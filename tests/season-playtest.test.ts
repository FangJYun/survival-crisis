import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseConfig} from '../assets/scripts/domain/config';
import {SurvivalRun} from '../assets/scripts/domain/survival';
import {runValidator} from '../assets/scripts/domain/run-validation';
import {PlaytestStorage,SEASON_SAMPLES,seasonCheckpoint} from '../assets/scripts/application/season-playtest';
import {SaveStore} from '../assets/scripts/application/save-store';
const config=()=>parseConfig(JSON.parse(readFileSync('assets/resources/config/game.json','utf8')));
const advance=(r:SurvivalRun)=>{for(let i=0;i<450;i++)r.tick(1/30);};

test('常速季节样本：中途存取不重置体温、燃料、首领与跨年，基础防护可用',async()=>{
    const c=config(),original=JSON.stringify(c),valid=runValidator(c);
    for(const sample of SEASON_SAMPLES){
        const initial=seasonCheckpoint(c,sample);assert.ok(valid(initial),sample.id);
        const run=new SurvivalRun(c,42,initial);advance(run);
        const store=new SaveStore(new PlaytestStorage(),valid),before=run.snapshot();
        await store.commit(before,'half');const loaded=await store.load();assert.deepEqual(loaded.value,before);
        const restored=new SurvivalRun(c,42,loaded.value!);assert.deepEqual(restored.snapshot(),before);advance(restored);
        assert.ok(valid(restored.snapshot()),sample.id);
        if(sample.protection==='none'&&sample.id!=='spring-boss')assert.ok(restored.battle.player.health<c.combat.health,sample.id);
        else assert.equal(restored.battle.player.health,c.combat.health,sample.id);
        if(sample.protection==='campfire'||sample.protection==='cooler')assert.ok(Math.abs(restored.state.buildings[1].fuelUntil!-restored.state.time-90)<.01);
        if(sample.id==='spring-boss')assert.equal(restored.environment.events['1:0'].status,'spawned');
        if(sample.id==='winter-armor'){assert.equal(restored.calendar.phase,'night');assert.ok(Math.abs(restored.calendar.remaining-210)<.01);}
        if(sample.id==='year-end'){assert.equal(restored.calendar.year,2);assert.equal(restored.calendar.season,0);}
    }
    assert.equal(JSON.stringify(c),original);
});
test('常速样本临时存储隔离：不同实例不能读取彼此进度',async()=>{
    const a=new PlaytestStorage(),b=new PlaytestStorage();await a.write('survival-v1','temporary');
    assert.equal(await b.read('survival-v1'),null);assert.equal(await a.read('survival-v1'),'temporary');
});
test('失去全部防护装备后：保留营地与材料，复活可补燃料走出冷热死亡循环',()=>{
    for(const id of ['summer-cooler','winter-fire']){
        const c=config();c.world.deathLossRate=1;
        const sample=SEASON_SAMPLES.find(s=>s.id===id)!;
        const r=new SurvivalRun(c,42,seasonCheckpoint(c,sample));
        for(const def of c.equipment.filter(e=>e.rarity==='white'))r.state.inventory.worn[def.slot]={id:`death-${def.id}`,definition:def.id};
        r.state.buildings[1].fuelUntil=r.state.time;
        r.battle.player.health=1;r.environment.temperature=id==='summer-cooler'?100:-100;r.environment.damageAt=r.state.time;
        r.tick(1/30);assert.equal(r.state.stats.deaths,1);assert.equal(Object.keys(r.state.inventory.worn).length,0);
        for(let i=0;i<244;i++)r.tick(1/30);
        assert.ok(r.battle.alive);assert.equal(r.state.buildings.length,2);
        assert.ok(r.fuelFacility());
        for(let i=0;i<1800;i++)r.tick(1/30);
        assert.equal(r.state.stats.deaths,1);assert.equal(r.battle.player.health,c.combat.health);
        assert.ok(r.environment.temperature>=c.environment.safeLow&&r.environment.temperature<=c.environment.safeHigh);
    }
});
