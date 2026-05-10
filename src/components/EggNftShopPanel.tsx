import {
    useSignAndExecuteTransaction,
    useCurrentAccount,
    useSuiClient,
} from "@mysten/dapp-kit";
import type { SpeciesId } from "@fantastic-farm/shared";
import { SPECIES, eggNftShopPriceMist } from "@fantastic-farm/shared";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import { useCallback, useEffect, useState } from "react";
import { getFantasticCoinType, getOnchainIdsFromEnv } from "../config/onchain";
import { mapApiErrorMessage } from "../services/apiClient";
import { dispatchEconomyRefresh } from "../hooks/useHeaderEconomy";
import { hatchOnChainEgg, preflightEggNftHatchOnChain } from "../services/gameService";
import type { GameLoadData } from "../types/api";
import {
    buildBurnEggForHatchTransaction,
    buildBuyEggWithFcTransaction,
    fetchOwnedEggNfts,
    formatFcFromMist,
    type OwnedEggNft,
} from "../services/marketplaceService";

const EGG_SHOP_ROWS: { species: SpeciesId; speciesCode: 0 | 1 | 2 | 3 }[] = [
    { species: "chicken", speciesCode: 0 },
    { species: "goat", speciesCode: 1 },
    { species: "sheep", speciesCode: 2 },
    { species: "cow", speciesCode: 3 },
];

function speciesIdFromEggCode(code: number): SpeciesId | null {
    const row = EGG_SHOP_ROWS.find((x) => x.speciesCode === code);
    return row?.species ?? null;
}

export type EggNftShopPanelProps = {
    active?: boolean;
    onError?: (message: string) => void;
    disableActions?: boolean;
    /** In-game gold (for hatch fee display only; BE enforces hatch gold). */
    playerGold?: number;
    /** After BE finalizes hatch (burn tx already succeeded on chain). */
    onHatchFinalize?: (data: GameLoadData) => void | Promise<void>;
};

function txDigestFromSignResult(result: unknown): string | undefined {
    if (result && typeof result === "object" && "digest" in result) {
        const d = (result as { digest: unknown }).digest;
        return typeof d === "string" && d.length > 0 ? d : undefined;
    }
    return undefined;
}

/**
 * FC shop: mint on-chain `EggNft` (`egg_shop::buy_egg_with_fc`).
 * Hatch: wallet `farm_nft::burn_egg_for_hatch`, then BE `POST /game/hatch-onchain` (gold fee + animal in DB).
 */
export default function EggNftShopPanel({
    active = true,
    onError,
    disableActions = false,
    playerGold,
    onHatchFinalize,
}: EggNftShopPanelProps) {
    const currentAccount = useCurrentAccount();
    const { mutateAsync: signAndExecute, isPending: walletTxPending } = useSignAndExecuteTransaction();
    const suiClient = useSuiClient();
    const onchainEnv = getOnchainIdsFromEnv();
    const pkg = onchainEnv.packageId.trim() ? normalizeSuiAddress(onchainEnv.packageId.trim()) : "";
    const coinType = pkg ? getFantasticCoinType(pkg) : "";

    const [ownedEggs, setOwnedEggs] = useState<OwnedEggNft[]>([]);
    const [eggsLoading, setEggsLoading] = useState(false);

    const report = useCallback(
        (msg: string) => {
            onError?.(msg);
        },
        [onError],
    );

    const loadOwnedEggs = useCallback(async () => {
        if (!pkg || !currentAccount?.address) {
            setOwnedEggs([]);
            return;
        }
        setEggsLoading(true);
        try {
            const list = await fetchOwnedEggNfts(suiClient, currentAccount.address, pkg);
            setOwnedEggs(list);
        } catch (e: unknown) {
            report(mapApiErrorMessage(e, "Could not load Egg NFTs from wallet."));
            setOwnedEggs([]);
        } finally {
            setEggsLoading(false);
        }
    }, [currentAccount?.address, pkg, report, suiClient]);

    useEffect(() => {
        if (!active || !pkg || !currentAccount?.address) {
            setOwnedEggs([]);
            return;
        }
        void loadOwnedEggs();
    }, [active, pkg, currentAccount?.address, loadOwnedEggs]);

    const busy = disableActions || walletTxPending;
    const ready = active && Boolean(pkg) && Boolean(currentAccount?.address) && typeof suiClient !== "undefined";

    const buyEgg = async (speciesCode: 0 | 1 | 2 | 3, priceMist: bigint) => {
        if (!currentAccount?.address || !pkg) return;
        try {
            const tx = await buildBuyEggWithFcTransaction(suiClient, {
                packageId: pkg,
                senderAddress: currentAccount.address,
                coinType,
                speciesCode,
                priceMist,
            });
            const res = await signAndExecute({
                transaction: tx,
            });
            void dispatchEconomyRefresh();
            void loadOwnedEggs();
            return txDigestFromSignResult(res);
        } catch (e: unknown) {
            report(mapApiErrorMessage(e, "Egg NFT purchase failed."));
            throw e;
        }
    };

    const burnAndFinalizeHatch = async (eggObjectId: string, speciesCode: number) => {
        if (!currentAccount?.address || !pkg) return;
        try {
            await preflightEggNftHatchOnChain(speciesCode);
            const tx = buildBurnEggForHatchTransaction({ packageId: pkg, eggObjectId });
            const res = await signAndExecute({ transaction: tx });
            const digest = txDigestFromSignResult(res);
            if (!digest) throw new Error("Missing transaction digest from wallet.");
            await suiClient.waitForTransaction({
                digest,
                options: { showEffects: true },
            });

            const apiRes = await hatchOnChainEgg(digest);
            const data = apiRes?.data as GameLoadData | undefined;
            if (data) await onHatchFinalize?.(data);
            void dispatchEconomyRefresh();
            void loadOwnedEggs();
        } catch (e: unknown) {
            report(mapApiErrorMessage(e, "Hatch failed."));
            throw e;
        }
    };

    if (!ready) {
        return (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <h3 className="text-sm font-semibold">Egg NFT shop (FC)</h3>
                <p className="mt-2 text-xs text-[var(--muted)]">
                    {!pkg
                        ? "Set VITE_FANTASTIC_FARM_PACKAGE_ID."
                        : !currentAccount?.address
                          ? "Connect a wallet to buy on-chain eggs with FC."
                          : "Unavailable."}
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h3 className="text-sm font-semibold">Egg NFT shop (FC)</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
                On-chain <code className="text-[10px]">EggNft</code> — pay FC from your wallet. To add the animal in the
                game: wallet burns the egg (gas), then the server charges <span className="text-[var(--text)]">hatch</span>{" "}
                <span className="text-[var(--text)]">gold</span> from your game account (same as inventory eggs). Package{" "}
                <code className="text-[10px]">{pkg.slice(0, 10)}…</code>.
            </p>
            <p className="mt-2 text-[11px] text-[var(--muted)]">
                The game calls <span className="text-[var(--text)]">/game/hatch-onchain/preflight</span> before your
                wallet signs burn — you need enough hatch gold + chuồng slots (same rules as finalize).
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
                {EGG_SHOP_ROWS.map((row) => {
                    const mist = eggNftShopPriceMist(row.species);
                    const fcLabel = formatFcFromMist(mist.toString());
                    return (
                        <button
                            key={row.species}
                            type="button"
                            disabled={busy}
                            onClick={() => void buyEgg(row.speciesCode, mist)}
                            className="rounded-md bg-[var(--card)] px-2 py-1.5 text-xs ring-1 ring-[var(--border)] hover:brightness-110 disabled:opacity-50"
                        >
                            {row.species} egg · {fcLabel} FC
                        </button>
                    );
                })}
            </div>

            <div className="mt-4 border-t border-[var(--border)] pt-3">
                <h4 className="text-xs font-semibold text-[var(--text)]">Eggs in wallet → hatch in game</h4>
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                    {typeof playerGold === "number" ? (
                        <>Your game gold: {playerGold}g (hatch fee shown per row).</>
                    ) : (
                        <>Log into the game to see gold; BE still enforces hatch cost.</>
                    )}
                </p>
                {eggsLoading ? (
                    <p className="mt-2 text-xs text-[var(--muted)]">Loading eggs…</p>
                ) : ownedEggs.length === 0 ? (
                    <p className="mt-2 text-xs text-[var(--muted)]">No EggNft in this wallet for this package.</p>
                ) : (
                    <ul className="mt-2 space-y-2">
                        {ownedEggs.map((e) => {
                            const sid = speciesIdFromEggCode(e.speciesCode);
                            const cfg = sid ? SPECIES[sid] : null;
                            const hatchLabel = cfg ? `${cfg.hatchGold}g` : "?g";
                            return (
                                <li
                                    key={e.objectId}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-[var(--card)] px-2 py-2 text-xs ring-1 ring-[var(--border)]"
                                >
                                    <div className="min-w-0">
                                        <div className="font-medium">{sid ?? `species ${e.speciesCode}`}</div>
                                        <div className="text-[10px] text-[var(--muted)]">
                                            {e.objectId.slice(0, 10)}… · hatch {hatchLabel}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => void burnAndFinalizeHatch(e.objectId, e.speciesCode)}
                                        className="shrink-0 rounded-md bg-[var(--card)] px-2 py-1 text-[11px] ring-1 ring-[var(--border)] hover:brightness-110 disabled:opacity-50"
                                    >
                                        Burn + hatch in game
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}
