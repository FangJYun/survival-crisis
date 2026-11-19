export const CONTENT_GROUPS = ['startup', 'common', 'heroes', 'monsters', 'seasons'] as const;
export type ContentGroup = typeof CONTENT_GROUPS[number];
export interface ContentLease<T> { value: T; release(): void }
/** 加载失败或页面销毁时释放已经取得的租约，禁止半初始化内容进入游戏。 */
export class ContentLoader<T> {
    private leases: ContentLease<T>[] = [];
    private generation = 0;
    readonly timings: {group: string; milliseconds: number}[] = [];
    constructor(private readonly loadGroup: (group: ContentGroup) => Promise<ContentLease<T>>) {}
    async load(progress: (complete: number, total: number) => void): Promise<Map<ContentGroup,T>> {
        this.dispose(); const generation=this.generation, acquired:ContentLease<T>[]=[], result=new Map<ContentGroup,T>();
        this.timings.length=0;
        try {
            for(const group of CONTENT_GROUPS){
                const start=Date.now(),lease=await this.loadGroup(group);acquired.push(lease);
                if(generation!==this.generation)throw new Error('内容加载已取消');
                result.set(group,lease.value);this.timings.push({group,milliseconds:Date.now()-start});progress(result.size,CONTENT_GROUPS.length);
            }
            this.leases=acquired;return result;
        } catch(error){for(const lease of acquired.reverse())lease.release();throw error;}
    }
    dispose():void {this.generation++;for(const lease of this.leases.reverse())lease.release();this.leases=[];}
}
