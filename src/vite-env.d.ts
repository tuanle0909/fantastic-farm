/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_BE_API_URL?: string;
    readonly VITE_REQUIRED_SUI_CHAIN?: string;
    readonly VITE_SUI_NETWORK?: string;
    readonly VITE_SUI_RPC_URL?: string;
    readonly VITE_SLUSH_WALLET_ORIGIN?: string;
    readonly VITE_PREFERRED_WALLET?: string;
    readonly VITE_UNITY_BUILD_BASE_URL?: string;
    /** Same as BE `FANTASTIC_FARM_PACKAGE_ID` after publish. */
    readonly VITE_FANTASTIC_FARM_PACKAGE_ID?: string;
    /** Same as BE `FANTASTIC_FARM_REGISTRY_OBJECT_ID` (shared `FarmRegistry`). */
    readonly VITE_FANTASTIC_FARM_REGISTRY_OBJECT_ID?: string;
    /** Shared-object id of `farm_marketplace::Marketplace` after publish. */
    readonly VITE_FANTASTIC_FARM_MARKETPLACE_OBJECT_ID?: string;
    /** Shared `FcMintRegistry` object id for `buy_fc_with_sui` (wraps FC `TreasuryCap`). */
    readonly VITE_FANTASTIC_FARM_FC_MINT_REGISTRY_OBJECT_ID?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
