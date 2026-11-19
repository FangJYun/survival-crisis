/** 新局请求与确认分开；取消不创建世界，也不写存档。 */
export class NewGameGate {
    private pending=false;
    request(hasExistingRun:boolean):boolean {
        this.pending=hasExistingRun;
        return !hasExistingRun;
    }
    cancel():void {this.pending=false;}
    confirm():boolean {
        if(!this.pending)return false;
        this.pending=false;return true;
    }
}
