import {existsSync,mkdirSync,readFileSync,readdirSync,renameSync,statSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

export const WECHAT_CONTENT_PACKAGES=['game-common','game-heroes','game-monsters','game-seasons'];

export function packageWechatContent(directory){
    const root=path.resolve(directory),settingsPath=path.join(root,'src/settings.json'),gamePath=path.join(root,'game.json');
    const settings=JSON.parse(readFileSync(settingsPath,'utf8')),game=JSON.parse(readFileSync(gamePath,'utf8'));
    for(const name of WECHAT_CONTENT_PACKAGES){
        const source=path.join(root,'assets',name),destination=path.join(root,'subpackages',name);
        assert.ok(!existsSync(destination),`目标分包已存在：${name}`);
        assert.ok(existsSync(path.join(source,'config.json')),`缺少源内容包 ${name}`);
    }
    mkdirSync(path.join(root,'subpackages'),{recursive:true});
    for(const name of WECHAT_CONTENT_PACKAGES){
        const destination=path.join(root,'subpackages',name);
        renameSync(path.join(root,'assets',name),destination);
        writeFileSync(path.join(destination,'game.js'),"require('./index.js');\n");
    }
    settings.assets.subpackages=[...new Set([...(settings.assets.subpackages??[]),...WECHAT_CONTENT_PACKAGES])];
    game.subpackages=[...(game.subpackages??[]),...WECHAT_CONTENT_PACKAGES.map(name=>({name,root:`subpackages/${name}/`}))];
    writeFileSync(settingsPath,JSON.stringify(settings));writeFileSync(gamePath,JSON.stringify(game,null,2)+'\n');
}

export function wechatPackageReport(directory,expectedAppId){
    const root=path.resolve(directory),game=JSON.parse(readFileSync(path.join(root,'game.json'),'utf8'));
    const project=JSON.parse(readFileSync(path.join(root,'project.config.json'),'utf8'));
    assert.equal(project.appid,expectedAppId,'微信产物 AppID 与构建配置不一致');
    assert.equal(project.compileType,'game','微信工程必须是小游戏类型');
    const packages=game.subpackages??game.subPackages??[];
    const roots=packages.map(pkg=>{
        const absolute=path.resolve(root,pkg.root);
        assert.ok(absolute.startsWith(root+path.sep),'分包必须位于游戏包内');
        assert.ok(statSync(absolute).isDirectory(),'分包目录不存在');
        return {name:pkg.name,root:pkg.root,absolute,bytes:0};
    });
    assert.equal(new Set(roots.map(pkg=>pkg.absolute)).size,roots.length,'分包目录不能重复');
    const result={appid:project.appid,mainBytes:0,totalBytes:0,packages:roots};
    const walk=folder=>{
        for(const file of readdirSync(folder,{withFileTypes:true})){
            const absolute=path.join(folder,file.name);
            if(file.isDirectory()){walk(absolute);continue;}
            assert.ok(file.isFile(),'包内不能包含链接或其他非普通文件');
            const bytes=statSync(absolute).size;
            const pkg=roots.find(pkg=>absolute.startsWith(pkg.absolute+path.sep));
            result.totalBytes+=bytes;if(pkg)pkg.bytes+=bytes;else result.mainBytes+=bytes;
        }
    };
    walk(root);
    assert.ok(result.mainBytes<=4*1024*1024,`主包超过 4 MiB：${result.mainBytes} 字节`);
    assert.ok(result.totalBytes<=30*1024*1024,`总包超过项目的 30 MiB 预算：${result.totalBytes} 字节`);
    return {...result,packages:roots.map(({absolute,...pkg})=>pkg)};
}
