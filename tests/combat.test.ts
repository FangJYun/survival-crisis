import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseConfig } from '../assets/scripts/domain/config';
import { Battle } from '../assets/scripts/domain/combat';
import { canStand, moveCircle } from '../assets/scripts/domain/movement';
const game = parseConfig(JSON.parse(readFileSync('assets/resources/config/game.json', 'utf8')));
const bounds = { x: -500, y: -300, width: 1000, height: 600 };
const make = () => new Battle(game.combat, bounds, [], { x: 0, y: 0 });
const advance = (battle: Battle, seconds: number) => { for (let i = 0; i < Math.ceil(seconds * 30); i++) battle.tick(1 / 30); };

test('战斗初始化：拒绝非有限障碍，不能静默关闭碰撞', () => {
    assert.throws(() => new Battle(game.combat, bounds, [{ x: NaN, y: 0, width: 48, height: 48 }], { x: 0, y: 0 }), /非法地图/);
});

test('移动：高速闪现路径不能越过薄墙', () => {
    const wall = { x: 50, y: -100, width: 2, height: 200 };
    const end = moveCircle({ x: 0, y: 0 }, { x: 400, y: 0 }, 18, bounds, [wall], false);
    assert.ok(end.x <= 32); assert.ok(canStand(end, 18, bounds, [wall]));
});
test('移动：斜向沿墙滑动，不能穿墙', () => {
    const wall = { x: 50, y: -200, width: 20, height: 400 };
    const end = moveCircle({ x: 0, y: 0 }, { x: 200, y: 100 }, 18, bounds, [wall]);
    assert.ok(end.x <= 32); assert.ok(end.y > 90);
});
test('移动：地图边界限制角色圆形而非中心', () => {
    const end = moveCircle({ x: 0, y: 0 }, { x: 10000, y: 10000 }, 18, bounds, []);
    assert.ok(end.x <= 482 && end.y <= 282);
});
test('移动：墙角和窄路不产生重叠', () => {
    const walls = [{ x: 0, y: 25, width: 200, height: 20 }, { x: 0, y: -45, width: 200, height: 20 }];
    const end = moveCircle({ x: -40, y: 0 }, { x: 200, y: 0 }, 18, bounds, walls);
    assert.ok(end.x > 100); assert.ok(canStand(end, 18, bounds, walls));
    const tight = walls.map(w => ({ ...w, y: w.y > 0 ? 12 : -32 }));
    const stopped = moveCircle({ x: -40, y: 0 }, { x: 200, y: 0 }, 18, bounds, tight);
    assert.ok(stopped.x < 0);
});
test('平 A：前摇不命中、命中窗口连续接触只扣一次', () => {
    const battle = make(); const e = battle.spawn('a', { ...game.monsters[0], speed: 0.01 }, { x: 0, y: -55 });
    assert.ok(battle.attack()); battle.tick(1 / 30); assert.equal(e.health, 72);
    advance(battle, 0.35); assert.equal(e.health, 48);
    assert.equal(battle.events.filter(e => e.type === 'hit' && e.target === 'a').length, 1);
});
test('平 A：前摇与后摇不能重复启动攻击', () => {
    const battle = make(); battle.attack(); assert.equal(battle.attack(), false);
    advance(battle, 0.6); assert.equal(battle.attack(), true);
});
test('平 A：背后和墙后目标不会命中', () => {
    const battle = make(); const behind = battle.spawn('behind', game.monsters[0], { x: 0, y: 70 });
    battle.obstacles.push({ x: -100, y: -40, width: 200, height: 4 });
    const hidden = battle.spawn('hidden', game.monsters[0], { x: 0, y: -65 });
    battle.attack(); advance(battle, 0.3);
    assert.equal(behind.health, 72); assert.equal(hidden.health, 72);
});
test('击杀：死亡事件唯一、尸体不继续攻击', () => {
    const battle = make(); const e = battle.spawn('a', game.monsters[0], { x: 0, y: -50 }); e.health = 1;
    battle.attack(); advance(battle, 0.8); battle.attack(); advance(battle, 0.8);
    assert.equal(e.phase, 'dead'); assert.equal(battle.events.filter(e => e.type === 'kill').length, 1);
    assert.equal(battle.player.health, 100);
});
test('闪现：无有效落点不消耗冷却，成功后拒绝连闪', () => {
    const battle = make(); battle.obstacles.push({ x: -50, y: -25, width: 100, height: 7 });
    assert.equal(battle.blink(), false); assert.equal(battle.blinkCooldown, 0);
    battle.obstacles.length = 0; assert.equal(battle.blink(), true); assert.equal(battle.blink(), false);
    advance(battle, 3.1); assert.equal(battle.blink(), true);
});
test('格挡：正面完美格挡不扣血、重复按住不刷新窗口', () => {
    const battle = make(); battle.block(true); battle.damagePlayer(20, { x: 0, y: -50 });
    assert.equal(battle.player.health, 100);
    advance(battle, 0.25); battle.block(true); battle.damagePlayer(20, { x: 0, y: -50 });
    assert.equal(battle.player.health, 96);
    assert.equal(battle.events.filter(e => e.type === 'perfect').length, 1);
});
test('格挡：背面攻击全额伤害，体力不足不再免伤', () => {
    const battle = make(); battle.block(true); battle.damagePlayer(20, { x: 0, y: 50 });
    assert.equal(battle.player.health, 80);
    battle.stamina = 1; battle.tick(1 / 30); assert.equal(battle.blocking, false);
    battle.damagePlayer(20, { x: 0, y: -50 }); assert.equal(battle.player.health, 60);
    assert.ok(battle.stamina >= 0);
});
test('格挡：一直持有最终耗尽，不能无限防御', () => {
    const battle = make(); battle.block(true); advance(battle, 6);
    assert.equal(battle.blocking, false);
});
test('暂停／死亡：禁止输入和重复死亡事件', () => {
    const battle = make(); battle.setActive(false);
    assert.equal(battle.attack(), false); assert.equal(battle.blink(), false); assert.equal(battle.block(true), false);
    battle.tick(1 / 30); assert.equal(battle.time, 0);
    battle.setActive(true); battle.damagePlayer(999, { x: 0, y: 30 }); battle.damagePlayer(999, { x: 0, y: 30 });
    assert.equal(battle.attack(), false); assert.equal(battle.blink(), false);
    assert.equal(battle.events.filter(e => e.type === 'death').length, 1);
});
test('敌人：距离外待机，接近后预警，再结算攻击', () => {
    const battle = make(); const e = battle.spawn('a', game.monsters[0], { x: 450, y: 0 });
    battle.tick(1 / 30); assert.equal(e.position.x, 450);
    e.position = { x: 0, y: -45 }; battle.tick(1 / 30); assert.equal(e.phase, 'windup');
    assert.equal(battle.player.health, 100); advance(battle, 0.65); assert.equal(battle.player.health, 82);
});
test('敌人：玩家死亡后没有有效目标，稳定待机', () => {
    const battle = make(); const e = battle.spawn('a', game.monsters[0], { x: 50, y: 0 });
    battle.damagePlayer(999, e.position); advance(battle, 1);
    assert.equal(e.phase, 'idle'); assert.equal(e.position.x, 50);
});
