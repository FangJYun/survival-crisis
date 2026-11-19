import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {parseConfig}=require('../.test-output/assets/scripts/domain/config.js');
const {SurvivalRun}=require('../.test-output/assets/scripts/domain/survival.js');
const {runValidator}=require('../.test-output/assets/scripts/domain/run-validation.js');
const {PlaytestStorage}=require('../.test-output/assets/scripts/application/season-playtest.js');
const {SaveStore}=require('../.test-output/assets/scripts/application/save-store.js');
const config=parseConfig(JSON.parse(readFileSync('assets/resources/config/game.json','utf8'))),original=JSON.stringify(config),valid=runValidator(config);
let run=new SurvivalRun(config,42),store=new SaveStore(new PlaytestStorage(),valid);
// 长周期规则浸泡，不冒充自然生存：仅测试塔耐久抬高，预置食物避免饥饿干扰。
run.tower.health=run.tower.maxHealth=1000000000;run.state.inventory.materials.food=1000;
const start=performance.now(),days=[],seasons=new Set([run.calendar.season]),maxTicks=Math.ceil((config.world.day+config.world.dusk+config.world.night)*config.world.seasonDays*4*30)+30;
let ticks=0,lastDay=1,maxEnemies=run.battle.enemies.length,heapPeak=0,foodCommands=0;
while(run.calendar.year===1&&ticks<maxTicks){
    if(run.battle.alive&&run.state.hunger<30)assert.ok(run.manage(`soak-food-${foodCommands++}`,'food'));
    run.tick(1/30);ticks++;assert.equal(run.state.ended,false,'规则浸泡塔不应提前终局');
    maxEnemies=Math.max(maxEnemies,run.battle.enemies.filter(e=>e.health>0).length);seasons.add(run.calendar.season);
    if(ticks%1800===0)heapPeak=Math.max(heapPeak,process.memoryUsage().heapUsed);
    if(run.calendar.day!==lastDay){
        const before=run.snapshot();assert.ok(valid(before),`第 ${run.calendar.day} 天状态无效`);
        await store.commit(before,`soak-day-${run.calendar.day}`);
        const recoveredStore=new SaveStore(store.storage,valid),loaded=await recoveredStore.load();
        assert.equal(JSON.stringify(loaded.value),JSON.stringify(before));
        run=new SurvivalRun(config,42,loaded.value);assert.equal(JSON.stringify(run.snapshot()),JSON.stringify(before));store=recoveredStore;
        lastDay=run.calendar.day;days.push({day:lastDay,season:run.calendar.season,time:run.state.time,tower:run.tower.health,deaths:run.state.stats.deaths,enemies:run.battle.enemies.length});
        console.error(`全年规则浸泡：第 ${lastDay} 天，已核对存取与世界重建`);
    }
}
assert.equal(run.calendar.year,2);assert.equal(run.calendar.season,0);assert.equal(run.calendar.day,config.world.seasonDays*4+1);
assert.equal(seasons.size,4);assert.equal(run.world.state.seed,42);assert.equal(Object.keys(run.environment.events).length,4);
assert.ok(Object.values(run.environment.events).every(e=>e.status==='missed'||e.status==='defeated'));
assert.equal(JSON.stringify(config),original);
console.log(JSON.stringify({kind:'default-duration domain soak; no rendering; fixture tower durability and food; not natural survival balance',node:process.version,wallSeconds:(performance.now()-start)/1000,
    ticks,simulationSeconds:run.state.time,daySeconds:config.world.day+config.world.dusk+config.world.night,seasonDays:config.world.seasonDays,
    restoredDays:days.length,maxEnemies,heapSamplePeak:heapPeak,foodCommands,final:{calendar:run.calendar,tower:run.tower.health,deaths:run.state.stats.deaths,events:run.environment.events},days},null,2));
