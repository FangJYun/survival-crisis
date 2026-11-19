export const SLOTS = ['head', 'body', 'feet', 'hands', 'weapon'] as const;
export const RARITIES = ['white', 'blue', 'purple', 'gold'] as const;
export const SKILLS = ['sweep', 'shockwave', 'warcry', 'first-aid'] as const;
export type SkillId = typeof SKILLS[number];
export const BUILDINGS = ['tower', 'wall', 'gate', 'stone-wall', 'reinforced-wall', 'campfire', 'cooler'] as const;
export type BuildingKind = typeof BUILDINGS[number];
export interface SkillDefinition {
    id: SkillId; name: string; cooldown: number; cast: number; range: number; arc: number;
    damage: number; knockback: number; heal: number; duration: number;
    cost: { id: string; count: number }[]; trainingCost: { id: string; count: number }[];
}
export interface CombatConfig {
    radius: number; health: number; stamina: number; speed: number;
    attackDamage: number; attackRange: number; attackArc: number;
    attackWindup: number; attackActive: number; attackRecovery: number;
    blinkDistance: number; blinkCooldown: number; blinkProtection: number;
    blockDrain: number; blockHitCost: number; blockDamageRatio: number;
    blockArc: number; perfectWindow: number; staminaRegen: number;
}
export interface MonsterConfig {
    role?: 'melee' | 'fast' | 'siege'; elite?: boolean;
    rare?: { material: string; chance: number; guarantee: number };
    id: string; health: number; damage: number; radius: number; speed: number;
    aggroRange: number; range: number; windup: number; recovery: number; drops: string[];
}
export interface GameConfig {
    version: number;
    world: { width: number; height: number; cellSize: number; chunkSize: number; day: number; dusk: number; night: number; seasonDays: number; deathLossRate: number };
    combat: CombatConfig;
    characters: { id: string; name: string; talent: string }[];
    materials: { id: string; name: string; source?: string }[];
    equipment: { id: string; name: string; slot: typeof SLOTS[number]; rarity: typeof RARITIES[number]; attack: number; defense: number; tier?: number; effect?: string; warmth?: number; cooling?: number }[];
    recipes: { id: string; output: string; materials: { id: string; count: number }[] }[];
    monsters: MonsterConfig[];
    skills: SkillDefinition[];
    loot: { equipmentChance: number; blueChance: number };
    environment: {
        comfort: number; safeLow: number; safeHigh: number; changePerSecond: number; damage: number; damageInterval: number;
        facilityRange: number; fuelSeconds: number; maxFuel: number; facilityProtection: number;
        seasons: {name: string; temperature: number; nightBonus: number; monster: string; boss: string; material: string}[];
    };
    growth: { combatThresholds: number[]; gatheringThresholds: number[]; skillLevels: number[]; killXp:number; gatherXp:number; healthPerLevel:number; attackPerLevel:number; gatherSpeedPerLevel:number; wardenLoggingTime:number; wardenFreeRepairEvery:number; hunterCounterBonus:number; hunterCounterSeconds:number; hunterBlinkBonus:number; hunterBlinkSeconds:number; toolLevel:number; toolCost:{id:string;count:number}[] };
    survival: {
        capacity: number; interactionRange: number; buildRange: number;
        hungerMax: number; hungerDrain: number; foodRestore: number; starvationDamage: number;
        respawnSeconds: number; respawnProtection: number; respawnHunger: number;
        relocationSeconds: number; relocationCooldown: number; safeEnemyRange: number; relocationCost: { id: string; count: number }[];
        repairSeconds: number; repairHealth: number; repairCost: { id: string; count: number }[];
        raidBudget: number; raidGrowth: number; spawnInterval: number; spawnRadius: number; maxEnemies: number; frenzy: number;
        autosaveSeconds: number;
        aggroSeconds: number; aggroRest: number;
        resources: { id: string; item: string; count: number; seconds: number; tool: string | null; blocking: boolean; regrow: number; yieldBySeason?: number[]; regrowBySeason?: number[] }[];
        buildings: { id: BuildingKind; name: string; health: number; costs: { id: string; count: number }[]; upgradeTo?: BuildingKind; repairCost?: { id: string; count: number }[]; fuel?: string }[];
    };
}
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** 对外部 JSON 做启动前验证，错误包含字段路径。 */
export function parseConfig(input: unknown): GameConfig {
    const errors: string[] = [];
    if (!object(input)) throw new Error('游戏配置必须是对象');
    const check = (condition: boolean, path: string) => { if (!condition) errors.push(path); };
    check(input.version === 1, 'version 必须是 1');
    const world = object(input.world) ? input.world : {};
    for (const key of ['width', 'height', 'cellSize', 'chunkSize', 'day', 'dusk', 'night', 'seasonDays']) {
        check(positive(world[key]), `world.${key} 必须大于零`);
    }
    for (const key of ['width', 'height', 'chunkSize', 'seasonDays']) check(Number.isInteger(world[key]), `world.${key} 必须是整数`);
    check(nonnegative(world.deathLossRate) && world.deathLossRate <= 1, 'world.deathLossRate 必须在 0～1');
    const combat = object(input.combat) ? input.combat : {};
    for (const key of ['radius', 'health', 'stamina', 'speed', 'attackDamage', 'attackRange', 'attackArc', 'attackWindup', 'attackActive', 'attackRecovery', 'blinkDistance', 'blinkCooldown', 'blinkProtection', 'blockDrain', 'blockHitCost', 'blockArc', 'perfectWindow', 'staminaRegen']) {
        check(positive(combat[key]), `combat.${key} 必须大于零`);
    }
    check(nonnegative(combat.blockDamageRatio) && combat.blockDamageRatio <= 1, 'combat.blockDamageRatio 必须在 0～1');
    check(positive(combat.attackArc) && combat.attackArc <= 360, 'combat.attackArc 最大 360');
    check(positive(combat.blockArc) && combat.blockArc <= 360, 'combat.blockArc 最大 360');
    const allIds = new Set<string>();
    const list = (name: string): Record<string, unknown>[] => {
        const value = input[name];
        if (!Array.isArray(value) || value.length === 0) { errors.push(`${name} 不能为空`); return []; }
        return value.flatMap((entry, i) => {
            if (!object(entry)) { errors.push(`${name}[${i}] 必须是对象`); return []; }
            if (typeof entry.id !== 'string' || !entry.id || allIds.has(entry.id)) errors.push(`${name}[${i}].id 缺失或重复`);
            else allIds.add(entry.id);
            return [entry];
        });
    };
    const characters = list('characters');
    check(characters.length === 2, 'characters 必须有两个角色');
    check(['warden','hunter'].every(id=>characters.some(c=>c.id===id)),'characters 必须包含 warden 和 hunter');
    for (const c of characters) check(typeof c.name === 'string' && typeof c.talent === 'string', `characters.${c.id} 需要名称和天赋`);
    const materials = list('materials'), equipment = list('equipment'), recipes = list('recipes'), monsters = list('monsters');
    const materialIds = new Set(materials.map(m => m.id));
    const itemIds = new Set([...materials, ...equipment].map(e => e.id));
    for (const e of equipment) {
        check(SLOTS.some(s => s === e.slot), `equipment.${e.id}.slot 非法`);
        check(RARITIES.some(r => r === e.rarity), `equipment.${e.id}.rarity 非法`);
        check(nonnegative(e.attack) && nonnegative(e.defense), `equipment.${e.id} 属性非法`);
        if(e.tier!==undefined)check(positive(e.tier)&&Number.isSafeInteger(e.tier),`equipment.${e.id}.tier 非法`);
        for(const k of ['warmth','cooling'])if(e[k]!==undefined)check(nonnegative(e[k]),`equipment.${e.id}.${k} 非法`);
    }
    for(const slot of SLOTS)for(const rarity of RARITIES)check(equipment.some(e=>e.slot===slot&&e.rarity===rarity),`equipment 缺少 ${slot}/${rarity}`);
    for (const r of recipes) {
        check(itemIds.has(r.output), `recipes.${r.id}.output 缺失引用`);
        if (!Array.isArray(r.materials) || !r.materials.length) errors.push(`recipes.${r.id}.materials 不能为空`);
        else for (const m of r.materials) check(object(m) && materialIds.has(m.id) && positive(m.count) && Number.isInteger(m.count), `recipes.${r.id} 材料引用或数量非法`);
    }
    for (const m of monsters) {
        for (const key of ['health', 'damage', 'radius', 'speed', 'aggroRange', 'range', 'windup', 'recovery']) check(positive(m[key]), `monsters.${m.id}.${key} 非法`);
        check(Array.isArray(m.drops) && m.drops.every(id => itemIds.has(id)), `monsters.${m.id}.drops 缺失引用`);
        if (m.role !== undefined) check(['melee','fast','siege'].includes(m.role as string), `monsters.${m.id}.role 非法`);
        if (m.rare !== undefined) check(object(m.rare) && materialIds.has(m.rare.material) && nonnegative(m.rare.chance) && m.rare.chance <= 1 && positive(m.rare.guarantee) && Number.isSafeInteger(m.rare.guarantee), `monsters.${m.id}.rare 非法`);
    }
    const loot = object(input.loot) ? input.loot : {};
    for (const k of ['equipmentChance','blueChance']) check(nonnegative(loot[k]) && loot[k] <= 1, `loot.${k} 概率非法`);
    const growth = object(input.growth) ? input.growth : {};
    for (const key of ['combatThresholds', 'gatheringThresholds', 'skillLevels']) {
        const values = growth[key];
        check(Array.isArray(values) && values.length > 0 && values.every((v, i) => positive(v) && Number.isInteger(v) && (i === 0 || v > values[i - 1])), `growth.${key} 必须严格递增`);
    }
    for(const key of ['killXp','gatherXp','healthPerLevel','attackPerLevel','gatherSpeedPerLevel','wardenLoggingTime','wardenFreeRepairEvery','hunterCounterBonus','hunterCounterSeconds','hunterBlinkBonus','hunterBlinkSeconds','toolLevel'])check(positive(growth[key]),`growth.${key} 非法`);
    check(positive(growth.wardenLoggingTime)&&growth.wardenLoggingTime<=1,'growth.wardenLoggingTime 最大 1');
    for(const key of ['killXp','gatherXp','wardenFreeRepairEvery','toolLevel'])check(Number.isSafeInteger(growth[key]),`growth.${key} 必须是整数`);
    check(Array.isArray(growth.toolCost)&&growth.toolCost.length>0&&growth.toolCost.every(m=>object(m)&&materialIds.has(m.id)&&positive(m.count)&&Number.isSafeInteger(m.count)),'growth.toolCost 非法');
    check(Array.isArray(growth.skillLevels)&&growth.skillLevels.length===2&&Array.isArray(growth.combatThresholds)&&growth.skillLevels.every(n=>typeof n==='number'&&n<=(growth.combatThresholds as unknown[]).length+1),'growth.skillLevels 需要两个有效等级');
    check(Array.isArray(growth.gatheringThresholds)&&typeof growth.toolLevel==='number'&&growth.toolLevel<=growth.gatheringThresholds.length+1,'growth.toolLevel 超出采集上限');
    const survival = object(input.survival) ? input.survival : {};
    for (const key of ['capacity','interactionRange','buildRange','hungerMax','hungerDrain','foodRestore','starvationDamage',
        'respawnSeconds','respawnProtection','respawnHunger','relocationSeconds','relocationCooldown','safeEnemyRange',
        'repairSeconds','repairHealth','raidBudget','raidGrowth','spawnInterval','spawnRadius','maxEnemies','frenzy','autosaveSeconds','aggroSeconds','aggroRest']) {
        check(positive(survival[key]), `survival.${key} 必须大于零`);
    }
    for (const key of ['capacity','raidBudget','raidGrowth','maxEnemies']) check(Number.isSafeInteger(survival[key]), `survival.${key} 必须是整数`);
    const costsValid = (value: unknown) => Array.isArray(value) && value.every(m => object(m) && materialIds.has(m.id) && positive(m.count) && Number.isSafeInteger(m.count));
    const environment = object(input.environment) ? input.environment : {};
    for(const k of ['comfort','safeLow','safeHigh'])check(typeof environment[k]==='number'&&Number.isFinite(environment[k]),`environment.${k} 非法`);
    for(const k of ['changePerSecond','damage','damageInterval','facilityRange','fuelSeconds','maxFuel','facilityProtection'])check(positive(environment[k]),`environment.${k} 非法`);
    check(typeof environment.safeLow==='number'&&typeof environment.safeHigh==='number'&&typeof environment.comfort==='number'&&environment.safeLow<environment.comfort&&environment.comfort<environment.safeHigh,'environment 安全温度范围非法');
    check(Array.isArray(environment.seasons)&&environment.seasons.length===4,'environment 需要四季');
    if(Array.isArray(environment.seasons))for(const s of environment.seasons)check(object(s)&&typeof s.name==='string'&&typeof s.temperature==='number'&&Number.isFinite(s.temperature)&&nonnegative(s.nightBonus)&&positive(world.day)&&s.nightBonus<world.day&&monsters.some(m=>m.id===s.monster)&&monsters.some(m=>m.id===s.boss&&m.elite===true)&&materialIds.has(s.material),'environment.seasons 引用或参数非法');
    const skills = list('skills');
    check(skills.length === SKILLS.length && SKILLS.every(id => skills.some(s => s.id === id)), 'skills 必须包含四种技能');
    for (const s of skills) {
        check(typeof s.name === 'string' && positive(s.cooldown) && positive(s.cast) && positive(s.range) && positive(s.arc) && s.arc <= 360, `skills.${s.id} 时序或范围非法`);
        for (const key of ['damage', 'knockback', 'heal', 'duration']) check(nonnegative(s[key]), `skills.${s.id}.${key} 非法`);
        check(costsValid(s.cost) && costsValid(s.trainingCost), `skills.${s.id} 材料引用非法`);
    }
    check(costsValid(survival.relocationCost), 'survival.relocationCost 非法');
    check(costsValid(survival.repairCost), 'survival.repairCost 非法');
    const resourceIds = new Set<string>();
    check(Array.isArray(survival.resources) && survival.resources.length > 0, 'survival.resources 缺失');
    if (Array.isArray(survival.resources)) for (const r of survival.resources) {
        const valid = object(r) && typeof r.id === 'string' && !resourceIds.has(r.id) && materialIds.has(r.item)
            && positive(r.count) && Number.isSafeInteger(r.count) && positive(r.seconds) && nonnegative(r.regrow)
            && (r.tool === null || typeof r.tool === 'string') && typeof r.blocking === 'boolean';
        check(valid, 'survival.resources 引用、ID 或参数非法'); if (object(r) && typeof r.id === 'string') resourceIds.add(r.id);
        if (object(r)) for (const key of ['yieldBySeason', 'regrowBySeason']) if (r[key] !== undefined) check(Array.isArray(r[key]) && r[key].length === 4 && r[key].every(positive), `survival.resources.${r.id}.${key} 需要四季正数`);
    }
    for (const id of ['wood','stone','food','herb']) check(resourceIds.has(id), `survival.resources 缺少 ${id}`);
    const buildingIds = new Set<string>();
    check(Array.isArray(survival.buildings), 'survival.buildings 缺失');
    if (Array.isArray(survival.buildings)) for (const b of survival.buildings) {
        check(object(b) && BUILDINGS.some(id=>id===b.id) && typeof b.id === 'string' && !buildingIds.has(b.id) && positive(b.health) && costsValid(b.costs) && (b.repairCost===undefined||costsValid(b.repairCost)), 'survival.buildings 非法');
        if (object(b) && typeof b.id === 'string') buildingIds.add(b.id);
        if(object(b)&&b.fuel!==undefined)check(materialIds.has(b.fuel),`survival.buildings.${b.id}.fuel 缺失引用`);
    }
    for (const id of BUILDINGS) check(buildingIds.has(id), `survival.buildings 缺少 ${id}`);
    if (Array.isArray(survival.buildings)) for (const b of survival.buildings) if (object(b) && b.upgradeTo !== undefined) check(typeof b.upgradeTo==='string' && buildingIds.has(b.upgradeTo) && b.upgradeTo !== b.id, `survival.buildings.${b.id} 升级引用非法`);
    const obtainable=new Set<string>();
    if(Array.isArray(survival.resources))for(const r of survival.resources)if(object(r))obtainable.add(r.item as string);
    for(const m of monsters){if(Array.isArray(m.drops))for(const id of m.drops)obtainable.add(id as string);if(object(m.rare))obtainable.add(m.rare.material as string);}
    for(let i=0;i<recipes.length;i++)for(const r of recipes)if(Array.isArray(r.materials)&&r.materials.every(m=>object(m)&&obtainable.has(m.id as string)))obtainable.add(r.output as string);
    for(const e of equipment)check(obtainable.has(e.id as string),`equipment.${e.id} 没有可达获取路线`);
    if (errors.length) throw new Error(`配置校验失败：\n${errors.join('\n')}`);
    return input as unknown as GameConfig;
}
