import { GameConfig, parseConfig } from '../domain/config';

export type BootState = { kind: 'loading' } | { kind: 'ready'; config: GameConfig } | { kind: 'error'; message: string };
export class BootLoader {
    state: BootState = { kind: 'loading' };
    private attempt = 0;
    constructor(private readonly load: () => Promise<unknown>) {}
    async retry(): Promise<BootState> {
        const attempt = ++this.attempt;
        this.state = { kind: 'loading' };
        try {
            const config = parseConfig(await this.load());
            if (attempt === this.attempt) this.state = { kind: 'ready', config };
        } catch (error) {
            if (attempt === this.attempt) this.state = { kind: 'error', message: error instanceof Error ? error.message : '资源加载失败' };
        }
        return this.state;
    }
}
