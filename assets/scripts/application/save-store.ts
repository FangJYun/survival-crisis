import { StoragePort } from '../domain/ports';

interface RecordEnvelope { schemaVersion:number; configVersion:number; sequence:number; transaction:string; checksum:string; payload:string }
export interface Loaded<T> { value:T|null; warning:string|null }
const KEYS=['snapshot-0','snapshot-1','journal-0','journal-1','journal-2','journal-3'];
export function checksum(value:string):string { let h=2166136261;for(let i=0;i<value.length;i++)h=Math.imul(h^value.charCodeAt(i),16777619);return (h>>>0).toString(16); }
/** 每条日志保存完整事务 post-state；四条环形日志 + 两份快照，不依赖奖励增量重放。 */
export class SaveStore<T> {
    private sequence=0;
    private lastTransaction='';
    private pending:RecordEnvelope|null=null;
    constructor(readonly storage:StoragePort,readonly validate:(v:unknown)=>v is T){}
    private decode(raw:string):RecordEnvelope|null {
        try {
            const r=JSON.parse(raw) as RecordEnvelope;
            if(r.schemaVersion>3||r.configVersion>1)throw new Error('VERSION');
            if(![1,2,3].includes(r.schemaVersion)||r.configVersion!==1||!Number.isSafeInteger(r.sequence)||r.sequence<1||typeof r.transaction!=='string'||typeof r.payload!=='string')return null;
            if(checksum(`${r.sequence}|${r.transaction}|${r.payload}`)!==r.checksum||!this.validate(JSON.parse(r.payload)))return null;
            return r;
        }catch(e){if(e instanceof Error&&e.message==='VERSION')throw new Error('存档版本高于当前游戏，原数据已保留；请使用较新版本。');return null;}
    }
    async load():Promise<Loaded<T>> {
        const records:RecordEnvelope[]=[];let damaged=false;
        for(const key of KEYS){const raw=await this.storage.read(key);if(raw===null)continue;const r=this.decode(raw);if(r)records.push(r);else damaged=true;}
        records.sort((a,b)=>b.sequence-a.sequence);
        if(!records.length){if(damaged)throw new Error('本地存档已损坏，尚未找到有效备份；原文件已保留。');return {value:null,warning:null};}
        const last=records[0];this.sequence=last.sequence;this.lastTransaction=last.transaction;
        return {value:JSON.parse(last.payload) as T,warning:damaged?`部分记录损坏，已恢复有效提交 #${last.sequence}。`:null};
    }
    async commit(value:T,transaction:string):Promise<void> {
        if(this.lastTransaction===transaction&&!this.pending)return;
        if(!this.validate(value))throw new Error('世界状态无效，已停止保存以保护备份。');
        if(this.pending&&this.pending.transaction!==transaction)throw new Error('上一事务尚未提交，请重试。');
        if(!this.pending){const sequence=this.sequence+1,payload=JSON.stringify(value);this.pending={schemaVersion:3,configVersion:1,sequence,transaction,payload,checksum:checksum(`${sequence}|${transaction}|${payload}`)};}
        const record=this.pending,raw=JSON.stringify(record),key=`journal-${record.sequence%4}`;
        await this.storage.write(key,raw);
        if(this.decode((await this.storage.read(key))||'')?.checksum!==record.checksum)throw new Error('存档回读校验失败，请重试。');
        if(record.sequence===1||record.sequence%4===0){
            const slot=`snapshot-${Math.floor(record.sequence/4)%2}`;
            await this.storage.write(slot,raw);
            if(this.decode((await this.storage.read(slot))||'')?.checksum!==record.checksum)throw new Error('备份回读失败，请重试。');
        }
        this.sequence=record.sequence;this.lastTransaction=transaction;this.pending=null;
    }
}
