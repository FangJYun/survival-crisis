import {levelAt,progressionValid} from './progression';
import { GameConfig, SLOTS, BUILDINGS } from './config';
import { RunState } from './survival';

/** 校验恢复边界；校验和只检查损坏，不作为防作弊签名。 */
export function runValidator(config:GameConfig):(v:unknown)=>v is RunState {
    return (v:unknown):v is RunState=>{
        try {
            const s=v as RunState,number=(n:number)=>Number.isFinite(n)&&n>=0,integer=(n:number)=>Number.isSafeInteger(n)&&n>=0;
            const pos=(p:{x:number;y:number})=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=config.world.width*config.world.cellSize/2&&Math.abs(p.y)<=config.world.height*config.world.cellSize/2;
            const cell=(p:{x:number;y:number})=>p&&integer(p.x)&&integer(p.y)&&p.x<config.world.width&&p.y<config.world.height;
            if(!s||typeof s.id!=='string'||!integer(s.revision)||!number(s.time)||typeof s.ended!=='boolean'||!integer(s.nextEntity)||!integer(s.deathId))return false;
            if(!number(s.hunger)||s.hunger>config.survival.hungerMax||!(s.respawnAt===null||number(s.respawnAt))||!number(s.relocationReady))return false;
            if(!Array.isArray(s.buildings)||s.buildings.filter(b=>b.kind==='tower').length!==1)return false;
            const cells=new Set<string>(),ids=new Set<string>();
            for(const b of s.buildings){const key=`${b.cell.x}:${b.cell.y}`;if(!cell(b.cell)||cells.has(key)||ids.has(b.id)||!BUILDINGS.some(k=>k===b.kind)||!number(b.health)||b.health>b.maxHealth||!number(b.maxHealth)||b.maxHealth===0||typeof b.open!=='boolean')return false;cells.add(key);ids.add(b.id);}
            if(s.ended!==(s.buildings.find(b=>b.kind==='tower')!.health===0))return false;
            if(!integer(s.world.seed)||!Array.isArray(s.world.resources)||!Array.isArray(s.world.explored)||!s.world.explored.every(n=>integer(n)&&n<config.world.width*config.world.height))return false;
            const resources=new Set<string>();
            for(const n of s.world.resources){if(resources.has(n.id)||!cell(n.cell)||!integer(n.amount)||!number(n.refreshAt)||!config.survival.resources.some(d=>d.id===n.definition&&n.amount<=d.count))return false;resources.add(n.id);}
            const bag=s.inventory,materials=new Set(config.materials.map(d=>d.id)),equipment=new Set(config.equipment.map(d=>d.id).concat('emergency-weapon'));
            if(!integer(bag.capacity)||bag.capacity!==config.survival.capacity||!integer(bag.nextItem)||!Array.isArray(bag.tools)||!bag.tools.every(t=>['axe','pick','improved-axe','improved-pick'].includes(t)))return false;
            if(!Object.entries(bag.materials).every(([id,n])=>materials.has(id)&&integer(n)&&n>0))return false;
            if(!Object.keys(bag.worn).every(slot=>SLOTS.some(s=>s===slot)))return false;
            const itemIds=new Set<string>();
            for(const item of [...bag.equipment,...Object.values(bag.worn)]){if(!item||typeof item.id!=='string'||itemIds.has(item.id)||!equipment.has(item.definition))return false;itemIds.add(item.id);}
            for(const slot of SLOTS){const item=bag.worn[slot];if(item&&(config.equipment.find(d=>d.id===item.definition)?.slot||(item.definition==='emergency-weapon'?'weapon':null))!==slot)return false;}
            if(Object.keys(bag.materials).length+bag.equipment.length>bag.capacity)return false;
            if(s.progression!==undefined&&!progressionValid(s.progression,config))return false;
            if(s.skills!==undefined){const known=new Set(config.skills.map(k=>k.id));if(!Array.isArray(s.skills.learned)||s.skills.learned.length>2||new Set(s.skills.learned).size!==s.skills.learned.length||!s.skills.learned.every(k=>known.has(k))||!s.skills.ready||!Object.entries(s.skills.ready).every(([k,t])=>s.skills!.learned.includes(k as typeof s.skills.learned[number])&&number(t)))return false;const slots=config.growth.skillLevels.filter(l=>levelAt(s.progression?.combatXp||0,config.growth.combatThresholds)>=l).length;if(s.skills.learned.length>slots)return false;}
            const maxHealth=config.combat.health+((s.progression?levelAt(s.progression.combatXp,config.growth.combatThresholds):1)-1)*config.growth.healthPerLevel;
            const b=s.battle;if(!pos(b.player.position)||!pos(b.player.facing)||!number(b.player.health)||b.player.health>maxHealth||!number(b.stamina)||b.stamina>config.combat.stamina||!number(b.time)||Math.abs(b.time-s.time)>.001||!number(b.blinkCooldown)||!number(b.protectedUntil))return false;
            if(b.castUntil!==undefined&&!number(b.castUntil))return false;
            if(b.events!==undefined&&(!Array.isArray(b.events)||!b.events.every(e=>['hit','kill','block','perfect','death','blink'].includes(e.type)&&typeof e.target==='string'&&number(e.amount))))return false;
            if(Object.values(s.enemies).some(m=>m.tauntUntil!==undefined&&!number(m.tauntUntil)))return false;
            if(s.pity!==undefined&&!Object.entries(s.pity).every(([id,n])=>materials.has(id)&&integer(n)))return false;
            if(s.eliteDay!==undefined&&!integer(s.eliteDay))return false;
            if(s.buildings.some(b=>b.fuelUntil!==undefined&&!number(b.fuelUntil)))return false;
            if(s.environment!==undefined){const e=s.environment;if(!Number.isFinite(e.temperature)||!number(e.damageAt)||!e.events||!Object.entries(e.events).every(([key,v])=>/^\d+:[0-3]$/.test(key)&&['pending','spawned','defeated','missed'].includes(v.status)&&number(v.attemptAt)&&(v.enemy===undefined||typeof v.enemy==='string')))return false;}
            if(b.swing!==null&&(!number(b.swing.elapsed)||!Array.isArray(b.swing.hit)||!b.swing.hit.every(id=>typeof id==='string')||!pos(b.swing.facing)||(b.swing.damage!==undefined&&(!number(b.swing.damage)||b.swing.damage===0))))return false;
            if(!Array.isArray(b.enemies)||b.enemies.length>config.survival.maxEnemies+10)return false;
            const enemies=new Set<string>();
            for(const e of b.enemies){if(enemies.has(e.id)||!pos(e.position)||!number(e.health)||!['idle','windup','recovery','dead'].includes(e.phase)||!Number.isFinite(e.timer)||!pos(e.facing)||!pos(e.attackFacing)||!config.monsters.some(d=>JSON.stringify(d)===JSON.stringify(e.definition)))return false;enemies.add(e.id);const meta=s.enemies[e.id];if(!meta||!['raid','wild'].includes(meta.source)||typeof meta.rewarded!=='boolean'||typeof meta.target!=='string'||!Array.isArray(meta.path)||!meta.path.every(cell)||!Number.isFinite(meta.revision)||!number(meta.replan))return false;}
            if(!['spawn','loot','death'].every(k=>integer(s.random[k as keyof typeof s.random])))return false;
            if(!['kills','deaths','gathered','built'].every(k=>integer(s.stats[k as keyof typeof s.stats])))return false;
            if(!Array.isArray(s.lost)||!s.lost.every(e=>typeof e.id==='string'&&equipment.has(e.definition)))return false;
            if(!integer(s.raid.night)||!integer(s.raid.remaining)||!number(s.raid.next)||!Object.values(s.random).every(integer)||!Object.values(s.stats).every(integer))return false;
            if(!Array.isArray(s.drops)||!s.drops.every(d=>pos(d.position)&&((d.material&&materials.has(d.material))||d.equipment&&equipment.has(d.equipment.definition))))return false;
            return true;
        }catch{return false;}
    };
}
