import { Rect, Vec } from './ports';

export const distance = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export function direction(v: Vec): Vec {
    if (!Number.isFinite(v.x) || !Number.isFinite(v.y)) return { x: 0, y: 0 };
    const size = Math.hypot(v.x, v.y);
    return size > 0 ? { x: v.x / size, y: v.y / size } : { x: 0, y: 0 };
}
export function canStand(p: Vec, radius: number, bounds: Rect, obstacles: readonly Rect[]): boolean {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || radius <= 0) return false;
    if (p.x - radius < bounds.x || p.y - radius < bounds.y ||
        p.x + radius > bounds.x + bounds.width || p.y + radius > bounds.y + bounds.height) return false;
    return !obstacles.some(r => {
        const x = Math.max(r.x, Math.min(p.x, r.x + r.width));
        const y = Math.max(r.y, Math.min(p.y, r.y + r.height));
        return Math.hypot(p.x - x, p.y - y) < radius - 1e-7;
    });
}

/** 小步扫掠防止快速位移穿墙；普通移动允许贴边滑动，闪现只沿原路径截断。 */
export function moveCircle(start: Vec, delta: Vec, radius: number, bounds: Rect,
    obstacles: readonly Rect[], slide = true): Vec {
    if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y) || !canStand(start, radius, bounds, obstacles)) return { ...start };
    const total = Math.hypot(delta.x, delta.y);
    if (!total) return { ...start };
    const length = Math.min(total, Math.hypot(bounds.width, bounds.height) * 2);
    const count = Math.ceil(length / (radius * 0.25));
    const dx = delta.x / total * length / count, dy = delta.y / total * length / count;
    let p = { ...start };
    for (let i = 0; i < count; i++) {
        const next = { x: p.x + dx, y: p.y + dy };
        if (canStand(next, radius, bounds, obstacles)) p = next;
        else if (!slide) break;
        else {
            if (canStand({ x: p.x + dx, y: p.y }, radius, bounds, obstacles)) p.x += dx;
            if (canStand({ x: p.x, y: p.y + dy }, radius, bounds, obstacles)) p.y += dy;
        }
    }
    return p;
}
