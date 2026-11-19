import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseConfig} from '../assets/scripts/domain/config';
import {SurvivalRun} from '../assets/scripts/domain/survival';
import {runValidator} from '../assets/scripts/domain/run-validation';
import {World,findPath} from '../assets/scripts/domain/world';
import {GridMap} from '../assets/scripts/domain/grid';
const config=()=>parseConfig(JSON.parse(readFileSync('assets/resources/config/game.json','utf8')));
const make=()=>{const r=new SurvivalRun(config(),42);r.battle.enemies.splice(0);r.state.enemies={};return r;};
const advance=(r:SurvivalRun,t:number)=>{for(let i=0;i<Math.ceil(t*30);i++)r.tick(1/30);};
function add(r:SurvivalRun,id:string,definition='stalker',x=300,y=0){const p=r.towerPosition,e=r.battle.spawn(id,r.config.monsters.find(d=>d.id===definition)!,{x:p.x+x,y:p.y+y});r.state.enemies[id]={source:'raid',rewarded:false,target:'',path:[],revision:-1,replan:0};return e;}
test('防线：木→石→强化升级原子扣料、保留生命比例与阻挡，三类可修可毁并恢复',()=>{
    const r=make();r.state.inventory.materials={wood:50,stone:50,'ancient-core':5};const cell={x:r.tower.cell.x+1,y:r.tower.cell.y-2};assert.ok(r.build(cell,'wall'));const b=r.state.buildings.find(b=>b.kind==='wall')!;
    b.health=60;assert.ok(r.upgradeWall());assert.equal(b.kind,'stone-wall');assert.equal(b.health,150);assert.ok(r.world.grid.isBlocked(cell.x,cell.y));
    assert.ok(r.repair());advance(r,1);assert.equal(b.health,180);assert.ok(r.upgradeWall());assert.equal(b.kind,'reinforced-wall');assert.equal(b.health,390);
    assert.ok(runValidator(r.config)(r.snapshot()));const restored=new SurvivalRun(r.config,42,r.snapshot());assert.equal(restored.state.buildings[1].kind,'reinforced-wall');assert.ok(restored.world.grid.isBlocked(cell.x,cell.y));
    restored.damageBuilding(b.id,9999);assert.equal(restored.world.grid.isBlocked(cell.x,cell.y),false);
    const a=make();a.state.inventory.materials.wood=3;a.build(cell,'wall');const before=JSON.stringify(a.state.inventory);assert.equal(a.upgradeWall(),false);assert.equal(JSON.stringify(a.state.inventory),before);assert.equal(a.state.buildings[1].kind,'wall');
});
test('仇恨：攻城优先塔，近战吸引有时间上限；远离塔不冻结战斗',()=>{
    const r=make();const melee=add(r,'melee','stalker',0,-160),siege=add(r,'siege','siege',0,-200);advance(r,.1);assert.equal(r.state.enemies[melee.id].target,'player');assert.equal(r.state.enemies[siege.id].target,'tower');
    r.battle.player.health=100000;r.battle.config.health=100000;advance(r,7);assert.ok((r.state.enemies[melee.id].restUntil||0)>0);r.battle.player.position={x:1800,y:1800};const hp=r.tower.health;advance(r,10);assert.ok(r.tower.health<hp);
});
test('寻路：多层封闭墙仍能破防，动态门与倒塌改变通路，远端变化不失效局部路径',()=>{
    const grid=new GridMap(12,12,48,{x:0,y:0});const path=findPath(grid,{x:1,y:1},[{x:4,y:1}]);const version=grid.revision;grid.setBlocked(10,10,true);assert.equal(grid.pathInvalidated(version,path),false);grid.setBlocked(2,1,true);assert.equal(grid.pathInvalidated(version,path),true);
    const r=make(),home=r.tower.cell;r.battle.player.position={x:1800,y:1800};r.tower.health=100000;r.tower.maxHealth=100000;
    for(let radius=1;radius<=2;radius++)for(let y=-radius;y<=radius;y++)for(let x=-radius;x<=radius;x++)if(Math.max(Math.abs(x),Math.abs(y))===radius){const cell={x:home.x+x,y:home.y+y};r.state.buildings.push({id:`wall-${x}:${y}`,kind:'wall',cell,health:10,maxHealth:120,open:false});r.world.grid.setBlocked(cell.x,cell.y,true);}
    add(r,'siege1','siege',360,0);add(r,'siege2','siege',420,0);advance(r,50);assert.ok(r.tower.health<100000);assert.ok(r.state.buildings.length<25);
    const door=make();door.state.inventory.materials.wood=5;const cell={x:home.x+1,y:home.y-2};door.build(cell,'gate');const b=door.state.buildings[1];door.battle.player.position=door.world.center({x:cell.x,y:cell.y+1});assert.ok(door.interact());assert.equal(b.open,true);assert.equal(door.world.grid.isBlocked(cell.x,cell.y),false);
});
test('掉落：普通怪只直接掉白蓝，重复击杀无重复奖励，满包保留落地实例',()=>{
    const r=make();r.config.loot.equipmentChance=1;r.config.loot.blueChance=1;r.state.inventory.capacity=0;const e=add(r,'loot');e.health=0;e.phase='dead';r.battle.events.push({type:'kill',target:e.id,amount:0});advance(r,.05);
    const item=r.state.drops.find(d=>d.equipment)!.equipment!;assert.equal(r.config.equipment.find(d=>d.id===item.definition)!.rarity,'blue');const count=r.state.drops.length;r.battle.events.push({type:'kill',target:e.id,amount:0});advance(r,.05);assert.equal(r.state.drops.length,count);assert.equal(r.state.stats.kills,1);
    r.config.loot.blueChance=0;const white=add(r,'white');white.health=0;white.phase='dead';r.battle.events.push({type:'kill',target:white.id,amount:0});advance(r,.05);assert.ok(r.state.drops.some(d=>d.equipment&&r.config.equipment.find(e=>e.id===d.equipment!.definition)!.rarity==='white'));
});
test('稀有材料：第三次精英保底、读档保留进度，日刷新不会重复生成活精英',()=>{
    const r=make();r.config.monsters.find(d=>d.id==='brute')!.rare!.chance=0;
    for(let i=0;i<2;i++){const e=add(r,`elite-${i}`,'brute');e.health=0;e.phase='dead';r.battle.events.push({type:'kill',target:e.id,amount:0});advance(r,.05);}
    assert.equal(r.state.pity!['ancient-core'],2);const restored=new SurvivalRun(r.config,42,r.snapshot());const e=add(restored,'third','brute');e.health=0;e.phase='dead';restored.battle.events.push({type:'kill',target:e.id,amount:0});advance(restored,.05);assert.equal(restored.state.inventory.materials['ancient-core'],1);assert.equal(restored.state.pity!['ancient-core'],0);
    restored.state.time=599.99;restored.battle.time=599.99;advance(restored,.1);assert.equal(restored.battle.enemies.filter(e=>e.definition.elite).length,1);const again=new SurvivalRun(restored.config,42,restored.snapshot());advance(again,.1);assert.equal(again.battle.enemies.filter(e=>e.definition.elite).length,1);
});
test('装备路线：20模板可制造，关键有限矿量覆盖全部配方，非法稀有引用拒绝',()=>{
    const c=config();assert.equal(c.equipment.length,20);for(const def of c.equipment){assert.ok(c.recipes.some(r=>r.output===def.id));assert.ok(def.tier!>=1);}
    const required=c.recipes.reduce((n,r)=>n+r.materials.filter(m=>m.id==='stone').reduce((s,m)=>s+m.count,0),0);
    for(let seed=1;seed<=20;seed++){const w=new World(c,c.survival.resources,seed);assert.ok(w.state.resources.reduce((n,r)=>n+(w.definition(r).item==='stone'?r.amount:0),0)>=required);}
    const wrong=config();wrong.monsters.find(d=>d.elite)!.rare!.material='missing';assert.throws(()=>parseConfig(wrong),/rare/);
    const noRoute=config();noRoute.monsters.forEach(m=>delete m.rare);assert.throws(()=>parseConfig(noRoute),/获取路线/);
});
