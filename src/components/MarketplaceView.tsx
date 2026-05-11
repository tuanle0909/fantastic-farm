import { useState } from "react";
import BuyFcPanel from "./BuyFcPanel";
import SellFcPanel from "./SellFcPanel";
import FarmMarketplacePanel from "./FarmMarketplacePanel";

/**
 * Dedicated route for on-chain secondary market (FC listings for FarmProductNft).
 * Does not require game JWT — only wallet + env object ids.
 */
export default function MarketplaceView() {
    const [marketplaceError, setMarketplaceError] = useState("");

    return (
        <div className="flex flex-col gap-4 text-[var(--text)]">
            <h2 className="text-lg font-semibold">Marketplace</h2>
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
