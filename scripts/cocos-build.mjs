import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import {preserveBuild} from './build-artifacts.mjs';
import {packageWechatContent} from './wechat-package.mjs';
const platform=process.argv[2];
if(!['web-mobile','wechatgame'].includes(platform))throw new Error('平台只能为 web-mobile 或 wechatgame');
const editor=process.env.COCOS_CREATOR_BIN||'/Applications/Cocos/Creator/3.8.8/CocosCreator.app/Contents/MacOS/CocosCreator';
if(!existsSync(editor))throw new Error('未找到编辑器，请设置 COCOS_CREATOR_BIN');
const critical=[['assets/scenes/Battle.scene','scene'],['assets/scripts/presentation/BattleView.ts','typescript'],['assets/resources/config/game.json','json']];
for(const [file,type] of critical){
    const meta=JSON.parse(readFileSync(`${file}.meta`,'utf8'));
    if(meta.importer!==type)throw new Error(`${file} 的资源类型异常（${meta.importer}），请先在 Creator 重新导入；已停止构建，避免产出空包。`);
}
function metas(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?metas(path.join(dir,e.name)):e.name.endsWith('.meta')?[path.join(dir,e.name)]:[]);}
// 记录原始内容与 UUID；仅针对已知导入类型降级为 * 的异常恢复，不改场景序列化。
const originals=new Map(metas('assets').concat(existsSync('assets.meta')?['assets.meta']:[]).map(file=>[file,readFileSync(file,'utf8')]));
function degraded(){return Array.from(originals).filter(([file,raw])=>JSON.parse(raw).importer!=='*'&&JSON.parse(readFileSync(file,'utf8')).importer==='*');}
function launch(){return new Promise(resolve=>{
    const child=spawn(editor,['--project',process.cwd(),'--build',`configPath=${path.resolve(`config/build-${platform}.json`)}`],{stdio:'inherit'});
    child.on('error',e=>{console.error(e.message);resolve(1);});child.on('exit',code=>resolve(code));
});}
const restorePrevious=preserveBuild(path.join('build',platform),path.join('temp',`build-recovery-${platform}-${Date.now()}`));
for(let attempt=0;attempt<2;attempt++){
    const code=await launch(),broken=degraded();
    if(broken.length){
        for(const [file,raw] of broken)writeFileSync(file,raw);
        const recovery=path.join('temp',`asset-cache-recovery-${Date.now()}`);
        if(existsSync('library'))renameSync('library',recovery);
        console.error(`检测到 ${broken.length} 份资源类型降级，已恢复原元数据；异常缓存保留于 ${recovery}。`);
        if(attempt===0){console.error('使用重建缓存重试一次。');continue;}
        process.exitCode=1;break;
    }
    if(code!==36&&code!==0){process.exitCode=code||1;break;}
    if(platform==='wechatgame'){
        try{packageWechatContent(path.join('build',platform));}
        catch(error){console.error(error);process.exitCode=1;break;}
    }
    const result=spawnSync(process.execPath,['scripts/check-build.mjs',platform],{stdio:'inherit'});
    process.exitCode=result.status??1;break;
}
if(process.exitCode&&restorePrevious){restorePrevious();console.error('本轮构建失败，已恢复上一份有效本地产物；失败产物与备份保留于 temp/build-recovery-*。');}
