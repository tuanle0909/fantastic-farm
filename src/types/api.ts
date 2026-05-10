export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface ApiResponse<T> {
    data: T;
    message?: string;
}

/** Profile from login or /auth/me (me does not return accessToken). */
export interface AccountProfile {
    userId: string;
    username: string;
    walletAddress: string;
    authProvider: string;
    lastLoginAt: string;
    gold?: number;
    exp?: number;
    fcBalance?: number;
    level?: number;
    storageSlots?: number;
}

export interface WalletLoginData extends AccountProfile {
    accessToken: string;
    isNew?: boolean;
}

/** GET /game/load */
export type PendingFarmProductMint = {
    id: string;
    species?: string;
    tierId?: string;
    label?: string;
    fcValue?: number;
};

export type FarmSpawnQueueOffSlot = {
    kind: "off";
    itemKey: string;
    quantity: number;
    queuedAt: string | null;
};

export type FarmSpawnQueueMintSlot = {
    kind: "mint";
    id: string;
    species?: string;
    tierId?: string;
    label?: string;
    fcValue?: number;
};

export type FarmSpawnQueueSlot = FarmSpawnQueueOffSlot | FarmSpawnQueueMintSlot;

export type GameLoadData = {
    user: unknown;
    inventory: unknown[];
    animals: unknown[];
    progression: {
        exp: number;
        level: number;
        storageSlots: number;
        /** Max simultaneous farm drop slots (Lv1=12, +2 per level). */
        farmDropQueueCapacity?: number;
    };
    pendingFarmProductMints?: PendingFarmProductMint[];
    /** Spawn queue merged off-chain drops + mint rows chronologically */
    farmSpawnQueue?: FarmSpawnQueueSlot[];
    /** BE `FANTASTIC_FARM_FAST_TEST` — spawn/hunger scaled for local QA. */
    fastTest?: boolean;
};
