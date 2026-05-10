import { requestJson } from "./apiClient";
import type { SpeciesId } from "@fantastic-farm/shared";
import type { ApiResponse, GameLoadData } from "../types/api";

/** Payload Unity gửi qua sự kiện `updateInventory` (JSON string). */
export type CollectItemPayload =
    | { itemKey: string; quantity?: number }
    | { items: Array<{ itemKey: string; quantity?: number }> };

export type CollectItemResponse = {
    user: unknown;
    inventory: unknown;
};

export async function collectItems(payload: CollectItemPayload) {
    return requestJson<ApiResponse<CollectItemResponse>>("/game/inventory/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

export async function loadGameData(): Promise<GameLoadData> {
    const res = await requestJson<ApiResponse<GameLoadData>>("/game/load", { method: "GET" });
    if (!res?.data) {
        throw new Error("Invalid game load response");
    }
    return res.data;
}

export async function syncFarm() {
    return requestJson<ApiResponse<GameLoadData>>("/game/sync", { method: "POST" });
}

export async function feedAnimal(animalId: string, premium: boolean) {
    return requestJson<ApiResponse<GameLoadData>>("/game/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ animalId, premium }),
    });
}

export async function buyFeed(itemKey: string, quantity: number) {
    return requestJson<ApiResponse<GameLoadData>>("/game/shop/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemKey, quantity }),
    });
}

export async function sellItems(itemKey: string, quantity: number) {
    return requestJson<ApiResponse<GameLoadData>>("/game/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemKey, quantity }),
    });
}

export async function hatchEgg(eggItemKey: string) {
    return requestJson<ApiResponse<GameLoadData>>("/game/hatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eggItemKey }),
    });
}

/** DB preflight: chuồng + hatch gold trước khi ví `burn_egg_for_hatch`. */
export async function preflightEggNftHatchOnChain(speciesCode: number) {
    return requestJson<ApiResponse<{ hatchGold: number; species: SpeciesId }>>("/game/hatch-onchain/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speciesCode }),
    });
}

export async function hatchOnChainEgg(txDigest: string) {
    return requestJson<ApiResponse<GameLoadData>>("/game/hatch-onchain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txDigest }),
    });
}

export async function convertOnChainItem(itemKey: string, quantity: number) {
    return requestJson<ApiResponse<GameLoadData>>("/game/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemKey, quantity }),
    });
}

export async function verifyFarmHash(hash: string, timestamp: number) {
    return requestJson<ApiResponse<{ ok: boolean }>>("/game/verify-hash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hash, timestamp }),
    });
}

export async function getGameConfig() {
    return requestJson<ApiResponse<Record<string, unknown>>>("/game/config", {
        method: "GET",
        skipAuth: true,
    });
}
