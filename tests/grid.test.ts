import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GridMap } from '../assets/scripts/domain/grid';
import { moveCircle } from '../assets/scripts/domain/movement';
test('网格：负原点、格边界和世界边界坐标一致', () => {
    const grid = new GridMap(10, 10, 48, { x: -240, y: -240 });
    assert.deepEqual(grid.cellAt({ x: -240, y: -240 }), { x: 0, y: 0 });
    assert.deepEqual(grid.cellAt({ x: 0, y: 0 }), { x: 5, y: 5 });
    assert.equal(grid.cellAt({ x: 240, y: 0 }), null);
    assert.equal(grid.cellAt({ x: -240.01, y: 0 }), null);
});
test('网格：解除阻挡后同一移动路径可以通行', () => {
    const grid = new GridMap(10, 10, 48, { x: -240, y: -240 }); grid.setBlocked(5, 5, true);
    const start = { x: -70, y: 24 }, delta = { x: 140, y: 0 };
    const blocked = moveCircle(start, delta, 18, grid.bounds, grid.colliders()); assert.ok(blocked.x <= -18);
    grid.setBlocked(5, 5, false);
    const clear = moveCircle(start, delta, 18, grid.bounds, grid.colliders()); assert.ok(clear.x > 60);
});
test('网格：拒绝越界写入，重复设置不产生额外导航失效', () => {
    const grid = new GridMap(2, 2, 48, { x: 0, y: 0 });
    assert.throws(() => grid.setBlocked(-1, 0, true)); assert.equal(grid.isBlocked(2, 1), true);
    grid.setBlocked(0, 0, true); grid.setBlocked(0, 0, true); assert.equal(grid.revision, 1);
});
