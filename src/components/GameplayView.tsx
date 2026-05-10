import {
    useSignAndExecuteTransaction,
    useCurrentAccount,
    useCurrentWallet,
    useDisconnectWallet,
    useResolveSuiNSName,
    useSuiClient,
} from "@mysten/dapp-kit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { REQUIRED_SUI_CHAIN } from "../config/chain";
import { getOnchainIdsFromEnv } from "../config/onchain";
import {
    feedChoiceLabels,
    formatDurationMs,
    goldShopRows,
    hungerBracketLabel,
    speciesSpawnHours,
    spawnMultiplierLine,
} from "../gameplay/gddUi";
import EggNftShopPanel from "./EggNftShopPanel";
import { SatietyBar } from "./SatietyBar";
import { useUnityGameAuth } from "../hooks/useUnityGameAuth";
import { dispatchEconomyRefresh } from "../hooks/useHeaderEconomy";
import { mapApiErrorMessage } from "../services/apiClient";
import { clearClientGameSession } from "../services/clientSessionClear";
import {
    buyFeed,
    collectItems,
    convertOnChainItem,
    feedAnimal,
    hatchEgg,
    loadGameData,
    sellItems,
    syncFarm,
} from "../services/gameService";
import { emitGameUpdated, emitWalletAndGame } from "../services/gameplayUnityBridge";
import {
    buildMintFarmProductTransaction,
    finalizeFarmProductMintAfterWalletSubmit,
    requestMintFarmProductProof,
} from "../services/onchainMintService";
import type { FarmSpawnQueueSlot, GameLoadData } from "../types/api";

const shortenAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

type PopulatedItem = { itemKey?: string; name?: string; kind?: string; sellGold?: number; fcValue?: number };
type InvSlot = { quantity?: number; itemId?: PopulatedItem | string };

function slotLabel(slot: InvSlot): { key: string; name: string; qty: number; meta: PopulatedItem | null } {
    const qty = slot.quantity ?? 0;
    const raw = slot.itemId;
    if (raw && typeof raw === "object" && "itemKey" in raw) {
        const m = raw as PopulatedItem;
        return { key: m.itemKey ?? "?", name: m.name ?? m.itemKey ?? "Item", qty, meta: m };
    }
    return { key: "?", name: "Item", qty, meta: null };
}

type AnimalRow = {
    _id?: string;
    displayName?: string;
    species?: string;
    satiety?: number;
    isStarter?: boolean;
    nextSpawnAt?: string;
};
type GameUserSnapshot = { gold?: number; fcBalance?: number };

/**
 * Full farm loop in React (buttons only). Emits the same bridge payloads Unity can consume later.
 */
export default function GameplayView() {
    const currentWallet = useCurrentWallet();
    const gameAuth = useUnityGameAuth();
    const {
        account,
        authState,
        setAuthState,
        errorMessage,
        setErrorMessage,
        setSignedPayload,
        isReturningWithKnownWallet,
        canRenderGame,
        handleContinueWithConnectedWallet,
    } = gameAuth;

    const [gameSnapshot, setGameSnapshot] = useState<GameLoadData | null>(null);
    const [localError, setLocalError] = useState("");
    const [busy, setBusy] = useState(false);
    const { data: suiNsName } = useResolveSuiNSName(account?.address);
    const { mutateAsync: disconnectWallet, isPending: isDisconnecting } = useDisconnectWallet();
    const currentAccount = useCurrentAccount();
    const { mutateAsync: signAndExecute, isPending: walletTxPending } = useSignAndExecuteTransaction();
    const suiClient = useSuiClient();
    const onchainEnv = getOnchainIdsFromEnv();
    const goldShop = goldShopRows();

    const [nowMs, setNowMs] = useState(() => Date.now());

    useEffect(() => {
        const id = window.setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    const refreshGame = useCallback(
        async (source: string) => {
            setLocalError("");
            try {
                const d = await loadGameData();
                setGameSnapshot(d);
                if (account?.address && authState === "in-game") {
                    emitGameUpdated(source, d);
                }
                return d;
            } catch (e: unknown) {
                setLocalError(mapApiErrorMessage(e, "Load failed."));
                throw e;
            }
        },
        [account?.address, authState],
    );

    const spawnPollLock = useRef(false);
    const lastSpawnPollAt = useRef(0);

    /** When server time passes nextSpawnAt, processFarm only runs on the next /game/load — poll or refetch on due. */
    useEffect(() => {
        if (authState !== "in-game" || !gameSnapshot || busy) return;
        const list = (gameSnapshot.animals ?? []) as AnimalRow[];
        const anySpawnDue = list.some((a) => {
            if (!a.nextSpawnAt) return false;
            const t = new Date(a.nextSpawnAt).getTime();
            return Number.isFinite(t) && t <= nowMs;
        });
        if (!anySpawnDue) return;
        const t0 = Date.now();
        if (t0 - lastSpawnPollAt.current < 2500 || spawnPollLock.current) return;
        lastSpawnPollAt.current = t0;
        spawnPollLock.current = true;
        void refreshGame("spawn_due")
            .catch(() => {})
            .finally(() => {
                spawnPollLock.current = false;
            });
    }, [authState, gameSnapshot, nowMs, busy, refreshGame]);

    useEffect(() => {
        if (authState !== "in-game" || !gameSnapshot?.fastTest) return;
        const id = window.setInterval(() => {
            void refreshGame("fast_test_poll").catch(() => {});
        }, 12_000);
        return () => clearInterval(id);
    }, [authState, gameSnapshot?.fastTest, refreshGame]);

    useEffect(() => {
        const onVis = () => {
            if (document.visibilityState !== "visible") return;
            if (authState !== "in-game" || !account?.address) return;
            void refreshGame("visibility").catch(() => {});
        };
        document.addEventListener("visibilitychange", onVis);
        return () => document.removeEventListener("visibilitychange", onVis);
    }, [authState, account?.address, refreshGame]);

    useEffect(() => {
        if (authState !== "loading-game" || !account?.address) {
            if (authState === "idle" || authState === "choose-wallet" || authState === "signing") {
                setGameSnapshot(null);
            }
            return;
        }
        let cancelled = false;
        setGameSnapshot(null);
        loadGameData()
            .then((d) => {
                if (!cancelled) setGameSnapshot(d);
            })
            .catch((e: unknown) => {
                if (!cancelled) {
                    setErrorMessage(mapApiErrorMessage(e, "Game load failed."));
                    setAuthState("error");
                }
            });
        return () => {
            cancelled = true;
        };
    }, [authState, account?.address, setAuthState, setErrorMessage]);

    useEffect(() => {
        if (authState !== "loading-game" || !account?.address || !gameSnapshot) return;
        setAuthState("in-game");
        emitWalletAndGame(account.address, gameSnapshot);
    }, [authState, account?.address, gameSnapshot, setAuthState]);

    const afterMutation = useCallback(
        async (source: string, preloaded?: GameLoadData | null) => {
            if (preloaded) {
                setGameSnapshot(preloaded);
                if (account?.address && authState === "in-game") {
                    emitGameUpdated(source, preloaded);
                }
            }
            try {
                await refreshGame(source);
            } finally {
                dispatchEconomyRefresh();
            }
        },
        [account?.address, authState, refreshGame],
    );

    const displayWalletName = useMemo(() => {
        if (currentWallet.connectionStatus !== "connected") return "Wallet";
        return currentWallet.currentWallet.name;
    }, [currentWallet]);

    const displayIdentity = useMemo(() => {
        if (!account?.address) return "";
        return suiNsName ?? shortenAddress(account.address);
    }, [account?.address, suiNsName]);

    const handleLogoutAndSwitchWallet = async () => {
        try {
            setErrorMessage("");
            setLocalError("");
            clearClientGameSession();
            setGameSnapshot(null);
            await disconnectWallet();
            setSignedPayload(null);
            setAuthState("idle");
        } catch (error) {
            setAuthState("error");
            setErrorMessage(mapApiErrorMessage(error, "Failed to disconnect wallet."));
        }
    };

    const animals = (gameSnapshot?.animals ?? []) as AnimalRow[];
    const slots = (gameSnapshot?.inventory ?? []) as InvSlot[];
    const gameUser = gameSnapshot?.user as GameUserSnapshot | undefined;

    if (!canRenderGame) {
        return (
            <div className="flex min-h-[560px] items-center justify-center text-[var(--text)]">
                <div className="w-full max-w-[420px] rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
                    <h2 className="mb-2 text-2xl font-semibold">Gameplay (React)</h2>
                    <p className="mb-4 text-sm text-[var(--muted)]">
                        Connect wallet on {REQUIRED_SUI_CHAIN}. Unity can be plugged in later — logic runs here.
                    </p>
                    {account && (
                        <div className="mb-3">
                            <p className="text-sm font-semibold">{displayIdentity}</p>
                            <p className="text-xs text-[var(--muted)]">
                                {displayWalletName} • {shortenAddress(account.address)}
                            </p>
                        </div>
                    )}
                    {(errorMessage || localError) && (
                        <p className="mb-3 text-sm text-rose-500">{errorMessage || localError}</p>
                    )}
                    {authState === "signing" && account && (
                        <div className="flex justify-center p-4">
                            <div className="animate-pulse text-sm text-[var(--muted)]">Sign message in wallet…</div>
                        </div>
                    )}
                    {authState === "verifying" && (
                        <div className="flex justify-center p-4">
                            <div className="animate-pulse text-sm text-[var(--muted)]">Verifying…</div>
                        </div>
                    )}
                    {(authState === "choose-wallet" || authState === "error") && account ? (
                        <div className="grid gap-2.5">
                            <button
                                type="button"
                                onClick={handleContinueWithConnectedWallet}
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm hover:brightness-110"
                            >
                                {authState === "error"
                                    ? "Try again"
                                    : isReturningWithKnownWallet
                                      ? "Continue"
                                      : "Sign in"}
                            </button>
                            <button
                                type="button"
                                disabled={isDisconnecting}
                                onClick={() => void handleLogoutAndSwitchWallet()}
                                className="w-full rounded-lg border border-red-900 bg-red-950 px-3 py-2.5 text-sm text-red-200 hover:bg-red-900/70 disabled:opacity-70"
                            >
                                {isDisconnecting ? "Disconnecting…" : "Disconnect wallet"}
                            </button>
                        </div>
                    ) : !account && authState !== "signing" && authState !== "verifying" ? (
                        <p className="text-sm text-[var(--muted)]">
                            Use <span className="font-semibold text-[var(--text)]">Connect Wallet</span> in the header.
                        </p>
                    ) : null}
                </div>
            </div>
        );
    }

    if (authState === "loading-game" && !gameSnapshot) {
        return (
            <div className="flex min-h-[400px] items-center justify-center text-sm text-[var(--muted)]">
                <div className="animate-pulse">Loading farm…</div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4 text-[var(--text)]">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <h2 className="text-lg font-semibold">State</h2>
                <p className="mt-1 text-xs text-[var(--muted)]">
                    Bridge: CustomEvent <code className="text-[10px]">fantastic-farm:gameplay</code> +{" "}
                    <code className="text-[10px]">postMessage</code> channel{" "}
                    <code className="text-[10px]">fantastic-farm-gameplay</code>.
                </p>
                {gameSnapshot?.progression ? (
                    <p className="mt-2 text-sm">
                        Lv {gameSnapshot.progression.level} · EXP {gameSnapshot.progression.exp} · storage{" "}
                        {gameSnapshot.progression.storageSlots}
                        {gameUser?.gold !== undefined ? ` · gold ${gameUser.gold}` : null}
                        {gameUser?.fcBalance !== undefined ? ` · FC (off-chain) ${gameUser.fcBalance}` : null}
                    </p>
                ) : null}
                {gameSnapshot?.progression ? (
                    <p className="mt-1 text-xs text-[var(--muted)]">
                        {spawnMultiplierLine(gameSnapshot.progression.storageSlots)}
                    </p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                            setBusy(true);
                            void refreshGame("manual_refresh").finally(() => setBusy(false));
                        }}
                        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:brightness-110 disabled:opacity-50"
                    >
                        Refresh /game/load
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                            setBusy(true);
                            void syncFarm()
                                .then((res) => afterMutation("sync_farm", res?.data))
                                .catch((e: unknown) => setLocalError(mapApiErrorMessage(e, "Sync failed.")))
                                .finally(() => setBusy(false));
                        }}
                        className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:brightness-110 disabled:opacity-50"
                    >
                        POST /game/sync
                    </button>
                </div>
                {localError ? <p className="mt-2 text-xs text-rose-500">{localError}</p> : null}
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <h3 className="text-sm font-semibold">Shop (gold)</h3>
                <p className="mt-1 text-xs text-[var(--muted)]">Prices from shared GDD constants (same as BE).</p>
                {gameSnapshot?.fastTest ? (
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                        Fast test: nếu BE bật <code className="text-[10px]">FANTASTIC_FARM_TEST_FREE_SHOP</code> thì giá
                        shop = 0 — vàng trong DB sẽ không đổi khi mua.
                    </p>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                    {goldShop.map((row) => (
                        <button
                            key={row.itemKey}
                            type="button"
                            disabled={busy}
                            onClick={() => {
                                setBusy(true);
                                void buyFeed(row.itemKey, 1)
                                    .then((res) => afterMutation(`buy_${row.itemKey}`, res?.data))
                                    .catch((e: unknown) => setLocalError(mapApiErrorMessage(e, "Buy failed.")))
                                    .finally(() => setBusy(false));
                            }}
                            className="rounded-md bg-[var(--card)] px-2 py-1.5 text-xs ring-1 ring-[var(--border)] hover:brightness-110 disabled:opacity-50"
                        >
                            Buy {row.label} ({row.goldCost}g)
                        </button>
                    ))}
                </div>
            </div>

            <EggNftShopPanel
                active={authState === "in-game"}
                onError={setLocalError}
                disableActions={busy}
                playerGold={gameUser?.gold}
                onHatchFinalize={(data) => void afterMutation("hatch_onchain", data)}
            />
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <h3 className="text-sm font-semibold">Animals</h3>
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                    Cho ăn: <span className="text-[var(--text)]">thường</span> dùng lúa mì hoặc cỏ;{" "}
                    <span className="text-[var(--text)]">vàng</span> dùng lúa mì vàng / cỏ vàng (buff on-chain theo
                    GDD, trừ đúng 1 item trong kho).
                </p>
                {animals.length === 0 ? (
                    <p className="mt-2 text-xs text-[var(--muted)]">No animals — hatch an egg from inventory.</p>
                ) : (
                    <ul className="mt-2 space-y-2">
                        {animals.map((a) => {
                            const feedLbl = feedChoiceLabels(a.species);
                            return (
                            <li
                                key={String(a._id)}
                                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-xs"
                            >
                                <div className="min-w-0 flex-1 space-y-1.5">
                                    <div>
                                        <span className="font-medium">{a.displayName ?? a.species}</span>
                                        <span className="text-[var(--muted)]"> · {a.species}</span>
                                    </div>
                                    <SatietyBar value={a.satiety ?? 0} />
                                    {a.nextSpawnAt ? (
                                        <span className="block text-[11px] text-[var(--muted)]">
                                            Next spawn:{" "}
                                            {formatDurationMs(
                                                new Date(a.nextSpawnAt).getTime() - nowMs,
                                            )}
                                            {gameSnapshot?.fastTest
                                                ? " · BE fast-test (spawn tỉ lệ theo sec/GDD-hour, không phải 4h thật)"
                                                : speciesSpawnHours(a.species) !== null
                                                  ? ` · base interval ${speciesSpawnHours(a.species)}h (GDD)`
                                                  : null}
                                        </span>
                                    ) : null}
                                    <span className="block text-[11px] text-[var(--muted)]">
                                        {hungerBracketLabel(a.satiety ?? 0)}
                                    </span>
                                </div>
                                <span className="flex shrink-0 flex-col gap-1 sm:flex-row">
                                    <button
                                        type="button"
                                        disabled={busy || !a._id}
                                        onClick={() => {
                                            if (!a._id) return;
                                            setBusy(true);
                                            void feedAnimal(a._id, false)
                                                .then((res) => afterMutation("feed", res?.data))
                                                .catch((e: unknown) =>
                                                    setLocalError(mapApiErrorMessage(e, "Feed failed.")),
                                                )
                                                .finally(() => setBusy(false));
                                        }}
                                        className="rounded bg-emerald-900/70 px-2 py-1 text-emerald-100 disabled:opacity-50"
                                    >
                                        {feedLbl.regular}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={busy || !a._id}
                                        onClick={() => {
                                            if (!a._id) return;
                                            setBusy(true);
                                            void feedAnimal(a._id, true)
                                                .then((res) => afterMutation("feed_premium", res?.data))
                                                .catch((e: unknown) =>
                                                    setLocalError(mapApiErrorMessage(e, "Premium feed failed.")),
                                                )
                                                .finally(() => setBusy(false));
                                        }}
                                        className="rounded bg-amber-900/70 px-2 py-1 text-amber-100 disabled:opacity-50"
                                    >
                                        {feedLbl.premium}
                                    </button>
                                </span>
                            </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <h3 className="text-sm font-semibold">Inventory</h3>
                {(gameSnapshot?.farmSpawnQueue?.length ?? 0) > 0 ? (
                    <div className="mt-2 rounded-lg border border-amber-900/40 bg-amber-950/20 p-2">
                        <p className="text-xs font-medium text-amber-100">
                            Đợi thu (FIFO · {(gameSnapshot?.farmSpawnQueue ?? []).length}/
                            {gameSnapshot?.progression?.farmDropQueueCapacity ?? 12})
                        </p>
                        <p className="mt-1 text-[10px] leading-snug text-amber-200/80">
                            Đầy giới hạn: drop mới vào và mục cũ nhất (thường hoặc hiếm chung một hàng) bị loại.
                        </p>
                        <ul className="mt-2 space-y-1">
                            {(gameSnapshot?.farmSpawnQueue ?? []).map((slot: FarmSpawnQueueSlot, idx: number) =>
                                slot.kind === "mint" ? (
                                    <li
                                        key={`mint-${slot.id}`}
                                        className="flex flex-wrap items-center justify-between gap-2 text-xs"
                                    >
                                        <span>Rare · {slot.label ?? slot.tierId}</span>
                                        <button
                                            type="button"
                                            disabled={busy || walletTxPending || !currentAccount || !onchainEnv.ready}
                                            onClick={() => {
                                                if (!onchainEnv.ready) {
                                                    setLocalError(
                                                        "Set VITE_FANTASTIC_FARM_PACKAGE_ID and REGISTRY_OBJECT_ID.",
                                                    );
                                                    return;
                                                }
                                                setBusy(true);
                                                void (async () => {
                                                    try {
                                                        const proof = await requestMintFarmProductProof(slot.id);
                                                        const viteDrift =
                                                            onchainEnv.ready &&
                                                            (proof.packageId.trim() !== onchainEnv.packageId.trim() ||
                                                                proof.registryObjectId.trim() !==
                                                                    onchainEnv.registryId.trim());
                                                        if (viteDrift) {
                                                            console.warn(
                                                                "[mint farm product] VITE_* differs from BE proof — PTB uses proof (restart `npm run dev` after .env changes).",
                                                                {
                                                                    proofPackage: proof.packageId,
                                                                    vitePackage: onchainEnv.packageId,
                                                                },
                                                            );
                                                        }
                                                        const tx = buildMintFarmProductTransaction(proof);
                                                        const execRes = await signAndExecute({
                                                            transaction: tx,
                                                        });
                                                        const finRes = await finalizeFarmProductMintAfterWalletSubmit(
                                                            suiClient,
                                                            execRes,
                                                            slot.id,
                                                        );
                                                        await afterMutation(
                                                            "mint_farm_product",
                                                            finRes?.data ?? undefined,
                                                        );
                                                    } catch (e: unknown) {
                                                        setLocalError(mapApiErrorMessage(e, "Mint failed."));
                                                    } finally {
                                                        setBusy(false);
                                                    }
                                                })();
                                            }}
                                            className="rounded bg-amber-800/90 px-2 py-1 text-amber-50 disabled:opacity-50"
                                        >
                                            Mint NFT
                                        </button>
                                    </li>
                                ) : (
                                    <li
                                        key={`off-${slot.queuedAt ?? "x"}-${idx}-${slot.itemKey}`}
                                        className="flex flex-wrap items-center justify-between gap-2 text-xs"
                                    >
                                        <span>
                                            {slot.itemKey} ×{slot.quantity}
                                        </span>
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => {
                                                setBusy(true);
                                                void collectItems({
                                                    itemKey: slot.itemKey,
                                                    quantity: slot.quantity,
                                                })
                                                    .then(() => afterMutation("collect"))
                                                    .catch((e: unknown) =>
                                                        setLocalError(mapApiErrorMessage(e, "Collect failed.")),
                                                    )
                                                    .finally(() => setBusy(false));
                                            }}
                                            className="rounded bg-emerald-800/90 px-2 py-1 text-emerald-50 disabled:opacity-50"
                                        >
                                            Collect
                                        </button>
                                    </li>
                                ),
                            )}
                        </ul>
                    </div>
                ) : null}
                <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {slots.length === 0 ? (
                        <li className="text-xs text-[var(--muted)]">Empty inventory.</li>
                    ) : (
                        slots.map((slot, i) => {
                            const { key, name, qty, meta } = slotLabel(slot);
                            const canSell = (meta?.sellGold ?? 0) > 0;
                            const canConvert = meta?.kind === "on";
                            const canHatch = meta?.kind === "egg";
                            return (
                                <li
                                    key={`${key}-${i}`}
                                    className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-xs"
                                >
                                    <div className="font-medium">
                                        {name} ×{qty}
                                    </div>
                                    <div className="mt-1 flex flex-wrap gap-1">
                                        {canSell ? (
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => {
                                                    setBusy(true);
                                                    void sellItems(key, 1)
                                                        .then((res) => afterMutation("sell", res?.data))
                                                        .catch((e: unknown) =>
                                                            setLocalError(mapApiErrorMessage(e, "Sell failed.")),
                                                        )
                                                        .finally(() => setBusy(false));
                                                }}
                                                className="rounded bg-emerald-900/80 px-2 py-1 text-emerald-100 disabled:opacity-50"
                                            >
                                                Sell
                                            </button>
                                        ) : null}
                                        {canConvert ? (
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => {
                                                    setBusy(true);
                                                    void convertOnChainItem(key, 1)
                                                        .then((res) => afterMutation("convert", res?.data))
                                                        .catch((e: unknown) =>
                                                            setLocalError(mapApiErrorMessage(e, "Convert failed.")),
                                                        )
                                                        .finally(() => setBusy(false));
                                                }}
                                                className="rounded bg-indigo-900/80 px-2 py-1 text-indigo-100 disabled:opacity-50"
                                            >
                                                → FC
                                            </button>
                                        ) : null}
                                        {canHatch ? (
                                            <button
                                                type="button"
                                                disabled={busy}
                                                onClick={() => {
                                                    setBusy(true);
                                                    void hatchEgg(key)
                                                        .then((res) => afterMutation("hatch", res?.data))
                                                        .catch((e: unknown) =>
                                                            setLocalError(mapApiErrorMessage(e, "Hatch failed.")),
                                                        )
                                                        .finally(() => setBusy(false));
                                                }}
                                                className="rounded bg-amber-900/80 px-2 py-1 text-amber-100 disabled:opacity-50"
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
        </div>
    );
}
