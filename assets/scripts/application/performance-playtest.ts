import {GameConfig} from '../domain/config';
import {canStand,distance} from '../domain/movement';
import {RunState,SurvivalRun} from '../domain/survival';

export const LONG_PROBE_SECONDS=30*60;

export function sustainedLoadConfig(config:GameConfig):GameConfig {
    return {...config,world:{...config.world,night:Math.max(config.world.night,LONG_PROBE_SECONDS+60)}};
}

/** 固定规模的开发负载；只抬高测试塔耐久，不改正式配置、敌人或玩家属性。 */
export function performanceCheckpoint(config:GameConfig):RunState {
    const run=new SurvivalRun(config,42);
    run.battle.enemies.splice(0);run.state.enemies={};
    run.state.time=config.world.day+config.world.dusk+10;run.battle.time=run.state.time;
    run.environment.damageAt=run.state.time+config.environment.damageInterval;
    run.state.raid={night:run.calendar.day,remaining:0,next:run.state.time};
    run.tower.health=run.tower.maxHealth=1000000;
    const types=config.monsters.filter(m=>!m.elite),home=run.tower.cell;
    const cells=[];
    for(let y=home.y-7;y<=home.y+7;y++)for(let x=home.x-7;x<=home.x+7;x++){
        const p=run.world.center({x,y}),d=distance(p,run.towerPosition);
        if(d>=config.world.cellSize*3&&d<=config.world.cellSize*7)cells.push({x,y});
    }
    // 均匀交错四个象限，避免所有角色挤在一个出生方向。
    cells.sort((a,b)=>Math.atan2(a.y-home.y,a.x-home.x)-Math.atan2(b.y-home.y,b.x-home.x));
    for(let i=0;i<config.survival.maxEnemies;i++){
        const def=types[i%types.length];
        let position=null;
        for(let j=0;j<cells.length;j++){
            const p=run.world.center(cells[(j+Math.floor(i*cells.length/config.survival.maxEnemies))%cells.length]);
            if(canStand(p,def.radius,run.world.grid.bounds,run.battle.obstacles)&&!run.battle.enemies.some(e=>distance(e.position,p)<e.radius+def.radius)) {position=p;break;}
        }
        if(!position)throw new Error('压力样本无法放满配置数量的敌人');
        const e=run.battle.spawn(`qa-load-${i}`,def,position);
        run.state.enemies[e.id]={source:'raid',rewarded:false,target:'',path:[],revision:-1,replan:0};
        run.world.reveal(position);
    }
    return run.snapshot();
}
export interface FrameSample {delta:number;work:number;enemies:number;sprites:number;assets:number;heap:number|null}
export class FrameObservation {
    private frames:number[]=[];
    private work:number[]=[];
    elapsed=0;
    minEnemies=Infinity;
    maxEnemies=0;
    sprites=0;
    assets=0;
    heapPeak:number|null=null;
    add(sample:FrameSample):void {
        if(!Number.isFinite(sample.delta)||sample.delta<=0||!Number.isFinite(sample.work)||sample.work<0)return;
        this.elapsed+=sample.delta;this.frames.push(sample.delta*1000);this.work.push(sample.work);
        this.minEnemies=Math.min(this.minEnemies,sample.enemies);this.maxEnemies=Math.max(this.maxEnemies,sample.enemies);
        this.sprites=Math.max(this.sprites,sample.sprites);this.assets=Math.max(this.assets,sample.assets);
        if(sample.heap!==null&&Number.isFinite(sample.heap))this.heapPeak=Math.max(this.heapPeak??0,sample.heap);
    }
    result() {
        const percentile=(values:number[],p:number)=>{const sorted=values.slice().sort((a,b)=>a-b);return sorted.length?sorted[Math.ceil(sorted.length*p)-1]:0;};
        return {seconds:this.elapsed,frames:this.frames.length,fps:this.elapsed?this.frames.length/this.elapsed:0,
            frameP95:percentile(this.frames,.95),frameP99:percentile(this.frames,.99),workP95:percentile(this.work,.95),
            minEnemies:Number.isFinite(this.minEnemies)?this.minEnemies:0,maxEnemies:this.maxEnemies,sprites:this.sprites,assets:this.assets,heapPeak:this.heapPeak};
    }
}
