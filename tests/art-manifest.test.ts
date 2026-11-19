import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseConfig} from '../assets/scripts/domain/config';
test('图集契约：所有敌人与建筑都映射到合法独立图像，角色四方向保持原帧',()=>{
    const c=parseConfig(JSON.parse(readFileSync('assets/resources/config/game.json','utf8')));
    const monsters=JSON.parse(readFileSync('assets/content/monsters/manifest.json','utf8')).frames as Record<string,number>;
    const buildings=JSON.parse(readFileSync('assets/content/common/manifest.json','utf8')).buildings as Record<string,number>;
    const heroes=JSON.parse(readFileSync('assets/content/heroes/manifest.json','utf8'));
    assert.equal(new Set(c.monsters.map(m=>monsters[m.id])).size,c.monsters.length);
    for(const m of c.monsters)assert.ok(Number.isInteger(monsters[m.id])&&monsters[m.id]>=16&&monsters[m.id]<28,m.id);
    assert.equal(new Set(c.survival.buildings.map(b=>buildings[b.id])).size,c.survival.buildings.length);
    for(const b of c.survival.buildings)assert.ok(Number.isInteger(buildings[b.id])&&buildings[b.id]>=0&&buildings[b.id]<32,b.id);
    assert.deepEqual(heroes.warden,[0,1,2,3]);assert.deepEqual(heroes.hunter,[4,5,6,7]);
});
