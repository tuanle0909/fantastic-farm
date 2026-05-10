import {
    GOLDEN_GRASS_COST,
    GOLDEN_WHEAT_COST,
    SPECIES,
    farmProductDisplayName,
    ON_CHAIN_TIER_ORDER,
    spawnBalanceMultiplier,
    type OnChainTierId,
    type SpeciesId,
} from "@fantastic-farm/shared";

/** Satiety 0–100 as returned by API (see BE animal model). */
export function hungerBracketLabel(satiety0to100: number): string {
    const s = satiety0to100 / 100;
    if (s > 0.5) return "Well fed — full spawn chance (off-chain bracket).";
    if (s > 0.25) return "Hungry — reduced off-chain spawn; on-chain chance already lower.";
    if (s > 0) return "Very hungry — further reduced spawns.";
    return "Starving — minimal / no rare spawns until fed.";
}

/** Nhãn nút cho (BE: `premium: false` = wheat/grass, `true` = golden wheat/grass). */
export function feedChoiceLabels(species: string | undefined): { regular: string; premium: string } {
    if (!species || !(species in SPECIES)) {
        return { regular: "Thức ăn thường", premium: "Thức ăn vàng" };
    }
    const cfg = SPECIES[species as SpeciesId];
    if (cfg.feedKey === "wheat") {
        return { regular: "Lúa mì", premium: "Lúa mì vàng" };
    }
    return { regular: "Cỏ", premium: "Cỏ vàng" };
}

export function formatDurationMs(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) return "Ready";
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
}

export type GoldShopRow = { itemKey: string; label: string; goldCost: number };

export function goldShopRows(): readonly GoldShopRow[] {
    return [
        { itemKey: "wheat", label: "Wheat", goldCost: SPECIES.chicken.feedGoldCost },
        { itemKey: "grass", label: "Grass", goldCost: SPECIES.goat.feedGoldCost },
        { itemKey: "golden_wheat", label: "Golden wheat", goldCost: GOLDEN_WHEAT_COST },
        { itemKey: "golden_grass", label: "Golden grass", goldCost: GOLDEN_GRASS_COST },
    ] as const;
}

export function spawnMultiplierLine(storageSlots: number): string {
    const m = spawnBalanceMultiplier(storageSlots);
    return `Spawn balance multiplier (storage): ×${m.toFixed(2)} (GDD: −10% per 5 slots above base, floor 50%).`;
}

export function speciesSpawnHours(species: string | undefined): number | null {
    if (!species || !(species in SPECIES)) return null;
    return SPECIES[species as SpeciesId].spawnHours;
}

export function decodeFarmProductNftLabel(speciesCode: number, tier: number): string {
    const speciesIds: SpeciesId[] = ["chicken", "goat", "sheep", "cow"];
    const sid = speciesIds[speciesCode];
    const tierId = ON_CHAIN_TIER_ORDER[tier] ?? ON_CHAIN_TIER_ORDER[0];
    if (!sid || !tierId) return `species ${speciesCode} · tier ${tier}`;
    return farmProductDisplayName(sid, tierId as OnChainTierId);
}
