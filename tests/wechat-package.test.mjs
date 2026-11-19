import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {packageWechatContent,wechatPackageReport,WECHAT_CONTENT_PACKAGES} from '../scripts/wechat-package.mjs';

function fixture(run){
    const directory=mkdtempSync(path.join(tmpdir(),'survival-package-test-'));
    try{
        mkdirSync(path.join(directory,'src'),{recursive:true});
        writeFileSync(path.join(directory,'src/settings.json'),JSON.stringify({assets:{subpackages:[]}}));
        writeFileSync(path.join(directory,'project.config.json'),JSON.stringify({appid:'wx-unit-test',compileType:'game'}));
        writeFileSync(path.join(directory,'game.json'),JSON.stringify({deviceOrientation:'landscape'}));
        for(const name of WECHAT_CONTENT_PACKAGES){
            const folder=path.join(directory,'assets',name);mkdirSync(folder,{recursive:true});
            writeFileSync(path.join(folder,'config.json'),JSON.stringify({name}));
            writeFileSync(path.join(folder,'index.js'),'');
        }
        run(directory);
    }finally{rmSync(directory,{recursive:true,force:true});}
}

test('微信分包：四份内容移动后入口、引擎清单与主包计量一致',()=>fixture(directory=>{
    packageWechatContent(directory);
    const report=wechatPackageReport(directory,'wx-unit-test');
    assert.equal(report.packages.length,4);
    assert.equal(report.totalBytes,report.mainBytes+report.packages.reduce((total,pkg)=>total+pkg.bytes,0));
    const settings=JSON.parse(readFileSync(path.join(directory,'src/settings.json'),'utf8'));
    assert.deepEqual(settings.assets.subpackages,WECHAT_CONTENT_PACKAGES);
    for(const pkg of report.packages)assert.equal(readFileSync(path.join(directory,pkg.root,'game.js'),'utf8'),"require('./index.js');\n");
    assert.throws(()=>packageWechatContent(directory),/已存在/);
}));

test('微信分包：主包超限、AppID 不符或分包目录越界必须拒绝',()=>fixture(directory=>{
    packageWechatContent(directory);
    assert.throws(()=>wechatPackageReport(directory,'wx-other'),/AppID/);
    writeFileSync(path.join(directory,'too-large.bin'),Buffer.alloc(4*1024*1024));
    assert.throws(()=>wechatPackageReport(directory,'wx-unit-test'),/超过 4 MiB/);
    writeFileSync(path.join(directory,'game.json'),JSON.stringify({subpackages:[{name:'bad',root:'../'}]}));
    assert.throws(()=>wechatPackageReport(directory,'wx-unit-test'),/包内/);
}));
