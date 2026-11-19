import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseConfig } from '../assets/scripts/domain/config';
import { SurvivalRun,RunState } from '../assets/scripts/domain/survival';
import { runValidator } from '../assets/scripts/domain/run-validation';
import { SaveStore } from '../assets/scripts/application/save-store';
import { Session } from '../assets/scripts/application/session';
import { StoragePort } from '../assets/scripts/domain/ports';
const config=()=>parseConfig(JSON.parse(readFileSync('assets/resources/config/game.json','utf8')));
class MemoryStorage implements StoragePort {
    data=new Map<string,string>();failAt=Infinity;writes=0;partial=false;
    async read(key:string){return this.data.get(key)??null;}
    async write(key:string,value:string){this.writes++;if(this.writes===this.failAt){if(this.partial)this.data.set(key,value.slice(0,30));throw new Error('磁盘满');}this.data.set(key,value);}
}
const drain=()=>new Promise<void>(resolve=>setImmediate(resolve));
test('存档暂停保留当前格挡时机，切后台则取消该输入',async()=>{
    const disk=new MemoryStorage(),c=config(),r=new SurvivalRun(c,42),session=new Session(r,new SaveStore(disk,runValidator(c)));
    await session.save();assert.ok(r.battle.block(true));const start=r.battle.blockStarted;
    const saving=session.save();assert.equal(r.battle.canAct,false);session.frame(1,()=>assert.fail());assert.ok(await saving);
    assert.equal(r.battle.blockStarted,start);
    const next=session.save();session.pause('background');assert.ok(await next);session.resume('background');
    assert.equal(r.battle.blocking,false);
});
test('保存：双槽／有界日志、损坏尾记录恢复提示、高版本保留拒绝',async()=>{
    const disk=new MemoryStorage(),c=config(),store=new SaveStore(disk,runValidator(c)),r=new SurvivalRun(c,42);
    for(let i=0;i<15;i++){r.state.revision=i;await store.commit(r.snapshot(),`tx-${i}`);}
    assert.equal(disk.data.size,6);assert.equal((await new SaveStore(disk,runValidator(c)).load()).value?.revision,14);
    disk.data.set('journal-3','{broken');const recovered=await new SaveStore(disk,runValidator(c)).load();assert.ok(recovered.warning);assert.ok(recovered.value);
    const original=disk.data.size;disk.data.set('journal-2',JSON.stringify({schemaVersion:99}));await assert.rejects(new SaveStore(disk,runValidator(c)).load(),/版本/);assert.equal(disk.data.size,original);
});
test('保存：每个写入阶段故障后恢复整笔状态，不出现半扣料／重掷死亡',async()=>{
    for(const transaction of ['craft','death','kill','relocate','end'])for(const failOffset of [1,2]){
        const disk=new MemoryStorage(),c=config(),r=new SurvivalRun(c,42),store=new SaveStore(disk,runValidator(c));
        await store.commit(r.snapshot(),'initial');
        // 推进到 checkpoint 事务，覆盖日志写入和快照写入两个阶段。
        await store.commit(r.snapshot(),'two');await store.commit(r.snapshot(),'three');const before=r.snapshot();
        if(transaction==='craft'){r.state.inventory.materials.wood=3;r.manage('craft','craft','craft-weapon');}
        if(transaction==='death'){r.config.world.deathLossRate=1;r.state.inventory.worn.weapon={id:'w',definition:'basic-weapon'};r.battle.damagePlayer(1000,{x:1000,y:1000});r.tick(1/30);}
        if(transaction==='kill'){const e=r.battle.enemies[0];e.health=0;e.phase='dead';r.battle.events.push({type:'kill',target:e.id,amount:0});r.tick(1/30);}
        if(transaction==='relocate'){r.state.inventory.materials={wood:5,stone:3};r.relocate({x:r.tower.cell.x+1,y:r.tower.cell.y});for(let t=0;t<242;t++)r.tick(1/30);}
        if(transaction==='end')r.damageBuilding('tower',10000);
        const after=r.snapshot();assert.ok(runValidator(c)(after),transaction);
        disk.failAt=disk.writes+failOffset;disk.partial=true;await assert.rejects(store.commit(after,transaction));
        const loaded=(await new SaveStore(disk,runValidator(c)).load()).value!;
        assert.ok(JSON.stringify(loaded)===JSON.stringify(before)||JSON.stringify(loaded)===JSON.stringify(after),transaction);
        disk.failAt=Infinity;await store.commit(after,transaction);await store.commit(after,transaction);
        assert.deepEqual((await new SaveStore(disk,runValidator(c)).load()).value,after);
    }
});
test('会话：写失败冻结、重试同一结果、后台和菜单拒绝世界命令，多重暂停不偷跑',async()=>{
    const disk=new MemoryStorage(),c=config(),r=new SurvivalRun(c,42),session=new Session(r,new SaveStore<RunState>(disk,runValidator(c)));
    await session.save();r.state.inventory.materials.wood=6;disk.failAt=disk.writes+1;
    session.pause('menu');assert.ok(session.command(()=>r.manage('c','craft','craft-weapon'),true));await drain();
    assert.ok(session.error);assert.equal(session.commandsAllowed,false);const snapshot=r.snapshot();session.frame(60,()=>assert.fail());assert.deepEqual(r.snapshot(),snapshot);
    assert.equal(session.command(()=>r.manage('d','craft','craft-weapon'),true),false);
    disk.failAt=Infinity;assert.ok(await session.save());assert.ok(session.fixed.pauses.has('menu'));
    session.pause('background');session.resume('menu');const time=r.state.time;session.frame(3600,()=>assert.fail());assert.equal(r.state.time,time);assert.equal(session.command(()=>true,true),false);
    session.resume('background');session.frame(1/30,()=>{});assert.ok(r.state.time-time<.04);
});
test('恢复：非法位置、错部位、未知装备与终局矛盾被拒绝',()=>{
    const c=config(),validate=runValidator(c),r=new SurvivalRun(c,42);assert.ok(validate(r.snapshot()));
    const a=r.snapshot();a.battle.player.position.x=Infinity;assert.equal(validate(a),false);
    const b=r.snapshot();b.inventory.worn.head={id:'a',definition:'basic-weapon'};assert.equal(validate(b),false);
    const d=r.snapshot();d.ended=true;assert.equal(validate(d),false);
});
test('会话：后台与保存退出同时请求时等待同一提交，不误报失败',async()=>{
    const disk=new MemoryStorage(),c=config(),r=new SurvivalRun(c,42);let release!:()=>void;
    const barrier=new Promise<void>(resolve=>{release=resolve;});
    const storage:StoragePort={read:k=>disk.read(k),write:async(k,v)=>{await barrier;await disk.write(k,v);}};
    const session=new Session(r,new SaveStore(storage,runValidator(c)));
    const first=session.save();session.pause('background');const second=session.save();assert.equal(first,second);
    session.frame(3600,()=>assert.fail());release();assert.deepEqual(await Promise.all([first,second]),[true,true]);
    assert.equal(session.error,null);assert.equal(disk.writes,2);assert.ok(session.fixed.pauses.has('background'));assert.equal(r.state.time,0);
});
test('会话：周期落盘、恢复清理移动／格挡输入、终局存档禁止世界命令',async()=>{
    const disk=new MemoryStorage(),c=config(),r=new SurvivalRun(c,42),store=new SaveStore(disk,runValidator(c)),session=new Session(r,store);
    await session.save();r.battle.move({x:0,y:-1});r.battle.block(true);
    for(let i=0;i<460;i++){session.frame(1/30,()=>{});await drain();}
    const loaded=(await new SaveStore(disk,runValidator(c)).load()).value!;assert.ok(loaded.time>=15);assert.equal(loaded.inventory.materials.wood,undefined);
    const restored=new SurvivalRun(c,42,loaded),before={...restored.battle.player.position};restored.tick(1/30);
    assert.deepEqual(restored.battle.player.position,before);assert.equal(restored.battle.blocking,false);
    restored.damageBuilding('tower',10000);const ended=new Session(restored,store);await ended.save();
    const final=(await new SaveStore(disk,runValidator(c)).load()).value!;assert.equal(final.ended,true);assert.equal(final.buildings.find(b=>b.id==='tower')!.health,0);
    const reloaded=new Session(new SurvivalRun(c,42,final),store);assert.equal(reloaded.command(()=>assert.fail()),false);
});
