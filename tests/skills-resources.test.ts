import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseConfig,SkillId} from '../assets/scripts/domain/config';
import {SurvivalRun} from '../assets/scripts/domain/survival';
import {runValidator} from '../assets/scripts/domain/run-validation';
import {Session} from '../assets/scripts/application/session';
import {SaveStore} from '../assets/scripts/application/save-store';
import {interfaceCheckpoint} from '../assets/scripts/application/interface-playtest';
const make=()=>{const c=parseConfig(JSON.parse(readFileSync('assets/resources/config/game.json','utf8')));const r=new SurvivalRun(c,42);r.battle.enemies.splice(0);r.state.enemies={};return r;};
const advance=(r:SurvivalRun,t:number)=>{for(let i=0;i<Math.ceil(t*30);i++)r.tick(1/30);};
const train=(r:SurvivalRun,ids:SkillId[])=>{r.progression.combatXp=2000;r.state.inventory.materials={hide:20,stone:20,herb:8};ids.forEach((id,i)=>assert.ok(r.manage(`learn-${i}`,'learn',id)));};
function enemy(r:SurvivalRun,id:string,dx=0,dy=-90){const e=r.battle.spawn(id,r.config.monsters[0],{x:r.battle.player.position.x+dx,y:r.battle.player.position.y+dy});r.state.enemies[id]={source:'raid',rewarded:false,target:'',path:[],revision:-1,replan:0};return e;}
test('训练：等级／塔旁／威胁限制，最多两种，重复或第三种不扣料',()=>{
    const r=make();r.state.inventory.materials={hide:20,stone:20};assert.equal(r.manage('low','learn','sweep'),false);
    r.progression.combatXp=200;r.manage('one','learn','sweep');assert.deepEqual(r.skills.learned,['sweep']);const bag=JSON.stringify(r.state.inventory);
    assert.equal(r.manage('dup','learn','sweep'),false);assert.equal(r.manage('locked','learn','warcry'),false);assert.equal(JSON.stringify(r.state.inventory),bag);
    r.progression.combatXp=2000;const e=enemy(r,'near');assert.equal(r.manage('danger','learn','warcry'),false);e.health=0;
    const original={...r.battle.player.position};r.battle.player.position.x+=500;assert.equal(r.manage('far','learn','warcry'),false);r.battle.player.position=original;
    assert.ok(r.manage('two','learn','warcry'));const before=JSON.stringify(r.state.inventory);assert.equal(r.manage('three','learn','first-aid'),false);assert.equal(JSON.stringify(r.state.inventory),before);
    assert.equal(r.manage('invalid','learn','invalid'),false);
});
test('横扫：扇形范围、障碍遮挡、同次仅一击、动作冲突及冷却',()=>{
    const r=make();train(r,['sweep']);const front=enemy(r,'front'),back=enemy(r,'back',0,130),far=enemy(r,'far',300,0);
    assert.ok(r.cast(0));const health=front.health;assert.ok(health<front.definition.health);assert.equal(back.health,back.definition.health);assert.equal(far.health,far.definition.health);
    assert.equal(r.cast(0),false);assert.equal(r.battle.attack(),false);assert.equal(r.battle.blink(),false);assert.equal(r.battle.block(true),false);assert.equal(front.health,health);
    advance(r,.4);assert.equal(r.cast(0),false);r.battle.setActive(false);r.state.time=100;assert.equal(r.cast(0),false);r.battle.setActive(true);
    const blocked=make();train(blocked,['sweep']);const e=enemy(blocked,'behind-wall',0,85);const p=blocked.battle.player.position;
    blocked.battle.obstacles.push({x:p.x-24,y:p.y+32,width:48,height:16});blocked.battle.player.facing={x:0,y:1};assert.ok(blocked.cast(0));assert.equal(e.health,e.definition.health);
});
test('冲击波：窄角攻击与击退不穿过障碍',()=>{
    const r=make();train(r,['shockwave']);const e=enemy(r,'front',0,-80),side=enemy(r,'side',110,0);const p={...e.position};
    r.battle.obstacles.push({x:p.x-24,y:p.y-75,width:48,height:10});assert.ok(r.cast(0));assert.ok(e.health<e.definition.health);assert.ok(e.position.y<p.y);assert.ok(e.position.y>p.y-65);assert.equal(side.health,side.definition.health);
});
test('战吼：仅附近敌人获得有限仇恨，过期或角色远离重新威胁塔',()=>{
    const r=make();train(r,['warcry']);const e=enemy(r,'near',0,-210),far=enemy(r,'far',700,0);assert.ok(r.cast(0));assert.ok(r.state.enemies[e.id].tauntUntil!>0);assert.equal(r.state.enemies[far.id].tauntUntil,undefined);
    advance(r,.1);assert.equal(r.state.enemies[e.id].target,'player');r.battle.player.position={x:-1000,y:-1000};advance(r,4.1);assert.equal(r.state.enemies[e.id].target,'tower');
});
test('急救：药材不足／满血不扣冷却，死亡复活不刷新技能，保存保留技能与冷却',()=>{
    const r=make();assert.equal(r.castStatus(0).kind,'empty');train(r,['first-aid']);assert.equal(r.castStatus(0).kind,'full');assert.equal(r.cast(0),false);r.battle.player.health=20;r.state.inventory.materials.herb=1;assert.equal(r.castStatus(0).kind,'materials');assert.equal(r.cast(0),false);assert.equal(r.skills.ready['first-aid'],0);
    r.state.inventory.materials.herb=3;assert.equal(r.castStatus(0).kind,'ready');assert.ok(r.cast(0));assert.equal(r.battle.player.health,60);assert.equal(r.state.inventory.materials.herb,1);
    const ready=r.skills.ready['first-aid'];const restored=new SurvivalRun(r.config,42,r.snapshot());assert.equal(restored.skills.ready['first-aid'],ready);assert.deepEqual(restored.skills.learned,['first-aid']);
    assert.equal(restored.castStatus(0).kind,'cooldown');
    restored.battle.damagePlayer(9999,{x:900,y:900});advance(restored,8.2);assert.equal(restored.battle.alive,true);assert.equal(restored.skills.ready['first-aid'],ready);restored.battle.player.health=10;assert.equal(restored.cast(0),false);
    assert.ok(runValidator(r.config)(restored.snapshot()));const bad=restored.snapshot();bad.skills!.learned.push('warcry','sweep');assert.equal(runValidator(r.config)(bad),false);
});
test('界面样本：快照有效，四种稀有度可查看，两个技能名额能通过真实训练使用',()=>{
    const source=make(),snapshot=interfaceCheckpoint(source.config);
    assert.ok(runValidator(source.config)(snapshot));
    const run=new SurvivalRun(source.config,42,snapshot);
    assert.equal(run.trainingSlots,2);assert.ok(run.trainingSafe);
    assert.equal(new Set(run.state.inventory.equipment.map(item=>source.config.equipment.find(def=>def.id===item.definition)?.rarity)).size,4);
    assert.ok(run.manage('learn-a','learn','sweep'));assert.ok(run.manage('learn-b','learn','first-aid'));
    assert.equal(run.castStatus(1).kind,'ready');assert.deepEqual(source.skills.learned,[]);
});
test('资源：季节产出按实际交付成长，有限矿不再生，建筑阻止刷新且离线不补算',async()=>{
    const r=make();const n=r.world.state.resources.find(n=>n.definition==='food')!,def=r.world.definition(n);r.state.time=600*21;r.battle.time=r.state.time;
    r.battle.player.position=r.world.center({x:n.cell.x,y:n.cell.y-1});assert.ok(r.interact());advance(r,1);assert.equal(r.state.inventory.materials.food,1);assert.equal(r.progression.gathering.foraging,5);assert.ok(n.refreshAt>r.state.time+def.regrow);
    n.refreshAt=r.state.time;r.state.buildings.push({id:'occupy',kind:'wall',cell:{...n.cell},health:120,maxHealth:120,open:false});advance(r,.1);assert.equal(n.amount,0);
    r.state.buildings=r.state.buildings.filter(b=>b.id!=='occupy');r.battle.player.position=r.world.start;advance(r,.1);assert.equal(n.amount,def.count);
    const rock=r.world.state.resources.find(n=>n.definition==='stone')!;rock.amount=0;rock.refreshAt=0;advance(r,1);assert.equal(rock.amount,0);
    const disk=new Map<string,string>();const session=new Session(r,new SaveStore({async read(k){return disk.get(k)??null;},async write(k,v){disk.set(k,v);}},runValidator(r.config)));
    session.pause('background');const time=r.state.time;session.frame(999,()=>{});assert.equal(r.state.time,time);
});
test('白蓝装备：五槽各有配方，季节／技能配置拒绝非法引用',()=>{
    const r=make();for(const slot of ['head','body','feet','hands','weapon'])for(const rarity of ['white','blue'])assert.ok(r.config.equipment.some(d=>d.slot===slot&&d.rarity===rarity&&r.config.recipes.some(p=>p.output===d.id)));
    r.config.skills[0].trainingCost=[{id:'missing',count:1}];assert.throws(()=>parseConfig(r.config),/skills/);
    const other=make();other.config.survival.resources[0].yieldBySeason=[1,0,1,1];assert.throws(()=>parseConfig(other.config),/yieldBySeason/);
});
test('技能击杀：施放后首个 tick 前保存仍能恢复待结算奖励，之后恢复不重复发放',()=>{
    const r=make();train(r,['sweep']);const e=enemy(r,'lethal');e.health=1;assert.ok(r.cast(0));assert.equal(e.health,0);assert.equal(r.state.stats.kills,0);
    assert.equal(r.interact(),false);assert.equal(r.build({x:r.tower.cell.x+1,y:r.tower.cell.y-2},'wall'),false);
    const snapshot=r.snapshot();assert.ok(runValidator(r.config)(snapshot));assert.ok(snapshot.battle.events!.some(e=>e.type==='kill'));
    const restored=new SurvivalRun(r.config,42,snapshot);advance(restored,.1);assert.equal(restored.state.stats.kills,1);const xp=restored.progression.combatXp;
    const again=new SurvivalRun(r.config,42,restored.snapshot());advance(again,.1);assert.equal(again.state.stats.kills,1);assert.equal(again.progression.combatXp,xp);
});
