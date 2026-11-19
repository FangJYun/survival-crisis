import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseConfig, SLOTS } from '../assets/scripts/domain/config';
import { SurvivalRun } from '../assets/scripts/domain/survival';
import { World, findPath, calendarAt } from '../assets/scripts/domain/world';
import { emptyInventory, craft, equip, loseWorn, dismantle } from '../assets/scripts/domain/inventory';
import { runValidator } from '../assets/scripts/domain/run-validation';
import { SaveStore } from '../assets/scripts/application/save-store';
import { PlaytestStorage } from '../assets/scripts/application/season-playtest';
const config=()=>parseConfig(JSON.parse(readFileSync('assets/resources/config/game.json','utf8')));
const run=()=>new SurvivalRun(config(),42);
const advance=(r:SurvivalRun,seconds:number)=>{for(let i=0;i<Math.ceil(seconds*30);i++)r.tick(1/30);};
const noEnemies=(r:SurvivalRun)=>{r.battle.enemies.splice(0);r.state.enemies={};};

test('地图：100 个种子出生点连通木石食物；种子和区块状态不依赖镜头',()=>{
    const c=config();for(let seed=1;seed<=100;seed++){
        const w=new World(c,c.survival.resources,seed),start=w.grid.cellAt(w.start)!;
        for(const kind of ['wood','stone','food'])assert.ok(w.state.resources.some(n=>n.definition===kind&&findPath(w.grid,start,[{x:n.cell.x+1,y:n.cell.y},{x:n.cell.x-1,y:n.cell.y},{x:n.cell.x,y:n.cell.y+1},{x:n.cell.x,y:n.cell.y-1}]).length));
        const again=new World(c,c.survival.resources,seed);assert.deepEqual(w.state,again.state);
        const a=w.activeChunks(w.start,w.start),b=w.activeChunks(w.start,{x:2000,y:2000});assert.ok(b.size>a.size);assert.equal(a.size,9);
    }
});
test('采集：工具、取消、容量失败不扣节点，完成不重复交付，离开读档保持枯竭',()=>{
    const r=run();noEnemies(r);const n=r.world.state.resources.find(n=>n.definition==='wood')!;
    r.battle.player.position=r.world.center({x:n.cell.x+1,y:n.cell.y});
    r.state.inventory.tools=[];assert.equal(r.interact(),false);r.state.inventory.tools=['axe'];
    assert.equal(r.interact(),true);r.battle.player.position.x+=10;advance(r,2);assert.equal(n.amount,4);assert.equal(r.state.inventory.materials.wood,undefined);
    r.battle.player.position.x-=10;r.interact();r.state.inventory.capacity=0;advance(r,2);assert.equal(n.amount,4);
    r.state.inventory.capacity=24;r.interact();advance(r,2);assert.equal(n.amount,0);assert.equal(r.state.inventory.materials.wood,4);advance(r,2);assert.equal(r.state.inventory.materials.wood,4);
    const restored=new SurvivalRun(r.config,42,r.snapshot());assert.equal(restored.world.state.resources.find(v=>v.id===n.id)!.amount,0);
});
test('背包：制造／换装／拆解原子性、实例唯一、应急不可拆解',()=>{
    const c=config(),bag=emptyInventory(1);bag.materials.wood=3;
    const crafted=craft(bag,c,'craft-weapon')!;assert.ok(crafted);assert.equal(bag.materials.wood,3);assert.equal(crafted.equipment.length,1);
    const worn=equip(crafted,c,crafted.equipment[0].id)!;assert.equal(worn.worn.weapon?.definition,'basic-weapon');assert.equal(worn.worn.head,undefined);
    worn.materials.stone=1;assert.equal(craft(worn,c,'craft-weapon'),null);
    const before=JSON.stringify(worn);assert.equal(equip(worn,c,'missing'),null);assert.equal(JSON.stringify(worn),before);
    worn.equipment=[{id:'e',definition:'emergency-weapon'}];assert.equal(dismantle(worn,c,'e'),null);
});
test('管理命令：重复制造请求只产一件，食物不超上限',()=>{
    const r=run();r.state.inventory.materials.wood=6;
    assert.ok(r.manage('request-1','craft','craft-weapon'));assert.equal(r.manage('request-1','craft','craft-weapon'),false);
    assert.equal(r.state.inventory.materials.wood,3);assert.equal(r.state.inventory.equipment.length,1);
    r.state.hunger=90;r.state.inventory.materials.food=2;r.manage('eat','food');assert.equal(r.state.hunger,100);assert.equal(r.state.inventory.materials.food,1);
});
test('死亡：五槽独立判定、概率边界、空槽不耗随机、背包豁免',()=>{
    const bag=emptyInventory(24);for(const slot of SLOTS)bag.worn[slot]={id:slot,definition:`basic-${slot}`};bag.equipment=[{id:'safe',definition:'basic-weapon'}];
    let calls=0;const values=[0,.9,.1,.8,.2],random={next:()=>values[calls++],state:()=>calls};
    const result=loseWorn(bag,.2,random);assert.deepEqual(result.lost.map(e=>e.id),['head','feet']);assert.equal(calls,5);assert.equal(result.inventory.equipment[0].id,'safe');
    assert.equal(loseWorn(bag,0,random).lost.length,0);assert.equal(loseWorn(bag,1,{next:()=>.999,state:()=>0}).lost.length,5);
    calls=0;loseWorn(emptyInventory(24),1,random);assert.equal(calls,0);
});
test('昼夜：精确边界、野怪狂暴从基础值派生且读档不叠加',()=>{
    const c=config();assert.equal(calendarAt(359.99,c).phase,'day');assert.equal(calendarAt(360,c).phase,'dusk');assert.equal(calendarAt(420,c).phase,'night');assert.equal(calendarAt(600,c).day,2);
    const r=run();r.state.time=419.99;r.battle.time=r.state.time;const speed=r.battle.enemies[0].definition.speed;advance(r,.1);assert.equal(r.battle.enemies[0].definition.speed,speed);
    assert.equal(new SurvivalRun(c,42,r.snapshot()).battle.enemies[0].definition.speed,speed);
});
test('墙门：重叠失败不扣料，开关、拆除、倒塌立即更新通路',()=>{
    const r=run();r.state.inventory.materials.wood=30;const cell={x:r.tower.cell.x+1,y:r.tower.cell.y-2};
    assert.ok(r.build(cell,'gate'));const gate=r.state.buildings.find(b=>b.kind==='gate')!;assert.ok(r.world.grid.isBlocked(cell.x,cell.y));
    const wood=r.state.inventory.materials.wood;assert.equal(r.build(cell,'wall'),false);assert.equal(r.state.inventory.materials.wood,wood);
    // 移到门旁，避开出生木石节点的交互优先级。
    r.battle.player.position=r.world.center({x:cell.x,y:cell.y+1});for(const n of r.world.state.resources)n.amount=0;
    r.interact();assert.equal(gate.open,true);assert.equal(r.world.grid.isBlocked(cell.x,cell.y),false);
    r.interact();assert.equal(gate.open,false);r.damageBuilding(gate.id,999);assert.equal(r.world.grid.isBlocked(cell.x,cell.y),false);
});
test('迁塔：受击、黄昏、读档取消；成功保留最新血量与旧墙',()=>{
    const r=run();noEnemies(r);r.battle.player.position=r.world.start;r.state.inventory.materials={wood:30,stone:20};
    const dest={x:r.tower.cell.x+1,y:r.tower.cell.y};
    assert.ok(r.relocate(dest));r.battle.damagePlayer(1,{x:400,y:0});advance(r,.1);assert.equal(r.channel,null);assert.equal(r.state.inventory.materials.wood,30);
    assert.ok(r.relocate(dest));assert.equal(new SurvivalRun(r.config,42,r.snapshot()).channel,null);
    r.channel=null;r.state.time=359.9;r.battle.time=r.state.time;r.relocate(dest);advance(r,.2);assert.equal(r.channel,null);assert.equal(r.tower.cell.x,dest.x-1);
    r.state.time=600;r.battle.time=600;assert.ok(r.build({x:r.tower.cell.x-1,y:r.tower.cell.y},'wall'));const wall=r.state.buildings.find(b=>b.kind==='wall')!;
    assert.ok(r.relocate(dest));r.damageBuilding('tower',70);advance(r,8.1);assert.deepEqual(r.tower.cell,dest);assert.equal(r.tower.health,930);assert.equal(r.state.buildings.filter(b=>b.kind==='tower').length,1);assert.ok(r.state.buildings.includes(wall));
});
test('维修：夜间禁修塔，修墙扣料一次且不超限，受击中断不扣料',()=>{
    const r=run();noEnemies(r);r.state.inventory.materials.wood=30;r.tower.health=999;r.state.time=421;r.battle.time=421;
    assert.equal(r.repair(),false);r.state.time=1;r.battle.time=1;r.repair();advance(r,1);assert.equal(r.tower.health,1000);assert.equal(r.state.inventory.materials.wood,29);
    r.tower.health=900;r.repair();r.battle.damagePlayer(1,{x:500,y:500});advance(r,1);assert.equal(r.tower.health,900);assert.equal(r.state.inventory.materials.wood,29);
});
test('死亡复活：只结算一次、读档不重掷、世界继续且不回塔血',()=>{
    const r=run();noEnemies(r);r.config.world.deathLossRate=1;r.state.inventory.worn.weapon={id:'w',definition:'basic-weapon'};r.tower.health=800;
    r.battle.damagePlayer(1000,{x:999,y:999});advance(r,.1);assert.equal(r.state.deathId,1);assert.equal(r.state.lost.length,1);
    const s=r.snapshot();assert.ok(runValidator(r.config)(s));const restored=new SurvivalRun(r.config,42,s);advance(restored,8.1);
    assert.ok(restored.battle.alive);assert.equal(restored.state.deathId,1);assert.equal(restored.tower.health,800);assert.equal(restored.state.inventory.worn.weapon,undefined);assert.ok(restored.battle.protectedUntil>restored.state.time);
    assert.ok(restored.manage('e1','emergency'));assert.equal(restored.manage('e2','emergency'),false);
});
test('终局优先：复活／迁塔前塔归零仅结算终局，读档仍终局',()=>{
    const r=run();noEnemies(r);r.battle.damagePlayer(1000,{x:900,y:900});advance(r,.1);r.state.respawnAt=r.state.time;
    r.damageBuilding('tower',10000);advance(r,1);assert.equal(r.state.ended,true);assert.equal(r.state.respawnAt,null);assert.equal(r.battle.alive,false);
    const restored=new SurvivalRun(r.config,42,r.snapshot());assert.equal(restored.state.ended,true);const time=restored.state.time;advance(restored,5);assert.equal(restored.state.time,time);
});
test('夜袭：封闭塔破墙、远离塔仍被攻击、预算有限、黎明撤退无奖励',()=>{
    const r=run();noEnemies(r);r.state.inventory.materials.wood=100;
    // 直接构造封闭圈作为地图 fixture，角色移开以免抢仇恨。
    for(const cell of [{x:r.tower.cell.x+1,y:r.tower.cell.y},{x:r.tower.cell.x-1,y:r.tower.cell.y},{x:r.tower.cell.x,y:r.tower.cell.y+1},{x:r.tower.cell.x,y:r.tower.cell.y-1}]){
        r.state.buildings.push({id:`fixture-${cell.x}-${cell.y}`,kind:'wall',cell,health:20,maxHealth:120,open:false});r.world.grid.setBlocked(cell.x,cell.y,true);
    }
    r.tower.health=100000;r.tower.maxHealth=100000;r.battle.player.position={x:1800,y:1800};r.state.time=419.99;r.battle.time=r.state.time;advance(r,100);
    assert.equal(r.state.raid.remaining,0);assert.ok(r.tower.health<100000);assert.ok(r.state.buildings.length<5);assert.equal(r.state.stats.kills,0);
    const restored=new SurvivalRun(r.config,42,r.snapshot());advance(restored,5);assert.equal(restored.state.raid.remaining,0);
    restored.state.time=599.99;restored.battle.time=599.99;advance(restored,.1);assert.equal(restored.battle.enemies.filter(e=>restored.state.enemies[e.id].source==='raid').length,0);assert.equal(restored.state.stats.kills,0);
});
test('采集动作：攻击／格挡拒绝开始，完成前工具失效不交付',()=>{
    const r=run();noEnemies(r);r.battle.attack();assert.equal(r.interact(),false);advance(r,1);
    r.battle.block(true);assert.equal(r.interact(),false);r.battle.block(false);assert.ok(r.interact());r.state.inventory.tools=[];advance(r,2);assert.equal(r.state.inventory.materials.wood,undefined);
});
test('迁塔：引导中落点被占无扣料、不复制塔',()=>{
    const r=run();noEnemies(r);r.state.inventory.materials={wood:20,stone:20};const dest={x:r.tower.cell.x+1,y:r.tower.cell.y};
    assert.ok(r.relocate(dest));r.battle.spawn('blocker',r.config.monsters[0],r.world.center(dest));advance(r,1);
    assert.equal(r.channel,null);assert.equal(r.state.inventory.materials.wood,20);assert.equal(r.state.buildings.filter(b=>b.kind==='tower').length,1);
});
test('夜袭：地图边缘出生点合法，黎明保留野怪且不发奖励',()=>{
    const r=run();r.tower.cell={x:0,y:0};r.world.grid.setBlocked(0,0,true);r.battle.player.position={x:1000,y:1000};r.state.time=419.99;r.battle.time=419.99;
    advance(r,.1);const raid=r.battle.enemies.filter(e=>r.state.enemies[e.id].source==='raid');assert.ok(raid.length>0);assert.ok(raid.every(e=>r.world.grid.cellAt(e.position)));
    const wild=r.battle.enemies.filter(e=>r.state.enemies[e.id].source==='wild').map(e=>e.id);r.state.time=599.99;r.battle.time=599.99;advance(r,.1);
    assert.deepEqual(r.battle.enemies.map(e=>e.id),wild);assert.equal(r.state.stats.kills,0);
});
test('背包：满包换装保留原装备，卸下失败不丢物品',()=>{
    const c=config(),bag=emptyInventory(1);bag.equipment=[{id:'new',definition:'basic-weapon'}];bag.worn.weapon={id:'old',definition:'emergency-weapon'};
    const next=equip(bag,c,'new')!;assert.equal(next.worn.weapon?.id,'new');assert.equal(next.equipment[0].id,'old');assert.equal(bag.worn.weapon?.id,'old');
});
test('复活：塔旁全堵等待，通路恢复才复活，冷却不被重置',()=>{
    const r=run();noEnemies(r);r.battle.blinkCooldown=20;
    for(let y=-3;y<=3;y++)for(let x=-3;x<=3;x++){if(!x&&!y)continue;r.world.grid.setBlocked(r.tower.cell.x+x,r.tower.cell.y+y,true);}
    r.battle.damagePlayer(1000,{x:999,y:999});advance(r,9);assert.equal(r.battle.alive,false);assert.notEqual(r.state.respawnAt,null);
    r.world.grid.setBlocked(r.tower.cell.x+1,r.tower.cell.y,false);advance(r,.1);assert.equal(r.battle.alive,true);assert.ok(r.battle.blinkCooldown>10);
    r.battle.events.push({type:'death',target:'player',amount:0});const deaths=r.state.deathId;advance(r,.1);assert.equal(r.state.deathId,deaths);
});
test('首夜规则集成：采集→制造穿戴→三面墙→夜袭→死亡存档→复活→黎明继续',async()=>{
    let r=run();const wood=r.world.state.resources.filter(n=>n.definition==='wood').slice(0,3);
    const storage=new PlaytestStorage(),createStore=()=>new SaveStore(storage,runValidator(r.config));
    const restore=async(reason:string)=>{
        const before=r.snapshot();await createStore().commit(before,reason);
        const loaded=await createStore().load();assert.deepEqual(loaded.value,before);
        r=new SurvivalRun(r.config,42,loaded.value!);assert.deepEqual(r.snapshot(),before);
    };
    for(const n of wood){r.battle.player.position=r.world.center({x:n.cell.x+1,y:n.cell.y});assert.ok(r.interact());advance(r,1.3);}
    r.battle.player.position=r.world.start;assert.equal(r.state.inventory.materials.wood,12);
    assert.ok(r.manage('craft','craft','craft-weapon'));assert.ok(r.manage('wear','equip',r.state.inventory.equipment[0].id));
    const home={...r.tower.cell};for(const cell of [{x:home.x-1,y:home.y},{x:home.x,y:home.y+1},{x:home.x,y:home.y-1}])assert.ok(r.build(cell,'wall'));
    r.battle.player.position=r.world.center({x:home.x+2,y:home.y});let restored=false;
    for(let i=0;i<18100 && r.calendar.day<2&&!r.state.ended;i++){
        const nearest=r.battle.enemies.filter(e=>e.health>0&&Math.hypot(e.position.x-r.battle.player.position.x,e.position.y-r.battle.player.position.y)<110)[0];
        if(nearest&&r.battle.alive){const dx=nearest.position.x-r.battle.player.position.x,dy=nearest.position.y-r.battle.player.position.y,l=Math.hypot(dx,dy);r.battle.player.facing={x:dx/l,y:dy/l};r.battle.attack();}
        r.tick(1/30);
        if(!restored&&r.calendar.phase==='night'&&r.calendar.remaining<=r.config.world.night-30&&r.state.stats.kills>=1&&r.battle.alive){
            r.battle.damagePlayer(1000,{x:r.battle.player.position.x,y:r.battle.player.position.y+100});
            advance(r,1/30);assert.equal(r.battle.alive,false);assert.ok(r.state.respawnAt!==null);
            await restore('first-night-death');restored=true;
        }
    }
    assert.ok(restored);assert.equal(r.calendar.day,2);assert.equal(r.state.ended,false);assert.ok(r.tower.health>0);assert.ok(r.state.stats.kills>0);
    assert.equal(r.battle.alive,true);assert.equal(r.state.respawnAt,null);
    await restore('first-dawn');assert.equal(r.calendar.day,2);
});
test('区块：玩家与塔重叠活动区不重复实体；休眠节点按游戏时间恢复',()=>{
    const r=run();const chunks=r.world.activeChunks(r.world.start,r.world.start),nodes=r.world.resourcesIn(chunks);
    assert.equal(new Set(nodes.map(n=>n.id)).size,nodes.length);
    const n=nodes.find(n=>n.definition==='food')!;n.amount=0;n.refreshAt=1;r.state.time=10;r.battle.time=10;advance(r,.1);assert.equal(n.amount,r.world.definition(n).count);
});
test('夜间维修墙：完成扣料一次，塔毁中断迁移不复制塔',()=>{
    const r=run();noEnemies(r);r.state.inventory.materials={wood:30,stone:20};const cell={x:r.tower.cell.x+1,y:r.tower.cell.y-2};r.build(cell,'wall');const wall=r.state.buildings.find(b=>b.kind==='wall')!;wall.health=110;
    r.state.time=421;r.battle.time=421;r.state.raid={night:1,remaining:0,next:0};assert.ok(r.repair());advance(r,1);assert.equal(wall.health,120);assert.equal(r.state.inventory.materials.wood,26);
    r.state.time=600;r.battle.time=600;assert.ok(r.relocate({x:r.tower.cell.x+1,y:r.tower.cell.y}));const wood=r.state.inventory.materials.wood;r.damageBuilding('tower',10000);advance(r,9);assert.equal(r.channel,null);assert.equal(r.state.inventory.materials.wood,wood);assert.equal(r.state.buildings.filter(b=>b.kind==='tower').length,1);
});
