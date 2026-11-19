import { GameConfig } from './config';
import { GridMap } from './grid';
import { SeededRandom, Vec } from './ports';

export interface ResourceDefinition { id: string; item: string; count: number; seconds: number; tool: string | null; blocking: boolean; regrow: number; yieldBySeason?: number[]; regrowBySeason?: number[] }
export interface ResourceNode { id: string; definition: string; cell: Vec; amount: number; refreshAt: number }
export interface WorldState { seed: number; resources: ResourceNode[]; explored: number[] }
export interface Calendar { day: number; phase: 'day' | 'dusk' | 'night'; remaining: number; season: number; year: number }
export function calendarAt(time: number, config: GameConfig): Calendar {
    const total = config.world.day + config.world.dusk + config.world.night;
    const index = Math.floor((time + 1e-8) / total), within = Math.max(0, time - index * total);
    const season=Math.floor(index/config.world.seasonDays)%4,day=config.world.day-config.environment.seasons[season].nightBonus;
    const phase = within < day ? 'day' : within < day + config.world.dusk ? 'dusk' : 'night';
    const end = phase === 'day' ? day : phase === 'dusk' ? day + config.world.dusk : total;
    return { day: index + 1, phase, remaining: Math.max(0, end - within), season: Math.floor(index / config.world.seasonDays) % 4, year: Math.floor(index / (config.world.seasonDays * 4)) + 1 };
}

export class World {
    readonly grid: GridMap;
    readonly state: WorldState;
    readonly homeCell: Vec;
    readonly start: Vec;
    private readonly chunks = new Map<number, ResourceNode[]>();
    private readonly explored = new Set<number>();
    private revealedCell = -1;
    constructor(readonly config: GameConfig, readonly definitions: ResourceDefinition[], seed: number, state?: WorldState) {
        const c = config.world;
        if (c.width < 16 || c.height < 16) throw new Error('生存地图最小为 16×16 格');
        this.grid = new GridMap(c.width, c.height, c.cellSize, { x: -c.width * c.cellSize / 2, y: -c.height * c.cellSize / 2 });
        this.homeCell = { x: Math.floor(c.width / 2), y: Math.floor(c.height / 2) };
        this.start = this.center({ x: this.homeCell.x, y: this.homeCell.y - 2 });
        this.state = state || { seed: seed >>> 0, resources: [], explored: [] };
        if (!state) this.generate(seed >>> 0);
        for (const cell of this.state.explored) this.explored.add(cell);
        for (const node of this.state.resources) {
            const id=this.chunkAt(this.center(node.cell))!;const resources=this.chunks.get(id)||[];resources.push(node);this.chunks.set(id,resources);
            if(node.amount>0&&this.definition(node).blocking)this.grid.setBlocked(node.cell.x,node.cell.y,true);
        }
        this.reveal(this.start);
        if(!state)for(const kind of ['wood','stone','food']){
            const node=this.state.resources.find(n=>n.definition===kind)!;
            const goals=[{x:node.cell.x+1,y:node.cell.y},{x:node.cell.x-1,y:node.cell.y},{x:node.cell.x,y:node.cell.y+1},{x:node.cell.x,y:node.cell.y-1}];
            if(!findPath(this.grid,this.grid.cellAt(this.start)!,goals).length)throw new Error(`出生区域无法取得 ${kind}`);
        }
    }
    center(cell: Vec): Vec { return { x: this.grid.origin.x + (cell.x + 0.5) * this.grid.cellSize, y: this.grid.origin.y + (cell.y + 0.5) * this.grid.cellSize }; }
    definition(node: ResourceNode): ResourceDefinition {
        const definition = this.definitions.find(d => d.id === node.definition);
        if (!definition) throw new Error(`未知资源定义：${node.definition}`); return definition;
    }
    reveal(position: Vec): void {
        const cell = this.grid.cellAt(position); if (!cell) return;
        const key=cell.y*this.grid.columns+cell.x;if(key===this.revealedCell)return;this.revealedCell=key;
        for (let y = cell.y - 6; y <= cell.y + 6; y++) for (let x = cell.x - 6; x <= cell.x + 6; x++) {
            if (x < 0 || y < 0 || x >= this.grid.columns || y >= this.grid.rows) continue;
            const id = y * this.grid.columns + x;
            if (!this.explored.has(id)) { this.explored.add(id); this.state.explored.push(id); }
        }
    }
    isExplored(cell: Vec): boolean { return this.explored.has(cell.y * this.grid.columns + cell.x); }
    chunkAt(position:Vec):number|null {
        const c=this.grid.cellAt(position);if(!c)return null;const size=this.config.world.chunkSize;
        return Math.floor(c.y/size)*Math.ceil(this.grid.columns/size)+Math.floor(c.x/size);
    }
    resourcesIn(chunks:Set<number>):ResourceNode[] {
        const nodes:ResourceNode[]=[];for(const id of Array.from(chunks))nodes.push(...(this.chunks.get(id)||[]));return nodes;
    }
    activeChunks(player: Vec, tower: Vec): Set<number> {
        const active = new Set<number>(), size = this.config.world.chunkSize, cols = Math.ceil(this.grid.columns / size), rows = Math.ceil(this.grid.rows / size);
        for (const p of [player, tower]) {
            const cell = this.grid.cellAt(p); if (!cell) continue;
            const cx = Math.floor(cell.x / size), cy = Math.floor(cell.y / size);
            for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) if (x >= 0 && y >= 0 && x < cols && y < rows) active.add(y * cols + x);
        }
        return active;
    }
    private generate(seed: number): void {
        const random = new SeededRandom(seed), occupied = new Set<string>();
        const add = (cell: Vec, kind: string) => {
            const key = `${cell.x}:${cell.y}`; if (occupied.has(key)) return;
            const def = this.definitions.find(d => d.id === kind); if (!def) throw new Error('资源类型配置缺失');
            occupied.add(key); this.state.resources.push({ id: `resource-${key}`, definition: kind, cell, amount: def.count, refreshAt: 0 });
        };
        for (const [dx, dy, kind] of [[-2,-2,'wood'],[-2,-3,'wood'],[-3,-2,'wood'],[2,-2,'stone'],[2,-3,'stone'],[0,-4,'food'],[1,-4,'herb']] as [number, number, string][]) {
            add({ x: this.homeCell.x + dx, y: this.homeCell.y + dy }, kind);
        }
        const count = Math.max(32, Math.floor(this.grid.columns * this.grid.rows / 40));
        for (let i = 0; i < count; i++) {
            const cell = { x: 1 + Math.floor(random.next() * (this.grid.columns - 2)), y: 1 + Math.floor(random.next() * (this.grid.rows - 2)) };
            if (Math.abs(cell.x - this.homeCell.x) <= 4 && Math.abs(cell.y - this.homeCell.y) <= 5) continue;
            if (cell.x === this.homeCell.x || cell.y === this.homeCell.y - 2) continue;
            add(cell, this.definitions[Math.floor(random.next() * this.definitions.length)].id);
        }
        // 至少保证每件配方各制造一件、两种工具各升级一次及各类防线一次的有限矿材。
        const required=this.config.recipes.reduce((n,r)=>n+r.materials.filter(m=>m.id==='stone').reduce((s,m)=>s+m.count,0),0)+this.config.growth.toolCost.filter(m=>m.id==='stone').reduce((n,m)=>n+2*m.count,0)+this.config.survival.buildings.reduce((n,b)=>n+b.costs.filter(m=>m.id==='stone').reduce((s,m)=>s+m.count,0),0);
        let available=this.state.resources.reduce((n,r)=>n+(this.definition(r).item==='stone'?r.amount:0),0);
        for(let y=1;y<this.grid.rows-1&&available<required;y++)for(let x=1;x<this.grid.columns-1&&available<required;x++){
            if(occupied.has(`${x}:${y}`)||x===this.homeCell.x||y===this.homeCell.y-2||Math.abs(x-this.homeCell.x)<=4&&Math.abs(y-this.homeCell.y)<=5)continue;
            add({x,y},'rich-stone');available+=this.definitions.find(d=>d.id==='rich-stone')!.count;
        }
        if(available<required)throw new Error('地图不足以容纳完整配方所需有限矿藏');
    }
}

/** 四方向 A*；有通路先绕路，允许破墙时使用指定的可破坏格代价。 */
export function findPath(grid: GridMap, start: Vec, goals: Vec[], breakable = new Map<number, number>(), limit = 6000): Vec[] {
    const index = (c: Vec) => c.y * grid.columns + c.x;
    const legalGoals = goals.filter(c => c.x >= 0 && c.y >= 0 && c.x < grid.columns && c.y < grid.rows && (!grid.isBlocked(c.x, c.y) || breakable.has(index(c))));
    if (!legalGoals.length) return [];
    const goalIds = new Set(legalGoals.map(index)), first = index(start);
    if (goalIds.has(first)) return [start];
    const heuristic = (c: Vec) => Math.min(...legalGoals.map(g => Math.abs(g.x - c.x) + Math.abs(g.y - c.y)));
    const scores = new Map<number, number>([[first, 0]]), parents = new Map<number, number>();
    const open: { cell: Vec; score: number }[] = [{ cell: start, score: heuristic(start) }], closed = new Set<number>();
    let visited = 0;
    while (open.length && visited++ < limit) {
        let best = 0; for (let i = 1; i < open.length; i++) if (open[i].score < open[best].score) best = i;
        const current = open.splice(best, 1)[0].cell, id = index(current);
        if (closed.has(id)) continue; closed.add(id);
        if (goalIds.has(id)) {
            const path: Vec[] = []; let cursor = id;
            while (cursor !== first) { path.push({ x: cursor % grid.columns, y: Math.floor(cursor / grid.columns) }); cursor = parents.get(cursor)!; }
            path.push(start); return path.reverse();
        }
        for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const cell = { x: current.x + dx, y: current.y + dy }, next = index(cell);
            if (cell.x < 0 || cell.y < 0 || cell.x >= grid.columns || cell.y >= grid.rows || closed.has(next)) continue;
            if (grid.isBlocked(cell.x, cell.y) && !breakable.has(next)) continue;
            const score = scores.get(id)! + 1 + (breakable.get(next) || 0);
            if (score >= (scores.get(next) ?? Infinity)) continue;
            scores.set(next, score); parents.set(next, id); open.push({ cell, score: score + heuristic(cell) });
        }
    }
    return [];
}
