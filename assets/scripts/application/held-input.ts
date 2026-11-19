export class HeldInput {
    private readonly sources=new Set<string|number>();

    get held():boolean{return this.sources.size>0;}

    press(source:string|number):boolean {
        const started=!this.held;
        this.sources.add(source);
        return started;
    }

    release(source:string|number):boolean {
        return this.sources.delete(source)&&!this.held;
    }

    clear():void{this.sources.clear();}
}
