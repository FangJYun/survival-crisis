import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseConfig } from '../assets/scripts/domain/config';
import { GameClock, SeededRandom } from '../assets/scripts/domain/ports';
import { FixedStep } from '../assets/scripts/application/fixed-step';

const config = () => JSON.parse(readFileSync('assets/resources/config/game.json', 'utf8'));
test('配置：真实游戏配置通过校验', () => assert.equal(parseConfig(config()).characters.length, 2));
test('配置：重复 ID 被拒绝', () => {
    const c = config(); c.equipment[0].id = c.materials[0].id;
    assert.throws(() => parseConfig(c), /重复/);
});
test('配置：非法概率被拒绝', () => {
    for (const value of [-0.1, 1.01, NaN, '0.2']) {
        const c = config(); c.world.deathLossRate = value;
        assert.throws(() => parseConfig(c), /deathLossRate/);
    }
});
test('配置：缺失材料与产物引用被拒绝', () => {
    const c = config(); c.recipes[0].output = 'missing'; c.recipes[0].materials[0].id = 'missing';
    assert.throws(() => parseConfig(c), /缺失引用/);
});
test('配置：非法部位、稀有度、成长曲线被拒绝', () => {
    const c = config(); c.equipment[0].slot = 'ring'; c.equipment[0].rarity = 'red'; c.growth.skillLevels = [6, 3];
    assert.throws(() => parseConfig(c), /slot/);
});
test('时钟：拒绝负值与无限增量', () => {
    const clock = new GameClock(); clock.advance(0.5);
    assert.equal(clock.now(), 0.5);
    assert.throws(() => clock.advance(Infinity)); assert.throws(() => clock.advance(-1));
});
test('随机：恢复后从同一随机位置继续', () => {
    const source = new SeededRandom(42); source.next();
    const restored = new SeededRandom(source.state());
    assert.equal(source.next(), restored.next());
    for (let i = 0; i < 100; i++) { const n = source.next(); assert.ok(n >= 0 && n < 1); }
});
test('调度：前台大时间差最多追赶上限，不补算后台时间', () => {
    const fixed = new FixedStep(); let ticks = 0;
    assert.equal(fixed.frame(3600, () => ticks++), 3);
    fixed.pause('background'); fixed.frame(3600, () => ticks++);
    fixed.resume('background'); fixed.frame(1 / 30, () => ticks++);
    assert.equal(ticks, 4);
});
test('调度：多重暂停必须逐项解除', () => {
    const fixed = new FixedStep(); fixed.pause('menu'); fixed.pause('background'); fixed.resume('background');
    assert.equal(fixed.frame(0.1, () => assert.fail()), 0);
    fixed.resume('menu'); assert.equal(fixed.frame(1 / 30, () => {}), 1);
});
test('调度：非法频率与时间不进入模拟', () => {
    assert.throws(() => new FixedStep(0));
    assert.equal(new FixedStep().frame(NaN, () => assert.fail()), 0);
});
