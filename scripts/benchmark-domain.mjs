import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {parseConfig}=require('../.test-output/assets/scripts/domain/config.js');
const {SurvivalRun}=require('../.test-output/assets/scripts/domain/survival.js');
const {performanceCheckpoint,LONG_PROBE_SECONDS,sustainedLoadConfig}=require('../.test-output/assets/scripts/application/performance-playtest.js');
const original=parseConfig(JSON.parse(readFileSync('assets/resources/config/game.json','utf8'))),long=process.argv.includes('--long');
const seconds=long?LONG_PROBE_SECONDS:60,config=long?sustainedLoadConfig(original):original;
const run=new SurvivalRun(config,42,performanceCheckpoint(config)),times=[];
const started=performance.now();
let minEnemies=Infinity,maxEnemies=0;
for(let index=0;index<seconds*30;index++){
    const start=performance.now();run.tick(1/30);times.push(performance.now()-start);
    const alive=run.battle.enemies.filter(enemy=>enemy.health>0).length;
    minEnemies=Math.min(minEnemies,alive);maxEnemies=Math.max(maxEnemies,alive);
}
assert.equal(minEnemies,config.survival.maxEnemies);assert.equal(run.state.ended,false);assert.equal(run.calendar.phase,'night');
times.sort((a,b)=>a-b);
console.log(JSON.stringify({kind:'Node domain only; no rendering or platform storage',node:process.version,ticks:times.length,simulationSeconds:seconds,
    wallSeconds:(performance.now()-started)/1000,minEnemies,maxEnemies,
    tickP95:times[Math.ceil(times.length*.95)-1],tickP99:times[Math.ceil(times.length*.99)-1],tickMax:times[times.length-1],
    enemies:run.battle.enemies.filter(e=>e.health>0).length,ended:run.state.ended},null,2));
