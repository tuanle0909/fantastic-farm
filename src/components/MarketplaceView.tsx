import BuyFcPanel from "./BuyFcPanel";
import SellFcPanel from "./SellFcPanel";
import FarmMarketplacePanel from "./FarmMarketplacePanel";

/**
 * Dedicated route for on-chain secondary market (FC listings for FarmProductNft).
 * Does not require game JWT — only wallet + env object ids.
 */
export default function MarketplaceView() {
    return (
        <div className="flex flex-col gap-4 text-[var(--text)]">
            <h2 className="text-lg font-semibold">Marketplace</h2>
            <div className="grid gap-4 md:grid-cols-2 md:items-start">
                <BuyFcPanel />
                <SellFcPanel />
            </div>
            <FarmMarketplacePanel />
        </div>
    );
}
