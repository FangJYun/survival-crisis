import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,accessSync,mkdirSync,readFileSync,writeFileSync,renameSync,readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserStoragePort,wechatStoragePort,FileSystem } from '../assets/scripts/platform/storage';
import { SaveStore } from '../assets/scripts/application/save-store';
const valid=(v:unknown):v is {revision:number}=>typeof v==='object'&&v!==null&&Number.isSafeInteger((v as {revision:number}).revision);

test('浏览器存储：命名空间隔离，配额失败保留上一有效记录',async()=>{
    const data=new Map<string,string>();let quota=false;
    const port=browserStoragePort({getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(quota)throw new Error('QuotaExceededError');data.set(k,v);}});
    const store=new SaveStore(port,valid);await store.commit({revision:1},'one');
    assert.ok(Array.from(data.keys()).every(k=>k.startsWith('survival-v1/')));
    quota=true;await assert.rejects(store.commit({revision:2},'two'),/Quota/);quota=false;
    assert.equal((await new SaveStore(port,valid).load()).value?.revision,1);
});
test('微信存储契约：真实文件覆盖、回读、轮换、损坏恢复及临时文件写失败',async()=>{
    const dir=mkdtempSync(join(tmpdir(),'survival-storage-'));let failRename=false;
    const fs:FileSystem={accessSync,mkdirSync:(p,recursive)=>{mkdirSync(p,{recursive});},readFileSync:(p,e)=>readFileSync(p,e),writeFileSync,renameSync:(a,b)=>{if(failRename)throw new Error('rename failed');renameSync(a,b);}};
    try{
        const port=wechatStoragePort({env:{USER_DATA_PATH:dir},getFileSystemManager:()=>fs}),store=new SaveStore(port,valid);
        assert.equal(await port.read('missing'),null);
        for(let i=1;i<=12;i++)await store.commit({revision:i},`tx-${i}`);
        assert.equal(readdirSync(join(dir,'survival-v1')).length,6);
        assert.equal((await new SaveStore(port,valid).load()).value?.revision,12);
        failRename=true;await assert.rejects(store.commit({revision:13},'next'),/rename/);
        assert.equal((await new SaveStore(port,valid).load()).value?.revision,12);
        failRename=false;await store.commit({revision:13},'next');
        writeFileSync(join(dir,'survival-v1','journal-1.json'),'{invalid');
        const loaded=await new SaveStore(port,valid).load();assert.equal(loaded.value?.revision,12);assert.ok(loaded.warning);
    }finally{rmSync(dir,{recursive:true,force:true});}
});
test('微信存储：权限异常不能当作空存档，读取错误向上报告',async()=>{
    const denied=()=>{throw {errMsg:'access:fail permission denied'};};
    const fs:FileSystem={accessSync:denied,mkdirSync:()=>assert.fail(),readFileSync:()=>assert.fail(),writeFileSync:()=>assert.fail(),renameSync:()=>assert.fail()};
    assert.throws(()=>wechatStoragePort({env:{USER_DATA_PATH:'/private'},getFileSystemManager:()=>fs}));
});
