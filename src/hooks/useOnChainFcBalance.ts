import { useCallback, useEffect, useState } from "react";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { getOnchainIdsFromEnv } from "../config/onchain";
import { ECONOMY_REFRESH_EVENT } from "./useHeaderEconomy";

/**
 * Total FANTASTIC_COIN (mist) for the connected wallet from fullnode — source of truth vs Mongo `fcBalance` ledger.
 */
export function useOnChainFcMist(walletConnected: boolean) {
    const client = useSuiClient();
    const account = useCurrentAccount();
    const { coinType } = getOnchainIdsFromEnv();

    const [mist, setMist] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!walletConnected || !coinType.trim() || !account?.address) {
            setMist(null);
            return;
        }
        try {
            const b = await client.getBalance({
                owner: normalizeSuiAddress(account.address.trim()),
                coinType,
            });
            setMist(b.totalBalance);
        } catch {
            setMist(null);
        }
    }, [walletConnected, coinType, client, account?.address]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    useEffect(() => {
        const onRefresh = () => {
            void refresh();
        };
        window.addEventListener(ECONOMY_REFRESH_EVENT, onRefresh);
        return () => window.removeEventListener(ECONOMY_REFRESH_EVENT, onRefresh);
    }, [refresh]);

    /** Light poll so seller sees FC after another wallet bought their listing (no WebSocket). */
    useEffect(() => {
        if (!walletConnected || !coinType.trim()) return;
        const id = window.setInterval(() => {
            void refresh();
        }, 25_000);
        return () => window.clearInterval(id);
    }, [walletConnected, coinType, refresh]);

    return mist;
}
