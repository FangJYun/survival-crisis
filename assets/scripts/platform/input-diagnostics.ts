interface TouchPoint {clientX:number;clientY:number}
interface DebugWx {
    getSystemInfoSync?():{platform?:string;brand?:string;windowWidth?:number;windowHeight?:number;pixelRatio?:number};
    onTouchStart?(callback:(event:{changedTouches:TouchPoint[]})=>void):void;
    offTouchStart?(callback:(event:{changedTouches:TouchPoint[]})=>void):void;
}
/** 只记录开发者工具内的输入计数与画布坐标，不读取账号或存档。 */
export function inputDiagnostics(report:(kind:string,value:Record<string,unknown>)=>void,wx=(globalThis as unknown as {wx?:DebugWx}).wx):{enabled:boolean;dispose:()=>void} {
    let info:ReturnType<NonNullable<DebugWx['getSystemInfoSync']>>|undefined;
    try{info=wx?.getSystemInfoSync?.();}catch{return {enabled:false,dispose:()=>{}};}
    if(!wx||!info||info.platform!=='devtools'&&info.brand!=='devtools')return {enabled:false,dispose:()=>{}};
    report('device',{width:info.windowWidth,height:info.windowHeight,dpr:info.pixelRatio,touch:typeof wx.onTouchStart});
    const touched=(event:{changedTouches:TouchPoint[]})=>{const p=event.changedTouches[0];if(p)report('raw',{x:p.clientX,y:p.clientY});};
    wx.onTouchStart?.(touched);
    return {enabled:true,dispose:()=>wx.offTouchStart?.(touched)};
}
