import { useSignAndExecuteTransaction, useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { getOnchainIdsFromEnv } from "../config/onchain";
import {
    ECONOMY_REFRESH_EVENT,
    dispatchEconomyRefresh,
} from "../hooks/useHeaderEconomy";
import { mapApiErrorMessage } from "../services/apiClient";
import { getStoredAuth } from "../services/authStorage";
import { convertOnChainItem, hatchEgg, loadGameData, sellItems } from "../services/gameService";
import {
    buildMintFarmProductTransaction,
    finalizeFarmProductMintAfterWalletSubmit,
    requestMintFarmProductProof,
} from "../services/onchainMintService";
import type { GameLoadData, PendingFarmProductMint } from "../types/api";

type PopulatedItem = {
    itemKey?: string;
    name?: string;
    kind?: string;
    sellGold?: number;
    fcValue?: number;
};

type InvSlot = {
    quantity?: number;
    itemId?: PopulatedItem | string;
};

function slotLabel(slot: InvSlot): { key: string; name: string; qty: number; meta: PopulatedItem | null } {
    const qty = slot.quantity ?? 0;
    const raw = slot.itemId;
    if (raw && typeof raw === "object" && "itemKey" in raw) {
        const m = raw as PopulatedItem;
        return { key: m.itemKey ?? "?", name: m.name ?? m.itemKey ?? "Item", qty, meta: m };
    }
    return { key: "?", name: "Item", qty, meta: null };
}

export default function InventoryView() {
    const location = useLocation();
    const account = useCurrentAccount();
    const suiClient = useSuiClient();
    const { mutateAsync: signAndExecute, isPending: walletBusy } = useSignAndExecuteTransaction();
    const onchainEnv = getOnchainIdsFromEnv();
    const [data, setData] = useState<GameLoadData | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    /** Bumps when header economy refreshes (e.g. after Gameplay wallet sign-in) so we reload inventory. */
    const [sessionEpoch, setSessionEpoch] = useState(0);

    const reload = useCallback(async () => {
        setError("");
        try {
            const d = await loadGameData();
            setData(d);
        } catch (e: unknown) {
            setError(mapApiErrorMessage(e, "Failed to load inventory."));
        }
    }, []);

    useEffect(() => {
        const onSession = () => setSessionEpoch((n) => n + 1);
        window.addEventListener(ECONOMY_REFRESH_EVENT, onSession);
        return () => window.removeEventListener(ECONOMY_REFRESH_EVENT, onSession);
    }, []);

    useEffect(() => {
        if (location.pathname !== "/inventory") return;
        if (!getStoredAuth()?.accessToken) {
            setData(null);
            setError("");
            return;
        }
        void reload();
    }, [location.pathname, sessionEpoch, reload]);

    const onSell = async (itemKey: string) => {
        setBusy(true);
        setError("");
        try {
            await sellItems(itemKey, 1);
            dispatchEconomyRefresh();
            await reload();
        } catch (e: unknown) {
            setError(mapApiErrorMessage(e, "Sell failed."));
        } finally {
            setBusy(false);
        }
    };

    const onConvert = async (itemKey: string) => {
        setBusy(true);
        setError("");
        try {
            await convertOnChainItem(itemKey, 1);
            dispatchEconomyRefresh();
            await reload();
        } catch (e: unknown) {
            setError(mapApiErrorMessage(e, "Convert failed."));
        } finally {
            setBusy(false);
        }
    };

    const onMintFarmProduct = async (p: PendingFarmProductMint) => {
        if (!onchainEnv.ready) {
            setError("On-chain not configured — set VITE package/registry IDs.");
            return;
        }
        if (!account) {
            setError("Connect wallet to mint.");
            return;
        }
        setBusy(true);
        setError("");
        try {
            const proof = await requestMintFarmProductProof(p.id);
            const viteDrift =
                onchainEnv.ready &&
                (proof.packageId.trim() !== onchainEnv.packageId.trim() ||
                    proof.registryObjectId.trim() !== onchainEnv.registryId.trim());
            if (viteDrift) {
                console.warn(
                    "[mint farm product] VITE_* on-chain IDs differ from BE proof — PTB uses proof (restart `npm run dev` after editing .env).",
                    { proofPackage: proof.packageId, vitePackage: onchainEnv.packageId },
                );
            }
            const tx = buildMintFarmProductTransaction(proof);
            const execRes = await signAndExecute({ transaction: tx });
            await finalizeFarmProductMintAfterWalletSubmit(suiClient, execRes, p.id);
            dispatchEconomyRefresh();
            await reload();
            setError("");
        } catch (e: unknown) {
            setError(mapApiErrorMessage(e, "Mint farm product failed."));
        } finally {
            setBusy(false);
        }
    };

    const onHatch = async (eggItemKey: string) => {
        setBusy(true);
        setError("");
        try {
            await hatchEgg(eggItemKey);
            dispatchEconomyRefresh();
            await reload();
        } catch (e: unknown) {
            setError(mapApiErrorMessage(e, "Hatch failed."));
        } finally {
            setBusy(false);
        }
    };

    const slots = (data?.inventory ?? []) as InvSlot[];
    const inventoryAuthed = Boolean(getStoredAuth()?.accessToken);

    return (
        <div className="flex min-h-[420px] flex-col gap-4 rounded-xl bg-[var(--surface)] p-6 text-[var(--text)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h2 className="text-xl font-semibold">Inventory</h2>
                    <p className="mt-1 text-sm text-[var(--muted)]">
                        Sell off-chain drops for gold, hatch eggs. GDD §5.2 rare drops appear below — mint each as a Sui{" "}
                        <code className="text-xs">FarmProductNft</code> (wallet gas).
                    </p>
                </div>
                <button
                    type="button"
                    disabled={busy || walletBusy}
                    onClick={() => void reload()}
                    className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium hover:brightness-110 disabled:opacity-50"
                >
                    Refresh
                </button>
            </div>
            {error ? <p className="text-sm text-rose-500">{error}</p> : null}
            {location.pathname === "/inventory" && !inventoryAuthed ? (
                <p className="text-sm text-[var(--muted)]">
                    To see items (e.g. <span className="font-medium text-[var(--text)]">Starter egg</span> on new
                    accounts), open <span className="font-medium text-[var(--text)]">Gameplay</span>, connect your
                    wallet, and finish sign-in — then return here or tap Refresh.
                </p>
            ) : null}
            {data?.progression ? (
                <p className="text-xs text-[var(--muted)]">
                    Level {data.progression.level} · storage slots {data.progression.storageSlots} · EXP{" "}
                    {data.progression.exp}
                </p>
            ) : null}

            {data?.progression?.farmDropQueueCapacity != null ? (
                <p className="mt-2 text-[11px] leading-snug text-[var(--muted)]">
                    Hàng chờ đồ trên farm (FIFO · tối đa <span className="text-[var(--text)]">{data.progression.farmDropQueueCapacity}</span>):{" "}
                    <span className="font-medium text-[var(--text)]">{data?.farmSpawnQueue?.length ?? 0}</span> đang chờ.
                    Thu từ đây ở tab <span className="font-medium text-[var(--text)]">Gameplay</span> (&quot;Collect&quot;).
                </p>
            ) : null}

            {(data?.pendingFarmProductMints?.length ?? 0) > 0 ? (
                <div className="rounded-xl border border-amber-900/40 bg-amber-950/20 p-4">
                    <h3 className="text-sm font-semibold text-amber-100">Rare on-chain drops (queued)</h3>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                        One NFT per drop. Mint consumes the queue entry (proof TTL ~5 min).
                    </p>
                    <ul className="mt-3 grid gap-2">
                        {(data?.pendingFarmProductMints ?? []).map((p) => (
                            <li
                                key={p.id}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm"
                            >
                                <span>
                                    <span className="font-medium">{p.label ?? p.tierId}</span>
                                    {p.fcValue != null ? (
                                        <span className="ml-2 text-xs text-[var(--muted)]">~{p.fcValue} FC value</span>
                                    ) : null}
                                </span>
                                <button
                                    type="button"
                                    disabled={busy || walletBusy || !account}
                                    onClick={() => void onMintFarmProduct(p)}
                                    className="rounded-md bg-amber-800/90 px-2 py-1 text-xs text-amber-50 hover:bg-amber-700 disabled:opacity-50"
                                >
                                    {walletBusy ? "Wallet…" : "Mint on Sui"}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            <ul className="grid gap-2 sm:grid-cols-2">
                {slots.length === 0 ? (
                    <li className="text-sm text-[var(--muted)]">
                        {inventoryAuthed
                            ? "No items yet. New wallets get a Starter egg once, right after first successful Gameplay sign-in (then hatch it from here). You can also collect drops in Unity or via dev collect on Gameplay."
                            : "Sign in via Gameplay to load your inventory."}
                    </li>
                ) : (
                    slots.map((slot, i) => {
                        const { key, name, qty, meta } = slotLabel(slot);
                        const canSell = (meta?.sellGold ?? 0) > 0;
                        const canConvert = meta?.kind === "on";
                        const canHatch = meta?.kind === "egg";
                        return (
                            <li
                                key={`${key}-${i}`}
                                className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
                            >
                                <div className="flex justify-between gap-2 text-sm font-semibold">
                                    <span>{name}</span>
                                    <span className="text-[var(--muted)]">×{qty}</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {canSell ? (
                                        <button
                                            type="button"
                                            disabled={busy || walletBusy}
                                            onClick={() => void onSell(key)}
                                            className="rounded-md bg-emerald-900/80 px-2 py-1 text-xs text-emerald-100 hover:bg-emerald-800 disabled:opacity-50"
                                        >
                                            Sell (+{meta?.sellGold}g)
                                        </button>
                                    ) : null}
                                    {canConvert ? (
                                        <button
                                            type="button"
                                            disabled={busy || walletBusy}
                                            onClick={() => void onConvert(key)}
                                            className="rounded-md bg-indigo-900/80 px-2 py-1 text-xs text-indigo-100 hover:bg-indigo-800 disabled:opacity-50"
                                        >
                                            → FC (+{meta?.fcValue})
                                        </button>
                                    ) : null}
                                    {canHatch ? (
                                        <button
                                            type="button"
                                            disabled={busy || walletBusy}
                                            onClick={() => void onHatch(key)}
                                            className="rounded-md bg-amber-900/80 px-2 py-1 text-xs text-amber-100 hover:bg-amber-800 disabled:opacity-50"
                                        >
                                            Hatch
                                        </button>
                                    ) : null}
                                </div>
                            </li>
                        );
                    })
                )}
            </ul>
        </div>
    );
}
