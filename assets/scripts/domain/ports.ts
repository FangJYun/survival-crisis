export interface Vec { x: number; y: number }
export interface Rect extends Vec { width: number; height: number }
export interface Clock { now(): number }
export interface RandomSource { next(): number; state(): number }
export interface StoragePort {
    read(key: string): Promise<string | null>;
    write(key: string, value: string): Promise<void>;
}

export class GameClock implements Clock {
    private elapsed = 0;
    now(): number { return this.elapsed; }
    advance(seconds: number): void {
        if (!Number.isFinite(seconds) || seconds < 0) throw new Error('时间增量必须非负且有限');
        this.elapsed += seconds;
    }
}

/** 可保存的独立随机流；表现层不得消耗领域随机流。 */
export class SeededRandom implements RandomSource {
    private value: number;
    constructor(seed: number) { this.value = (seed >>> 0) || 0x6d2b79f5; }
    state(): number { return this.value; }
    next(): number {
        let x = this.value;
        x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
        this.value = x >>> 0;
        return this.value / 4294967296;
    }
}
