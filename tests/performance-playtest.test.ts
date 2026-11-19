import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseConfig} from '../assets/scripts/domain/config';
import {runValidator} from '../assets/scripts/domain/run-validation';
import {SurvivalRun} from '../assets/scripts/domain/survival';
import {performanceCheckpoint,FrameObservation,LONG_PROBE_SECONDS,sustainedLoadConfig} from '../assets/scripts/application/performance-playtest';
import {calendarAt} from '../assets/scripts/domain/world';
import {qaMode} from '../assets/scripts/platform/qa-mode';

test('长测：微信调试冷启动显式进入，正式构建与非本地网页不会受启动参数影响',()=>{
    const wx={getLaunchOptionsSync:()=>({query:{qa:'performance-long'}})};
    assert.equal(qaMode(true,{wx}),'performance-long');assert.equal(qaMode(false,{wx}),null);
    assert.equal(qaMode(true,{wx:{getLaunchOptionsSync:()=>{throw new Error('unavailable');}}}),null);
    assert.equal(qaMode(true,{location:{hostname:'localhost',search:'?qa=performance-long'}}),'performance-long');
    assert.equal(qaMode(true,{location:{hostname:'example.com',search:'?qa=performance-long'}}),null);
});

test('长测：完整 30 分钟仍处于同一次夜袭，仅延长独立样本的黑夜',()=>{
    const config=parseConfig(JSON.parse(readFileSync('assets/resources/config/game.json','utf8'))),long=sustainedLoadConfig(config);
    const state=performanceCheckpoint(long),end=state.time+LONG_PROBE_SECONDS;
    assert.equal(calendarAt(end,long).phase,'night');assert.ok(calendarAt(end,config).day>1);
    assert.deepEqual({...long,world:{...long.world,night:config.world.night}},config);
    assert.ok(runValidator(long)(state));
});
test('压力场景：真实配置上限敌人、合法分散出生、配置不变且持续活动',()=>{
    const c=parseConfig(JSON.parse(readFileSync('assets/resources/config/game.json','utf8'))),before=JSON.stringify(c);
    const state=performanceCheckpoint(c);assert.ok(runValidator(c)(state));assert.equal(state.battle.enemies.length,c.survival.maxEnemies);
    assert.equal(new Set(state.battle.enemies.map(e=>e.id)).size,c.survival.maxEnemies);
    assert.ok(state.battle.enemies.some(e=>e.definition.role==='siege'));assert.ok(state.battle.enemies.some(e=>e.definition.role==='fast'));
    const r=new SurvivalRun(c,42,state);
    for(let i=0;i<900;i++)r.tick(1/30);
    assert.equal(r.battle.enemies.filter(e=>e.health>0).length,c.survival.maxEnemies);assert.ok(r.tower.health<r.tower.maxHealth);
    assert.ok(runValidator(c)(r.snapshot()));assert.equal(JSON.stringify(c),before);
});
test('帧观测：按实际时间计算 FPS，保留慢帧与负载范围，不把无效样本算通过',()=>{
    const o=new FrameObservation();assert.equal(o.result().fps,0);
    for(const delta of [.01,.01,.08])o.add({delta,work:delta*500,enemies:delta===.08?39:40,sprites:50,assets:35,heap:100});
    o.add({delta:0,work:1,enemies:0,sprites:0,assets:0,heap:null});
    const r=o.result();assert.equal(r.frames,3);assert.equal(r.fps,30);assert.equal(r.frameP95,80);assert.equal(r.workP95,40);assert.equal(r.minEnemies,39);assert.equal(r.maxEnemies,40);assert.equal(r.heapPeak,100);
});
