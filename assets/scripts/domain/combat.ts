import { CombatConfig, MonsterConfig } from './config';
import { Rect, Vec } from './ports';
import { canStand, direction, distance, moveCircle } from './movement';

export interface Fighter {
    id: string; position: Vec; facing: Vec; health: number; radius: number;
}
export interface Enemy extends Fighter {
    definition: MonsterConfig; phase: 'idle' | 'windup' | 'recovery' | 'dead';
    timer: number; attackFacing: Vec;
}
interface Swing { damage:number; elapsed: number; hit: Set<string>; facing: Vec }
export interface CombatEvent { type: 'hit' | 'kill' | 'block' | 'perfect' | 'death' | 'blink'; target: string; amount: number }
export interface BattleState {
    castUntil?: number;
    events?: CombatEvent[];
    player: Fighter; enemies: Enemy[]; stamina: number; time: number; blinkCooldown: number; protectedUntil: number;
    swing: { damage?:number; elapsed: number; hit: string[]; facing: Vec } | null;
}

export class Battle {
    readonly player: Fighter;
    readonly enemies: Enemy[] = [];
    readonly events: CombatEvent[] = [];
    stamina: number;
    time = 0;
    blinkCooldown = 0;
    protectedUntil = 0;
    castUntil = 0;
    defense = 0;
    damageForAttack:(()=>number)|null=null;
    onPerfectBlock:(()=>void)|null=null;
    onBlink:(()=>void)|null=null;
    blockStarted: number | null = null;
    private swing: Swing | null = null;
    private moveInput: Vec = { x: 0, y: 0 };
    private active = true;
    constructor(readonly config: CombatConfig, readonly bounds: Rect, readonly obstacles: Rect[], start: Vec) {
        if (![bounds, ...obstacles].every(r => [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width > 0 && r.height > 0)
            || !canStand(start, config.radius, bounds, obstacles)) throw new Error('非法地图阻挡或角色出生位置');
        this.player = { id: 'player', position: { ...start }, facing: { x: 0, y: -1 }, health: config.health, radius: config.radius };
        this.stamina = config.stamina;
    }
    get alive(): boolean { return this.player.health > 0; }
    get canAct(): boolean { return this.active && this.alive; }
    get attacking(): boolean { return this.swing !== null; }
    get blocking(): boolean { return this.blockStarted !== null; }
    get attackProgress(): number { return this.swing?.elapsed ?? -1; }
    snapshot(): BattleState {
        return JSON.parse(JSON.stringify({ events: this.events, castUntil: this.castUntil, player: this.player, enemies: this.enemies, stamina: this.stamina,
            time: this.time, blinkCooldown: this.blinkCooldown, protectedUntil: this.protectedUntil,
            swing: this.swing ? { ...this.swing, hit: Array.from(this.swing.hit) } : null })) as BattleState;
    }
    restore(state: BattleState): void {
        Object.assign(this.player, state.player); this.enemies.splice(0, this.enemies.length, ...state.enemies);
        this.stamina = state.stamina; this.time = state.time; this.blinkCooldown = state.blinkCooldown; this.protectedUntil = state.protectedUntil;
        this.castUntil = state.castUntil || 0;
        this.events.splice(0,this.events.length,...(state.events||[]));
        this.swing = state.swing ? { ...state.swing, damage:state.swing.damage??this.config.attackDamage, hit: new Set(state.swing.hit) } : null;
        this.moveInput = { x: 0, y: 0 }; this.blockStarted = null;
    }
    revive(position: Vec, protection: number): void {
        this.player.position = { ...position }; this.player.health = this.config.health; this.stamina = this.config.stamina;
        this.protectedUntil = this.time + protection; this.swing = null; this.blockStarted = null; this.moveInput = { x: 0, y: 0 };
    }
    setActive(active: boolean, clearControls = true): void {
        this.active = active;
        if (!active && clearControls) { this.moveInput = { x: 0, y: 0 }; this.blockStarted = null; }
    }
    move(input: Vec): void {
        if (!this.active || !this.alive) return;
        this.moveInput = direction(input);
        if (!this.blocking && (this.moveInput.x || this.moveInput.y)) this.player.facing = { ...this.moveInput };
    }
    attack(): boolean {
        if (!this.active || !this.alive || this.swing || this.blocking || this.time < this.castUntil) return false;
        this.swing = { damage:this.damageForAttack?.()??this.config.attackDamage, elapsed: 0, hit: new Set(), facing: { ...this.player.facing } };
        return true;
    }
    block(held: boolean): boolean {
        if (!held) { this.blockStarted = null; return true; }
        if (!this.active || !this.alive || this.swing || this.time < this.castUntil || this.stamina < this.config.blockHitCost) return false;
        if (!this.blocking) this.blockStarted = this.time;
        return true;
    }
    blink(): boolean {
        if (!this.active || !this.alive || this.time < this.castUntil || this.blinkCooldown > 0 || this.blocking || this.swing) return false;
        const delta = { x: this.player.facing.x * this.config.blinkDistance, y: this.player.facing.y * this.config.blinkDistance };
        const next = moveCircle(this.player.position, delta, this.player.radius, this.bounds, this.obstacles, false);
        if (distance(next, this.player.position) < 0.01) return false;
        this.player.position = next;
        this.blinkCooldown = this.config.blinkCooldown;
        this.protectedUntil = this.time + this.config.blinkProtection;
        this.events.push({ type: 'blink', target: 'player', amount: 0 });this.onBlink?.();
        return true;
    }
    spawn(id: string, definition: MonsterConfig, position: Vec): Enemy {
        if (this.enemies.some(e => e.id === id)) throw new Error(`重复敌人 ID: ${id}`);
        const enemy: Enemy = { id, definition, position: { ...position }, facing: { x: 0, y: -1 }, health: definition.health, radius: definition.radius, phase: 'idle', timer: 0, attackFacing: { x: 0, y: -1 } };
        this.enemies.push(enemy); return enemy;
    }
    damageEnemy(enemy: Enemy, amount: number): void {
        if (!this.active || !this.alive || enemy.health <= 0 || !Number.isFinite(amount) || amount <= 0) return;
        enemy.health = Math.max(0, enemy.health - amount);
        this.events.push({ type: 'hit', target: enemy.id, amount });
        if (enemy.health === 0) { enemy.phase = 'dead'; this.events.push({ type: 'kill', target: enemy.id, amount: 0 }); }
    }
    damagePlayer(amount: number, source: Vec): void {
        if (!this.active || !this.alive || !Number.isFinite(amount) || amount <= 0 || this.time < this.protectedUntil) return;
        const incoming = direction({ x: source.x - this.player.position.x, y: source.y - this.player.position.y });
        const frontal = incoming.x * this.player.facing.x + incoming.y * this.player.facing.y >= Math.cos(this.config.blockArc * Math.PI / 360);
        if (this.blockStarted !== null && frontal && this.stamina >= this.config.blockHitCost) {
            this.stamina -= this.config.blockHitCost;
            const perfect = this.time - this.blockStarted <= this.config.perfectWindow;
            this.events.push({ type: perfect ? 'perfect' : 'block', target: 'player', amount });
            if(perfect)this.onPerfectBlock?.();
            amount = perfect ? 0 : amount * this.config.blockDamageRatio;
            if (this.stamina < this.config.blockHitCost) this.blockStarted = null;
        }
        amount *= 1 - Math.min(0.75, this.defense / (this.defense + 100));
        this.player.health = Math.max(0, this.player.health - amount);
        if (amount) this.events.push({ type: 'hit', target: 'player', amount });
        if (!this.alive) {
            this.blockStarted = null; this.swing = null;
            this.events.push({ type: 'death', target: 'player', amount: 0 });
        }
    }
    tick(dt: number, enemyController?: (enemy: Enemy, dt: number) => void): void {
        if (!this.active || !Number.isFinite(dt) || dt <= 0) return;
        // 应用层固定步调度；对外拒绝大步长，避免跳过命中窗口。
        if (dt > 0.05) throw new Error('战斗必须使用不大于 50ms 的固定步长');
        this.time += dt; this.blinkCooldown = Math.max(0, this.blinkCooldown - dt);
        if (this.alive) {
            if (this.blocking) {
                this.stamina = Math.max(0, this.stamina - this.config.blockDrain * dt);
                if (this.stamina < this.config.blockHitCost) this.blockStarted = null;
            } else this.stamina = Math.min(this.config.stamina, this.stamina + this.config.staminaRegen * dt);
            const speed = this.config.speed * (this.blocking ? 0.35 : this.swing ? 0.4 : 1);
            this.player.position = moveCircle(this.player.position, { x: this.moveInput.x * speed * dt, y: this.moveInput.y * speed * dt }, this.player.radius, this.bounds, this.obstacles);
        }
        if (this.swing && this.alive) {
            const from = this.swing.elapsed;
            this.swing.elapsed += dt;
            const { attackWindup: windup, attackActive: active, attackRecovery: recovery } = this.config;
            if (this.swing.elapsed >= windup && from < windup + active) {
                for (const enemy of this.enemies) {
                    if (enemy.health <= 0 || this.swing.hit.has(enemy.id)) continue;
                    const offset = { x: enemy.position.x - this.player.position.x, y: enemy.position.y - this.player.position.y };
                    const dir = direction(offset);
                    if (distance(enemy.position, this.player.position) <= this.config.attackRange + enemy.radius &&
                        dir.x * this.swing.facing.x + dir.y * this.swing.facing.y >= Math.cos(this.config.attackArc * Math.PI / 360)) {
                        // 障碍遮挡使用同一移动扫掠；不能隔着围墙打到目标。
                        const end = moveCircle(this.player.position, offset, 1, this.bounds, this.obstacles, false);
                        if (distance(end, enemy.position) > 2) continue;
                        this.swing.hit.add(enemy.id);
                        enemy.health = Math.max(0, enemy.health - this.swing.damage);
                        this.events.push({ type: 'hit', target: enemy.id, amount: this.swing.damage });
                        if (enemy.health === 0) {
                            enemy.phase = 'dead';
                            this.events.push({ type: 'kill', target: enemy.id, amount: 0 });
                        }
                    }
                }
            }
            if (this.swing.elapsed >= windup + active + recovery) this.swing = null;
        }
        for (const enemy of this.enemies) {
            if (enemyController) enemyController(enemy, dt); else this.updateEnemy(enemy, dt);
        }
    }
    private updateEnemy(e: Enemy, dt: number): void {
        if (e.health <= 0) return;
        if (!this.alive) { e.phase = 'idle'; return; }
        const d = e.definition;
        const offset = { x: this.player.position.x - e.position.x, y: this.player.position.y - e.position.y };
        if (e.phase === 'windup') {
            e.timer -= dt;
            if (e.timer <= 0) {
                const facing = direction(offset);
                if (distance(e.position, this.player.position) <= d.range + this.player.radius && facing.x * e.attackFacing.x + facing.y * e.attackFacing.y >= 0.5) {
                    const end = moveCircle(e.position, offset, 1, this.bounds, this.obstacles, false);
                    if (distance(end, this.player.position) <= 2) this.damagePlayer(d.damage, e.position);
                }
                e.phase = 'recovery'; e.timer = d.recovery;
            }
            return;
        }
        if (e.phase === 'recovery') { e.timer -= dt; if (e.timer <= 0) e.phase = 'idle'; return; }
        const dist = distance(e.position, this.player.position);
        if (dist > d.aggroRange) return;
        e.facing = direction(offset);
        if (dist <= d.range + this.player.radius) {
            e.phase = 'windup'; e.timer = d.windup; e.attackFacing = { ...e.facing };
        } else {
            const travel = Math.min(d.speed * dt, Math.max(0, dist - e.radius - this.player.radius));
            e.position = moveCircle(e.position, { x: e.facing.x * travel, y: e.facing.y * travel }, e.radius, this.bounds, this.obstacles);
        }
    }
}
