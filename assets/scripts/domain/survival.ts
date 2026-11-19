import {Progression,initialProgression,levelAt,gatheringKind,Gathering} from './progression';
import { Battle, BattleState, Enemy } from './combat';
import { GameConfig, SLOTS, SkillId, SkillDefinition, BuildingKind, MonsterConfig } from './config';
import { Vec, SeededRandom } from './ports';
import { canStand, direction, distance, moveCircle } from './movement';
import { World, WorldState, calendarAt, findPath } from './world';
import { Equipment, InventoryState, Slot, emptyInventory, grantMaterial, hasMaterials, takeMaterials,
    usedSlots, craft, equip, unequip, dismantle, loseWorn } from './inventory';

export interface Building { id: string; kind: BuildingKind; cell: Vec; health: number; maxHealth: number; open: boolean; fuelUntil?: number }
export interface EnemyMemory { source: 'raid' | 'wild'; rewarded: boolean; target: string; path: Vec[]; revision: number; replan: number; tauntUntil?: number; lureUntil?: number; restUntil?: number; reserved?: Vec }
export interface Drop { id: string; position: Vec; material?: string; equipment?: Equipment }
type CastStatus={kind:'empty'}|{kind:'blocked'|'full'|'materials'|'ready';skill:SkillDefinition}|{kind:'cooldown';skill:SkillDefinition;remaining:number};
export interface RunState {
    skills?: { learned: SkillId[]; ready: Partial<Record<SkillId, number>> };
    pity?: Record<string, number>;
    eliteDay?: number;
    environment?: { temperature: number; damageAt: number; events: Record<string, { status: 'pending'|'spawned'|'defeated'|'missed'; enemy?: string; attemptAt: number }> };
    progression?:Progression;
    id: string; revision: number; time: number; world: WorldState; battle: BattleState; inventory: InventoryState;
    buildings: Building[]; enemies: Record<string, EnemyMemory>; drops: Drop[];
    hunger: number; respawnAt: number | null; lost: Equipment[]; deathId: number; ended: boolean;
    raid: { night: number; remaining: number; next: number }; nextEntity: number; relocationReady: number;
    random: { spawn: number; loot: number; death: number }; stats: { kills: number; deaths: number; gathered: number; built: number };
}
export type Channel = { kind: 'gather' | 'repair' | 'relocate'; target: string; cell?: Vec; until: number; origin: Vec };
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const adjacent = (c: Vec) => [{ x:c.x+1,y:c.y },{ x:c.x-1,y:c.y },{ x:c.x,y:c.y+1 },{ x:c.x,y:c.y-1 }];

/** 唯一世界状态；镜头离开塔不会暂停塔或夜袭。未提交的引导动作不进入快照。 */
export class SurvivalRun {
    readonly world: World;
    readonly battle: Battle;
    readonly state: RunState;
    channel: Channel | null = null;
    message = '先靠近树木按 E 采集；木材可以制作武器和围墙。';
    private readonly spawnRandom: SeededRandom;
    private readonly lootRandom: SeededRandom;
    private readonly deathRandom: SeededRandom;
    private obstacleRevision = -1;
    private processed = new Set<string>();
    private activeChunks = new Set<number>();
    constructor(readonly config: GameConfig, seed: number, restored?: RunState, hero='warden') {
        const s = restored ? copy(restored) : undefined;
        this.world = new World(config, config.survival.resources, seed, s?.world);
        const tower = config.survival.buildings.find(b => b.id === 'tower')!;
        this.battle = new Battle({ ...config.combat }, this.world.grid.bounds, this.world.grid.colliders(), this.world.start);
        this.state = s || {
            id: `run-${Date.now()}-${seed >>> 0}`, revision: 0, time: 0, world: this.world.state,
            battle: this.battle.snapshot(), inventory: emptyInventory(config.survival.capacity),
            buildings: [{ id:'tower', kind:'tower', cell:{ ...this.world.homeCell }, health:tower.health, maxHealth:tower.health, open:false }],
            enemies: {}, drops: [], hunger:config.survival.hungerMax, respawnAt:null, lost:[], deathId:0, ended:false,
            raid:{ night:0, remaining:0, next:0 }, nextEntity:1, relocationReady:0,
            random:{ spawn:seed ^ 0x19a43, loot:seed ^ 0x5a821, death:seed ^ 0x71ab5 }, stats:{ kills:0,deaths:0,gathered:0,built:0 },
        };
        if(!config.characters.some(c=>c.id===hero))throw new Error('未知角色');
        this.state.progression??=initialProgression(hero);
        this.state.skills ??= { learned: [], ready: {} };
        this.state.pity ??= {};
        this.state.eliteDay ??= this.calendar.day;
        this.state.environment ??= { temperature: config.environment.comfort, damageAt: this.state.time+config.environment.damageInterval, events: {} };
        this.battle.damageForAttack=()=>{
            let bonus=0;const p=this.progression,c=this.config.growth;
            if(p.hero==='hunter'){if(p.blinkUntil>this.state.time)bonus=c.hunterBlinkBonus;if(p.counterUntil>this.state.time){bonus=Math.max(bonus,c.hunterCounterBonus);p.counterUntil=0;this.changed('强化反击已消耗。');}}
            return this.battle.config.attackDamage*(1+bonus);
        };
        this.battle.onPerfectBlock=()=>{if(this.progression.hero==='hunter'){this.progression.counterUntil=this.state.time+config.growth.hunterCounterSeconds;this.changed('完美格挡：下一次攻击强化。');}};
        this.battle.onBlink=()=>{if(this.progression.hero==='hunter'){this.progression.blinkUntil=this.state.time+config.growth.hunterBlinkSeconds;this.changed('闪现：限时攻击增益。');}};
        this.spawnRandom = new SeededRandom(this.state.random.spawn);
        this.lootRandom = new SeededRandom(this.state.random.loot);
        this.deathRandom = new SeededRandom(this.state.random.death);
        this.updateEquipment();
        if (s) this.battle.restore(s.battle);
        for (const b of this.state.buildings) this.world.grid.setBlocked(b.cell.x, b.cell.y, b.health > 0 && !b.open);
        this.syncObstacles(); this.updateEquipment();
        if (!s) this.spawnWild();
    }
    get progression():Progression {return this.state.progression!;}
    get level():number {return levelAt(this.progression.combatXp,this.config.growth.combatThresholds);}
    get trainingSlots():number {return this.config.growth.skillLevels.filter(level=>this.level>=level).length;}
    get skills() { return this.state.skills!; }
    get environment() { return this.state.environment!; }
    gatheringLevel(kind:Gathering):number {return levelAt(this.progression.gathering[kind],this.config.growth.gatheringThresholds);}
    gatheringSeconds(item:string,seconds:number):number {return seconds/(1+(this.gatheringLevel(gatheringKind(item))-1)*this.config.growth.gatherSpeedPerLevel)*(item==='wood'&&this.progression.hero==='warden'?this.config.growth.wardenLoggingTime:1);}
    private repairCosts(b:Building) {return this.progression.hero==='warden'&&b.kind!=='tower'&&(this.progression.repairs+1)%this.config.growth.wardenFreeRepairEvery===0?[]:this.config.survival.buildings.find(d=>d.id===b.kind)!.repairCost??this.config.survival.repairCost;}
    get tower(): Building { return this.state.buildings.find(b => b.kind === 'tower')!; }
    get towerPosition(): Vec { return this.world.center(this.tower.cell); }
    get calendar() { return calendarAt(this.state.time, this.config); }
    get nearTower(): boolean { return distance(this.battle.player.position, this.towerPosition) <= this.config.survival.interactionRange; }
    get editable(): boolean { return !this.state.ended && this.battle.alive; }
    private get busy():boolean {return this.battle.attacking||this.battle.blocking||this.battle.time<this.battle.castUntil;}
    get trainingSafe():boolean {return this.editable&&this.nearTower&&!this.busy&&!this.channel&&!this.battle.enemies.some(e=>e.health>0&&(e.phase==='windup'||distance(e.position,this.battle.player.position)<this.config.survival.safeEnemyRange));}
    snapshot(): RunState {
        this.state.battle = this.battle.snapshot();
        this.state.random = { spawn:this.spawnRandom.state(), loot:this.lootRandom.state(), death:this.deathRandom.state() };
        return copy(this.state);
    }
    private changed(text: string): boolean { this.state.revision++; this.message = text; return true; }
    private reject(text: string): false { this.message = text; return false; }
    private syncObstacles(): void {
        if (this.obstacleRevision === this.world.grid.revision) return;
        this.obstacleRevision = this.world.grid.revision;
        this.battle.obstacles.splice(0, this.battle.obstacles.length, ...this.world.grid.colliders());
    }
    private updateEquipment(): void {
        let attack = 0, defense = 0;
        for (const item of Object.values(this.state.inventory.worn)) {
            const def = this.config.equipment.find(d => d.id === item?.definition);
            attack += def?.attack || (item?.definition === 'emergency-weapon' ? 2 : 0); defense += def?.defense || 0;
        }
        this.battle.config.attackDamage = this.config.combat.attackDamage + attack+(this.level-1)*this.config.growth.attackPerLevel;
        this.battle.config.health=this.config.combat.health+(this.level-1)*this.config.growth.healthPerLevel; this.battle.defense = defense;
    }
    /** commandId 在同一进程内去重；持久化由 Session 冻结输入并提交完整 post-state。 */
    manage(id: string, kind: 'craft'|'equip'|'unequip'|'dismantle'|'food'|'emergency'|'upgrade-tool'|'learn', value = ''): boolean {
        if (!this.editable || this.processed.has(id)) return false;
        this.processed.add(id);
        const bag = this.state.inventory;
        let next: InventoryState | null = null;
        if (kind === 'learn') {
            const skill = this.config.skills.find(s => s.id === value);
            if (!skill || !this.trainingSafe) return this.reject('训练需要靠近塔，且周围没有战斗威胁。');
            if (this.skills.learned.includes(skill.id)) return this.reject('已经学会此技能，不重复消耗材料。');
            if (this.skills.learned.length >= Math.min(2, this.trainingSlots)) return this.reject('等级名额不足或已学满两种；本局不能改选。');
            if (!takeMaterials(bag, skill.trainingCost)) return this.reject('训练材料不足。');
            this.skills.learned.push(skill.id); this.skills.ready[skill.id] = 0;
            return this.changed(`已学习${skill.name}，本局不可改选。`);
        } else if(kind==='upgrade-tool'){
            const tool=value==='logging'?'improved-axe':value==='mining'?'improved-pick':null;
            if(!tool||!this.nearTower||this.gatheringLevel(value as Gathering)<this.config.growth.toolLevel||bag.tools.includes(tool)||!takeMaterials(bag,this.config.growth.toolCost))return this.reject('升级工具需要对应采集 3 级、塔旁及足够木石。');
            bag.tools.push(tool);
        } else if (kind === 'food') {
            if (this.state.hunger >= this.config.survival.hungerMax || !takeMaterials(bag,[{id:'food',count:1}])) return this.reject('没有食物，或饥饿值已满。');
            this.state.hunger = Math.min(this.config.survival.hungerMax, this.state.hunger + this.config.survival.foodRestore);
        } else if (kind === 'emergency') {
            if (!this.nearTower) return this.reject('请靠近营地塔领取应急武器。');
            if ([...bag.equipment, ...Object.values(bag.worn)].some(e => e?.definition === 'emergency-weapon')) return this.reject('本局现有应急武器只能持有一把。');
            if (usedSlots(bag) >= bag.capacity) return this.reject('背包已满。');
            bag.equipment.push({id:`item-${bag.nextItem++}`,definition:'emergency-weapon'});
        } else {
            if ((kind === 'craft' || kind === 'dismantle') && !this.nearTower) return this.reject('制造和拆解需要靠近营地塔。');
            if (kind === 'craft') next = craft(bag,this.config,value);
            if (kind === 'equip') next = equip(bag,this.config,value);
            if (kind === 'unequip' && SLOTS.some(s => s === value)) next = unequip(bag,value as Slot);
            if (kind === 'dismantle') next = dismantle(bag,this.config,value);
            if (!next) return this.reject('操作失败：检查材料、背包空间或装备。');
            this.state.inventory = next;
        }
        this.updateEquipment(); return this.changed(kind === 'food' ? '吃下食物，饥饿值恢复。' : '背包已更新。');
    }
    castStatus(slot:number):CastStatus {
        const skill = this.config.skills.find(s => s.id === this.skills.learned[slot]);
        if(!skill)return {kind:'empty'};
        const remaining=(this.skills.ready[skill.id]||0)-this.state.time;
        if(remaining>0)return {kind:'cooldown',skill,remaining};
        if(!this.editable||this.busy||this.channel||!this.battle.canAct)return {kind:'blocked',skill};
        if(skill.heal>0&&this.battle.player.health>=this.battle.config.health)return {kind:'full',skill};
        if(!hasMaterials(this.state.inventory,skill.cost))return {kind:'materials',skill};
        return {kind:'ready',skill};
    }
    cast(slot: number): boolean {
        const status=this.castStatus(slot);
        if(status.kind!=='ready'){
            const messages={empty:'技能槽为空，请在塔旁训练。',blocked:'当前动作不能释放技能。',cooldown:'技能冷却中。',full:'生命已满。',materials:'缺少技能材料。'};
            return this.reject(messages[status.kind]);
        }
        const {skill}=status;
        if(!takeMaterials(this.state.inventory,skill.cost))return this.reject('缺少技能材料。');
        this.skills.ready[skill.id] = this.state.time + skill.cooldown;
        this.battle.castUntil = this.battle.time + skill.cast;
        const player = this.battle.player;
        if (skill.heal) player.health = Math.min(this.battle.config.health, player.health + skill.heal);
        for (const enemy of this.battle.enemies) {
            if (enemy.health <= 0 || distance(enemy.position, player.position) > skill.range + enemy.radius) continue;
            const delta = { x: enemy.position.x - player.position.x, y: enemy.position.y - player.position.y }, dir = direction(delta);
            if (dir.x * player.facing.x + dir.y * player.facing.y < Math.cos(skill.arc * Math.PI / 360)) continue;
            if (distance(moveCircle(player.position, delta, 1, this.world.grid.bounds, this.battle.obstacles, false), enemy.position) > 2) continue;
            if (skill.damage) this.battle.damageEnemy(enemy, this.battle.config.attackDamage * skill.damage);
            if (skill.knockback && enemy.health > 0) enemy.position = moveCircle(enemy.position, { x: dir.x * skill.knockback, y: dir.y * skill.knockback }, enemy.radius, this.world.grid.bounds, this.battle.obstacles, false);
            if (skill.duration && this.state.enemies[enemy.id]) this.state.enemies[enemy.id].tauntUntil = this.state.time + skill.duration;
        }
        return this.changed(`释放${skill.name}。`);
    }
    interact(): boolean {
        if (!this.editable || this.busy) return false;
        if (this.channel) { this.channel = null; return this.reject('已取消操作。'); }
        const p = this.battle.player.position, range = this.config.survival.interactionRange;
        const drops = this.state.drops.filter(d => distance(d.position,p) <= range).sort((a,b)=>distance(a.position,p)-distance(b.position,p));
        if (drops.length) {
            const drop = drops[0], bag = this.state.inventory;
            if (drop.material ? !grantMaterial(bag,drop.material,1) : usedSlots(bag)>=bag.capacity) return this.reject('背包已满，掉落物仍留在原地。');
            if (drop.equipment) bag.equipment.push(drop.equipment);
            this.state.drops = this.state.drops.filter(d => d.id !== drop.id); return this.changed('已拾取掉落物。');
        }
        const node = this.world.state.resources.filter(n => n.amount>0 && distance(this.world.center(n.cell),p)<=range)
            .sort((a,b)=>distance(this.world.center(a.cell),p)-distance(this.world.center(b.cell),p))[0];
        const gate = this.state.buildings.filter(b=>b.kind==='gate' && distance(this.world.center(b.cell),p)<=range).sort((a,b)=>distance(this.world.center(a.cell),p)-distance(this.world.center(b.cell),p))[0];
        if (node && (!gate || distance(this.world.center(node.cell),p)<distance(this.world.center(gate.cell),p))) {
            const def = this.world.definition(node);
            if (def.tool && !this.state.inventory.tools.includes(def.tool)) return this.reject('缺少对应采集工具。');
            this.channel = {kind:'gather',target:node.id,until:this.state.time+this.gatheringSeconds(def.item,def.seconds),origin:{...p}};
            this.message = '正在采集…移动、受伤或再次按 E 可取消。'; return true;
        }
        if (!gate) return this.reject('靠近树木、矿石、植物、掉落物或木门再交互。');
        const pos = this.world.center(gate.cell);
        if (gate.open && [this.battle.player,...this.battle.enemies.filter(e=>e.health>0)].some(a=>Math.abs(a.position.x-pos.x)<24+a.radius && Math.abs(a.position.y-pos.y)<24+a.radius)) return this.reject('门口有人，暂时不能关门。');
        gate.open=!gate.open; this.world.grid.setBlocked(gate.cell.x,gate.cell.y,!gate.open); this.syncObstacles();
        return this.changed(gate.open?'木门已打开。':'木门已关闭。');
    }
    canPlace(cell: Vec, movingTower = false): boolean {
        const g=this.world.grid, pos=this.world.center(cell), p=this.battle.player;
        if (!Number.isInteger(cell.x)||!Number.isInteger(cell.y)||g.isBlocked(cell.x,cell.y)||!this.world.isExplored(cell)||distance(pos,p.position)>this.config.survival.buildRange) return false;
        if (this.world.state.resources.some(n=>n.amount>0&&n.cell.x===cell.x&&n.cell.y===cell.y)) return false;
        if (this.state.buildings.some(b=>b.cell.x===cell.x&&b.cell.y===cell.y)) return false;
        if ([p,...this.battle.enemies.filter(e=>e.health>0)].some(a=>Math.abs(a.position.x-pos.x)<g.cellSize/2+a.radius && Math.abs(a.position.y-pos.y)<g.cellSize/2+a.radius)) return false;
        if (movingTower && !findPath(g,g.cellAt(p.position)!,[cell]).length) return false;
        return true;
    }
    build(cell: Vec, kind: Exclude<BuildingKind,'tower'>): boolean {
        if (!this.editable || this.busy || this.channel || !this.canPlace(cell)) return this.reject('落点不可用：请在附近已探索的空地建造。');
        const def=this.config.survival.buildings.find(b=>b.id===kind)!;
        if (!takeMaterials(this.state.inventory,def.costs)) return this.reject('建造材料不足。');
        this.state.buildings.push({id:`building-${this.state.nextEntity++}`,kind,cell:{...cell},health:def.health,maxHealth:def.health,open:false});
        this.world.grid.setBlocked(cell.x,cell.y,true); this.syncObstacles(); this.state.stats.built++;
        return this.changed(`${def.name}已建成。`);
    }
    upgradeWall(): boolean {
        if (!this.editable || this.channel || !this.battle.canAct) return false;
        const b=this.state.buildings.filter(b=>distance(this.world.center(b.cell),this.battle.player.position)<=this.config.survival.interactionRange&&this.config.survival.buildings.find(d=>d.id===b.kind)?.upgradeTo).sort((a,b)=>distance(this.world.center(a.cell),this.battle.player.position)-distance(this.world.center(b.cell),this.battle.player.position))[0];
        const next=this.config.survival.buildings.find(d=>d.id===this.config.survival.buildings.find(d=>d.id===b?.kind)?.upgradeTo);
        if (!b || !next) return this.reject('附近没有可升级的围墙。');
        if (!takeMaterials(this.state.inventory,next.costs)) return this.reject('升级材料不足。');
        b.health=Math.max(1,Math.floor(b.health/b.maxHealth*next.health));b.maxHealth=next.health;b.kind=next.id;
        return this.changed(`升级为${next.name}，保留原墙生命比例和阻挡。`);
    }
    fuelFacility(): boolean {
        if(!this.editable||!this.battle.canAct)return false;
        const b=this.state.buildings.filter(b=>this.config.survival.buildings.find(d=>d.id===b.kind)?.fuel&&distance(this.world.center(b.cell),this.battle.player.position)<=this.config.survival.interactionRange).sort((a,b)=>distance(this.world.center(a.cell),this.battle.player.position)-distance(this.world.center(b.cell),this.battle.player.position))[0];
        const def=this.config.survival.buildings.find(d=>d.id===b?.kind);
        if(!b||!def?.fuel)return this.reject('靠近篝火或降温设施再补充燃料。');
        const current=Math.max(this.state.time,b.fuelUntil||0);
        if(current-this.state.time+this.config.environment.fuelSeconds>this.config.environment.maxFuel||!takeMaterials(this.state.inventory,[{id:def.fuel,count:1}]))return this.reject('燃料不足或设施已满。');
        b.fuelUntil=current+this.config.environment.fuelSeconds;return this.changed(`${def.name}已补充燃料。`);
    }
    demolish(): boolean {
        if (!this.editable) return false;
        const b=this.state.buildings.filter(v=>v.kind!=='tower'&&distance(this.world.center(v.cell),this.battle.player.position)<=this.config.survival.interactionRange)
            .sort((a,b)=>distance(this.world.center(a.cell),this.battle.player.position)-distance(this.world.center(b.cell),this.battle.player.position))[0];
        if (!b) return this.reject('附近没有可拆除的墙或门。');
        this.removeBuilding(b); return this.changed('已拆除建筑，不返还材料。');
    }
    repair(): boolean {
        if (!this.editable || this.channel || this.busy) return false;
        const b=this.state.buildings.filter(v=>v.health<v.maxHealth&&distance(this.world.center(v.cell),this.battle.player.position)<=this.config.survival.interactionRange)
            .sort((a,b)=>a.health/a.maxHealth-b.health/b.maxHealth)[0];
        if (!b) return this.reject('附近没有需要维修的建筑。');
        if (b.kind==='tower' && this.calendar.phase!=='day') return this.reject('营地塔只能在白天维修。');
        if (!hasMaterials(this.state.inventory,this.repairCosts(b))) return this.reject('维修需要木材。');
        this.channel={kind:'repair',target:b.id,until:this.state.time+this.config.survival.repairSeconds,origin:{...this.battle.player.position}};
        this.message='正在维修…'; return true;
    }
    relocate(cell: Vec): boolean {
        if (!this.editable || this.channel || this.busy || !this.relocationValid(cell)) return this.reject('迁塔需要白天、靠近塔、周围安全、材料足够且落点可达；冷却 60 秒。');
        this.channel={kind:'relocate',target:'tower',cell:{...cell},until:this.state.time+this.config.survival.relocationSeconds,origin:{...this.battle.player.position}};
        this.message='正在迁塔…原塔仍会受到攻击。'; return true;
    }
    private relocationValid(cell:Vec):boolean {
        return this.calendar.phase==='day' && this.nearTower && this.state.time>=this.state.relocationReady && this.canPlace(cell,true)
            && hasMaterials(this.state.inventory,this.config.survival.relocationCost)
            && !this.battle.enemies.some(e=>e.health>0&&(distance(e.position,this.towerPosition)<this.config.survival.safeEnemyRange || distance(e.position,this.world.center(cell))<this.config.survival.safeEnemyRange));
    }
    private finishChannel():void {
        const a=this.channel; if(!a)return;
        if (!this.editable||this.battle.attacking||this.battle.blocking||distance(a.origin,this.battle.player.position)>5||(a.kind==='relocate'&&!this.relocationValid(a.cell!))) {this.channel=null;this.message='操作已中断，未消耗材料。';return;}
        if(this.state.time+1e-8<a.until)return;
        this.channel=null;
        if(a.kind==='gather') {
            const n=this.world.state.resources.find(n=>n.id===a.target);if(!n||n.amount<=0)return;
            const def=this.world.definition(n);
            const amount = Math.max(1, Math.floor(n.amount * (def.yieldBySeason?.[this.calendar.season] ?? 1)));
            if((def.tool&&!this.state.inventory.tools.includes(def.tool)) || distance(this.world.center(n.cell),this.battle.player.position)>this.config.survival.interactionRange || !grantMaterial(this.state.inventory,def.item,amount)){this.message='背包已满，资源保持原样。';return;}
            const kind=gatheringKind(def.item);this.progression.gathering[kind]=Math.min(Number.MAX_SAFE_INTEGER,this.progression.gathering[kind]+amount*this.config.growth.gatherXp);
            this.state.stats.gathered+=amount;n.amount=0;n.refreshAt=def.regrow?this.state.time+def.regrow*(def.regrowBySeason?.[this.calendar.season]??1):0;
            if(def.blocking)this.world.grid.setBlocked(n.cell.x,n.cell.y,false);
            this.syncObstacles();this.changed('采集完成，材料已放入背包。');
        } else if(a.kind==='repair') {
            const b=this.state.buildings.find(b=>b.id===a.target);
            if(!b||b.health<=0||distance(this.world.center(b.cell),this.battle.player.position)>this.config.survival.interactionRange || (b.kind==='tower'&&this.calendar.phase!=='day'))return;
            if(takeMaterials(this.state.inventory,this.repairCosts(b))){if(b.kind!=='tower')this.progression.repairs++;b.health=Math.min(b.maxHealth,b.health+this.config.survival.repairHealth);this.changed('维修完成。');}
        } else {
            // 提交前的第二次校验；血量一直保存在同一座塔上。
            if(!this.relocationValid(a.cell!))return;
            takeMaterials(this.state.inventory,this.config.survival.relocationCost);
            this.world.grid.setBlocked(this.tower.cell.x,this.tower.cell.y,false);this.tower.cell={...a.cell!};this.world.grid.setBlocked(a.cell!.x,a.cell!.y,true);
            this.syncObstacles();this.state.relocationReady=this.state.time+this.config.survival.relocationCooldown;this.changed('营地塔迁移完成，原防线留在原处。');
        }
    }
    private removeBuilding(b:Building):void {
        this.world.grid.setBlocked(b.cell.x,b.cell.y,false);this.state.buildings=this.state.buildings.filter(v=>v.id!==b.id);this.syncObstacles();
    }
    damageBuilding(id:string,amount:number):void {
        const b=this.state.buildings.find(b=>b.id===id);if(!b||this.state.ended||!Number.isFinite(amount)||amount<=0)return;
        b.health=Math.max(0,b.health-amount);
        if(b.health===0) {
            if(b.kind==='tower'){this.state.ended=true;this.state.respawnAt=null;this.channel=null;this.battle.setActive(false);this.changed('营地塔被摧毁，本局结束。');}
            else{this.removeBuilding(b);this.changed('一段防线被摧毁了！');}
        }
    }
    tick(dt:number):void {
        if(this.state.ended)return;
        if(!Number.isFinite(dt)||dt<=0||dt>0.05)throw new Error('生存模拟步长必须在 0～50ms');
        this.activeChunks=this.world.activeChunks(this.battle.player.position,this.towerPosition);
        const previous=this.calendar;this.state.time+=dt;const now=this.calendar;
        if(previous.phase!==now.phase||previous.day!==now.day) {
            if(now.phase==='dusk')this.message=`黄昏降临，今夜敌人从${['东','北','西','南'][(now.day-1)%4]}面出现，含近战、快速、攻城与季节变体。${now.day%this.config.world.seasonDays===0?'季末首领逼近；明日进入下一季！':''}`;
            if(now.phase==='day') {
                const ids=new Set(Object.keys(this.state.enemies).filter(id=>this.state.enemies[id].source==='raid'));
                for(let i=this.battle.enemies.length-1;i>=0;i--)if(ids.has(this.battle.enemies[i].id))this.battle.enemies.splice(i,1);
                for(const id of Array.from(ids))delete this.state.enemies[id];
                for(const [key,event] of Object.entries(this.environment.events)){
                    if(event.status==='pending'||event.status==='spawned'&&event.enemy&&ids.has(event.enemy))event.status='missed';
                    if(Number(key.split(':')[0])<now.year-1)delete this.environment.events[key];
                }
                this.state.raid.remaining=0;this.message='天亮了，夜袭怪物撤退。';
                this.spawnDailyElite();
            }
            this.changed(this.message);
        }
        this.seasonEvent();
        if(now.phase==='night') {
            if(this.state.raid.night!==now.day){this.state.raid={night:now.day,remaining:Math.max(0,this.config.survival.raidBudget+(now.day-1)*this.config.survival.raidGrowth-(now.day%this.config.world.seasonDays===0?1:0)),next:this.state.time};this.changed('夜袭开始，守住营地塔！');}
            if(this.state.raid.remaining>0&&this.state.time>=this.state.raid.next&&this.battle.enemies.filter(e=>e.health>0).length<this.config.survival.maxEnemies){
                if(this.spawnRaid()){this.state.raid.remaining--;this.changed('敌人正在逼近营地。');}
                this.state.raid.next=this.state.time+this.config.survival.spawnInterval;
            }
        }
        this.syncObstacles();
        this.battle.tick(dt,(e,delta)=>this.enemyAI(e,delta));
        for(const event of this.battle.events.splice(0)) {
            if(event.type==='hit'&&event.target==='player') {this.channel=null;this.message='受到攻击，操作中断。';}
            if(event.type==='kill')this.reward(event.target);
            if(event.type==='death')this.handleDeath();
            if(event.type==='perfect')this.message=this.progression.hero==='hunter'?`完美格挡！下一击强化，${this.config.growth.hunterCounterSeconds} 秒内有效。`:'完美格挡！';
        }
        if(this.state.ended)return;
        this.updateTemperature(dt);
        if(this.battle.alive){
            this.state.hunger=Math.max(0,this.state.hunger-this.config.survival.hungerDrain*dt);
            if(this.state.hunger===0){this.battle.damagePlayer(this.config.survival.starvationDamage*dt,this.battle.player.position);this.battle.events.splice(0);if(!this.battle.alive)this.handleDeath();}
        }
        if(this.state.respawnAt!==null && this.state.time>=this.state.respawnAt) {
            const pos=this.respawnPosition();
            if(pos){this.battle.revive(pos,this.config.survival.respawnProtection);this.state.hunger=Math.max(this.config.survival.respawnHunger,this.state.hunger);this.environment.temperature=this.config.environment.comfort;this.environment.damageAt=this.state.time+this.config.environment.damageInterval;this.state.respawnAt=null;this.changed('已在营地塔旁复活，获得短暂无敌。');}
        }
        for(let i=this.battle.enemies.length-1;i>=0;i--){const e=this.battle.enemies[i];if(e.health<=0&&this.state.enemies[e.id]?.rewarded){this.battle.enemies.splice(i,1);delete this.state.enemies[e.id];}}
        this.finishChannel();this.world.reveal(this.battle.player.position);
        for(const n of this.world.resourcesIn(this.activeChunks))if(n.amount===0&&n.refreshAt>0&&this.state.time>=n.refreshAt){
            const pos=this.world.center(n.cell),size=this.world.grid.cellSize;
            if(this.world.grid.isBlocked(n.cell.x,n.cell.y)||this.state.buildings.some(b=>b.cell.x===n.cell.x&&b.cell.y===n.cell.y)||[this.battle.player,...this.battle.enemies.filter(e=>e.health>0)].some(a=>Math.abs(a.position.x-pos.x)<size/2+a.radius&&Math.abs(a.position.y-pos.y)<size/2+a.radius))continue;
            n.amount=this.world.definition(n).count;n.refreshAt=0;if(this.world.definition(n).blocking)this.world.grid.setBlocked(n.cell.x,n.cell.y,true);
        }
        this.syncObstacles();
    }
    private updateTemperature(dt:number):void {
        const cfg=this.config.environment,env=this.environment;
        let target=cfg.seasons[this.calendar.season].temperature+(this.calendar.phase==='night'?-3:0),warmth=0,cooling=0;
        for(const item of Object.values(this.state.inventory.worn)){const def=this.config.equipment.find(d=>d.id===item?.definition);warmth+=def?.warmth||0;cooling+=def?.cooling||0;}
        const nearby=this.state.buildings.filter(b=>(b.fuelUntil||0)>this.state.time&&distance(this.world.center(b.cell),this.battle.player.position)<=cfg.facilityRange);
        if(nearby.some(b=>b.kind==='campfire'))warmth+=cfg.facilityProtection;
        if(nearby.some(b=>b.kind==='cooler'))cooling+=cfg.facilityProtection;
        target=target<cfg.comfort?Math.min(cfg.comfort,target+warmth):Math.max(cfg.comfort,target-cooling);
        env.temperature+=Math.sign(target-env.temperature)*Math.min(Math.abs(target-env.temperature),cfg.changePerSecond*dt);
        if(this.state.time>=env.damageAt){env.damageAt=this.state.time+cfg.damageInterval;if(this.battle.alive&&(env.temperature<cfg.safeLow||env.temperature>cfg.safeHigh)){const hp=this.battle.player.health;this.battle.damagePlayer(cfg.damage,this.battle.player.position);if(this.battle.player.health<hp){this.channel=null;this.message=env.temperature<cfg.safeLow?'体温过低！靠近点燃篝火或穿保暖装备。':'体温过高！靠近降温设施或穿隔热装备。';}if(!this.battle.alive)this.handleDeath();}}
    }
    private seasonEvent():void {
        const now=this.calendar;if(now.day%this.config.world.seasonDays!==0||now.phase==='day')return;
        const key=`${now.year}:${now.season}`,event=this.environment.events[key]??(this.environment.events[key]={status:'pending',attemptAt:0});
        if(event.status!=='pending'||this.state.time<event.attemptAt||this.battle.enemies.filter(e=>e.health>0).length>=this.config.survival.maxEnemies)return;
        event.attemptAt=this.state.time+this.config.survival.spawnInterval;
        const def=this.config.monsters.find(d=>d.id===this.config.environment.seasons[now.season].boss)!;
        for(let i=0;i<32;i++){
            const angle=this.spawnRandom.next()*Math.PI*2,position={x:this.towerPosition.x+Math.cos(angle)*this.config.survival.spawnRadius*this.world.grid.cellSize,y:this.towerPosition.y+Math.sin(angle)*this.config.survival.spawnRadius*this.world.grid.cellSize};
            if(canStand(position,def.radius,this.world.grid.bounds,this.battle.obstacles)&&distance(position,this.battle.player.position)>100&&!this.battle.enemies.some(e=>e.health>0&&distance(e.position,position)<e.radius+def.radius)){
                const id=this.spawn('raid',position,def);event.status='spawned';event.enemy=id;this.changed(`${this.config.environment.seasons[now.season].name}季末首领出现！`);return;
            }
        }
    }
    private handleDeath():void {
        if(this.battle.alive||this.state.respawnAt!==null||this.state.ended)return;
        const result=loseWorn(this.state.inventory,this.config.world.deathLossRate,this.deathRandom);
        this.state.inventory=result.inventory;this.state.lost=result.lost;this.state.deathId++;this.state.stats.deaths++;
        this.progression.counterUntil=0;this.progression.blinkUntil=0;
        this.state.respawnAt=this.state.time+this.config.survival.respawnSeconds;this.channel=null;this.updateEquipment();
        this.changed(`你倒下了，${result.lost.length} 件穿戴装备永久消失。营地仍在战斗。`);
    }
    private respawnPosition():Vec|null {
        for(let r=1;r<=3;r++)for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++) {
            const p=this.world.center({x:this.tower.cell.x+x,y:this.tower.cell.y+y});
            if(canStand(p,this.battle.player.radius,this.world.grid.bounds,this.battle.obstacles)&&!this.battle.enemies.some(e=>e.health>0&&distance(e.position,p)<e.radius+this.battle.player.radius))return p;
        }return null;
    }
    private spawnWild():void {
        for(const [i,offset] of [{x:12,y:0},{x:-13,y:3},{x:0,y:13}].entries()) {
            const cell={x:this.tower.cell.x+offset.x,y:this.tower.cell.y+offset.y};if(this.world.grid.isBlocked(cell.x,cell.y))continue;
            this.spawn('wild',this.world.center(cell),i===2?this.config.monsters.find(m=>m.elite)||this.config.monsters[0]:this.config.monsters[0]);
        }
    }
    private spawnDailyElite(): void {
        if(this.state.eliteDay===this.calendar.day)return;
        this.state.eliteDay=this.calendar.day;
        const definition=this.config.monsters.find(d=>d.elite);if(!definition||this.battle.enemies.some(e=>e.health>0&&e.definition.elite)||this.battle.enemies.filter(e=>e.health>0).length>=this.config.survival.maxEnemies)return;
        for(let i=0;i<32;i++){
            const angle=this.spawnRandom.next()*Math.PI*2,position={x:this.towerPosition.x+Math.cos(angle)*13*this.world.grid.cellSize,y:this.towerPosition.y+Math.sin(angle)*13*this.world.grid.cellSize};
            if(canStand(position,definition.radius,this.world.grid.bounds,this.battle.obstacles)&&distance(position,this.battle.player.position)>200&&!this.battle.enemies.some(e=>e.health>0&&distance(e.position,position)<e.radius+definition.radius)){this.spawn('wild',position,definition);return;}
        }
    }
    private spawn(source:'wild'|'raid',position:Vec,definition:MonsterConfig=this.config.monsters[0]):string {
        const id=`enemy-${this.state.nextEntity++}`;this.battle.spawn(id,definition,position);
        this.state.enemies[id]={source,rewarded:false,target:'',path:[],revision:-1,replan:0};
        return id;
    }
    private spawnRaid():boolean {
        const size=this.world.grid.cellSize,r=this.config.survival.spawnRadius;
        const base=(this.calendar.day-1)%4*Math.PI/2;
        const variants=new Set(this.config.environment.seasons.map(s=>s.monster));
        const types=this.config.monsters.filter(d=>!d.elite&&!variants.has(d.id));types.push(this.config.monsters.find(d=>d.id===this.config.environment.seasons[this.calendar.season].monster)!);
        const definition=types[this.state.nextEntity%types.length];
        for(let i=0;i<32;i++) {
            const angle=base+(this.spawnRandom.next()-.5)*Math.PI/2;
            const pos={x:this.towerPosition.x+Math.cos(angle)*r*size,y:this.towerPosition.y+Math.sin(angle)*r*size};
            const cell=this.world.grid.cellAt(pos);if(!cell)continue;const center=this.world.center(cell);
            if(canStand(center,definition.radius,this.world.grid.bounds,this.battle.obstacles)&&distance(center,this.battle.player.position)>100&&!this.battle.enemies.some(e=>e.health>0&&distance(center,e.position)<e.radius*2)){this.spawn('raid',center,definition);return true;}
        }return false;
    }
    private reward(id:string):void {
        const meta=this.state.enemies[id],enemy=this.battle.enemies.find(e=>e.id===id);if(!meta||meta.rewarded||!enemy)return;
        if(this.state.ended||enemy.health>0)return;
        meta.rewarded=true;this.state.stats.kills++;this.progression.combatXp=Math.min(Number.MAX_SAFE_INTEGER,this.progression.combatXp+this.config.growth.killXp);this.updateEquipment();
        for(const event of Object.values(this.environment.events))if(event.enemy===id)event.status='defeated';
        const materials=enemy.definition.drops.slice(),rare=enemy.definition.rare;
        if(rare){const count=(this.state.pity![rare.material]||0)+1;if(count>=rare.guarantee||this.lootRandom.next()<rare.chance){materials.push(rare.material);this.state.pity![rare.material]=0;}else this.state.pity![rare.material]=count;}
        for(const material of materials){
            if(!grantMaterial(this.state.inventory,material,1))this.state.drops.push({id:`drop-${this.state.nextEntity++}`,position:{...enemy.position},material});
        }
        if(this.lootRandom.next()<this.config.loot.equipmentChance){
            const rarity=this.lootRandom.next()<this.config.loot.blueChance?'blue':'white';
            const defs=this.config.equipment.filter(d=>d.rarity===rarity);
            const item={id:`item-${this.state.inventory.nextItem++}`,definition:defs[Math.floor(this.lootRandom.next()*defs.length)].id};
            if(usedSlots(this.state.inventory)<this.state.inventory.capacity)this.state.inventory.equipment.push(item);else this.state.drops.push({id:`drop-${this.state.nextEntity++}`,position:{...enemy.position},equipment:item});
        }
        this.changed('击败怪物，获得战利品与经验。');
    }
    private enemyAI(e:Enemy,dt:number):void {
        if(e.health<=0||this.state.ended)return;const m=this.state.enemies[e.id];if(!m)return;
        const d=e.definition,player=this.battle.player,taunted=(m.tauntUntil||0)>this.state.time&&distance(e.position,player.position)<this.config.skills.find(s=>s.id==='warcry')!.range*2;
        let near=this.battle.alive&&(taunted||distance(e.position,player.position)<(m.source==='raid'?180:d.aggroRange));
        if (m.source==='raid'&&!taunted) {
            if (d.role==='siege' || (m.restUntil||0)>this.state.time) near=false;
            else if(near){if(!m.lureUntil)m.lureUntil=this.state.time+this.config.survival.aggroSeconds;if(this.state.time>=m.lureUntil){near=false;m.restUntil=this.state.time+this.config.survival.aggroRest;m.lureUntil=0;}}
            else m.lureUntil=0;
        }
        if(m.source==='wild'&&(!near||!this.activeChunks.has(this.world.chunkAt(e.position)!))){e.phase='idle';m.path=[];return;}
        let target=near?'player':'tower';
        let position=target==='player'?player.position:this.towerPosition;
        if(e.phase==='windup') {
            e.timer-=dt;if(e.timer>0)return;
            const building=this.state.buildings.find(b=>b.id===m.target);
            const p=m.target==='player'&&this.battle.alive?player.position:building?this.world.center(building.cell):null;
            if(p&&distance(e.position,p)<=d.range+(building?24:player.radius)) {
                const delta={x:p.x-e.position.x,y:p.y-e.position.y},dir=direction(delta);
                const obstacles=building?this.battle.obstacles.filter(r=>!(r.x===p.x-24&&r.y===p.y-24)):this.battle.obstacles;
                if(dir.x*e.attackFacing.x+dir.y*e.attackFacing.y>=.5&&distance(moveCircle(e.position,delta,1,this.world.grid.bounds,obstacles,false),p)<2) {
                    const damage=d.damage*(this.calendar.phase==='night'?this.config.survival.frenzy:1);
                    if(building)this.damageBuilding(building.id,damage);else this.battle.damagePlayer(damage,e.position);
                }
            }
            e.phase='recovery';e.timer=d.recovery;return;
        }
        if(e.phase==='recovery'){e.timer-=dt;if(e.timer<=0)e.phase='idle';return;}
        const g=this.world.grid,start=g.cellAt(e.position),goal=g.cellAt(position);if(!start||!goal)return;
        if(m.target!==target||g.pathInvalidated(m.revision,m.path)||this.state.time>=m.replan) {
            const reserved=new Set(Object.entries(this.state.enemies).filter(([id])=>id!==e.id).flatMap(([,m])=>m.reserved?[`${m.reserved.x}:${m.reserved.y}`]:[]));
            const allGoals=target==='tower'?adjacent(goal):[goal],available=allGoals.filter(c=>!reserved.has(`${c.x}:${c.y}`));
            const goals=available.length?available:allGoals;
            let path=findPath(g,start,goals);
            if(!path.length){const costs=new Map<number,number>();for(const b of this.state.buildings)if(b.kind!=='tower'&&!b.open)costs.set(b.cell.y*g.columns+b.cell.x,3+b.health/20);path=findPath(g,start,goals,costs);}
            m.path=path.slice(1);m.reserved=path[path.length-1];m.target=target;m.revision=g.revision;m.replan=this.state.time+1;
        }
        const next=m.path[0];
        if(next){
            const wall=this.state.buildings.find(b=>b.kind!=='tower'&&!b.open&&b.cell.x===next.x&&b.cell.y===next.y);
            if(wall){target=wall.id;position=this.world.center(wall.cell);}
        }
        const radius=target==='player'?player.radius:24;
        if(distance(e.position,position)<=d.range+radius) {
            const delta={x:position.x-e.position.x,y:position.y-e.position.y};
            const obstacles=target==='player'?this.battle.obstacles:this.battle.obstacles.filter(r=>!(r.x===position.x-24&&r.y===position.y-24));
            if(distance(moveCircle(e.position,delta,1,this.world.grid.bounds,obstacles,false),position)<2){m.target=target;e.facing=direction(delta);e.attackFacing={...e.facing};e.phase='windup';e.timer=d.windup;return;}
        }
        if(!next)return;
        const waypoint=this.world.center(next),dist=distance(waypoint,e.position),facing=direction({x:waypoint.x-e.position.x,y:waypoint.y-e.position.y});
        e.facing=facing;const travel=Math.min(dist,d.speed*dt*(this.calendar.phase==='night'?this.config.survival.frenzy:1));
        const candidate=moveCircle(e.position,{x:facing.x*travel,y:facing.y*travel},e.radius,g.bounds,this.battle.obstacles);
        const overlap=this.battle.enemies.find(other=>other!==e&&other.health>0&&distance(other.position,candidate)<e.radius+other.radius-2);
        if(!overlap)e.position=candidate;
        else {const away=direction({x:candidate.x-overlap.position.x,y:candidate.y-overlap.position.y});e.position=moveCircle(e.position,{x:away.x*d.speed*dt,y:away.y*d.speed*dt},e.radius,g.bounds,this.battle.obstacles);}
        if(distance(e.position,waypoint)<2)m.path.shift();
    }
}
