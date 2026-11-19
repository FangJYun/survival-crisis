import {GameConfig} from '../domain/config';
import {StoragePort} from '../domain/ports';
import {canStand,direction} from '../domain/movement';
import {RunState,SurvivalRun} from '../domain/survival';

/** 开发结果样本单独保存，刷新可恢复；不读写正常旅程的键。 */
export function outcomeStorage(storage:StoragePort):StoragePort {
    return {read:key=>storage.read(`qa-outcomes/${key}`),write:(key,value)=>storage.write(`qa-outcomes/${key}`,value)};
}
export function outcomeCheckpoint(config:GameConfig,kind:'death'|'tower'):RunState {
    const run=new SurvivalRun(config,7);
    run.battle.enemies.splice(0);run.state.enemies={};
    run.state.inventory.materials={wood:20,hide:15,food:5};
    for(const recipe of config.recipes.filter(r=>config.equipment.some(e=>e.id===r.output&&e.rarity==='white'))){
        if(!run.manage(`qa-craft-${recipe.id}`,'craft',recipe.id))throw new Error('样本制造失败');
        const item=run.state.inventory.equipment[run.state.inventory.equipment.length-1];
        if(!run.manage(`qa-equip-${item.id}`,'equip',item.id))throw new Error('样本穿戴失败');
    }
    if(!run.manage('qa-spare','craft','craft-weapon'))throw new Error('备用装备制造失败');
    if(kind==='tower'){
        run.state.time=config.world.day+config.world.dusk+10;run.battle.time=run.state.time;
        run.state.raid={night:run.calendar.day,remaining:0,next:run.state.time};
        run.environment.damageAt=run.state.time+config.environment.damageInterval;
        run.tower.health=1;
    }else run.battle.player.health=1;
    const target=kind==='death'?run.battle.player.position:run.towerPosition;
    const monster=kind==='tower'?config.monsters.find(m=>m.role==='siege'&&!m.elite)!:config.monsters.find(m=>(m.role??'melee')==='melee'&&!m.elite)!;
    const position=[{x:target.x+48,y:target.y},{x:target.x-48,y:target.y},{x:target.x,y:target.y+48},{x:target.x,y:target.y-48}]
        .find(p=>canStand(p,monster.radius,run.world.grid.bounds,run.battle.obstacles));
    if(!position)throw new Error('结果样本缺少合法敌人位置');
    const enemy=run.battle.spawn('qa-threat',monster,position);enemy.facing=direction({x:target.x-position.x,y:target.y-position.y});
    run.state.enemies[enemy.id]={source:kind==='tower'?'raid':'wild',rewarded:false,target:'',path:[],revision:-1,replan:0};
    run.message=kind==='tower'?'本地塔毁样本：塔仅余 1 生命，等待攻城怪攻击。':'本地死亡样本：角色仅余 1 生命，五件白装已穿戴，背包有备用木剑。';
    return run.snapshot();
}
