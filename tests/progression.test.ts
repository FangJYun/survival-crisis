import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseConfig} from '../assets/scripts/domain/config';
import {SurvivalRun} from '../assets/scripts/domain/survival';
import {initialProgression,experienceAt,levelAt} from '../assets/scripts/domain/progression';
import {runValidator} from '../assets/scripts/domain/run-validation';
import {SaveStore,checksum} from '../assets/scripts/application/save-store';
const config=()=>parseConfig(JSON.parse(readFileSync('assets/resources/config/game.json','utf8')));
const make=(hero='warden')=>new SurvivalRun(config(),42,undefined,hero);
const advance=(r:SurvivalRun,s:number)=>{for(let i=0;i<Math.ceil(s*30);i++)r.tick(1/30);};
const clear=(r:SurvivalRun)=>{r.battle.enemies.splice(0);r.state.enemies={};};
function kill(r:SurvivalRun,id:string){const e=r.battle.enemies.find(e=>e.id===id)!;e.health=0;e.phase='dead';r.battle.events.push({type:'kill',target:id,amount:0});r.tick(1/30);}
test('成长：累计曲线、跨级余量、训练资格及满级',()=>{
    const c=config(),r=make();assert.deepEqual(experienceAt(230,c.growth.combatThresholds),{level:3,remaining:30,needed:250});
    r.progression.combatXp=1800;assert.equal(r.level,7);assert.equal(r.trainingSlots,2);assert.equal(levelAt(999999,c.growth.combatThresholds),20);
    assert.equal(experienceAt(999999,c.growth.combatThresholds).needed,null);assert.equal(r.progression.gathering.logging,0);
});
test('击杀：奖励一次、提升基础属性但不回塔血，清理与终局不加经验',()=>{
    const r=make();r.tower.health=700;const definitions=JSON.stringify(r.battle.enemies.map(e=>e.definition));const id=r.battle.enemies[0].id;r.progression.combatXp=190;kill(r,id);
    assert.equal(r.level,3);assert.equal(r.battle.config.health,110);assert.equal(r.battle.player.health,100);assert.equal(r.tower.health,700);assert.equal(r.battle.config.attackDamage,28);
    const xp=r.progression.combatXp;r.battle.events.push({type:'kill',target:id,amount:0});r.tick(1/30);assert.equal(r.progression.combatXp,xp);
    assert.ok(definitions.includes(JSON.stringify(r.battle.enemies[0].definition)));
    r.damageBuilding('tower',10000);r.battle.events.push({type:'kill',target:r.battle.enemies[0].id,amount:0});r.tick(1/30);assert.equal(r.progression.combatXp,xp);
});
test('采集：独立经验、取消／满包不成长，守望者只提高伐木效率',()=>{
    const a=make(),b=make('hunter');clear(a);clear(b);assert.ok(a.gatheringSeconds('wood',1)<b.gatheringSeconds('wood',1));assert.equal(a.gatheringSeconds('stone',1),b.gatheringSeconds('stone',1));
    const n=a.world.state.resources.find(n=>n.definition==='wood')!;a.battle.player.position=a.world.center({x:n.cell.x+1,y:n.cell.y});a.interact();a.interact();advance(a,2);assert.equal(a.progression.gathering.logging,0);
    a.state.inventory.capacity=0;a.interact();advance(a,2);assert.equal(a.progression.gathering.logging,0);assert.equal(n.amount,4);
    a.state.inventory.capacity=24;a.interact();advance(a,2);assert.equal(a.progression.gathering.logging,20);assert.equal(a.progression.gathering.mining,0);assert.equal(a.progression.gathering.foraging,0);
    a.progression.gathering.logging=120;assert.ok(a.gatheringSeconds('wood',1)<.8);
});
test('工具：等级／材料／塔旁条件、重复升级不扣料，高阶节点需要工具',()=>{
    const r=make();clear(r);r.state.inventory.materials={wood:20,stone:10};assert.equal(r.manage('low','upgrade-tool','logging'),false);assert.equal(r.state.inventory.materials.wood,20);
    r.progression.gathering.logging=120;assert.ok(r.manage('tool','upgrade-tool','logging'));assert.ok(r.state.inventory.tools.includes('improved-axe'));assert.equal(r.state.inventory.materials.wood,10);
    assert.equal(r.manage('again','upgrade-tool','logging'),false);assert.equal(r.state.inventory.materials.wood,10);
    const n=r.world.state.resources.find(n=>n.definition==='hardwood')!;r.battle.player.position=r.world.center({x:n.cell.x+1,y:n.cell.y});
    for(const other of r.world.state.resources)if(other.id!==n.id&&Math.hypot(other.cell.x-n.cell.x,other.cell.y-n.cell.y)<3)other.amount=0;
    r.state.inventory.tools=[];assert.equal(r.interact(),false);r.state.inventory.tools=['improved-axe'];assert.ok(r.interact());advance(r,4);assert.equal(n.amount,0);assert.equal(r.progression.gathering.logging,160);
});
test('守望者：每三次修墙免材；中断、塔维修不累计，读档不刷新进度',()=>{
    const r=make();clear(r);r.state.inventory.materials.wood=30;r.build({x:r.tower.cell.x+1,y:r.tower.cell.y-2},'wall');const wall=r.state.buildings.find(b=>b.kind==='wall')!;
    for(let i=0;i<3;i++){wall.health=100;r.repair();advance(r,1);}assert.equal(r.state.inventory.materials.wood,25);assert.equal(r.progression.repairs,3);
    wall.health=90;r.repair();r.battle.player.position.x+=10;advance(r,1);assert.equal(r.progression.repairs,3);
    const restored=new SurvivalRun(r.config,42,r.snapshot());assert.equal(restored.progression.repairs,3);restored.state.buildings.find(b=>b.kind==='wall')!.health=120;restored.tower.health=900;restored.battle.player.position=restored.world.start;restored.repair();advance(restored,1);assert.equal(restored.progression.repairs,3);
});
test('猎手：真实完美格挡强化一次攻击，非法攻击不消耗，闪现增益不叠加并到期',()=>{
    const r=make('hunter');clear(r);const p=r.battle.player.position;r.battle.block(true);r.battle.damagePlayer(10,{x:p.x,y:p.y-80});assert.ok(r.progression.counterUntil>0);
    assert.equal(r.battle.attack(),false);assert.ok(r.progression.counterUntil>0);r.battle.block(false);assert.ok(r.battle.attack());assert.equal(r.progression.counterUntil,0);
    assert.equal(r.battle.snapshot().swing?.damage,36);const restored=new SurvivalRun(r.config,42,r.snapshot());assert.equal(restored.battle.snapshot().swing?.damage,36);
    advance(r,1);assert.ok(r.battle.blink());assert.equal(r.battle.blink(),false);assert.ok(r.battle.attack());assert.equal(r.battle.snapshot().swing?.damage,30);
    advance(r,7);r.battle.attack();assert.equal(r.battle.snapshot().swing?.damage,24);
});
test('存档：旧局补初值，新档保留等级与天赋，死亡复活保留成长并清理临时增益',async()=>{
    const r=make('hunter');clear(r);r.progression.combatXp=230;r.progression.gathering.logging=125;r.state.inventory.materials.wood=1;r.manage('stats','food');
    const snapshot=r.snapshot();assert.ok(runValidator(r.config)(snapshot));let writes=new Map<string,string>();
    const disk={async read(k:string){return writes.get(k)??null;},async write(k:string,v:string){writes.set(k,v);}};const store=new SaveStore(disk,runValidator(r.config));await store.commit(snapshot,'growth');
    assert.equal(JSON.parse(Array.from(writes.values())[0]).schemaVersion,3);
    const restored=new SurvivalRun(r.config,42,(await store.load()).value!);assert.equal(restored.progression.hero,'hunter');assert.equal(restored.level,3);
    restored.battle.damagePlayer(9999,{x:999,y:999});advance(restored,8.2);assert.equal(restored.level,3);assert.equal(restored.progression.gathering.logging,125);assert.equal(restored.battle.player.health,110);
    const legacy=r.snapshot();delete legacy.progression;legacy.battle.player.health=100;const payload=JSON.stringify(legacy),transaction='legacy',sequence=1;
    writes=new Map([['snapshot-0',JSON.stringify({schemaVersion:1,configVersion:1,sequence,transaction,payload,checksum:checksum(`${sequence}|${transaction}|${payload}`)})]]);
    const old=(await new SaveStore(disk,runValidator(r.config)).load()).value!;assert.ok(old);assert.deepEqual(new SurvivalRun(r.config,42,old).progression,initialProgression('warden'));
    const invalid=r.snapshot();invalid.progression!.hero='invalid';assert.equal(runValidator(r.config)(invalid),false);assert.throws(()=>make('invalid'));
    assert.equal(make('hunter').level,1);
});
test('猎手：反击到期消失、重复触发不叠加，守望者无战斗天赋',()=>{
    const r=make('hunter');clear(r);const p=r.battle.player.position;
    r.battle.block(true);r.battle.damagePlayer(1,{x:p.x,y:p.y-80});r.battle.damagePlayer(1,{x:p.x,y:p.y-80});r.battle.block(false);
    r.battle.attack();assert.equal(r.battle.snapshot().swing?.damage,36);advance(r,1);
    r.battle.block(true);r.battle.damagePlayer(1,{x:p.x,y:p.y-80});r.battle.block(false);advance(r,6);r.battle.attack();assert.equal(r.battle.snapshot().swing?.damage,24);
    const w=make();clear(w);w.battle.blink();w.battle.attack();assert.equal(w.battle.snapshot().swing?.damage,24);
});
test('配置：角色标识、工具等级与训练名额非法时启动拒绝',()=>{
    const c=config();c.characters[0].id='other';assert.throws(()=>parseConfig(c),/characters/);
    const d=config();d.growth.toolLevel=100;assert.throws(()=>parseConfig(d),/toolLevel/);
    const e=config();e.growth.skillLevels=[3,6,9];assert.throws(()=>parseConfig(e),/skillLevels/);
});
