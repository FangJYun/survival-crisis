import { StoragePort } from '../domain/ports';
export interface FileSystem {
    accessSync(path:string):void;
    mkdirSync(path:string,recursive:boolean):void;
    readFileSync(path:string,encoding:'utf8'):string;
    writeFileSync(path:string,data:string,encoding:'utf8'):void;
    renameSync(oldPath:string,newPath:string):void;
}
export interface WechatFiles { env:{USER_DATA_PATH:string};getFileSystemManager():FileSystem }
export function wechatStoragePort(wx:WechatFiles):StoragePort {
    const fs=wx.getFileSystemManager(),dir=`${wx.env.USER_DATA_PATH}/survival-v1`;
    const missing=(e:unknown)=>/no such file|not exist|ENOENT/i.test(String((e as {errMsg?:string})?.errMsg||e));
    try{fs.accessSync(dir);}catch(error){if(!missing(error))throw error;fs.mkdirSync(dir,true);}
    return {
        async read(key){const path=`${dir}/${key}.json`;try{fs.accessSync(path);}catch(error){if(missing(error))return null;throw error;}return fs.readFileSync(path,'utf8');},
        async write(key,value){const path=`${dir}/${key}.json`;fs.writeFileSync(`${path}.tmp`,value,'utf8');fs.renameSync(`${path}.tmp`,path);},
    };
}
export function browserStoragePort(storage:Pick<Storage,'getItem'|'setItem'>):StoragePort {
    return {async read(key){return storage.getItem(`survival-v1/${key}`);},async write(key,value){storage.setItem(`survival-v1/${key}`,value);}};
}
export function localStoragePort():StoragePort {
    const wx=(globalThis as unknown as {wx?:WechatFiles}).wx;
    return wx?wechatStoragePort(wx):browserStoragePort(globalThis.localStorage);
}

