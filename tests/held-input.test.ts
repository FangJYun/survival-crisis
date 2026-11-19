import {test} from 'node:test';
import assert from 'node:assert/strict';
import {HeldInput} from '../assets/scripts/application/held-input';

test('多指与键盘混用：只有最终输入释放才松开动作，切界面后旧触点不干扰',()=>{
    const held=new HeldInput();
    assert.equal(held.press(1),true);assert.equal(held.press(2),false);assert.equal(held.press('key'),false);
    assert.equal(held.release(1),false);assert.equal(held.release('key'),false);assert.equal(held.held,true);
    assert.equal(held.release(2),true);assert.equal(held.held,false);
    held.press(3);held.clear();held.press(4);
    assert.equal(held.release(3),false);assert.equal(held.held,true);assert.equal(held.release(4),true);
});
