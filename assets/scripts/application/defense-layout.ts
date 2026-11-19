import {BuildingKind} from '../domain/config';
import {Building} from '../domain/survival';

export const wallSides=[{x:0,y:1,bit:1},{x:1,y:0,bit:2},{x:0,y:-1,bit:4},{x:-1,y:0,bit:8}] as const;
export interface DefenseShape {mask:number;axis:'horizontal'|'vertical'}
export function isDefense(kind:BuildingKind):boolean {
    return kind==='wall'||kind==='stone-wall'||kind==='reinforced-wall'||kind==='gate';
}

/** 根据当前格子派生连接；不写进存档，拆毁、开门和旧存档均使用同一规则。 */
export function defenseLayout(buildings:readonly Building[]):Map<string,DefenseShape> {
    const cells=new Map<string,Building>(),result=new Map<string,DefenseShape>();
    for(const b of buildings)if(b.health>0&&isDefense(b.kind))cells.set(`${b.cell.x}:${b.cell.y}`,b);
    for(const b of cells.values()){
        let mask=0;
        for(const side of wallSides)if(cells.has(`${b.cell.x+side.x}:${b.cell.y+side.y}`))mask|=side.bit;
        const vertical=Number(!!(mask&1))+Number(!!(mask&4));
        const horizontal=Number(!!(mask&2))+Number(!!(mask&8));
        result.set(b.id,{mask,axis:vertical>horizontal?'vertical':'horizontal'});
    }
    // 门只连接其两侧门柱，避免 T 字交点在门洞内画出一截墙。
    for(const b of cells.values()){
        const shape=result.get(b.id)!;
        for(const side of wallSides){
            const neighbor=cells.get(`${b.cell.x+side.x}:${b.cell.y+side.y}`);
            if(b.kind==='gate'&&(shape.axis==='vertical'?side.x!==0:side.y!==0)||
                neighbor?.kind==='gate'&&(result.get(neighbor.id)!.axis==='vertical'?side.x!==0:side.y!==0))shape.mask&=~side.bit;
        }
    }
    return result;
}
