import {GameConfig} from './config';
export const GATHERING=['logging','mining','foraging'] as const;
export type Gathering=typeof GATHERING[number];
export interface Progression {
    hero:string; combatXp:number; gathering:Record<Gathering,number>;
    repairs:number; counterUntil:number; blinkUntil:number;
}
export function initialProgression(hero:string):Progression {
    return {hero,combatXp:0,gathering:{logging:0,mining:0,foraging:0},repairs:0,counterUntil:0,blinkUntil:0};
}
/** 阈值是累计经验；上限仍保留累计值，升级不吞掉跨级余量。 */
export function levelAt(xp:number,thresholds:number[]):number {return 1+thresholds.filter(t=>xp>=t).length;}
export function experienceAt(xp:number,thresholds:number[]):{level:number;remaining:number;needed:number|null} {
    const level=levelAt(xp,thresholds),previous=level===1?0:thresholds[level-2];
    return {level,remaining:xp-previous,needed:thresholds[level-1]===undefined?null:thresholds[level-1]-previous};
}
export function gatheringKind(item:string):Gathering {return item==='wood'?'logging':item==='stone'?'mining':'foraging';}
export function progressionValid(p:Progression,config:GameConfig):boolean {
    return Boolean(p&&config.characters.some(c=>c.id===p.hero)&&Number.isSafeInteger(p.combatXp)&&p.combatXp>=0
        &&Number.isSafeInteger(p.repairs)&&p.repairs>=0&&[p.counterUntil,p.blinkUntil].every(n=>Number.isFinite(n)&&n>=0)
        &&p.gathering&&GATHERING.every(k=>Number.isSafeInteger(p.gathering[k])&&p.gathering[k]>=0));
}
