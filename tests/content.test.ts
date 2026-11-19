import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ContentLoader,CONTENT_GROUPS} from '../assets/scripts/application/content';
test('内容加载：失败释放已加载组，重试完整加载，有进度且重复释放幂等',async()=>{
    let fail=true,acquired=0,released=0;const progress:number[]=[];
    const loader=new ContentLoader(async group=>{if(fail&&group==='monsters')throw new Error('资源缺失');acquired++;return {value:group,release(){released++;}};});
    await assert.rejects(loader.load(n=>progress.push(n)),/资源缺失/);assert.equal(acquired,released);
    fail=false;const result=await loader.load(n=>progress.push(n));assert.deepEqual(Array.from(result.keys()),Array.from(CONTENT_GROUPS));assert.equal(progress.at(-1),5);
    loader.dispose();const count=released;assert.equal(acquired,released);loader.dispose();assert.equal(released,count);
});
test('内容加载：销毁期间的迟到结果被释放，反复重入不积累租约',async()=>{
    let resolve!:(v:{value:string;release():void})=>void,released=0;
    const loader=new ContentLoader(()=>new Promise<{value:string;release():void}>(r=>{resolve=r;}));const pending=loader.load(()=>{});loader.dispose();resolve({value:'late',release(){released++;}});await assert.rejects(pending,/取消/);assert.equal(released,1);
    let held=0;const repeat=new ContentLoader(async group=>{held++;return {value:group,release(){held--;}};});
    for(let i=0;i<20;i++){await repeat.load(()=>{});assert.equal(held,5);}repeat.dispose();assert.equal(held,0);
});
