/** Shared Sui `Clock` object (same on all networks). */
export const SUI_CLOCK_OBJECT_ID =
    "0x0000000000000000000000000000000000000000000000000000000000000006";

export function getFantasticCoinType(packageId: string): string {
    const pid = packageId.trim();
    return `${pid}::fantastic_coin::FANTASTIC_COIN`;
}

export function getOnchainIdsFromEnv(): {
    packageId: string;
    registryId: string;
    marketplaceId: string;
    /** Shared `FcMintRegistry` (wraps `TreasuryCap<FANTASTIC_COIN>`) for `buy_fc_with_sui`. */
    fcMintRegistryObjectId: string;
    coinType: string;
    ready: boolean;
    marketplaceReady: boolean;
    fcOnrampReady: boolean;
} {
    const packageId = import.meta.env.VITE_FANTASTIC_FARM_PACKAGE_ID?.trim() ?? "";
    const registryId = import.meta.env.VITE_FANTASTIC_FARM_REGISTRY_OBJECT_ID?.trim() ?? "";
    const marketplaceId = import.meta.env.VITE_FANTASTIC_FARM_MARKETPLACE_OBJECT_ID?.trim() ?? "";
    const fcMintRegistryObjectId = import.meta.env.VITE_FANTASTIC_FARM_FC_MINT_REGISTRY_OBJECT_ID?.trim() ?? "";
    const coinType = packageId ? getFantasticCoinType(packageId) : "";
    const ready = Boolean(packageId && registryId);
    const marketplaceReady = Boolean(packageId && registryId && marketplaceId);
    const fcOnrampReady = Boolean(packageId && fcMintRegistryObjectId);
    return {
        packageId,
        registryId,
        marketplaceId,
        fcMintRegistryObjectId,
        coinType,
        ready,
        marketplaceReady,
        fcOnrampReady,
    };
}
