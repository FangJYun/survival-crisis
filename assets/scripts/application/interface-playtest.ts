import { GameConfig } from '../domain/config';
import { RunState, SurvivalRun } from '../domain/survival';

export function interfaceCheckpoint(config:GameConfig):RunState {
    const run=new SurvivalRun(config,42);
    run.battle.enemies.splice(0);run.state.enemies={};
    run.progression.combatXp=config.growth.combatThresholds[config.growth.skillLevels[1]-2];
    run.state.inventory.materials={wood:22,stone:18,hide:16,herb:10,food:5};
    for(const [index,definition] of ['basic-weapon','blue-body','purple-head','gold-feet'].entries()){
        run.state.inventory.equipment.push({id:`ui-sample-${index}`,definition});
    }
    run.battle.player.health=65;run.state.hunger=70;
    return run.snapshot();
}
