import {Color,Graphics} from 'cc';
import {Building} from '../domain/survival';
import {DefenseShape,wallSides} from '../application/defense-layout';

/** 格子中心到格子边界的连续墙段，包含独立墙柱、转角和交叉口。 */
export function drawDefense(g:Graphics,b:Building,shape:DefenseShape,size:number,night:boolean):void {
    g.clear();
    const stone=b.kind==='stone-wall',reinforced=b.kind==='reinforced-wall';
    const palette=stone?['#577779','#91B7B5','#DBEEDE']:reinforced?['#67514B','#B78966','#F2D6A0']:['#76513C','#C9965C','#FFE0A1'];
    const tint=(hex:string)=>{const c=new Color().fromHEX(hex);if(night){c.r=Math.round(c.r*.75);c.g=Math.round(c.g*.85);}return c;};
    const box=(x:number,y:number,w:number,h:number,fill:string,radius=3)=>{
        g.fillColor=tint(fill);g.roundRect(x,y,w,h,radius);g.fill();
    };
    const beam=(x1:number,y1:number,x2:number,y2:number,width:number,fill:string)=>{
        g.strokeColor=tint(fill);g.lineWidth=width;g.moveTo(x1,y1);g.lineTo(x2,y2);g.stroke();
    };
    const half=size/2;
    if(b.kind==='gate'){
        const vertical=shape.axis==='vertical',post=half-5;
        const panel=(a:number,c:number,w:number,h:number,fill:string)=>vertical?box(c,a,h,w,fill):box(a,c,w,h,fill);
        // 开门后两扇门叶收至两侧，中央保留清晰的通道。
        if(b.open){
            panel(-post-2,1,7,25,palette[0]);panel(post-5,1,7,25,palette[0]);
            panel(-post-1,3,5,21,palette[1]);panel(post-4,3,5,21,palette[1]);
        }else{
            panel(-half,-10,size,24,palette[0]);panel(-half+2,-5,size-4,16,palette[1]);
            for(const offset of [-12,0,12])panel(offset-1,-4,2,14,palette[2]);
            if(vertical)beam(-5,-14,8,14,3,palette[0]);else beam(-14,-5,14,8,3,palette[0]);
        }
        for(const offset of [-post,post]){
            panel(offset-5,-13,10,31,palette[0]);panel(offset-3,-9,6,24,palette[1]);panel(offset-4,13,8,6,palette[2]);
        }
        return;
    }
    for(const side of wallSides)if(shape.mask&side.bit){
        const x=side.x*half,y=side.y*half;
        beam(0,-5,x,y-5,stone?23:18,palette[0]);
        beam(0,2,x,y+2,stone?19:14,palette[1]);
        beam(0,8,x,y+8,4,palette[2]);
    }
    box(-10,-15,20,36,palette[0],5);box(-7,-11,14,30,palette[1],3);
    box(-9,16,18,8,palette[2],3);
    if(reinforced){box(-10,-5,20,5,'#6F8391',1);box(-10,8,20,5,'#6F8391',1);}
    else if(stone){beam(-6,-2,6,-2,2,palette[0]);beam(0,-10,0,-2,2,palette[0]);}
    else {beam(-3,-7,-3,11,1.5,palette[0]);}
}
