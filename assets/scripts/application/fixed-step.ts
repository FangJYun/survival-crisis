export type PauseReason = 'menu' | 'background' | 'storage' | 'system';

export class FixedStep {
    readonly pauses = new Set<PauseReason>();
    private accumulator = 0;
    constructor(readonly hz = 30, readonly maxFrame = 0.1) {
        if (!(hz > 0) || !Number.isFinite(hz) || !(maxFrame > 0) || !Number.isFinite(maxFrame)) {
            throw new Error('模拟频率和单帧上限必须有效');
        }
    }
    pause(reason: PauseReason): void { this.pauses.add(reason); this.accumulator = 0; }
    resume(reason: PauseReason): void { this.pauses.delete(reason); this.accumulator = 0; }
    get paused(): boolean { return this.pauses.size > 0; }
    frame(delta: number, step: (dt: number) => void): number {
        if (this.paused || !Number.isFinite(delta) || delta <= 0) return 0;
        this.accumulator += Math.min(delta, this.maxFrame);
        const dt = 1 / this.hz;
        let count = 0;
        while (this.accumulator + 1e-10 >= dt) {
            this.accumulator -= dt; step(dt); count++;
            if (this.paused) { this.accumulator = 0; break; }
        }
        return count;
    }
}
