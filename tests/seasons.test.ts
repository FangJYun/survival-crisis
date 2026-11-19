import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseConfig} from '../assets/scripts/domain/config';
import {SurvivalRun} from '../assets/scripts/domain/survival';
import {calendarAt} from '../assets/scripts/domain/world';
import {runValidator} from '../assets/scripts/domain/run-validation';
const config=()=>parseConfig(JSON.parse(readFileSync('assets/resources/config/game.json','utf8')));
const make=()=>{const r=new SurvivalRun(config(),42);r.battle.enemies.splice(0);r.state.enemies={};return r;};
const advance=(r:SurvivalRun,t:number)=>{for(let i=0;i<Math.ceil(t*30);i++)r.tick(1/30);};
const at=(r:SurvivalRun,time:number)=>{r.state.time=time;r.battle.time=time;};
test('四季：精确季末／冬季长夜／跨年、大时间跳转纯查询保留世界',()=>{
    const c=config();assert.equal(calendarAt(4200-1e-5,c).season,0);assert.equal(calendarAt(4200,c).season,1);assert.equal(calendarAt(8400,c).season,2);assert.equal(calendarAt(12600,c).season,3);
    assert.equal(calendarAt(12600+299.99,c).phase,'day');assert.equal(calendarAt(12600+300,c).phase,'dusk');assert.equal(calendarAt(12600+360,c).phase,'night');assert.equal(calendarAt(12600+360,c).remaining,240);
    assert.deepEqual(calendarAt(16800,c),{day:29,phase:'day',remaining:360,season:0,year:2});assert.equal(calendarAt(16800*100,c).year,101);
    const r=make(),world=r.world.state;r.state.inventory.materials.wood=3;r.build({x:r.tower.cell.x+1,y:r.tower.cell.y-2},'wall');at(r,16799.99);advance(r,.1);assert.equal(r.calendar.year,2);assert.equal(r.world.state,world);assert.equal(r.state.buildings.length,2);
});
test('环境：冬季温度伤害按间隔，复活恢复安全体温且不改变塔血',()=>{
    const r=make();at(r,12600);advance(r,22);assert.ok(r.environment.temperature<5);assert.ok(r.battle.player.health<100);const hp=r.battle.player.health;advance(r,.1);assert.equal(r.battle.player.health,hp);
    r.battle.player.health=1;r.environment.damageAt=r.state.time;advance(r,.1);assert.equal(r.battle.alive,false);const tower=r.tower.health;advance(r,8.1);assert.equal(r.battle.alive,true);assert.ok(r.environment.temperature>=19);assert.equal(r.tower.health,tower);
});
test('设施：燃料、空间／距离限制，游戏时钟燃尽，篝火与降温有基础材料应对',()=>{
    for(const [time,kind,fuel] of [[12600,'campfire','wood'],[4200,'cooler','herb']] as const){
        const r=make();at(r,time);r.state.inventory.materials={wood:30,stone:30,herb:20};const cell={x:r.tower.cell.x+1,y:r.tower.cell.y-2};assert.ok(r.build(cell,kind));assert.ok(r.fuelFacility());const b=r.state.buildings[1];assert.equal(b.fuelUntil,time+120);advance(r,30);assert.equal(r.battle.player.health,100);assert.ok(r.environment.temperature>=5&&r.environment.temperature<=35);
        const restored=new SurvivalRun(r.config,42,r.snapshot());assert.equal(restored.state.buildings[1].fuelUntil,b.fuelUntil);assert.equal(restored.environment.temperature,r.environment.temperature);
        restored.state.inventory.materials[fuel]=0;const until=restored.state.buildings[1].fuelUntil;assert.equal(restored.fuelFacility(),false);assert.equal(restored.state.buildings[1].fuelUntil,until);restored.battle.player.position={x:1800,y:1800};assert.equal(restored.fuelFacility(),false);
    }
});
test('环境装备：白装已有全年可获取保护路线，保护不叠成反向危险',()=>{
    const r=make();for(const d of r.config.equipment.filter(d=>d.rarity==='white'&&d.slot!=='weapon'))r.state.inventory.worn[d.slot]={id:d.id,definition:d.id};at(r,12600+360);r.state.raid={night:r.calendar.day,remaining:0,next:0};advance(r,30);assert.ok(r.environment.temperature>=5);assert.equal(r.battle.player.health,100);
    at(r,4200);advance(r,35);assert.ok(r.environment.temperature<=35&&r.environment.temperature>=20);assert.equal(r.battle.player.health,100);
    for(const d of r.config.equipment.filter(d=>d.rarity==='gold'&&d.slot!=='weapon'))r.state.inventory.worn[d.slot]={id:d.id,definition:d.id};advance(r,30);assert.equal(r.environment.temperature,20);
});
test('季末首领：四事件唯一触发、保存恢复／迁塔不重复、击杀与黎明边界',()=>{
    for(let season=0;season<4;season++){
        const r=make();at(r,(season*7+6)*600+(season===3?300:360)-.01);advance(r,.1);const key=`1:${season}`,event=r.environment.events[key];assert.equal(event.status,'spawned');const id=event.enemy!;assert.equal(r.battle.enemies.filter(e=>e.id===id).length,1);
        const restored=new SurvivalRun(r.config,42,r.snapshot());advance(restored,.1);assert.equal(restored.environment.events[key].enemy,id);assert.equal(restored.battle.enemies.filter(e=>e.id===id).length,1);
        const e=restored.battle.enemies.find(e=>e.id===id)!;e.health=0;e.phase='dead';restored.battle.events.push({type:'kill',target:id,amount:0});advance(restored,.1);const mat=r.config.environment.seasons[season].material;assert.equal(restored.state.inventory.materials[mat],1);assert.equal(restored.environment.events[key].status,'defeated');
        restored.battle.events.push({type:'kill',target:id,amount:0});advance(restored,.1);assert.equal(restored.state.inventory.materials[mat],1);
        const missed=make();at(missed,(season*7+6)*600+(season===3?300:360)-.01);advance(missed,.1);at(missed,(season*7+7)*600-.01);advance(missed,.1);assert.equal(missed.environment.events[key].status,'missed');assert.equal(missed.state.inventory.materials[mat],undefined);
    }
});
test('加速一年集成：四季事件与建筑保存，温度／燃料／保底／技能版本完整校验',()=>{
    const c=config();c.world.day=2;c.world.dusk=.5;c.world.night=1;c.environment.seasons[3].nightBonus=.5;c.combat.health=100000;parseConfig(c);
    const r=new SurvivalRun(c,42);r.tower.health=100000;r.tower.maxHealth=100000;r.state.inventory.materials={wood:30,stone:30,herb:30};r.build({x:r.tower.cell.x+1,y:r.tower.cell.y-2},'campfire');r.fuelFacility();
    advance(r,3.5*28+.1);assert.equal(r.calendar.year,2);assert.equal(Object.keys(r.environment.events).length,4);assert.ok(Object.values(r.environment.events).every(e=>['missed','defeated'].includes(e.status)));assert.equal(r.state.buildings[1].kind,'campfire');assert.ok(runValidator(c)(r.snapshot()));
    const restored=new SurvivalRun(c,42,r.snapshot());assert.deepEqual(restored.environment,r.environment);assert.equal(restored.state.buildings[1].fuelUntil,r.state.buildings[1].fuelUntil);
    const invalid=r.snapshot();invalid.environment!.temperature=NaN;assert.equal(runValidator(c)(invalid),false);
});
