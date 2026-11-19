import { GameConfig, SLOTS } from './config';
import { RandomSource } from './ports';

export type Slot = typeof SLOTS[number];
export interface Equipment { id: string; definition: string }
export interface InventoryState {
    materials: Record<string, number>; equipment: Equipment[];
    worn: Partial<Record<Slot, Equipment>>; tools: string[]; capacity: number; nextItem: number;
}
const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
export function emptyInventory(capacity: number): InventoryState {
    return { materials: {}, equipment: [], worn: {}, tools: ['axe', 'pick'], capacity, nextItem: 1 };
}
export function usedSlots(bag: InventoryState): number {
    return Object.values(bag.materials).filter(n => n > 0).length + bag.equipment.length;
}
export function hasMaterials(bag: InventoryState, costs: readonly { id: string; count: number }[]): boolean {
    const totals: Record<string, number> = {};
    for (const cost of costs) {
        if (!Number.isSafeInteger(cost.count) || cost.count <= 0) return false;
        totals[cost.id] = (totals[cost.id] || 0) + cost.count;
    }
    return Object.entries(totals).every(([id, count]) => (bag.materials[id] || 0) >= count);
}
export function takeMaterials(bag: InventoryState, costs: readonly { id: string; count: number }[]): boolean {
    if (!hasMaterials(bag, costs)) return false;
    for (const { id, count } of costs) { bag.materials[id] -= count; if (bag.materials[id] === 0) delete bag.materials[id]; }
    return true;
}
export function grantMaterial(bag: InventoryState, id: string, count: number): boolean {
    if (!Number.isSafeInteger(count) || count <= 0 || !Number.isSafeInteger((bag.materials[id] || 0) + count)) return false;
    if (!bag.materials[id] && usedSlots(bag) >= bag.capacity) return false;
    bag.materials[id] = (bag.materials[id] || 0) + count; return true;
}
export function craft(bag: InventoryState, config: GameConfig, recipeId: string): InventoryState | null {
    const recipe = config.recipes.find(r => r.id === recipeId);
    if (!recipe || !hasMaterials(bag, recipe.materials)) return null;
    const next = copy(bag); takeMaterials(next, recipe.materials);
    const definition = config.equipment.find(e => e.id === recipe.output);
    if (definition) {
        if (usedSlots(next) >= next.capacity) return null;
        next.equipment.push({ id: `item-${next.nextItem++}`, definition: definition.id });
    } else if (!grantMaterial(next, recipe.output, 1)) return null;
    return next;
}
export function equip(bag: InventoryState, config: GameConfig, instanceId: string): InventoryState | null {
    const next = copy(bag), index = next.equipment.findIndex(e => e.id === instanceId);
    if (index < 0) return null;
    const item = next.equipment[index], definition = config.equipment.find(e => e.id === item.definition);
    const slot: Slot | undefined = definition?.slot || (item.definition === 'emergency-weapon' ? 'weapon' : undefined);
    if (!slot) return null;
    const original = next.worn[slot]; next.equipment.splice(index, 1);
    if (original) next.equipment.push(original);
    if (usedSlots(next) > next.capacity) return null;
    next.worn[slot] = item; return next;
}
export function unequip(bag: InventoryState, slot: Slot): InventoryState | null {
    if (!bag.worn[slot] || usedSlots(bag) >= bag.capacity) return null;
    const next = copy(bag); next.equipment.push(next.worn[slot]!); delete next.worn[slot]; return next;
}
export function dismantle(bag: InventoryState, config: GameConfig, instanceId: string): InventoryState | null {
    const item = bag.equipment.find(e => e.id === instanceId);
    if (!item || item.definition === 'emergency-weapon') return null;
    const recipe = config.recipes.find(r => r.output === item.definition);
    if (!recipe) return null;
    const next = copy(bag); next.equipment = next.equipment.filter(e => e.id !== instanceId);
    for (const m of recipe.materials) if (!grantMaterial(next, m.id, Math.max(1, Math.floor(m.count / 2)))) return null;
    return next;
}
export function loseWorn(bag: InventoryState, probability: number, random: RandomSource): { inventory: InventoryState; lost: Equipment[] } {
    if (!Number.isFinite(probability) || probability < 0 || probability > 1) throw new Error('装备损失率非法');
    const next = copy(bag), lost: Equipment[] = [];
    for (const slot of SLOTS) {
        const item = next.worn[slot];
        if (item && random.next() < probability) { lost.push(item); delete next.worn[slot]; }
    }
    return { inventory: next, lost };
}
