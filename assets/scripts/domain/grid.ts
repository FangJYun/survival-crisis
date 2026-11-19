import { Rect, Vec } from './ports';

/** 静态格阻挡；世界坐标允许负原点，放置和移动使用同一碰撞矩形。 */
export class GridMap {
    readonly bounds: Rect;
    private readonly blocked = new Set<number>();
    revision = 0;
    private readonly changes: { revision: number; cell: Vec }[] = [];
    constructor(readonly columns: number, readonly rows: number, readonly cellSize: number, readonly origin: Vec) {
        if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns <= 0 || rows <= 0 || !Number.isFinite(cellSize) || cellSize <= 0) throw new Error('非法网格尺寸');
        this.bounds = { ...origin, width: columns * cellSize, height: rows * cellSize };
    }
    cellAt(position: Vec): Vec | null {
        const x = Math.floor((position.x - this.origin.x) / this.cellSize);
        const y = Math.floor((position.y - this.origin.y) / this.cellSize);
        return this.inside(x, y) ? { x, y } : null;
    }
    isBlocked(x: number, y: number): boolean { return !this.inside(x, y) || this.blocked.has(y * this.columns + x); }
    setBlocked(x: number, y: number, value: boolean): void {
        if (!this.inside(x, y)) throw new Error('网格坐标超出边界');
        const id = y * this.columns + x;
        if (this.blocked.has(id) === value) return;
        if (value) this.blocked.add(id); else this.blocked.delete(id);
        this.revision++;
        this.changes.push({ revision: this.revision, cell: {x,y} });
        if (this.changes.length > 256) this.changes.shift();
    }
    pathInvalidated(revision: number, path: Vec[]): boolean {
        if (revision === this.revision) return false;
        if (!this.changes.length || revision < this.changes[0].revision-1) return true;
        return this.changes.some(c=>c.revision>revision && path.some(p=>Math.abs(p.x-c.cell.x)<=1 && Math.abs(p.y-c.cell.y)<=1));
    }
    colliders(): Rect[] {
        // Creator 的 loose 模式会把 Set 展开转为 [].concat(Set)，必须显式 Array.from。
        return Array.from(this.blocked).map(id => ({ x: this.origin.x + (id % this.columns) * this.cellSize,
            y: this.origin.y + Math.floor(id / this.columns) * this.cellSize, width: this.cellSize, height: this.cellSize }));
    }
    private inside(x: number, y: number): boolean {
        return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < this.columns && y < this.rows;
    }
}
