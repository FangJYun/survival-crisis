import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BootLoader } from '../assets/scripts/application/boot';
const config = () => JSON.parse(readFileSync('assets/resources/config/game.json', 'utf8'));
test('启动：资源失败可以重试且不进入半初始化世界', async () => {
    let attempts = 0;
    const boot = new BootLoader(async () => { if (++attempts === 1) throw new Error('network'); return config(); });
    assert.equal((await boot.retry()).kind, 'error');
    assert.equal((await boot.retry()).kind, 'ready');
});
test('启动：资源存在但配置非法仍阻止启动', async () => {
    const boot = new BootLoader(async () => ({ version: 1 }));
    assert.equal((await boot.retry()).kind, 'error');
});
test('启动：较早请求的晚到失败不会覆盖较新成功', async () => {
    let fail!: (e: Error) => void;
    let count = 0;
    const boot = new BootLoader(() => ++count === 1 ? new Promise((_, reject) => { fail = reject; }) : Promise.resolve(config()));
    const first = boot.retry(); await boot.retry(); fail(new Error('old failure')); await first;
    assert.equal(boot.state.kind, 'ready');
});
