import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseConfig,SLOTS} from '../assets/scripts/domain/config';
import {SurvivalRun} from '../assets/scripts/domain/survival';
import {runValidator} from '../assets/scripts/domain/run-validation';
import {SaveStore} from '../assets/scripts/application/save-store';
import {Session} from '../assets/scripts/application/session';
import {PlaytestStorage} from '../assets/scripts/application/season-playtest';
import {outcomeCheckpoint,outcomeStorage} from '../assets/scripts/application/outcome-playtest';
const config=()=>parseConfig(JSON.parse(readFileSync('assets/resources/config/game.json','utf8')));
test('死亡结果样本：实际敌人攻击触发部分永久损失，背包豁免且读档不重掷',async()=>{
    const c=config(),initial=outcomeCheckpoint(c,'death'),valid=runValidator(c);assert.ok(valid(initial));
    const r=new SurvivalRun(c,7,initial),bag=JSON.stringify(r.state.inventory.equipment),materials=JSON.stringify(r.state.inventory.materials);
    assert.equal(SLOTS.filter(slot=>r.state.inventory.worn[slot]).length,5);
    for(let i=0;i<90&&r.battle.alive;i++)r.tick(1/30);
    assert.equal(r.state.stats.deaths,1);assert.ok(r.state.lost.length>0&&r.state.lost.length<5);assert.equal(r.state.drops.length,0);
    assert.equal(JSON.stringify(r.state.inventory.equipment),bag);assert.equal(JSON.stringify(r.state.inventory.materials),materials);
    const disk=new PlaytestStorage(),store=new SaveStore(outcomeStorage(disk),valid);await store.commit(r.snapshot(),'death');
    const recovered=(await new SaveStore(outcomeStorage(disk),valid).load()).value!;
    const restored=new SurvivalRun(c,7,recovered),lost=JSON.stringify(restored.state.lost),random=restored.state.random.death;
    for(let i=0;i<250;i++)restored.tick(1/30);
    assert.ok(restored.battle.alive);assert.equal(restored.state.stats.deaths,1);assert.equal(JSON.stringify(restored.state.lost),lost);assert.equal(restored.snapshot().random.death,random);
});
test('塔毁样本：攻城怪真实攻击进入终局，重建 Session 仍禁止动作',async()=>{
    const c=config(),valid=runValidator(c),r=new SurvivalRun(c,7,outcomeCheckpoint(c,'tower'));assert.ok(valid(r.snapshot()));
    for(let i=0;i<150&&!r.state.ended;i++)r.tick(1/30);
    assert.ok(r.state.ended);assert.equal(r.tower.health,0);
    const store=new SaveStore(outcomeStorage(new PlaytestStorage()),valid),s=new Session(r,store);assert.ok(await s.save());
    const final=(await store.load()).value!;assert.ok(final.ended);
    const loaded=new Session(new SurvivalRun(c,7,final),store);assert.equal(loaded.command(()=>assert.fail()),false);
});
test('结果样本的持久键均隔离，已有正常旅程原样保留',async()=>{
    const normal=new PlaytestStorage();await normal.write('snapshot-0','normal-save');
    const keys:string[]=[],scoped=outcomeStorage({async read(key){keys.push(key);return normal.read(key);},async write(key,value){keys.push(key);await normal.write(key,value);}});
    const c=config(),store=new SaveStore(scoped,runValidator(c));assert.equal((await store.load()).value,null);
    await store.commit(outcomeCheckpoint(c,'death'),'initial');assert.ok(keys.every(key=>key.startsWith('qa-outcomes/')));
    assert.equal(await normal.read('snapshot-0'),'normal-save');assert.ok((await new SaveStore(outcomeStorage(normal),runValidator(c)).load()).value);
});
