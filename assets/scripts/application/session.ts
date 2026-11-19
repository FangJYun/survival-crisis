import { SurvivalRun, RunState } from '../domain/survival';
import { SaveStore } from './save-store';
import { FixedStep, PauseReason } from './fixed-step';

/** 单写者：关键结算完成后立即冻结，成功落盘前不接受下一次输入或模拟。 */
export class Session {
    readonly fixed=new FixedStep();
    error:string|null=null;
    saving=false;
    private pending:RunState|null=null;
    private savedRevision=-1;
    private inFlight:Promise<boolean>|null=null;
    private savedTime=-Infinity;
    constructor(readonly run:SurvivalRun,readonly store:SaveStore<RunState>){}
    get commandsAllowed():boolean{return !this.fixed.pauses.has('background')&&!this.fixed.pauses.has('storage')&&!this.fixed.pauses.has('system')&&!this.run.state.ended;}
    pause(reason:PauseReason):void{this.fixed.pause(reason);this.run.battle.setActive(false,reason!=='storage');}
    resume(reason:PauseReason):void{this.fixed.resume(reason);this.run.battle.setActive(!this.fixed.paused&&!this.run.state.ended);}
    command(action:()=>boolean,management=false):boolean {
        if(!this.commandsAllowed||(!management&&this.fixed.paused))return false;
        const ok=action();if(this.run.state.revision!==this.savedRevision)void this.save();return ok;
    }
    frame(delta:number,controls:()=>void):void {
        this.fixed.frame(delta,dt=>{controls();this.run.tick(dt);if(this.run.state.revision!==this.savedRevision||this.run.state.time-this.savedTime>=this.run.config.survival.autosaveSeconds)void this.save();});
    }
    save():Promise<boolean>{
        if(this.inFlight)return this.inFlight;
        const task=this.persist();this.inFlight=task;
        void task.then(()=>{if(this.inFlight===task)this.inFlight=null;});
        return task;
    }
    private async persist():Promise<boolean>{
        if(!this.pending)this.pending=this.run.snapshot();
        this.pause('storage');this.saving=true;this.error=null;
        try {
            const s=this.pending;await this.store.commit(s,`${s.id}:${s.revision}:${s.time.toFixed(8)}`);
            this.savedRevision=s.revision;this.savedTime=s.time;this.pending=null;this.resume('storage');return true;
        }catch(error){this.error=error instanceof Error?error.message:String(error);return false;}
        finally{this.saving=false;}
    }
}
