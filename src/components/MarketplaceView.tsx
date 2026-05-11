import { useCurrentAccount } from "@mysten/dapp-kit";
import { useMemo, useState } from "react";
import { getOnchainIdsFromEnv } from "../config/onchain";
import { useOnChainFcMist } from "../hooks/useOnChainFcBalance";
import { formatFcFromMist } from "../services/marketplaceService";
import BuyFcPanel from "./BuyFcPanel";
import SellFcPanel from "./SellFcPanel";
import FarmMarketplacePanel from "./FarmMarketplacePanel";

/**
 * Dedicated route for on-chain secondary market (FC listings for FarmProductNft).
 * Does not require game JWT — only wallet + env object ids.
 */
export default function MarketplaceView() {
    const [marketplaceError, setMarketplaceError] = useState("");
    const account = useCurrentAccount();
    const walletConnected = Boolean(account?.address);
    const fcMist = useOnChainFcMist(walletConnected);
    const coinTypeConfigured = Boolean(getOnchainIdsFromEnv().coinType.trim());
    const fcDisplay = useMemo(() => {
        if (!walletConnected) return "—";
        if (!coinTypeConfigured) return "Chưa cấu hình package";
        if (fcMist === null) return "Đang tải…";
        return `${formatFcFromMist(fcMist)} FC`;
    }, [walletConnected, coinTypeConfigured, fcMist]);

    return (
        <div className="flex flex-col gap-4 text-[var(--text)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold">Marketplace</h2>
                <div
                    className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm shadow-[0_2px_12px_rgba(0,0,0,0.06)]"
                    title="Số FC on-chain trong ví (Fantastic Coin) — dùng để mua listing."
                >
                    <span className="text-[var(--muted)]">FC trong ví: </span>
                    <span className="font-semibold tabular-nums text-[var(--text)]">{fcDisplay}</span>
                </div>
            </div>
            {marketplaceError ? (
                <div
                    className="flex flex-wrap items-start justify-between gap-2 rounded-xl border border-rose-500/35 bg-rose-950/25 px-3 py-2 text-sm text-rose-100"
                    role="alert"
                >
                    <span className="min-w-0 flex-1">{marketplaceError}</span>
                    <button
                        type="button"
                        onClick={() => setMarketplaceError("")}
                        className="shrink-0 rounded-md border border-rose-400/40 px-2 py-0.5 text-xs text-rose-100 hover:bg-rose-900/40"
                    >
                        Đóng
                    </button>
                </div>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2 md:items-start">
                <BuyFcPanel />
                <SellFcPanel />
            </div>
            <FarmMarketplacePanel onError={setMarketplaceError} />
        </div>
    );
}
