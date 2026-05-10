import type { CollectItemPayload } from "./gameService";

const KEY_CANDIDATES = ["itemKey", "item", "id", "key", "name"] as const;
const QTY_CANDIDATES = ["quantity", "count", "amount", "qty", "n"] as const;
const ARRAY_WRAPPERS = ["items", "data", "list", "inventory"] as const;

function str(v: unknown): string | null {
    if (typeof v === "string" && v.trim() !== "") {
        return v.trim();
    }
    if (typeof v === "number" && Number.isFinite(v)) {
        return String(v);
    }
    return null;
}

function qty(v: unknown): number {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        return Math.max(1, Math.floor(v));
    }
    if (typeof v === "string" && v.trim() !== "") {
        const n = Number.parseInt(v, 10);
        if (Number.isFinite(n) && n > 0) {
            return n;
        }
    }
    return 1;
}

function pickItemKey(obj: Record<string, unknown>): string | null {
    for (const k of KEY_CANDIDATES) {
        const s = str(obj[k]);
        if (s) {
            return s;
        }
    }
    return null;
}

function pickQuantity(obj: Record<string, unknown>): number {
    for (const k of QTY_CANDIDATES) {
        if (obj[k] !== undefined && obj[k] !== null) {
            return qty(obj[k]);
        }
    }
    return 1;
}

/**
 * Nhận bất kỳ JSON từ Unity, chuẩn hóa thành payload API /game/inventory/collect.
 * Hỗ trợ: { itemKey, quantity }, { item, count }, mảng, { items: [...] }, { data: [...] }.
 * Trả về null nếu không suy ra được mục nào.
 */
export function normalizeInventoryPayloadFromUnity(raw: unknown): CollectItemPayload | null {
    if (raw === null || raw === undefined) {
        return null;
    }

    if (Array.isArray(raw)) {
        const items = raw
            .map((x) => {
                if (!x || typeof x !== "object") {
                    return null;
                }
                const o = x as Record<string, unknown>;
                const itemKey = pickItemKey(o);
                if (!itemKey) {
                    return null;
                }
                return { itemKey, quantity: pickQuantity(o) };
            })
            .filter((e): e is { itemKey: string; quantity: number } => e !== null);
        if (items.length === 0) {
            return null;
        }
        if (items.length === 1) {
            return items[0]!;
        }
        return { items };
    }

    if (typeof raw === "object") {
        const o = raw as Record<string, unknown>;

        for (const w of ARRAY_WRAPPERS) {
            const a = o[w];
            if (Array.isArray(a) && a.length > 0) {
                return normalizeInventoryPayloadFromUnity(a);
            }
        }

        const itemKey = pickItemKey(o);
        if (itemKey) {
            return { itemKey, quantity: pickQuantity(o) };
        }
    }

    return null;
}
