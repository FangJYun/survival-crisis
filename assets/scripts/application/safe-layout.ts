/** SafeArea 改变容器尺寸与锚点；固定坐标的设计层还需居中缩放。 */
export function safeLayout(width:number,height:number,anchorX:number,anchorY:number) {
    if(![width,height,anchorX,anchorY].every(Number.isFinite)||width<=0||height<=0)throw new Error('安全区域尺寸无效');
    return {scale:Math.min(1,width/1280,height/720),x:(.5-anchorX)*width,y:(.5-anchorY)*height};
}
