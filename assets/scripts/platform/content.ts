import {assetManager, AssetManager, Asset, JsonAsset, Texture2D, AudioClip} from 'cc';
import {ContentGroup, ContentLease} from '../application/content';
export interface GameContent { manifest: Record<string,unknown>; texture?: Texture2D; detailTexture?: Texture2D; interfaceTexture?: Texture2D; audio?: Record<string,AudioClip> }
export async function loadContentGroup(group:ContentGroup):Promise<ContentLease<GameContent>> {
    const name=`game-${group}`;
    const label={startup:'启动',common:'通用',heroes:'角色',monsters:'怪物',seasons:'季节'}[group];
    const unavailable=(error:unknown)=>{console.warn('内容加载失败',name,error);return new Error(`${label}内容暂时无法加载，请重试。`);};
    const bundle=assetManager.getBundle(name)||await new Promise<AssetManager.Bundle>((resolve,reject)=>assetManager.loadBundle(name,(error,b)=>error?reject(error):resolve(b))).catch(error=>{throw unavailable(error);});
    const held:Asset[]=[];
    const retain=<T extends Asset>(asset:T):T=>{asset.addRef();held.push(asset);return asset;};
    const release=()=>{for(const asset of held.splice(0).reverse())asset.decRef();};
    try {
        const json=retain(await new Promise<JsonAsset>((resolve,reject)=>bundle.load('manifest',JsonAsset,(error,a)=>error?reject(error):resolve(a))));
        const manifest=json.json as Record<string,unknown>;
        if(manifest.group!==group||manifest.version!==1)throw new Error(`${name} 清单版本或分组错误`);
        if(group==='startup'&&(!Array.isArray(manifest.required)||!['common','heroes','monsters','seasons'].every(g=>(manifest.required as string[]).includes(g))))throw new Error('启动清单缺少必要内容');
        if(group==='heroes'&&!['warden','hunter'].every(hero=>Array.isArray(manifest[hero])&&(manifest[hero] as unknown[]).length===4&&(manifest[hero] as number[]).every(n=>Number.isSafeInteger(n)&&n>=0&&n<16)))throw new Error('角色四方向内容缺失');
        if(group==='seasons'&&(!Array.isArray(manifest.ground)||manifest.ground.length!==4||!manifest.ground.every(v=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v))))throw new Error('季节表现内容缺失');
        const frameMapValid=(value:unknown)=>typeof value==='object'&&value!==null&&!Array.isArray(value)&&Object.values(value).every(n=>Number.isSafeInteger(n)&&n>=0&&n<32);
        if(group==='monsters'&&!frameMapValid(manifest.frames))throw new Error('怪物图集映射缺失');
        const value:GameContent={manifest};
        if(group==='common'){
            if(manifest.rows!==4||manifest.columns!==4)throw new Error('图集布局不兼容');
            value.texture=retain(await new Promise<Texture2D>((resolve,reject)=>bundle.load('wilderness-atlas/texture',Texture2D,(error,a)=>error?reject(error):resolve(a))));
            if(!frameMapValid(manifest.buildings))throw new Error('建筑图集映射缺失');
            value.detailTexture=retain(await new Promise<Texture2D>((resolve,reject)=>bundle.load('defense-atlas/texture',Texture2D,(error,a)=>error?reject(error):resolve(a))));
            value.interfaceTexture=retain(await new Promise<Texture2D>((resolve,reject)=>bundle.load('camp-ui-atlas/texture',Texture2D,(error,a)=>error?reject(error):resolve(a))));
            value.audio={};
            for(const sound of ['attack','hit','gather','night','death'])value.audio[sound]=retain(await new Promise<AudioClip>((resolve,reject)=>bundle.load(sound,AudioClip,(error,a)=>error?reject(error):resolve(a))));
        }
        return {value,release};
    }catch(error){release();throw unavailable(error);}
}
