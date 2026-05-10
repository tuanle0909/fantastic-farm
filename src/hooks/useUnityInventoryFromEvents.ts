import { useEffect, useRef, type RefObject } from "react";
import { getStoredAuth } from "../services/authStorage";
import {
    collectItemsWithRetry,
    INVENTORY_DEBOUNCE_MS,
    mapToCollectPayload,
    mergePayloadIntoMap,
} from "../services/inventoryDebounceUtils";
import { loadPendingMapFromSession, savePendingMapToSession } from "../services/pendingInventorySession";
import { collectItems } from "../services/gameService";
import { normalizeInventoryPayloadFromUnity } from "../services/normalizeInventoryPayload";
import type { UnityAuthState } from "./useUnityGameAuth";

type UnityEventApi = {
    addEventListener: (eventName: string, callback: (...parameters: unknown[]) => unknown) => void;
    removeEventListener: (eventName: string, callback: (...parameters: unknown[]) => unknown) => void;
};

type AccountAddress = { address: string } | null | undefined;

/**
 * Sự kiện Unity "updateInventory" → debounce, gom item, lưu session, gọi API; online flush.
 * Trả về hàm reset ref khi logout trong view.
 */
export function useUnityInventoryFromEvents(
    authState: UnityAuthState,
    isLoaded: boolean,
    account: AccountAddress,
    addEventListener: UnityEventApi["addEventListener"],
    removeEventListener: UnityEventApi["removeEventListener"]
): { resetForLogout: () => void; pendingMapRef: RefObject<Map<string, number>> } {
    const pendingInventoryRef = useRef(new Map<string, number>());
    const inventoryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const inventoryWalletHydratedRef = useRef<string | null>(null);

    const resetForLogout = () => {
        pendingInventoryRef.current.clear();
        if (inventoryDebounceRef.current) {
            clearTimeout(inventoryDebounceRef.current);
            inventoryDebounceRef.current = null;
        }
        inventoryWalletHydratedRef.current = null;
    };

    useEffect(() => {
        if (authState !== "in-game" || !isLoaded || !account?.address) {
            return;
        }

        const address = account.address;
        const walletKey = address.toLowerCase();

        const runFlush = () => {
            const map = pendingInventoryRef.current;
            if (map.size === 0) {
                return;
            }
            if (!getStoredAuth()) {
                return;
            }
            const toSend = mapToCollectPayload(map);
            if (!toSend) {
                return;
            }
            const snap = new Map(map);
            map.clear();
            savePendingMapToSession(address, map);

            void collectItemsWithRetry(
                (p) => collectItems(p),
                toSend
            ).catch((err: unknown) => {
                for (const [k, v] of snap) {
                    map.set(k, (map.get(k) ?? 0) + v);
                }
                savePendingMapToSession(address, map);
                // eslint-disable-next-line no-console
                console.error("[Unity] collectItems failed after retries", err);
            });
        };

        if (inventoryWalletHydratedRef.current !== walletKey) {
            inventoryWalletHydratedRef.current = walletKey;
            pendingInventoryRef.current = loadPendingMapFromSession(address);
            if (pendingInventoryRef.current.size > 0 && getStoredAuth()) {
                if (inventoryDebounceRef.current) {
                    clearTimeout(inventoryDebounceRef.current);
                }
                inventoryDebounceRef.current = setTimeout(() => {
                    inventoryDebounceRef.current = null;
                    runFlush();
                }, 0);
            }
        }

        const onOnline = () => {
            if (!getStoredAuth() || !account) {
                return;
            }
            if (pendingInventoryRef.current.size > 0) {
                if (inventoryDebounceRef.current) {
                    clearTimeout(inventoryDebounceRef.current);
                    inventoryDebounceRef.current = null;
                }
                runFlush();
                return;
            }
            const fromDisk = loadPendingMapFromSession(account.address);
            if (fromDisk.size > 0) {
                for (const [k, v] of fromDisk) {
                    pendingInventoryRef.current.set(k, (pendingInventoryRef.current.get(k) ?? 0) + v);
                }
                savePendingMapToSession(account.address, pendingInventoryRef.current);
                runFlush();
            }
        };

        const handler = (...args: unknown[]) => {
            const first = args[0];
            const jsonString = typeof first === "string" ? first : String(first ?? "");
            if (!jsonString.trim()) {
                return;
            }
            let parsed: unknown;
            try {
                parsed = JSON.parse(jsonString);
            } catch {
                // eslint-disable-next-line no-console
                console.warn("[Unity] updateInventory: invalid JSON", jsonString);
                return;
            }

            if (!getStoredAuth()) {
                // eslint-disable-next-line no-console
                console.warn("[Unity] updateInventory: not authenticated, skipped");
                return;
            }

            const payload = normalizeInventoryPayloadFromUnity(parsed);
            if (!payload) {
                // eslint-disable-next-line no-console
                console.warn("[Unity] updateInventory: could not normalize payload", parsed);
                return;
            }

            mergePayloadIntoMap(pendingInventoryRef.current, payload);
            savePendingMapToSession(address, pendingInventoryRef.current);

            if (inventoryDebounceRef.current) {
                clearTimeout(inventoryDebounceRef.current);
            }
            inventoryDebounceRef.current = setTimeout(() => {
                inventoryDebounceRef.current = null;
                runFlush();
            }, INVENTORY_DEBOUNCE_MS);
        };

        window.addEventListener("online", onOnline);
        addEventListener("updateInventory", handler);
        return () => {
            window.removeEventListener("online", onOnline);
            removeEventListener("updateInventory", handler);
            if (inventoryDebounceRef.current) {
                clearTimeout(inventoryDebounceRef.current);
                inventoryDebounceRef.current = null;
            }
        };
    }, [authState, isLoaded, addEventListener, removeEventListener, account?.address]);

    return { resetForLogout, pendingMapRef: pendingInventoryRef };
}
