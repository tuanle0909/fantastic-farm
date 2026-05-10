import { useCallback, useEffect, useState } from "react";
import { fetchSession } from "../services/authService";
import { getStoredAuth } from "../services/authStorage";

export type HeaderEconomy = {
    gold?: number;
    exp?: number;
    fcBalance?: number;
    level?: number;
    storageSlots?: number;
};

export const ECONOMY_REFRESH_EVENT = "fantastic-farm:refresh-economy";

export function dispatchEconomyRefresh() {
    window.dispatchEvent(new CustomEvent(ECONOMY_REFRESH_EVENT));
}

/**
 * Hiển thị gold/exp trên header; refetch khi wallet đổi hoặc sau hành động game (custom event).
 */
export function useHeaderEconomy(walletConnected: boolean) {
    const [economy, setEconomy] = useState<HeaderEconomy>({});

    const refresh = useCallback(async () => {
        if (!getStoredAuth()) {
            setEconomy({});
            return;
        }
        try {
            const p = await fetchSession();
            setEconomy({
                gold: p.gold,
                exp: p.exp,
                fcBalance: p.fcBalance,
                level: p.level,
                storageSlots: p.storageSlots,
            });
        } catch {
            setEconomy({});
        }
    }, []);

    useEffect(() => {
        if (!walletConnected) {
            setEconomy({});
            return;
        }
        void refresh();
    }, [walletConnected, refresh]);

    useEffect(() => {
        const onRefresh = () => {
            void refresh();
        };
        window.addEventListener(ECONOMY_REFRESH_EVENT, onRefresh);
        return () => window.removeEventListener(ECONOMY_REFRESH_EVENT, onRefresh);
    }, [refresh]);

    return { economy, refreshEconomy: refresh };
}
