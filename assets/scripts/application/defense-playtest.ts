import {GameConfig} from '../domain/config';
import {RunState,SurvivalRun} from '../domain/survival';

/** 本地专用围墙样本；调用方必须使用独立的 PlaytestStorage。 */
export function defenseCheckpoint(config:GameConfig):RunState {
    const run=new SurvivalRun(config,42),home=run.tower.cell;
    run.battle.enemies.splice(0);run.state.enemies={};
    for(const resource of run.world.state.resources)if(Math.abs(resource.cell.x-home.x)<=7&&Math.abs(resource.cell.y-home.y)<=7){
        resource.amount=0;resource.refreshAt=1e9;run.world.grid.setBlocked(resource.cell.x,resource.cell.y,false);
    }
    run.state.inventory.materials={wood:250,stone:250,'ancient-core':10,food:10};
    for(let y=-3;y<=3;y++)for(let x=-3;x<=3;x++)if(Math.max(Math.abs(x),Math.abs(y))===3){
        const cell={x:home.x+x,y:home.y+y};
        run.battle.player.position=run.world.center({x:home.x+Math.sign(x)*Math.min(Math.abs(x),2),y:home.y+Math.sign(y)*Math.min(Math.abs(y),2)});
        run.world.reveal(run.battle.player.position);
        if(!run.build(cell,x===0&&y===-3||x===3&&y===0?'gate':y===3?'stone-wall':x===-3?'reinforced-wall':'wall'))throw new Error('围墙样本建造失败');
    }
    run.battle.player.position=run.world.center({x:home.x,y:home.y-1});
    return run.snapshot();
}
