/* eslint-disable react-hooks/preserve-manual-memoization */
/* eslint-disable react-hooks/set-state-in-effect */
import { Unity, useUnityContext } from "react-unity-webgl";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    useSignAndExecuteTransaction,
    useCurrentWallet,
    useDisconnectWallet,
    useResolveSuiNSName,
    useSuiClient,
} from "@mysten/dapp-kit";
import { eggNftShopPriceMist, type SpeciesId } from "@fantastic-farm/shared";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { mapApiErrorMessage } from "../services/apiClient";
import { clearClientGameSession } from "../services/clientSessionClear";
import { REQUIRED_SUI_CHAIN } from "../config/chain";
import { getFantasticCoinType, getOnchainIdsFromEnv } from "../config/onchain";
import { useUnityGameAuth } from "../hooks/useUnityGameAuth";
import { useOnChainFcMist } from "../hooks/useOnChainFcBalance";
import { dispatchEconomyRefresh } from "../hooks/useHeaderEconomy";
import {
    buyFeed,
    collectItems,
    feedAnimal,
    hatchEgg,
    hatchOnChainEgg,
    loadGameData,
    preflightEggNftHatchOnChain,
    sellItems,
} from "../services/gameService";
import {
    buildBurnEggForHatchTransaction,
    buildBuyEggWithFcTransaction,
    fetchOwnedEggNfts,
    fetchOwnedFarmProductNfts,
    resolveFarmPackageIdFromMarketplace,
    type OwnedEggNft,
    type OwnedFarmProductNft,
} from "../services/marketplaceService";
import {
    buildMintFarmProductTransaction,
    finalizeFarmProductMintAfterWalletSubmit,
    requestMintFarmProductProof,
} from "../services/onchainMintService";
import { getStoredAuth } from "../services/authStorage";
import type { GameLoadData } from "../types/api";
import { normalizeInventoryPayloadFromUnity } from "../services/normalizeInventoryPayload";
import { decodeFarmProductNftLabel } from "../gameplay/gddUi";

const shortenAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;
const UNITY_BRIDGE_OBJECT = "ReactBridge";

/** Passed to Unity loader — avoids "companyName / productName / productVersion missing" console warnings. */
const UNITY_WEBGL_META = {
    companyName: "Fantastic Team",
    productName: "Fantastic Farm",
    productVersion: import.meta.env.VITE_UNITY_PRODUCT_VERSION?.trim() || "1.0",
} as const;

const EGG_NFT_SPECIES_BY_CODE: SpeciesId[] = ["chicken", "goat", "sheep", "cow"];
const FARM_PRODUCT_SPECIES_BY_CODE = ["chicken", "goat", "sheep", "cow"] as const;
const FARM_PRODUCT_TIER_BY_INDEX = ["silver", "gold", "ruby", "emerald", "rainbow"] as const;

type UnityOwnedFarmProductNft = {
    objectId: string;
    speciesCode: number;
    species: string;
    tier: number;
    tierId: string;
    label: string;
    itemKey: string;
    kind: "nft";
    imageKey: string;
    imageUrl?: string;
    quantity: 1;
};

/** Mirrors Farm `ServerOwnedEggNft` for `GameManager.AddOwnedEggNftsToItemLayer`. */
type UnityOwnedEggNft = {
    objectId: string;
    speciesCode: number;
    species: string;
    label: string;
    itemKey: string;
    kind: "egg";
    imageKey: string;
    quantity: 1;
};

function txDigestFromWalletSign(result: unknown): string | undefined {
    if (result && typeof result === "object" && "digest" in result) {
        const digest = (result as { digest: unknown }).digest;
        return typeof digest === "string" && digest.length > 0 ? digest : undefined;
    }
    return undefined;
}

function fcDisplayNumberFromMist(mist: string | null): number | null {
    if (!mist) return null;
    try {
        const value = BigInt(mist);
        const whole = value / 1_000_000_000n;
        const frac = value % 1_000_000_000n;
        return Number(whole) + Number(frac) / 1_000_000_000;
    } catch {
        return null;
    }
}

function mapOwnedFarmProductNftForUnity(nft: OwnedFarmProductNft): UnityOwnedFarmProductNft {
    const species = FARM_PRODUCT_SPECIES_BY_CODE[nft.speciesCode] ?? "chicken";
    const tierId = FARM_PRODUCT_TIER_BY_INDEX[nft.tier] ?? "silver";
    const imageKey = `nft_${species}_${tierId}`;
    return {
        objectId: nft.objectId,
        speciesCode: nft.speciesCode,
        species,
        tier: nft.tier,
        tierId,
        label: nft.label || decodeFarmProductNftLabel(nft.speciesCode, nft.tier),
        itemKey: imageKey,
        kind: "nft",
        imageKey,
        imageUrl: nft.imageUrl,
        quantity: 1,
    };
}

/**
 * Unity inventory rows for wallet EggNfts use `egg_nft_<species>:<objectId>`
 * (GameManager.AddOwnedEggNftsToItemLayer). Off-chain eggs use keys like `starter_egg` only.
 */
function parseWalletEggNftFromUnityItemKey(itemKey: string): { eggObjectId: string; speciesCode: number } | null {
    const trimmed = itemKey.trim();
    const colon = trimmed.indexOf(":");
    if (colon <= 0) return null;
    const baseKey = trimmed.slice(0, colon).trim().toLowerCase();
    const rawId = trimmed.slice(colon + 1).trim();
    if (!/^0x[0-9a-fA-F]+$/.test(rawId)) return null;
    const speciesCodeByPrefix: Record<string, number> = {
        egg_nft_chicken: 0,
        egg_nft_goat: 1,
        egg_nft_sheep: 2,
        egg_nft_cow: 3,
    };
    const speciesCode = speciesCodeByPrefix[baseKey];
    if (speciesCode === undefined) return null;
    return { eggObjectId: normalizeSuiAddress(rawId), speciesCode };
}

function mapOwnedEggNftForUnity(egg: OwnedEggNft): UnityOwnedEggNft {
    const species = EGG_NFT_SPECIES_BY_CODE[egg.speciesCode] ?? "chicken";
    const imageKey = `egg_nft_${species}`;
    const label = `${species.charAt(0).toUpperCase()}${species.slice(1)} egg`;
    return {
        objectId: egg.objectId,
        speciesCode: egg.speciesCode,
        species,
        label,
        itemKey: imageKey,
        kind: "egg",
        imageKey,
        quantity: 1,
    };
}

export default function UnityView() {
    const unityServerIp = import.meta.env.VITE_UNITY_BUILD_BASE_URL ?? "/unity";
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
    const onChainFcMist = useOnChainFcMist(Boolean(account?.address));
    const onChainFcBalance = useMemo(() => fcDisplayNumberFromMist(onChainFcMist), [onChainFcMist]);

    const { data: suiNsName } = useResolveSuiNSName(account?.address);
    const { mutateAsync: disconnectWallet, isPending: isDisconnecting } = useDisconnectWallet();
    const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();
    const suiClient = useSuiClient();

    const { unityProvider, sendMessage, isLoaded, addEventListener, removeEventListener } = useUnityContext({
        loaderUrl: `${unityServerIp}/o.loader.js`,
        dataUrl: `${unityServerIp}/o.data`,
        frameworkUrl: `${unityServerIp}/o.framework.js`,
        codeUrl: `${unityServerIp}/o.wasm`,
        ...UNITY_WEBGL_META,
    });

    const buildUnityGameSnapshot = useCallback(
        async (game: GameLoadData) => {
            if (!account?.address) return undefined;
            const user = typeof game.user === "object" && game.user !== null ? game.user : {};
            const baseGame = onChainFcBalance === null
                ? game
                : {
                      ...game,
                      user: {
                          ...user,
                          fcBalance: onChainFcBalance,
                      },
                  };

            const onchainEnv = getOnchainIdsFromEnv();
            if (!onchainEnv.marketplaceReady) {
                return baseGame;
            }

            try {
                const packageId = await resolveFarmPackageIdFromMarketplace(
                    suiClient,
                    onchainEnv.marketplaceId,
                    onchainEnv.packageId,
                );
                const [ownedNfts, ownedEggs] = await Promise.all([
                    fetchOwnedFarmProductNfts(suiClient, account.address, packageId),
                    fetchOwnedEggNfts(suiClient, account.address, packageId),
                ]);
                return {
                    ...baseGame,
                    ownedFarmProductNfts: ownedNfts.map(mapOwnedFarmProductNftForUnity),
                    ownedEggNfts: ownedEggs.map(mapOwnedEggNftForUnity),
                };
            } catch (err) {
                // eslint-disable-next-line no-console
                console.warn("[Unity] Could not load on-chain NFTs for Unity snapshot", err);
                return baseGame;
            }
        },
        [account?.address, onChainFcBalance, suiClient],
    );

    const sendGameSnapshotToUnity = useCallback(
        async (methodName: "OnWalletConnected" | "OnGameUpdated", game: GameLoadData, source?: string) => {
            if (!account?.address) return;
            const unityGame = await buildUnityGameSnapshot(game);
            if (!unityGame) return;
            const kind = methodName === "OnWalletConnected" ? "wallet_and_game" : "game_updated";
            sendMessage(
                UNITY_BRIDGE_OBJECT,
                methodName,
                JSON.stringify({
                    kind,
                    walletAddress: account.address,
                    chainId: REQUIRED_SUI_CHAIN,
                    source,
                    game: unityGame,
                }),
            );
        },
        [account?.address, buildUnityGameSnapshot, sendMessage],
    );

    useEffect(() => {
        const address = account?.address;
        if (!canRenderGame || !isLoaded || authState !== "loading-game" || !address || !gameSnapshot) {
            return;
        }

        setAuthState("in-game");
        void sendGameSnapshotToUnity("OnWalletConnected", gameSnapshot, "initial_load");
    }, [canRenderGame, isLoaded, authState, account?.address, gameSnapshot, onChainFcBalance, setAuthState, sendGameSnapshotToUnity]);

    useEffect(() => {
        if (!isLoaded || authState !== "in-game" || !gameSnapshot || onChainFcBalance === null) {
            return;
        }

        void sendGameSnapshotToUnity("OnGameUpdated", gameSnapshot, "fc_balance");
    }, [isLoaded, authState, gameSnapshot, onChainFcBalance, sendGameSnapshotToUnity]);

    useEffect(() => {
        if (!isLoaded) return;
        const refreshUnityGame = async (source: string) => {
            const latest = await loadGameData();
            setGameSnapshot(latest);
            await sendGameSnapshotToUnity("OnGameUpdated", latest, source);
        };

        const onUpdateInventory = (...args: unknown[]) => {
            if (authState !== "in-game" || !account?.address || !getStoredAuth()) {
                return;
            }
            const raw = args[0];
            const jsonString = typeof raw === "string" ? raw : String(raw ?? "");
            if (!jsonString.trim()) {
                return;
            }

            let parsed: unknown;
            try {
                parsed = JSON.parse(jsonString);
            } catch {
                // eslint-disable-next-line no-console
                console.warn("[Unity] updateInventory: invalid JSON", jsonString);
                return;
            }

            const payload = normalizeInventoryPayloadFromUnity(parsed);
            if (!payload) {
                // eslint-disable-next-line no-console
                console.warn("[Unity] updateInventory: could not normalize payload", parsed);
                return;
            }

            void collectItems(payload)
                .then(() => refreshUnityGame("unity_inventory_collect"))
                .catch((err: unknown) => {
                    // eslint-disable-next-line no-console
                    console.warn("[Unity] updateInventory failed", err);
                    void refreshUnityGame("unity_inventory_collect_failed");
                });
        };

        const onHatchEgg = (...args: unknown[]) => {
            if (authState !== "in-game" || !account?.address || !getStoredAuth()) {
                return;
            }
            const raw = args[0];
            const jsonString = typeof raw === "string" ? raw : String(raw ?? "");
            if (!jsonString.trim()) {
                return;
            }
            let itemKey = "";
            try {
                const parsed = JSON.parse(jsonString) as { itemKey?: unknown };
                itemKey = typeof parsed.itemKey === "string" ? parsed.itemKey.trim() : "";
            } catch {
                // eslint-disable-next-line no-console
                console.warn("[Unity] hatchEgg: invalid JSON", jsonString);
                return;
            }
            if (!itemKey) return;

            const walletEgg = parseWalletEggNftFromUnityItemKey(itemKey);
            if (walletEgg) {
                void (async () => {
                    try {
                        const onchainEnv = getOnchainIdsFromEnv();
                        const pkg = onchainEnv.packageId.trim()
                            ? normalizeSuiAddress(onchainEnv.packageId.trim())
                            : "";
                        if (!pkg) throw new Error("Missing VITE_FANTASTIC_FARM_PACKAGE_ID.");
                        await preflightEggNftHatchOnChain(walletEgg.speciesCode);
                        const tx = buildBurnEggForHatchTransaction({
                            packageId: pkg,
                            eggObjectId: walletEgg.eggObjectId,
                        });
                        const execRes = await signAndExecute({ transaction: tx });
                        const digest = txDigestFromWalletSign(execRes);
                        if (!digest) throw new Error("Missing tx digest.");
                        await suiClient.waitForTransaction({
                            digest,
                            options: { showEffects: true },
                        });
                        const apiRes = await hatchOnChainEgg(digest);
                        dispatchEconomyRefresh();
                        const data = apiRes?.data;
                        if (data) {
                            setGameSnapshot(data);
                            await sendGameSnapshotToUnity("OnGameUpdated", data, "hatch_onchain_from_unity");
                            try {
                                const latest = await loadGameData();
                                setGameSnapshot(latest);
                                await sendGameSnapshotToUnity(
                                    "OnGameUpdated",
                                    latest,
                                    "hatch_onchain_from_unity_refresh",
                                );
                            } catch (refreshErr: unknown) {
                                // eslint-disable-next-line no-console
                                console.warn("[Unity] hatch_onchain_from_unity refresh failed", refreshErr);
                            }
                        } else {
                            await refreshUnityGame("hatch_onchain_from_unity");
                        }
                    } catch (err: unknown) {
                        // eslint-disable-next-line no-console
                        console.warn("[Unity] hatch wallet EggNft (burn + hatch-onchain) failed", err);
                        void refreshUnityGame("hatch_onchain_from_unity_failed");
                    }
                })();
                return;
            }

            void hatchEgg(itemKey)
                .then(() => refreshUnityGame("hatch"))
                .catch((err: unknown) => {
                    // eslint-disable-next-line no-console
                    console.warn("[Unity] hatchEgg failed", err);
                    void refreshUnityGame("hatch_failed");
                });
        };

        const onSellItem = (...args: unknown[]) => {
            if (authState !== "in-game" || !account?.address || !getStoredAuth()) {
                return;
            }
            const raw = args[0];
            const jsonString = typeof raw === "string" ? raw : String(raw ?? "");
            if (!jsonString.trim()) {
                return;
            }
            let itemKey = "";
            let quantity = 1;
            try {
                const parsed = JSON.parse(jsonString) as { itemKey?: unknown; quantity?: unknown };
                itemKey = typeof parsed.itemKey === "string" ? parsed.itemKey.trim() : "";
                quantity = typeof parsed.quantity === "number" && Number.isFinite(parsed.quantity)
                    ? Math.max(1, Math.floor(parsed.quantity))
                    : 1;
            } catch {
                // eslint-disable-next-line no-console
                console.warn("[Unity] sellItem: invalid JSON", jsonString);
                return;
            }
            if (!itemKey) return;

            void sellItems(itemKey, quantity)
                .then(() => refreshUnityGame("sell"))
                .catch((err: unknown) => {
                    // eslint-disable-next-line no-console
                    console.warn("[Unity] sellItem failed", err);
                    void refreshUnityGame("sell_failed");
                });
        };

        const onFeedAnimal = (...args: unknown[]) => {
            if (authState !== "in-game" || !account?.address || !getStoredAuth()) {
                return;
            }
            const raw = args[0];
            const jsonString = typeof raw === "string" ? raw : String(raw ?? "");
            if (!jsonString.trim()) {
                return;
            }
            let animalId = "";
            let premium = false;
            try {
                const parsed = JSON.parse(jsonString) as { animalId?: unknown; premium?: unknown };
                animalId = typeof parsed.animalId === "string" ? parsed.animalId.trim() : "";
                premium = parsed.premium === true;
            } catch {
                // eslint-disable-next-line no-console
                console.warn("[Unity] feedAnimal: invalid JSON", jsonString);
                return;
            }
            if (!animalId) return;

            void feedAnimal(animalId, premium)
                .then(() => refreshUnityGame(premium ? "feed_premium" : "feed"))
                .catch((err: unknown) => {
                    // eslint-disable-next-line no-console
                    console.warn("[Unity] feedAnimal failed", err);
                    void refreshUnityGame("feed_failed");
                });
        };

        const onBuyFeed = (...args: unknown[]) => {
            if (authState !== "in-game" || !account?.address || !getStoredAuth()) {
                return;
            }
            const raw = args[0];
            const jsonString = typeof raw === "string" ? raw : String(raw ?? "");
            if (!jsonString.trim()) {
                return;
            }
            let itemKey = "";
            let quantity = 1;
            try {
                const parsed = JSON.parse(jsonString) as { itemKey?: unknown; quantity?: unknown };
                itemKey = typeof parsed.itemKey === "string" ? parsed.itemKey.trim() : "";
                quantity = typeof parsed.quantity === "number" && Number.isFinite(parsed.quantity)
                    ? Math.max(1, Math.floor(parsed.quantity))
                    : 1;
            } catch {
                // eslint-disable-next-line no-console
                console.warn("[Unity] buyFeed: invalid JSON", jsonString);
                return;
            }
            if (!itemKey) return;

            void buyFeed(itemKey, quantity)
                .then((res) => {
                    dispatchEconomyRefresh();
                    if (res?.data) {
                        setGameSnapshot(res.data);
                        void sendGameSnapshotToUnity("OnGameUpdated", res.data, `buy_${itemKey}`);
                    } else {
                        void refreshUnityGame(`buy_${itemKey}`);
                    }
                })
                .catch((err: unknown) => {
                    // eslint-disable-next-line no-console
                    console.warn("[Unity] buyFeed failed", err);
                    void refreshUnityGame("buy_feed_failed");
                });
        };

        const onBuyEggNft = (...args: unknown[]) => {
            if (authState !== "in-game" || !account?.address || !getStoredAuth()) {
                return;
            }
            const raw = args[0];
            const jsonString = typeof raw === "string" ? raw : String(raw ?? "");
            if (!jsonString.trim()) {
                return;
            }

            let species: SpeciesId | null = null;
            let speciesCode = -1;
            try {
                const parsed = JSON.parse(jsonString) as { species?: unknown; speciesCode?: unknown };
                const rawSpecies = typeof parsed.species === "string" ? parsed.species.trim().toLowerCase() : "";
                speciesCode = typeof parsed.speciesCode === "number" && Number.isFinite(parsed.speciesCode)
                    ? Math.floor(parsed.speciesCode)
                    : EGG_NFT_SPECIES_BY_CODE.indexOf(rawSpecies as SpeciesId);
                species = EGG_NFT_SPECIES_BY_CODE[speciesCode] ?? null;
            } catch {
                // eslint-disable-next-line no-console
                console.warn("[Unity] buyEggNft: invalid JSON", jsonString);
                return;
            }
            if (!species || speciesCode < 0 || speciesCode > 3) return;

            void (async () => {
                try {
                    const onchainEnv = getOnchainIdsFromEnv();
                    const pkg = onchainEnv.packageId.trim() ? normalizeSuiAddress(onchainEnv.packageId.trim()) : "";
                    if (!pkg) throw new Error("Missing VITE_FANTASTIC_FARM_PACKAGE_ID.");
                    const coinType = getFantasticCoinType(pkg);
                    const tx = await buildBuyEggWithFcTransaction(suiClient, {
                        packageId: pkg,
                        senderAddress: account.address,
                        coinType,
                        speciesCode,
                        priceMist: eggNftShopPriceMist(species),
                    });
                    const execRes = await signAndExecute({ transaction: tx });
                    const digest = txDigestFromWalletSign(execRes);
                    if (!digest) throw new Error("Missing tx digest.");
                    dispatchEconomyRefresh();
                    await refreshUnityGame(`buy_egg_nft_${species}`);
                } catch (err: unknown) {
                    // eslint-disable-next-line no-console
                    console.warn("[Unity] buyEggNft failed", err);
                    void refreshUnityGame("buy_egg_nft_failed");
                }
            })();
        };

        const onSyncFarm = () => {
            if (authState !== "in-game" || !account?.address || !getStoredAuth()) {
                return;
            }

            void refreshUnityGame("unity_farm_sync").catch((err: unknown) => {
                // eslint-disable-next-line no-console
                console.warn("[Unity] syncFarm failed", err);
            });
        };

        const onMintFarmProduct = (...args: unknown[]) => {
            if (authState !== "in-game" || !account?.address || !getStoredAuth()) {
                return;
            }
            const raw = args[0];
            const jsonString = typeof raw === "string" ? raw : String(raw ?? "");
            if (!jsonString.trim()) {
                return;
            }
            let pendingMintId = "";
            try {
                const parsed = JSON.parse(jsonString) as { pendingMintId?: unknown };
                pendingMintId = typeof parsed.pendingMintId === "string" ? parsed.pendingMintId.trim() : "";
            } catch {
                // eslint-disable-next-line no-console
                console.warn("[Unity] mintFarmProduct: invalid JSON", jsonString);
                return;
            }
            if (!pendingMintId) return;

            void (async () => {
                try {
                    const proof = await requestMintFarmProductProof(pendingMintId);
                    const tx = buildMintFarmProductTransaction(proof);
                    const execRes = await signAndExecute({ transaction: tx });
                    const finRes = await finalizeFarmProductMintAfterWalletSubmit(suiClient, execRes, pendingMintId);
                    dispatchEconomyRefresh();
                    if (finRes?.data) {
                        setGameSnapshot(finRes.data);
                        await sendGameSnapshotToUnity("OnGameUpdated", finRes.data, "mint_farm_product");
                    } else {
                        await refreshUnityGame("mint_farm_product");
                    }
                } catch (err: unknown) {
                    // eslint-disable-next-line no-console
                    console.warn("[Unity] mintFarmProduct failed", err);
                    sendMessage(
                        UNITY_BRIDGE_OBJECT,
                        "OnMintFarmProductResult",
                        JSON.stringify({
                            success: false,
                            pendingMintId,
                            message: mapApiErrorMessage(err, "Mint cancelled or failed."),
                        }),
                    );
                    void refreshUnityGame("mint_farm_product_failed");
                }
            })();
        };

        addEventListener("updateInventory", onUpdateInventory);
        addEventListener("hatchEgg", onHatchEgg);
        addEventListener("sellItem", onSellItem);
        addEventListener("feedAnimal", onFeedAnimal);
        addEventListener("buyFeed", onBuyFeed);
        addEventListener("buyEggNft", onBuyEggNft);
        addEventListener("syncFarm", onSyncFarm);
        addEventListener("mintFarmProduct", onMintFarmProduct);
        return () => {
            removeEventListener("updateInventory", onUpdateInventory);
            removeEventListener("hatchEgg", onHatchEgg);
            removeEventListener("sellItem", onSellItem);
            removeEventListener("feedAnimal", onFeedAnimal);
            removeEventListener("buyFeed", onBuyFeed);
            removeEventListener("buyEggNft", onBuyEggNft);
            removeEventListener("syncFarm", onSyncFarm);
            removeEventListener("mintFarmProduct", onMintFarmProduct);
        };
    }, [isLoaded, authState, account?.address, addEventListener, removeEventListener, sendMessage, sendGameSnapshotToUnity, signAndExecute, suiClient]);

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
                if (!cancelled) {
                    setGameSnapshot(d);
                }
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

    const displayWalletName = useMemo(() => {
        if (currentWallet.connectionStatus !== "connected") {
            return "Wallet";
        }
        return currentWallet.currentWallet.name;
    }, [currentWallet]);

    const displayIdentity = useMemo(() => {
        if (!account?.address) {
            return "";
        }
        return suiNsName ?? shortenAddress(account.address);
    }, [account?.address, suiNsName]);

    const handleLogoutAndSwitchWallet = async () => {
        try {
            setErrorMessage("");
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

    if (!canRenderGame) {
        return (
            <div className="flex min-h-[560px] items-center justify-center text-[var(--text)]">
                <div className="w-full max-w-[420px] rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
                    <h2 className="mb-2 text-2xl font-semibold">Connect wallet to play</h2>
                    <p className="mb-4 text-sm text-[var(--muted)]">
                        Use Slush Wallet on {REQUIRED_SUI_CHAIN}, then Unity will start.
                    </p>
                    {account && (
                        <div className="mb-3">
                            <p className="text-sm font-semibold">
                                {displayIdentity}
                            </p>
                            <p className="text-xs text-[var(--muted)]">
                                {displayWalletName} • {shortenAddress(account.address)}
                            </p>
                        </div>
                    )}
                    {errorMessage && (
                        <p className="mb-3 text-sm text-rose-500">
                            {errorMessage}
                        </p>
                    )}
                    {authState === "signing" && account && (
                        <div className="flex justify-center p-4">
                            <div className="animate-pulse text-sm text-[var(--muted)]">Please sign the message in your wallet...</div>
                        </div>
                    )}
                    {authState === "verifying" && (
                        <div className="flex justify-center p-4">
                            <div className="animate-pulse text-sm text-[var(--muted)]">Verifying with server...</div>
                        </div>
                    )}
                    {(authState === "choose-wallet" || authState === "error") && account ? (
                        <div className="grid gap-2.5">
                            <button
                                onClick={handleContinueWithConnectedWallet}
                                className="w-full cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm text-[var(--text)] transition hover:brightness-110"
                            >
                                {authState === "error" ? "Try again" : isReturningWithKnownWallet ? "Continue with this wallet" : "Sign message to login"}
                            </button>
                            <button
                                onClick={handleLogoutAndSwitchWallet}
                                disabled={isDisconnecting}
                                className="w-full cursor-pointer rounded-lg border border-red-900 bg-red-950 px-3 py-2.5 text-sm text-red-200 transition hover:bg-red-900/70 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                                {isDisconnecting ? "Disconnecting..." : "Logout and connect another wallet"}
                            </button>
                        </div>
                    ) : !account && authState !== "signing" && authState !== "verifying" ? (
                        <p className="text-sm text-[var(--muted)]">
                            Use the <span className="font-semibold text-[var(--text)]">Connect Wallet</span> button in header to continue.
                        </p>
                    ) : null}
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto w-full max-w-[1400px]">
            <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-black/30 aspect-video">
                {authState === "loading-game" ? (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-black/55 px-4 text-center text-sm text-white">
                        <div className="animate-pulse">{gameSnapshot ? "Starting Unity…" : "Loading farm from server…"}</div>
                    </div>
                ) : null}
                <Unity
                    unityProvider={unityProvider}
                    className="h-full w-full"
                />
            </div>
        </div>
    );
}
