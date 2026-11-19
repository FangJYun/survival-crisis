import {test} from 'node:test';
import assert from 'node:assert/strict';
import {safeLayout} from '../assets/scripts/application/safe-layout';
test('安全区布局：缩放设计层并补偿锚点，四边始终位于安全容器内',()=>{
    for(const [width,height,ax,ay] of [[1280,720,.5,.5],[1136,678,.5,.47],[1558,680,.5,.51],[800,600,.4,.6]]){
        const f=safeLayout(width,height,ax,ay);
        assert.ok(f.x-640*f.scale>=-ax*width-1e-6);assert.ok(f.x+640*f.scale<=(1-ax)*width+1e-6);
        assert.ok(f.y-360*f.scale>=-ay*height-1e-6);assert.ok(f.y+360*f.scale<=(1-ay)*height+1e-6);
    }
    assert.deepEqual(safeLayout(1280,720,.5,.5),{scale:1,x:0,y:0});
    assert.throws(()=>safeLayout(0,720,.5,.5));
});
