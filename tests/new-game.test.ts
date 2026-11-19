import {test} from 'node:test';
import assert from 'node:assert/strict';
import {NewGameGate} from '../assets/scripts/application/new-game-gate';
test('新局：有原局时需要确认，取消后迟到确认与重复确认均无效',()=>{
    const gate=new NewGameGate();let replacements=0;
    assert.equal(gate.request(true),false);gate.cancel();if(gate.confirm())replacements++;
    assert.equal(replacements,0);assert.equal(gate.request(true),false);
    if(gate.confirm())replacements++;if(gate.confirm())replacements++;assert.equal(replacements,1);
});
test('新局：没有原局可直接开始，旧确认不能影响新请求',()=>{
    const gate=new NewGameGate();gate.request(true);assert.equal(gate.request(false),true);assert.equal(gate.confirm(),false);
});
