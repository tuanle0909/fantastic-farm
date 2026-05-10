import { ApiError } from "./apiClient";
import type { CollectItemPayload } from "./gameService";

/** Cộng dồn từng lần normalize (cùng itemKey thì cộng quantity). */
export function mergePayloadIntoMap(map: Map<string, number>, payload: CollectItemPayload) {
    if ("items" in payload && Array.isArray(payload.items)) {
        for (const it of payload.items) {
            const q = it.quantity ?? 1;
            map.set(it.itemKey, (map.get(it.itemKey) ?? 0) + q);
        }
    } else {
        const p = payload as { itemKey: string; quantity?: number };
        const q = p.quantity ?? 1;
        map.set(p.itemKey, (map.get(p.itemKey) ?? 0) + q);
    }
}

export function mapToCollectPayload(map: Map<string, number>): CollectItemPayload | null {
    if (map.size === 0) {
        return null;
    }
    const entries = [...map.entries()];
    if (entries.length === 1) {
        const [itemKey, quantity] = entries[0]!;
        return { itemKey, quantity };
    }
    return { items: entries.map(([itemKey, quantity]) => ({ itemKey, quantity })) };
}

export const INVENTORY_DEBOUNCE_MS = 400;

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 600;

function shouldRetryError(err: unknown): boolean {
    if (err instanceof ApiError) {
        if (err.status === 401) {
            return false;
        }
        if (err.status >= 400 && err.status < 500 && err.status !== 429) {
            return false;
        }
        return true;
    }
    return true;
}

export async function collectItemsWithRetry(
    collectFn: (p: CollectItemPayload) => Promise<unknown>,
    payload: CollectItemPayload
): Promise<void> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            await collectFn(payload);
            return;
        } catch (err) {
            lastErr = err;
            if (!shouldRetryError(err)) {
                throw err;
            }
            await new Promise((r) => setTimeout(r, RETRY_BASE_MS * (attempt + 1)));
        }
    }
    throw lastErr;
}
