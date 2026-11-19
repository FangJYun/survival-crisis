import {GameConfig} from '../domain/config';
import {StoragePort} from '../domain/ports';
import {SurvivalRun,RunState} from '../domain/survival';

/** 开发样本专用；从不接触浏览器或微信的正式存档。 */
export class PlaytestStorage implements StoragePort {
    private values=new Map<string,string>();
    async read(key:string):Promise<string|null>{return this.values.get(key)??null;}
    async write(key:string,value:string):Promise<void>{this.values.set(key,value);}
}
export const SEASON_SAMPLES=[
    {id:'summer-heat',name:'夏季无防护',season:1,offset:0,protection:'none'},
    {id:'summer-cooler',name:'夏季降温棚',season:1,offset:0,protection:'cooler'},
    {id:'winter-cold',name:'冬季无防护',season:3,offset:0,protection:'none'},
    {id:'winter-fire',name:'冬季篝火',season:3,offset:0,protection:'campfire'},
    {id:'winter-armor',name:'冬季白装长夜',season:3,offset:360,protection:'armor'},
    {id:'spring-boss',name:'春末黄昏首领',season:0,offset:3958,protection:'none'},
    {id:'year-end',name:'冬末跨年',season:3,offset:4198,protection:'campfire'},
] as const;
export type SeasonSample=typeof SEASON_SAMPLES[number];

/** 只设置起点，不改配置或加速。无野怪、初始夜袭预算已耗尽，隔离温度/边界观察。 */
export function seasonCheckpoint(config:GameConfig,sample:SeasonSample):RunState {
    const run=new SurvivalRun(config,42);
    run.battle.enemies.splice(0);run.state.enemies={};
    run.state.time=sample.season*config.world.seasonDays*(config.world.day+config.world.dusk+config.world.night)+sample.offset;
    run.battle.time=run.state.time;
    run.environment.damageAt=run.state.time+config.environment.damageInterval;
    run.state.eliteDay=run.calendar.day;
    run.state.raid={night:run.calendar.day,remaining:0,next:run.state.time};
    run.state.inventory.materials={wood:30,stone:30,herb:20};
    if(sample.protection==='armor'){
        for(const def of config.equipment.filter(e=>e.rarity==='white'&&e.slot!=='weapon'))run.state.inventory.worn[def.slot]={id:`qa-${def.id}`,definition:def.id};
    }else if(sample.protection!=='none'){
        if(!run.build({x:run.tower.cell.x+1,y:run.tower.cell.y-2},sample.protection)||!run.fuelFacility())throw new Error('季节样本设施初始化失败');
    }
    run.message=`本地样本：${sample.name}；正常速度，临时存档。`;
    return run.snapshot();
}
