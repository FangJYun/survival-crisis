import {existsSync,readFileSync,mkdirSync,cpSync,renameSync} from 'node:fs';
import path from 'node:path';
export function hasBattleScene(directory){
    try{return Object.keys(JSON.parse(readFileSync(path.join(directory,'assets/main/config.json'),'utf8')).scenes).some(s=>s.endsWith('/Battle.scene'));}catch{return false;}
}
/** 仅备份已包含入口场景的本地生成目录，不接触源码或玩家存储。 */
export function preserveBuild(directory,recoveryRoot){
    if(!hasBattleScene(directory))return null;
    mkdirSync(recoveryRoot,{recursive:true});
    const backup=path.join(recoveryRoot,'previous');cpSync(directory,backup,{recursive:true,errorOnExist:true,force:false});
    return ()=>{
        if(existsSync(directory))renameSync(directory,path.join(recoveryRoot,'failed'));
        cpSync(backup,directory,{recursive:true});
    };
}
