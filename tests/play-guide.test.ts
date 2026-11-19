import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseConfig} from '../assets/scripts/domain/config';
import {playGuide} from '../assets/scripts/application/play-guide';
test('玩法手册：风险、季节与设施费用读取当前配置，覆盖六个玩法主题',()=>{
    const c=parseConfig(JSON.parse(readFileSync('assets/resources/config/game.json','utf8')));
    c.world.deathLossRate=.33;c.world.seasonDays=9;c.environment.fuelSeconds=100;
    const pages=playGuide(c),all=pages.map(p=>p.body).join('\n');
    assert.equal(pages.length,6);assert.ok(all.includes('33%'));assert.ok(all.includes('每季 9 天'));assert.ok(all.includes('100 秒'));
    for(const rule of ['塔生命归零','没有遗物包','读档不会重抽','最多选两种','当前设备','保存出错'])assert.ok(all.includes(rule),rule);
});
