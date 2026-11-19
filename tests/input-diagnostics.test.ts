import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inputDiagnostics} from '../assets/scripts/platform/input-diagnostics';
test('输入诊断：仅开发者工具记录坐标和尺寸，不采集其他设备字段，销毁解除同一监听',()=>{
    const values:{kind:string;value:Record<string,unknown>}[]=[];
    let touch:(e:{changedTouches:{clientX:number;clientY:number}[]})=>void=()=>assert.fail();
    let removed=false;
    const d=inputDiagnostics((kind,value)=>values.push({kind,value}),{
        getSystemInfoSync:()=>({platform:'devtools',windowWidth:852,windowHeight:393,pixelRatio:3,extra:'not-collected'}),
        onTouchStart:callback=>{touch=callback;},offTouchStart:callback=>{assert.equal(callback,touch);removed=true;},
    });
    assert.ok(d.enabled);touch({changedTouches:[{clientX:20,clientY:30}]});
    assert.deepEqual(values,[{kind:'device',value:{width:852,height:393,dpr:3,touch:'function'}},{kind:'raw',value:{x:20,y:30}}]);
    d.dispose();assert.ok(removed);
});
test('输入诊断：手机和不可用系统接口不注册调试监听',()=>{
    for(const wx of [{getSystemInfoSync:()=>({platform:'ios'}),onTouchStart:()=>assert.fail()},{getSystemInfoSync:()=>{throw new Error('unavailable');}}]){
        const d=inputDiagnostics(()=>assert.fail(),wx);assert.equal(d.enabled,false);d.dispose();
    }
});
