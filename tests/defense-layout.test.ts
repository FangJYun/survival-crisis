import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {defenseLayout,wallSides} from '../assets/scripts/application/defense-layout';
import {defenseCheckpoint} from '../assets/scripts/application/defense-playtest';
import {Building,SurvivalRun} from '../assets/scripts/domain/survival';
import {parseConfig} from '../assets/scripts/domain/config';
import {findPath} from '../assets/scripts/domain/world';
import {moveCircle} from '../assets/scripts/domain/movement';
import {runValidator} from '../assets/scripts/domain/run-validation';
const config=()=>parseConfig(JSON.parse(readFileSync('assets/resources/config/game.json','utf8')));
const wall=(id:string,x:number,y:number,kind:Building['kind']='wall'):Building=>({id,kind,cell:{x,y},health:120,maxHealth:120,open:false});

test('墙连接：覆盖全部十六种相邻组合，混合墙材连接，斜角和设施不连接',()=>{
    for(let mask=0;mask<16;mask++){
        const buildings=[wall('center',4,4)];
        wallSides.forEach((s,i)=>{if(mask&s.bit)buildings.push(wall(`neighbor-${i}`,4+s.x,4+s.y,i%2?'stone-wall':'reinforced-wall'));});
        buildings.push(wall('diagonal',5,5),wall('facility',3,3,'campfire'));
        assert.equal(defenseLayout(buildings).get('center')!.mask,mask);
    }
    const isolated=defenseLayout([wall('wall',0,0),wall('tower',1,0,'tower'),wall('facility',0,1,'cooler')]);
    assert.equal(isolated.get('wall')!.mask,0);assert.equal(isolated.has('tower'),false);
});

test('门连接：横竖方向由相邻墙推导，开门不切断门柱连接，拆毁实时重算',()=>{
    for(const vertical of [false,true]){
        const buildings=[wall('gate',4,4,'gate'),wall('a',vertical?4:3,vertical?3:4),wall('b',vertical?4:5,vertical?5:4)];
        let layout=defenseLayout(buildings);
        assert.equal(layout.get('gate')!.axis,vertical?'vertical':'horizontal');
        assert.equal(layout.get('gate')!.mask,vertical?5:10);
        buildings[0].open=true;assert.deepEqual(defenseLayout(buildings),layout);
        buildings[2].health=0;layout=defenseLayout(buildings);assert.equal(layout.has('b'),false);
        assert.equal(layout.get('gate')!.mask,vertical?4:8);
    }
    const junction=[wall('gate',4,4,'gate'),wall('a',3,4),wall('b',5,4),wall('c',4,5)];
    const shapes=defenseLayout(junction);assert.equal(shapes.get('gate')!.mask,10);assert.equal(shapes.get('c')!.mask,0);
});

test('闭合营地：逐格建成后无法穿墙，门开关与破墙改变寻路；旧存档无需迁移',()=>{
    const c=config(),snapshot=defenseCheckpoint(c);assert.ok(runValidator(c)(snapshot));
    const run=new SurvivalRun(c,42,snapshot),home=run.tower.cell,gate=run.state.buildings.find(b=>b.kind==='gate'&&b.cell.y===home.y-3)!;
    const inside={x:home.x,y:home.y-2},outside={x:home.x,y:home.y-4};
    const closedShape=defenseLayout(run.state.buildings).get(gate.id)!;
    assert.equal(findPath(run.world.grid,outside,[inside]).length,0);
    const origin=run.world.center(outside),target=run.world.center(inside),delta={x:target.x-origin.x,y:target.y-origin.y};
    const closed=moveCircle(origin,delta,18,run.world.grid.bounds,run.world.grid.colliders(),false);
    assert.ok(closed.y<run.world.center(gate.cell).y-24);
    const wood=run.state.inventory.materials.wood;assert.equal(run.build(gate.cell,'wall'),false);assert.equal(run.state.inventory.materials.wood,wood);
    assert.ok(run.interact());assert.equal(gate.open,true);assert.ok(findPath(run.world.grid,outside,[inside]).length);
    const opened=moveCircle(origin,delta,18,run.world.grid.bounds,run.world.grid.colliders(),false);assert.ok(Math.abs(opened.y-target.y)<1e-6);
    assert.deepEqual(defenseLayout(run.state.buildings).get(gate.id),closedShape);
    assert.ok(run.interact());assert.equal(gate.open,false);assert.equal(findPath(run.world.grid,outside,[inside]).length,0);
    const west=run.state.buildings.find(b=>b.cell.x===home.x-3&&b.cell.y===home.y)!;
    run.damageBuilding(west.id,9999);assert.ok(findPath(run.world.grid,{x:home.x-4,y:home.y},[inside]).length);
    assert.equal(defenseLayout(run.state.buildings).has(west.id),false);
    const restored=new SurvivalRun(c,42,run.snapshot());assert.deepEqual(defenseLayout(restored.state.buildings),defenseLayout(run.state.buildings));
});
