import { accessSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import path from 'node:path';
import {wechatPackageReport} from './wechat-package.mjs';

// 执行实际构建后的纯规则模块，捕获 TS 测试无法发现的 Cocos 转译差异。
const platform = process.argv[2];
if (!['web-mobile', 'wechatgame'].includes(platform)) throw new Error('未知构建平台');
const sceneConfig=JSON.parse(readFileSync(`build/${platform}/assets/main/config.json`,'utf8'));
assert.ok(Object.keys(sceneConfig.scenes).some(url=>url.endsWith('/Battle.scene')), '实际产物缺少 Battle.scene，Creator 返回完成码也不能视为成功');
const subpackages=platform==='wechatgame'?JSON.parse(readFileSync(`build/${platform}/game.json`,'utf8')).subpackages??[]:[];
if(platform==='wechatgame'){
    const buildConfig=JSON.parse(readFileSync('config/build-wechatgame.json','utf8'));
    const report=wechatPackageReport('build/wechatgame',buildConfig.packages.wechatgame.appid);
    assert.ok(report.packages.some(pkg=>pkg.name==='game-common'),'通用资源必须放入微信分包');
    const settings=JSON.parse(readFileSync('build/wechatgame/src/settings.json','utf8'));
    for(const pkg of report.packages)assert.ok(settings.assets.subpackages.includes(pkg.name),`引擎启动配置缺少分包 ${pkg.name}`);
    console.log('微信包体检查',JSON.stringify(report));
}
for(const name of ['startup','common','heroes','monsters','seasons']){
    const root=subpackages.find(pkg=>pkg.name===`game-${name}`)?.root??`assets/game-${name}`;
    const bundle=JSON.parse(readFileSync(`build/${platform}/${root}/config.json`,'utf8'));
    assert.ok(Object.values(bundle.paths).some(p=>p[0]==='manifest'),`缺少 game-${name} 内容清单`);
    if(name==='common')for(const asset of ['wilderness-atlas/texture','defense-atlas/texture','camp-ui-atlas/texture','attack','hit','gather','night','death'])assert.ok(Object.values(bundle.paths).some(p=>p[0]===asset),`缺少通用内容 ${asset}`);
}
const registrations = new Map();
const System = { register(name, dependencies, declare) {
    if(Array.isArray(name)){dependencies(()=>{},{}).execute();return;}
    registrations.set(name, { dependencies, declare });
} };
const runtime={System};
runInNewContext(readFileSync(`build/${platform}/src/chunks/bundle.js`, 'utf8'), runtime, { timeout: 5000 });
const cache=new Map();
runInNewContext(readFileSync(`build/${platform}/assets/main/index.js`, 'utf8'), runtime, { timeout: 5000 });
function load(name) {
    const file=name.includes('.')?name:`${name}.ts`;
    if(cache.has(file))return cache.get(file);
    const registration = registrations.get(`chunks:///_virtual/${file}`);
    assert.ok(registration, `构建中缺少 ${name} 模块`);
    const exports = {};cache.set(file,exports);
    const module = registration.declare((key, value) => {
        if (typeof key === 'object') { Object.assign(exports, key); return key; }
        exports[key] = value; return value;
    });
    registration.dependencies.forEach((dependency, index) => {
        // 使用实际构建的 Babel helpers；纯领域模块仅模拟编辑器注册标记，不装载画面引擎。
        if (path.basename(dependency) === 'rollupPluginModLoBabelHelpers.js') module.setters[index](load('rollupPluginModLoBabelHelpers.js'));
        else if (dependency === 'cc') module.setters[index]({ cclegacy: { _RF: { push() {}, pop() {} } } });
        else if(dependency.endsWith('.ts'))module.setters[index](load(path.basename(dependency)));
        else throw new Error(`未声明的规则模块依赖：${dependency}`);
    });
    module.execute(); return exports;
}
const { GridMap } = load('grid');
const { moveCircle } = load('movement');
const grid = new GridMap(10, 10, 48, { x: -240, y: -240 });
grid.setBlocked(5, 5, true); grid.setBlocked(5, 6, true);
const colliders = grid.colliders();
assert.equal(colliders.length, 2, 'Cocos 转译后 Set 必须展开为两格');
assert.ok(colliders.every(r => [r.x, r.y, r.width, r.height].every(Number.isFinite)), '构建后障碍坐标必须有限');
const start = { x: -80, y: 24 }, delta = { x: 220, y: 0 };
const stopped = moveCircle(start, delta, 18, grid.bounds, colliders, false);
assert.ok(stopped.x <= -18, '构建后高速移动不能穿墙');
grid.setBlocked(5, 5, false);
const cleared = moveCircle(start, delta, 18, grid.bounds, grid.colliders(), false);
assert.ok(cleared.x > 130, '解除格阻挡后可以通行');
const {parseConfig}=load('config'),{SurvivalRun}=load('survival'),{SaveStore}=load('save-store'),{runValidator}=load('run-validation');
const config=parseConfig(JSON.parse(readFileSync('assets/resources/config/game.json','utf8')));
const {defenseLayout}=load('defense-layout'),{defenseCheckpoint}=load('defense-playtest');
const enclosure=defenseCheckpoint(config);assert.ok(runValidator(config)(enclosure));
const enclosureShapes=defenseLayout(enclosure.buildings);
assert.equal(enclosureShapes.size,24,'实际构建必须派生完整闭合墙圈');
const sideGate=enclosure.buildings.find(b=>b.kind==='gate'&&b.cell.x>enclosure.buildings[0].cell.x);
assert.equal(enclosureShapes.get(sideGate.id).axis,'vertical','实际构建侧门必须纵向连接');
const southGate=enclosure.buildings.find(b=>b.kind==='gate'&&b.cell.y<enclosure.buildings[0].cell.y);
assert.equal(enclosureShapes.get(southGate.id).mask,10,'实际构建底部门必须横向连接');
const {playGuide}=load('play-guide'),{safeLayout}=load('safe-layout');
assert.equal(playGuide(config).length,6,'实际产物必须包含完整游戏手册');
const fitted=safeLayout(1280,656,.5,.45);
assert.ok(fitted.scale*720<=656&&Math.abs(fitted.y-32.8)<1e-6,'实际产物必须在安全区内缩放并居中');
const {performanceCheckpoint}=load('performance-playtest');
const loadSnapshot=performanceCheckpoint(config);assert.ok(runValidator(config)(loadSnapshot));
assert.equal(loadSnapshot.battle.enemies.length,config.survival.maxEnemies,'实际构建压力样本须达到配置上限');
const {outcomeCheckpoint,outcomeStorage}=load('outcome-playtest');
const deathCase=new SurvivalRun(config,7,outcomeCheckpoint(config,'death'));
for(let i=0;i<90&&deathCase.battle.alive;i++)deathCase.tick(1/30);
assert.equal(deathCase.state.stats.deaths,1,'实际构建的死亡样本必须受到敌人攻击');
assert.equal(deathCase.state.lost.length,2,'实际构建的默认概率五槽独立损失保持固定种子结果');
const qaDisk=new Map([['snapshot-0','normal-save']]),qaStore=new SaveStore(outcomeStorage({async read(k){return qaDisk.get(k)??null;},async write(k,v){qaDisk.set(k,v);}}),runValidator(config));
const deathSnapshot=deathCase.snapshot();await qaStore.commit(deathSnapshot,'qa-death');
assert.equal(qaDisk.get('snapshot-0'),'normal-save','结果样本不可覆盖正常存档键');
assert.equal(JSON.stringify((await qaStore.load()).value.lost),JSON.stringify(deathSnapshot.lost));
const towerCase=new SurvivalRun(config,7,outcomeCheckpoint(config,'tower'));
for(let i=0;i<150&&!towerCase.state.ended;i++)towerCase.tick(1/30);
assert.ok(towerCase.state.ended&&towerCase.tower.health===0,'实际构建的攻城样本必须正确进入终局');
const run=new SurvivalRun(config,42);
assert.equal(run.interact(),true);
for(let i=0;i<50;i++)run.tick(1/30);
assert.equal(run.state.inventory.materials.wood,4,'构建后采集必须交付材料');
assert.equal(run.progression.gathering.logging,20,'构建后采集经验必须交付');
const hunter=new SurvivalRun(config,42,undefined,'hunter');assert.equal(hunter.progression.hero,'hunter');
assert.ok(hunter.battle.blink());hunter.battle.attack();assert.equal(hunter.battle.snapshot().swing.damage,30,'构建后猎手闪现增益');
assert.ok(run.manage('craft','craft','craft-weapon'));
assert.ok(run.manage('equip','equip',run.state.inventory.equipment[0].id));
const snapshot=run.snapshot();assert.ok(runValidator(config)(snapshot));
if(platform==='wechatgame'){
    const {localStoragePort}=load('storage');
    const directory=mkdtempSync(path.join(tmpdir(),'survival-build-save-'));
    const storageApi={accessSync,readFileSync,writeFileSync,renameSync,mkdirSync:(folder,recursive)=>mkdirSync(folder,{recursive})};
    runtime.wx={env:{USER_DATA_PATH:directory},getFileSystemManager:()=>storageApi};
    try{
        const createStore=()=>new SaveStore(localStoragePort(),runValidator(config));
        await createStore().commit(snapshot,'wechat-file-smoke');
        const recovered=(await createStore().load()).value;
        assert.equal(JSON.stringify(recovered),JSON.stringify(snapshot),'微信产物必须从独立磁盘存储实例恢复完整快照');
        console.log('微信产物文件存档检查通过（本地文件模拟 wx API，未访问游戏存档）');
    }finally{
        delete runtime.wx;
        rmSync(directory,{recursive:true,force:true});
    }
}
const disk=new Map(),store=new SaveStore({async read(k){return disk.get(k)??null;},async write(k,v){disk.set(k,v);}},runValidator(config));
await store.commit(snapshot,'smoke');assert.equal((await store.load()).value.inventory.worn.weapon.definition,'basic-weapon');
const restored=new SurvivalRun(config,42,(await store.load()).value);
assert.equal(restored.state.inventory.materials.wood,1);
restored.progression.combatXp=2000;restored.state.inventory.materials={hide:20,stone:30,wood:30,herb:10};
assert.ok(restored.manage('learn1','learn','sweep'));assert.ok(restored.manage('learn2','learn','first-aid'));assert.equal(restored.manage('third','learn','warcry'),false);
assert.ok(restored.cast(0));assert.equal(restored.cast(0),false);assert.ok(runValidator(config)(restored.snapshot()));
const pending=new SurvivalRun(config,42);pending.battle.enemies.splice(0);pending.state.enemies={};pending.progression.combatXp=2000;pending.state.inventory.materials={hide:4,stone:4};
assert.ok(pending.manage('learn','learn','sweep'));
const target=pending.battle.spawn('pending-kill',config.monsters[0],{x:pending.battle.player.position.x,y:pending.battle.player.position.y-50});target.health=1;
pending.state.enemies[target.id]={source:'raid',rewarded:false,target:'',path:[],revision:-1,replan:0};assert.ok(pending.cast(0));
const resumed=new SurvivalRun(config,42,pending.snapshot());resumed.tick(1/30);assert.equal(resumed.state.stats.kills,1,'技能击杀后立即读档不能丢失待结算奖励');
const {calendarAt}=load('world');assert.equal(calendarAt(12600+360,config).remaining,240);assert.equal(calendarAt(16800,config).year,2);
assert.equal(config.equipment.length,20);
const {NewGameGate}=load('new-game-gate');
const gate=new NewGameGate();assert.equal(gate.request(true),false);gate.cancel();assert.equal(gate.confirm(),false);
gate.request(true);assert.equal(gate.confirm(),true);assert.equal(gate.confirm(),false);
console.log(`${platform} 构建产物检查通过：五组内容、手册与安全区、碰撞、采集、20装备、四选二技能、冬季长夜、跨年、存档恢复、新局确认、死亡损失与塔毁样本`);
