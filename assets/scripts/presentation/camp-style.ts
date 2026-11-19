import { GameConfig, SkillDefinition, SkillId } from '../domain/config';
import { Equipment, Slot } from '../domain/inventory';

export const icons={head:32,body:33,feet:34,hands:35,weapon:36,bag:37,heart:38,stamina:39,food:40,temperature:41,sweep:42,shockwave:43,warcry:44,'first-aid':45,shield:46,blink:47,tower:12,wood:8,stone:9,herb:11} as const;
export const rarityStyle={
    white:{name:'白装',fill:'#F2EFE3',edge:'#969184',ink:'#5B574B'},
    blue:{name:'蓝装',fill:'#E2F2FA',edge:'#598FAC',ink:'#285E79'},
    purple:{name:'紫装',fill:'#F0E6FA',edge:'#9E70B5',ink:'#70448C'},
    gold:{name:'金装',fill:'#FFF0CA',edge:'#D29A38',ink:'#895811'},
};
export const skillStyle:Record<SkillId,{fill:string;edge:string;light:string;role:string}>={
    sweep:{fill:'#E5F3D5',edge:'#629348',light:'#9EE96F',role:'范围伤害'},
    shockwave:{fill:'#DDF1F7',edge:'#5B98B6',light:'#64D9FF',role:'远程击退'},
    warcry:{fill:'#FCE6C8',edge:'#B5823C',light:'#FFD57B',role:'吸引敌人'},
    'first-aid':{fill:'#FBE3DF',edge:'#B27075',light:'#8AFFB9',role:'恢复生命'},
};
export const slotNames:Record<Slot,string>={head:'头部',body:'衣服',feet:'鞋子',hands:'手套',weapon:'武器'};

export function equipmentInfo(config:GameConfig,id:string) {
    const definition=config.equipment.find(item=>item.id===id);
    return definition??{id,name:'应急木棍',slot:'weapon' as const,rarity:'white' as const,attack:2,defense:0,warmth:0,cooling:0,effect:'可在营地塔旁领取；不可拆解。'};
}

export function materialIcon(id:string):number {
    switch(id){
        case 'wood':return icons.wood;
        case 'stone':return icons.stone;
        case 'herb':return icons.herb;
        case 'food':return icons.food;
        case 'hide':return icons.body;
        case 'ancient-core':return icons.shockwave;
        case 'verdant-essence':return 20;
        case 'ember-heart':return 25;
        case 'amber-shell':return 26;
        case 'frost-fur':return 27;
        default:return icons.bag;
    }
}

export function describeSkill(skill:SkillDefinition):string {
    if(skill.heal)return `恢复 ${skill.heal} 点生命`;
    if(skill.duration)return `吸引周围敌人 ${skill.duration} 秒`;
    return `造成 ${skill.damage} 倍伤害${skill.knockback?'并击退敌人':''}`;
}

export type BagTab='gear'|'materials'|'craft'|'tools';
export type SupplyAction='emergency'|'logging'|'mining';
export type BagEntry=
    |{kind:'gear';key:string;item:Equipment;slot?:Slot}
    |{kind:'material';key:string;id:string}
    |{kind:'recipe';key:string;recipe:GameConfig['recipes'][number]}
    |{kind:'tool';key:string;action:SupplyAction;name:string;icon:number};

export const supplies:readonly BagEntry[]=[
    {kind:'tool',key:'emergency',action:'emergency',name:'应急木棍',icon:icons.weapon},
    {kind:'tool',key:'logging',action:'logging',name:'进阶斧',icon:icons.wood},
    {kind:'tool',key:'mining',action:'mining',name:'进阶镐',icon:icons.stone},
];
