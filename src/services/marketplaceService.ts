import { marketplaceListingMinPriceMist } from "@fantastic-farm/shared";
import type { EventId, SuiEvent, SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { isValidSuiObjectId, normalizeSuiAddress, normalizeSuiObjectId } from "@mysten/sui/utils";
import { Transaction } from "@mysten/sui/transactions";
import { decodeFarmProductNftLabel } from "../gameplay/gddUi";

export type MarketplaceListingRow = {
    listingId: string;
    seller: string;
    priceMist: string;
    priceFcDisplay: string;
    /** Populated via `enrichMarketplaceListingsWithNftDisplay` (on-chain NFT under marketplace DOF). */
    nftImageUrl?: string;
    nftLabel?: string;
};

function parseU64Field(v: unknown): string | null {
    if (typeof v === "number" && Number.isFinite(v)) return String(Math.max(0, Math.trunc(v)));
    if (typeof v === "string" && /^\d+$/.test(v)) return v;
    return null;
}

export function fcMistFromDecimalInput(input: string): bigint {
    const t = input.trim();
    if (!t) throw new Error("Enter a price");
    const neg = t.startsWith("-");
    if (neg) throw new Error("Price must be positive");
    const [wholeRaw, fracRaw = ""] = t.split(".");
    if (!/^\d+$/.test(wholeRaw) || (fracRaw && !/^\d+$/.test(fracRaw))) throw new Error("Invalid number");
    const frac = (fracRaw + "000000000").slice(0, 9);
    return BigInt(wholeRaw) * 1_000_000_000n + BigInt(frac);
}

export function formatFcFromMist(mist: string): string {
    const b = BigInt(mist);
    const whole = b / 1_000_000_000n;
    const frac = b % 1_000_000_000n;
    if (frac === 0n) return `${whole}`;
    const fracStr = frac.toString().padStart(9, "0").replace(/0+$/, "");
    return `${whole}.${fracStr}`;
}

/** Same 500 bps as `fantastic_coin::buy_fc_with_sui` on-chain. */
const BUY_FC_FEE_BPS = 500n;

/** GDD §14 `withdrawFee` / Move `SELL_FC_WITHDRAW_FEE_BPS`: 10%. */
export const SELL_FC_FEE_BPS = 1000n;

/** Net SUI (mist) user receives when selling `fcMist` worth of FC after 10% withdrawal fee. */
export function netSuiMistFromSellFcMist(fcMist: bigint): bigint {
    const fee = (fcMist * SELL_FC_FEE_BPS) / 10000n;
    return fcMist - fee;
}

/** FC minted for a given SUI payment (mist), matching Move integer fee. */
export function netFcMintedForPaidSuiMist(paidSuiMist: bigint): bigint {
    const fee = (paidSuiMist * BUY_FC_FEE_BPS) / 10000n;
    return paidSuiMist - fee;
}

/**
 * Minimum SUI (mist) to pay so on-chain minted FC &gt;= `targetFcMist`
 * (binary search; fee rounds down like Move).
 */
export function suiMistToBuyAtLeastFcMist(targetFcMist: bigint): bigint {
    if (targetFcMist <= 0n) throw new Error("FC amount must be positive");
    let lo = 1n;
    let hi = (targetFcMist * 10000n + 9499n) / 9500n + 100n;
    while (netFcMintedForPaidSuiMist(hi) < targetFcMist) {
        hi = hi * 2n;
    }
    while (lo < hi) {
        const mid = (lo + hi) / 2n;
        if (netFcMintedForPaidSuiMist(mid) >= targetFcMist) hi = mid;
        else lo = mid + 1n;
    }
    return lo;
}

async function queryEventsPages(
    client: SuiJsonRpcClient,
    query: { MoveEventType: string },
    maxPages = 40,
    pageSize = 50,
): Promise<SuiEvent[]> {
    const out: SuiEvent[] = [];
    let cursor: EventId | null | undefined = null;
    for (let p = 0; p < maxPages; p++) {
        const res: Awaited<ReturnType<SuiJsonRpcClient["queryEvents"]>> = await client.queryEvents({
            query,
            cursor,
            limit: pageSize,
            order: "descending",
        });
        out.push(...res.data);
        if (!res.hasNextPage) break;
        cursor = res.nextCursor === undefined ? null : res.nextCursor;
    }
    return out;
}

/** Active rows = `Listed` minus `SaleCompleted` listing_ids. Cancellations emit no event — use `pruneStaleMarketplaceListingRows` with the Marketplace object id to drop removed DOF slots. */
export async function fetchActiveMarketplaceListings(
    client: SuiJsonRpcClient,
    packageId: string,
): Promise<MarketplaceListingRow[]> {
    const pid = normalizeSuiAddress(packageId.trim());
    const listedType = `${pid}::farm_marketplace::Listed`;
    const soldType = `${pid}::farm_marketplace::SaleCompleted`;
    const [listedEvents, soldEvents] = await Promise.all([
        queryEventsPages(client, { MoveEventType: listedType }),
        queryEventsPages(client, { MoveEventType: soldType }),
    ]);

    const sold = new Set<string>();
    for (const e of soldEvents) {
        const j = e.parsedJson as Record<string, unknown> | undefined;
        const id = j ? parseU64Field(j.listing_id) : null;
        if (id !== null) sold.add(id);
    }

    const byId = new Map<string, { seller: string; price: string }>();
    for (const e of listedEvents) {
        const j = e.parsedJson as Record<string, unknown> | undefined;
        if (!j) continue;
        const listingId = parseU64Field(j.listing_id);
        const seller = typeof j.seller === "string" ? j.seller : "";
        const price = parseU64Field(j.price);
        if (listingId === null || !seller || price === null) continue;
        if (!byId.has(listingId)) byId.set(listingId, { seller, price });
    }

    const rows: MarketplaceListingRow[] = [];
    for (const [listingId, meta] of byId) {
        if (sold.has(listingId)) continue;
        rows.push({
            listingId,
            seller: meta.seller,
            priceMist: meta.price,
            priceFcDisplay: `${formatFcFromMist(meta.price)} FC`,
        });
    }
    rows.sort((a, b) => Number(b.listingId) - Number(a.listingId));
    return rows;
}

/**
 * Drops listing rows whose `listing_id` dynamic object field no longer exists on the Marketplace
 * (sold NFTs are already excluded via `SaleCompleted` events; cancelled listings are not).
 */
export async function pruneStaleMarketplaceListingRows(
    client: SuiJsonRpcClient,
    marketplaceObjectId: string,
    rows: MarketplaceListingRow[],
): Promise<MarketplaceListingRow[]> {
    const mid = marketplaceObjectId.trim();
    if (!mid || rows.length === 0) return rows;

    const exists = await Promise.all(
        rows.map(async (row) => {
            try {
                const res = await client.getDynamicFieldObject({
                    parentId: mid,
                    name: { type: "u64", value: row.listingId },
                });
                return !res.error && res.data != null;
            } catch {
                return false;
            }
        }),
    );
    return rows.filter((_, i) => exists[i]);
}

function pickFarmProductDisplayFields(fields: Record<string, unknown>): {
    speciesCode: number;
    tier: number;
    imageUrl?: string;
    chainName?: string | null;
} | null {
    if (!("species_code" in fields) || !("tier" in fields)) return null;
    const speciesCode = Number(fields.species_code);
    const tier = Number(fields.tier);
    if (!Number.isFinite(speciesCode) || !Number.isFinite(tier)) return null;
    const imageRaw = fields.image_url;
    const imageUrl =
        typeof imageRaw === "string" && /^https?:\/\//i.test(imageRaw.trim()) ? imageRaw.trim() : undefined;
    const chainNameRaw = fields.name;
    const chainName = typeof chainNameRaw === "string" ? chainNameRaw : null;
    return { speciesCode, tier, imageUrl, chainName };
}

/**
 * Each active listing id names a `dynamic_object_field` on the shared Marketplace holding the `FarmProductNft`.
 */
async function loadListedFarmProductPreview(
    client: SuiJsonRpcClient,
    marketplaceObjectId: string,
    listingId: string,
): Promise<{ imageUrl?: string; nftLabel: string } | null> {
    const mid = marketplaceObjectId.trim();
    if (!mid) return null;
    let res: Awaited<ReturnType<SuiJsonRpcClient["getDynamicFieldObject"]>>;
    try {
        res = await client.getDynamicFieldObject({
            parentId: mid,
            name: { type: "u64", value: listingId },
        });
    } catch {
        return null;
    }
    if (res.error || !res.data?.content || res.data.content.dataType !== "moveObject") return null;

    const labelFromPicked = (picked: NonNullable<ReturnType<typeof pickFarmProductDisplayFields>>) =>
        picked.chainName && picked.chainName.trim().length > 0
            ? picked.chainName.trim()
            : decodeFarmProductNftLabel(picked.speciesCode, picked.tier);

    const tryFromRawFields = (raw: unknown): { imageUrl?: string; nftLabel: string } | null => {
        const f = flattenMoveStructFields(raw);
        const picked = pickFarmProductDisplayFields(f);
        if (!picked) return null;
        return { imageUrl: picked.imageUrl, nftLabel: labelFromPicked(picked) };
    };

    const direct = tryFromRawFields(res.data.content.fields);
    if (direct) return direct;

    const outer = flattenMoveStructFields(res.data.content.fields);
    const v = outer.value;
    if (v && typeof v === "object" && v !== null) {
        const nested = tryFromRawFields(v);
        if (nested) return nested;
        if ("fields" in v) {
            const fromInner = tryFromRawFields((v as { fields: unknown }).fields);
            if (fromInner) return fromInner;
        }
    }
    if (typeof v === "string") {
        const oid = normalizeSuiObjectId(v);
        if (isValidSuiObjectId(oid)) {
            try {
                const obj = await client.getObject({ id: oid, options: { showContent: true } });
                const c = obj.data?.content;
                if (c?.dataType === "moveObject") {
                    return tryFromRawFields(c.fields);
                }
            } catch {
                /* ignore */
            }
        }
    }
    return null;
}

/** Best-effort: attach `image_url` + label for each listing by reading the listed `FarmProductNft` on-chain. */
export async function enrichMarketplaceListingsWithNftDisplay(
    client: SuiJsonRpcClient,
    marketplaceObjectId: string,
    rows: MarketplaceListingRow[],
): Promise<MarketplaceListingRow[]> {
    const mid = marketplaceObjectId.trim();
    if (!mid || rows.length === 0) return rows;
    return Promise.all(
        rows.map(async (row) => {
            const preview = await loadListedFarmProductPreview(client, mid, row.listingId);
            if (!preview) return { ...row };
            return { ...row, nftImageUrl: preview.imageUrl, nftLabel: preview.nftLabel };
        }),
    );
}

/**
 * Canonical package id hosting `farm_marketplace::Marketplace` — matches minted `FarmProductNft` + listing Move calls.
 * Use when `VITE_FANTASTIC_FARM_PACKAGE_ID` may be stale vs `MARKETPLACE_OBJECT_ID` from the same publish.
 */
export async function resolveFarmPackageIdFromMarketplace(
    client: SuiJsonRpcClient,
    marketplaceObjectId: string,
    fallbackPackageId: string,
): Promise<string> {
    const mid = marketplaceObjectId.trim();
    if (!mid) return normalizeSuiAddress(fallbackPackageId.trim());
    try {
        const { data } = await client.getObject({ id: mid, options: { showType: true } });
        const t = data?.type;
        const m = t?.match(/^(0x[0-9a-fA-F]+)::farm_marketplace::Marketplace$/);
        if (m) return normalizeSuiAddress(m[1]);
    } catch {
        /* ignore */
    }
    return normalizeSuiAddress(fallbackPackageId.trim());
}

export type OwnedFarmProductNft = {
    objectId: string;
    speciesCode: number;
    tier: number;
    label: string;
    /** HTTPS URL from on-chain `FarmProductNft.image_url`. */
    imageUrl?: string;
};

export type OwnedEggNft = {
    objectId: string;
    speciesCode: number;
};

/** Nested `fields` when RPC wraps struct as `{ type, fields: { species_code,... } }`. */
function flattenMoveStructFields(fields: unknown): Record<string, unknown> {
    if (!fields || typeof fields !== "object" || fields === null) return {};
    const outer = fields as Record<string, unknown>;
    const nested = outer.fields;
    if (
        nested !== undefined &&
        nested !== null &&
        typeof nested === "object" &&
        !Array.isArray(nested) &&
        nested !== outer
    ) {
        const n = nested as Record<string, unknown>;
        if ("species_code" in n || "tier" in n || ("name" in n && "description" in n)) return n;
    }
    return outer;
}

function resolveOwnedObjectTypeTag(row: {
    data?:
        | {
              type?: string | null;
              content?: { dataType?: string; type?: string } | null;
          }
        | null
        | undefined;
}): string | null {
    const d = row.data;
    const outer = typeof d?.type === "string" ? d.type : null;
    const c = d?.content;
    const inner = c?.dataType === "moveObject" && typeof c.type === "string" ? c.type : null;
    return outer ?? inner;
}

/** Distinguishes `EggNft` from farm product / animal NFTs when `type` is missing. */
function isLikelyEggNftFields(f: Record<string, unknown>): boolean {
    return "species_code" in f && "image_url" in f && !("tier" in f) && !("name" in f);
}

/** Only keep objects still owned directly by `walletAddress`. Listed NFTs sit under Marketplace DOF (not AddressOwner); also drops stale rows from RPC `getOwnedObjects`. */
async function retainOnlyDirectAddressOwners(
    client: SuiJsonRpcClient,
    walletAddress: string,
    candidates: OwnedFarmProductNft[],
): Promise<OwnedFarmProductNft[]> {
    if (candidates.length === 0) return [];
    const addr = normalizeSuiAddress(walletAddress.trim());
    const BATCH = 50;
    const validIds = new Set<string>();
    for (let i = 0; i < candidates.length; i += BATCH) {
        const batch = candidates.slice(i, i + BATCH);
        const res = await client.multiGetObjects({
            ids: batch.map((n) => n.objectId),
            options: { showOwner: true },
        });
        for (const row of res) {
            const data = row.data;
            const oid = data?.objectId;
            if (!oid) continue;
            const owner = data.owner;
            if (
                owner &&
                typeof owner === "object" &&
                "AddressOwner" in owner &&
                typeof (owner as { AddressOwner?: unknown }).AddressOwner === "string" &&
                normalizeSuiAddress((owner as { AddressOwner: string }).AddressOwner) === addr
            ) {
                validIds.add(oid);
            }
        }
    }
    return candidates.filter((n) => validIds.has(n.objectId));
}

/** Distinguishes `FarmProductNft` from `EggNft` / `AnimalNft` when `type` is missing on some RPC shapes. */
function isLikelyFarmProductNftFields(f: Record<string, unknown>): boolean {
    return (
        "species_code" in f &&
        "tier" in f &&
        "name" in f &&
        "description" in f &&
        "image_url" in f
    );
}

export async function fetchOwnedFarmProductNfts(
    client: SuiJsonRpcClient,
    owner: string,
    packageId: string,
): Promise<OwnedFarmProductNft[]> {
    const addr = normalizeSuiAddress(owner.trim());
    const pkg = normalizeSuiAddress(packageId.trim());
    const structType = `${pkg}::farm_nft::FarmProductNft`;
    const pushFromObject = (
        row: Awaited<ReturnType<SuiJsonRpcClient["getOwnedObjects"]>>["data"][number],
        out: OwnedFarmProductNft[],
    ) => {
        const oid = row.data?.objectId;
        const content = row.data?.content;
        if (!oid || !content || content.dataType !== "moveObject") return;
        const typ = resolveOwnedObjectTypeTag(row);
        const f = flattenMoveStructFields(content.fields);

        if (typ) {
            if (typ.includes("::farm_nft::") && typ.includes("FarmProductNft")) {
                const m = typ.match(/^(0x[0-9a-fA-F]+)::farm_nft::FarmProductNft$/);
                if (!m || normalizeSuiAddress(m[1]) !== pkg) return;
            } else if (typ.includes("::farm_nft::")) {
                return;
            } else if (!isLikelyFarmProductNftFields(f)) {
                return;
            }
        } else if (!isLikelyFarmProductNftFields(f)) {
            return;
        }

        const speciesCode = Number(f.species_code ?? 0);
        const tier = Number(f.tier ?? 0);
        const rawName = f.name;
        const name = typeof rawName === "string" ? rawName : null;
        const rawImg = f.image_url;
        const imageUrl =
            typeof rawImg === "string" && /^https?:\/\//i.test(rawImg.trim())
                ? rawImg.trim()
                : undefined;
        out.push({
            objectId: oid,
            speciesCode,
            tier,
            label: name ?? `NFT #${oid.slice(-4)}`,
            imageUrl,
        });
    };
    const out: OwnedFarmProductNft[] = [];
    let cursor: string | null | undefined = null;
    for (let p = 0; p < 40; p++) {
        const page = await client.getOwnedObjects({
            owner: addr,
            filter: { StructType: structType },
            options: { showContent: true, showType: true },
            cursor,
            limit: 50,
        });
        for (const o of page.data) {
            pushFromObject(o, out);
        }
        if (!page.hasNextPage) break;
        cursor = page.nextCursor ?? null;
    }
    if (out.length === 0) {
        cursor = null;
        for (let p = 0; p < 40; p++) {
            const page = await client.getOwnedObjects({
                owner: addr,
                options: { showContent: true, showType: true },
                cursor,
                limit: 50,
            });
            for (const o of page.data) {
                pushFromObject(o, out);
            }
            if (!page.hasNextPage) break;
            cursor = page.nextCursor ?? null;
        }
    }
    const uniq = new Map<string, OwnedFarmProductNft>();
    for (const n of out) uniq.set(n.objectId, n);
    return retainOnlyDirectAddressOwners(client, addr, [...uniq.values()]);
}

export async function fetchOwnedEggNfts(
    client: SuiJsonRpcClient,
    owner: string,
    packageId: string,
): Promise<OwnedEggNft[]> {
    const addr = normalizeSuiAddress(owner.trim());
    const pkg = normalizeSuiAddress(packageId.trim());
    const structType = `${pkg}::farm_nft::EggNft`;
    const pushFromObject = (
        row: Awaited<ReturnType<SuiJsonRpcClient["getOwnedObjects"]>>["data"][number],
        out: OwnedEggNft[],
    ) => {
        const oid = row.data?.objectId;
        const content = row.data?.content;
        if (!oid || !content || content.dataType !== "moveObject") return;
        const typ = resolveOwnedObjectTypeTag(row);
        const f = flattenMoveStructFields(content.fields);

        if (typ) {
            if (typ.includes("::farm_nft::") && typ.includes("EggNft")) {
                const m = typ.match(/^(0x[0-9a-fA-F]+)::farm_nft::EggNft$/);
                if (!m || normalizeSuiAddress(m[1]) !== pkg) return;
            } else if (typ.includes("::farm_nft::")) {
                return;
            } else if (!isLikelyEggNftFields(f)) {
                return;
            }
        } else if (!isLikelyEggNftFields(f)) {
            return;
        }

        const speciesCode = Number(f.species_code ?? 0);
        out.push({ objectId: oid, speciesCode });
    };
    const out: OwnedEggNft[] = [];
    let cursor: string | null | undefined = null;
    for (let p = 0; p < 40; p++) {
        const page = await client.getOwnedObjects({
            owner: addr,
            filter: { StructType: structType },
            options: { showContent: true, showType: true },
            cursor,
            limit: 50,
        });
        for (const o of page.data) {
            pushFromObject(o, out);
        }
        if (!page.hasNextPage) break;
        cursor = page.nextCursor ?? null;
    }
    if (out.length > 0) return out;

    cursor = null;
    for (let p = 0; p < 40; p++) {
        const page = await client.getOwnedObjects({
            owner: addr,
            options: { showContent: true, showType: true },
            cursor,
            limit: 50,
        });
        for (const o of page.data) {
            pushFromObject(o, out);
        }
        if (!page.hasNextPage) break;
        cursor = page.nextCursor ?? null;
    }
    return out;
}

export type PickFcCoverResult = {
    coinObjectIds: string[];
    /** Sum of selected coin balances (≥ minBalance when pick succeeds). */
    totalBalance: bigint;
};

/** Pick minimal FC coin objects whose combined balance ≥ minBalance. */
export async function pickFcCoinObjects(
    client: SuiJsonRpcClient,
    owner: string,
    coinType: string,
    minBalance: bigint,
): Promise<PickFcCoverResult> {
    const coinObjectIds: string[] = [];
    let totalBalance = 0n;
    let cursor: string | null | undefined = null;
    const ownerNorm = normalizeSuiAddress(owner.trim());
    for (let p = 0; p < 40; p++) {
        const page: Awaited<ReturnType<SuiJsonRpcClient["getCoins"]>> = await client.getCoins({
            owner: ownerNorm,
            coinType,
            cursor,
        });
        for (const c of page.data) {
            coinObjectIds.push(c.coinObjectId);
            totalBalance += BigInt(c.balance);
            if (totalBalance >= minBalance) return { coinObjectIds, totalBalance };
        }
        if (!page.hasNextPage) break;
        cursor = page.nextCursor ?? null;
    }
    throw new Error("Insufficient FC (on-chain) for this price.");
}

function asVersionString(v: unknown): string | null {
    if (typeof v === "string" && v.length > 0) return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(Math.trunc(v));
    return null;
}

/** Supports Mysten-normalized owners and raw RPC `{"Shared":{"initial_shared_version":...}}`. */
function extractInitialSharedVersionForSharedObject(owner: unknown): string | null {
    if (!owner || typeof owner !== "object") return null;
    const o = owner as Record<string, unknown>;

    if (o.$kind === "Shared" && o.Shared && typeof o.Shared === "object") {
        const s = o.Shared as Record<string, unknown>;
        return asVersionString(s.initialSharedVersion ?? s.initial_shared_version);
    }
    if (o.$kind === "ConsensusAddressOwner" && o.ConsensusAddressOwner && typeof o.ConsensusAddressOwner === "object") {
        const c = o.ConsensusAddressOwner as Record<string, unknown>;
        return asVersionString(c.startVersion ?? c.start_version);
    }
    // Raw JSON-RPC (no $kind): { "Shared": { "initial_shared_version": "123" } }
    if (o.Shared && typeof o.Shared === "object") {
        const s = o.Shared as Record<string, unknown>;
        return asVersionString(s.initial_shared_version ?? s.initialSharedVersion);
    }
    if (o.ConsensusAddressOwner && typeof o.ConsensusAddressOwner === "object") {
        const c = o.ConsensusAddressOwner as Record<string, unknown>;
        return asVersionString(c.start_version ?? c.startVersion);
    }
    return null;
}

/**
 * `Marketplace` is a shared object; pass `&mut Marketplace` using explicit shared ref + mutable.
 * Also validates the id matches `packageId::farm_marketplace::Marketplace` (avoids TypeMismatch on wrong env id).
 */
export async function addMarketplaceMutableToTransaction(
    client: SuiJsonRpcClient,
    tx: Transaction,
    packageId: string,
    marketplaceObjectId: string,
) {
    const pkg = normalizeSuiAddress(packageId.trim());
    const mid = normalizeSuiAddress(marketplaceObjectId.trim());
    const { data: d } = await client.getObject({
        id: mid,
        options: { showType: true, showOwner: true },
    });
    if (!d?.type) {
        throw new Error(
            `Marketplace object not found (${mid}). Set VITE_FANTASTIC_FARM_MARKETPLACE_OBJECT_ID to the shared Marketplace from the same publish as the package.`,
        );
    }
    const m = d.type.match(/^(0x[0-9a-fA-F]+)::farm_marketplace::Marketplace$/);
    if (!m) {
        let hint =
            "\nIn the `sui client publish` transaction, open Created Objects and use the id whose type is exactly `<your_package>::farm_marketplace::Marketplace` (Owner: Shared).";
        if (d.type.includes("::coin::CoinMetadata")) {
            hint =
                "\nThis id is **CoinMetadata** (FC token icon/name). That is not the marketplace. Find the object typed `...::farm_marketplace::Marketplace` in the same publish tx.";
        } else if (d.type.includes("farm_registry::FarmRegistry")) {
            hint = "\nThis id is **FarmRegistry**. You need the other shared object **Marketplace** from the same publish.";
        } else if (d.type.includes("::package::Package")) {
            hint = "\nThis id is the **Package** itself. Use a child object from Created Objects, not the package id.";
        }
        throw new Error(
            `Wrong object type for marketplace (expected <PACKAGE>::farm_marketplace::Marketplace).\nGot: ${d.type}.${hint}`,
        );
    }
    const objectPkg = normalizeSuiAddress(m[1]);
    if (objectPkg !== pkg) {
        throw new Error(
            `Marketplace object belongs to package ${objectPkg} but VITE_FANTASTIC_FARM_PACKAGE_ID is ${pkg}. Re-copy all VITE_FANTASTIC_FARM_* ids from a single sui publish output.`,
        );
    }
    /** Parsed owner: SDK-normalized (`$kind`) or raw JSON-RPC (`Shared.initial_shared_version`). */
    const owner = d.owner;
    const initialSharedVersion = extractInitialSharedVersionForSharedObject(owner);
    if (!initialSharedVersion) {
        throw new Error(
            `Object ${mid} has owner ${JSON.stringify(owner)} — could not read initial shared version. Wrong object or RPC shape?`,
        );
    }
    return tx.sharedObjectRef({
        objectId: mid,
        initialSharedVersion,
        mutable: true,
    });
}

/**
 * `FcMintRegistry` is shared; pass `&mut FcMintRegistry` for `buy_fc_with_sui`.
 * Validates type `<PACKAGE>::fantastic_coin::FcMintRegistry`.
 */
export async function addFcMintRegistryMutableToTransaction(
    client: SuiJsonRpcClient,
    tx: Transaction,
    packageId: string,
    fcMintRegistryObjectId: string,
) {
    const pkg = normalizeSuiAddress(packageId.trim());
    const rid = normalizeSuiAddress(fcMintRegistryObjectId.trim());
    const { data: d } = await client.getObject({
        id: rid,
        options: { showType: true, showOwner: true },
    });
    if (!d?.type) {
        throw new Error(
            `FcMintRegistry object not found (${rid}). Set VITE_FANTASTIC_FARM_FC_MINT_REGISTRY_OBJECT_ID to the shared FcMintRegistry from the same publish as the package.`,
        );
    }
    const m = d.type.match(/^(0x[0-9a-fA-F]+)::fantastic_coin::FcMintRegistry$/);
    if (!m) {
        let hint =
            "\nIn the `sui client publish` transaction, open Created Objects and use the id whose type ends with `::fantastic_coin::FcMintRegistry` (Owner: Shared).";
        if (d.type.includes("::coin::TreasuryCap")) {
            hint =
                "\nThis id is an **owned TreasuryCap** from an older package. Republish the updated `fantastic_coin` (shared `FcMintRegistry`) and use that object's id instead.";
        } else if (d.type.includes("::coin::CoinMetadata")) {
            hint =
                "\nThis id is **CoinMetadata** (FC token). You need **FcMintRegistry** from the same publish.";
        }
        throw new Error(
            `Wrong object type for FC mint registry (expected <PACKAGE>::fantastic_coin::FcMintRegistry).\nGot: ${d.type}.${hint}`,
        );
    }
    const objectPkg = normalizeSuiAddress(m[1]);
    if (objectPkg !== pkg) {
        throw new Error(
            `FcMintRegistry belongs to package ${objectPkg} but VITE_FANTASTIC_FARM_PACKAGE_ID is ${pkg}. Re-copy all VITE_FANTASTIC_FARM_* ids from a single sui publish output.`,
        );
    }
    const owner = d.owner;
    const initialSharedVersion = extractInitialSharedVersionForSharedObject(owner);
    if (!initialSharedVersion) {
        throw new Error(
            `Object ${rid} has owner ${JSON.stringify(owner)} — could not read initial shared version. Wrong object or RPC shape?`,
        );
    }
    return tx.sharedObjectRef({
        objectId: rid,
        initialSharedVersion,
        mutable: true,
    });
}

export async function buildListFarmProductTransaction(
    client: SuiJsonRpcClient,
    packageId: string,
    marketplaceObjectId: string,
    farmProductNftObjectId: string,
    /** `FarmProductNft.tier` 0=silver … 4=rainbow — must match on-chain floor in Move. */
    tierIndex: number,
    priceMist: bigint,
): Promise<Transaction> {
    const min = marketplaceListingMinPriceMist(tierIndex);
    if (priceMist < min) {
        throw new Error(
            `Listing price must be at least ${formatFcFromMist(String(min))} FC for this tier (on-chain floor = k × design tier FC × econ scale; see @fantastic-farm/shared).`,
        );
    }
    const tx = new Transaction();
    const market = await addMarketplaceMutableToTransaction(client, tx, packageId, marketplaceObjectId);
    tx.moveCall({
        target: `${packageId.trim()}::farm_marketplace::list_farm_product`,
        arguments: [market, tx.object(farmProductNftObjectId), tx.pure.u64(priceMist)],
    });
    return tx;
}

export async function buildBuyFarmProductListingTransaction(
    client: SuiJsonRpcClient,
    packageId: string,
    marketplaceObjectId: string,
    listingId: bigint,
    coinObjectIds: string[],
): Promise<Transaction> {
    if (coinObjectIds.length === 0) throw new Error("No FC coins to pay with");
    const tx = new Transaction();
    const market = await addMarketplaceMutableToTransaction(client, tx, packageId, marketplaceObjectId);
    const primary = tx.object(coinObjectIds[0]);
    if (coinObjectIds.length > 1) {
        tx.mergeCoins(
            primary,
            coinObjectIds.slice(1).map((id) => tx.object(id)),
        );
    }
    tx.moveCall({
        target: `${packageId.trim()}::farm_marketplace::buy_farm_product_listing`,
        arguments: [market, tx.pure.u64(listingId), primary],
    });
    return tx;
}

export async function buildCancelListingTransaction(
    client: SuiJsonRpcClient,
    packageId: string,
    marketplaceObjectId: string,
    listingId: bigint,
): Promise<Transaction> {
    const tx = new Transaction();
    const market = await addMarketplaceMutableToTransaction(client, tx, packageId, marketplaceObjectId);
    tx.moveCall({
        target: `${packageId.trim()}::farm_marketplace::cancel_listing`,
        arguments: [market, tx.pure.u64(listingId)],
    });
    return tx;
}

/**
 * FC → SUI (`fantastic_coin::sell_fc_for_sui`): đốt FC, trả SUI từ `sui_reserve` (10% phí studio, 90% cho user).
 * Nếu các coin gộp có dư so với `fcAmountMist`, remainder FC chuyển lại `senderAddress`.
 */
export async function buildSellFcForSuiTransaction(
    client: SuiJsonRpcClient,
    packageId: string,
    fcMintRegistryObjectId: string,
    senderAddress: string,
    fcAmountMist: bigint,
    coinObjectIds: string[],
    aggregatedBalance: bigint,
): Promise<Transaction> {
    if (fcAmountMist <= 0n) throw new Error("FC amount must be positive");
    if (coinObjectIds.length === 0) throw new Error("No FC coins selected");
    if (aggregatedBalance < fcAmountMist) throw new Error("Aggregated FC balance is less than sell amount.");
    const tx = new Transaction();
    const registry = await addFcMintRegistryMutableToTransaction(
        client,
        tx,
        packageId,
        fcMintRegistryObjectId,
    );
    const primary = tx.object(coinObjectIds[0]);
    if (coinObjectIds.length > 1) {
        tx.mergeCoins(
            primary,
            coinObjectIds.slice(1).map((id) => tx.object(id)),
        );
    }
    const [sellCoin] = tx.splitCoins(primary, [fcAmountMist]);
    tx.moveCall({
        target: `${packageId.trim()}::fantastic_coin::sell_fc_for_sui`,
        arguments: [registry, sellCoin],
    });
    if (aggregatedBalance > fcAmountMist) {
        tx.transferObjects([primary], tx.pure.address(normalizeSuiAddress(senderAddress.trim())));
    }
    return tx;
}

/**
 * SUI → FC (`fantastic_coin::buy_fc_with_sui`): 5% SUI fee to studio, net SUI to `sui_reserve`, `net` FC minted to sender.
 * `payment` is split from the gas coin — leave enough SUI for gas + amount.
 * Uses shared `FcMintRegistry` (any signer; TreasuryCap is inside the registry).
 */
export async function buildBuyFcWithSuiTransaction(
    client: SuiJsonRpcClient,
    packageId: string,
    fcMintRegistryObjectId: string,
    suiAmountMist: bigint,
): Promise<Transaction> {
    if (suiAmountMist <= 0n) throw new Error("SUI amount must be positive");
    const tx = new Transaction();
    const registry = await addFcMintRegistryMutableToTransaction(
        client,
        tx,
        packageId,
        fcMintRegistryObjectId,
    );
    const [payment] = tx.splitCoins(tx.gas, [suiAmountMist]);
    tx.moveCall({
        target: `${packageId.trim()}::fantastic_coin::buy_fc_with_sui`,
        arguments: [registry, payment],
    });
    return tx;
}

/** `egg_shop::buy_egg_with_fc` — pay exact FC mist; `EggNft` minted to sender. */
export async function buildBuyEggWithFcTransaction(
    client: SuiJsonRpcClient,
    params: {
        packageId: string;
        senderAddress: string;
        coinType: string;
        speciesCode: number;
        priceMist: bigint;
    },
): Promise<Transaction> {
    const { packageId, senderAddress, coinType, speciesCode, priceMist } = params;
    if (speciesCode < 0 || speciesCode > 3) throw new Error("speciesCode must be 0–3");
    if (priceMist <= 0n) throw new Error("price must be positive");
    const pkg = normalizeSuiAddress(packageId.trim());
    const { coinObjectIds, totalBalance } = await pickFcCoinObjects(
        client,
        senderAddress,
        coinType,
        priceMist,
    );
    const tx = new Transaction();
    const primary = tx.object(coinObjectIds[0]);
    if (coinObjectIds.length > 1) {
        tx.mergeCoins(
            primary,
            coinObjectIds.slice(1).map((id) => tx.object(id)),
        );
    }
    const [payCoin] = tx.splitCoins(primary, [priceMist]);
    tx.moveCall({
        target: `${pkg}::egg_shop::buy_egg_with_fc`,
        arguments: [payCoin, tx.pure.u8(speciesCode)],
    });
    if (totalBalance > priceMist) {
        tx.transferObjects([primary], tx.pure.address(normalizeSuiAddress(senderAddress.trim())));
    }
    return tx;
}

/** `farm_nft::burn_egg_for_hatch` — destroys `EggNft`; then call BE `POST /game/hatch-onchain` with tx digest. */
export function buildBurnEggForHatchTransaction(params: { packageId: string; eggObjectId: string }): Transaction {
    const pkg = normalizeSuiAddress(params.packageId.trim());
    const eggId = normalizeSuiAddress(params.eggObjectId.trim());
    const tx = new Transaction();
    tx.moveCall({
        target: `${pkg}::farm_nft::burn_egg_for_hatch`,
        arguments: [tx.object(eggId)],
    });
    return tx;
}
