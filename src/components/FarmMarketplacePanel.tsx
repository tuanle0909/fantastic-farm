import {
    useSignAndExecuteTransaction,
    useCurrentAccount,
    useSuiClient,
} from "@mysten/dapp-kit";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getFantasticCoinType, getOnchainIdsFromEnv } from "../config/onchain";
import { decodeFarmProductNftLabel } from "../gameplay/gddUi";
import { mapApiErrorMessage } from "../services/apiClient";
import { dispatchEconomyRefresh } from "../hooks/useHeaderEconomy";
import { ECONOMY_ONCHAIN_SCALE_DEN, ECONOMY_ONCHAIN_SCALE_NUM, marketplaceListingMinPriceMist } from "@fantastic-farm/shared";
import { normalizeSuiAddress } from "@mysten/sui/utils";
import {
    buildBuyFarmProductListingTransaction,
    buildCancelListingTransaction,
    buildListFarmProductTransaction,
    fcMistFromDecimalInput,
    enrichMarketplaceListingsWithNftDisplay,
    fetchActiveMarketplaceListings,
    fetchOwnedFarmProductNfts,
    formatFcFromMist,
    pickFcCoinObjects,
    pruneStaleMarketplaceListingRows,
    resolveFarmPackageIdFromMarketplace,
    type MarketplaceListingRow,
    type OwnedFarmProductNft,
} from "../services/marketplaceService";
import TxSuccessDialog from "./TxSuccessDialog";

const shortenAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

function txDigestFromSignResult(result: unknown): string | undefined {
    if (result && typeof result === "object" && "digest" in result) {
        const d = (result as { digest: unknown }).digest;
        return typeof d === "string" && d.length > 0 ? d : undefined;
    }
    return undefined;
}

export type FarmMarketplacePanelProps = {
    /**
     * When false, auto-refresh is skipped (e.g. Gameplay tab before JWT in-game).
     * On the dedicated Marketplace route, leave true whenever the panel is visible.
     */
    active?: boolean;
    /** Surface errors to parent (e.g. GameplayView banner). */
    onError?: (message: string) => void;
    /** Disable list/buy/cancel alongside parent busy state (e.g. during game mutations). */
    disableActions?: boolean;
};

export default function FarmMarketplacePanel({
    active = true,
    onError,
    disableActions = false,
}: FarmMarketplacePanelProps) {
    const currentAccount = useCurrentAccount();
    const { mutateAsync: signAndExecute, isPending: walletTxPending } = useSignAndExecuteTransaction();
    const suiClient = useSuiClient();
    const onchainEnv = getOnchainIdsFromEnv();

    /** Package id parsed from Marketplace object type (`getObject`); aligns NFT fetch + txs when `VITE_FANTASTIC_FARM_PACKAGE_ID` is stale. */
    const [chainResolvedPackageId, setChainResolvedPackageId] = useState<string | null>(null);

    useEffect(() => {
        setChainResolvedPackageId(null);
    }, [onchainEnv.packageId, onchainEnv.marketplaceId]);

    const effectivePackageId =
        chainResolvedPackageId ??
        (onchainEnv.packageId.trim() ? normalizeSuiAddress(onchainEnv.packageId.trim()) : "");
    const effectiveCoinType =
        effectivePackageId.trim() !== "" ? getFantasticCoinType(effectivePackageId) : onchainEnv.coinType;

    const [marketplaceListings, setMarketplaceListings] = useState<MarketplaceListingRow[]>([]);
    const [ownedProductNfts, setOwnedProductNfts] = useState<OwnedFarmProductNft[]>([]);
    const [listPriceFc, setListPriceFc] = useState("1");
    const [selectedListNftId, setSelectedListNftId] = useState("");
    const [mpBusy, setMpBusy] = useState(false);
    const [localError, setLocalError] = useState("");
    const [buySuccess, setBuySuccess] = useState<{
        open: boolean;
        description: string;
        digest?: string;
    }>({ open: false, description: "" });

    const [listNftPickerOpen, setListNftPickerOpen] = useState(false);
    const listNftPickerRef = useRef<HTMLDivElement>(null);

    const report = useCallback(
        (msg: string) => {
            setLocalError(msg);
            onError?.(msg);
        },
        [onError],
    );

    const clearErrors = useCallback(() => {
        setLocalError("");
        onError?.("");
    }, [onError]);

    const refreshMarketplace = useCallback(async () => {
        if (!onchainEnv.marketplaceReady || !currentAccount?.address) return;
        const pkg = await resolveFarmPackageIdFromMarketplace(
            suiClient,
            onchainEnv.marketplaceId,
            onchainEnv.packageId,
        );
        setChainResolvedPackageId(pkg);
        const [rowsRaw, nfts] = await Promise.all([
            fetchActiveMarketplaceListings(suiClient, pkg),
            fetchOwnedFarmProductNfts(suiClient, currentAccount.address, pkg),
        ]);
        const rows = await pruneStaleMarketplaceListingRows(suiClient, onchainEnv.marketplaceId, rowsRaw);
        let listings = rows;
        try {
            listings = await enrichMarketplaceListingsWithNftDisplay(
                suiClient,
                onchainEnv.marketplaceId,
                rows,
            );
        } catch {
            listings = rows;
        }
        setMarketplaceListings(listings);
        const enriched = nfts.map((n) => ({
            ...n,
            label: n.label || decodeFarmProductNftLabel(n.speciesCode, n.tier),
        }));
        setOwnedProductNfts(enriched);
    }, [currentAccount?.address, onchainEnv.marketplaceReady, onchainEnv.marketplaceId, onchainEnv.packageId, suiClient]);

    useEffect(() => {
        if (!active || !onchainEnv.marketplaceReady || !currentAccount?.address) return;
        void refreshMarketplace().catch((e: unknown) =>
            report(mapApiErrorMessage(e, "Marketplace refresh failed.")),
        );
    }, [active, currentAccount?.address, onchainEnv.marketplaceReady, refreshMarketplace, report]);

    useEffect(() => {
        if (ownedProductNfts.length === 0) {
            setSelectedListNftId("");
            return;
        }
        if (!selectedListNftId || !ownedProductNfts.some((n) => n.objectId === selectedListNftId)) {
            setSelectedListNftId(ownedProductNfts[0].objectId);
        }
    }, [ownedProductNfts, selectedListNftId]);

    useEffect(() => {
        if (ownedProductNfts.length === 0) setListNftPickerOpen(false);
    }, [ownedProductNfts.length]);

    useEffect(() => {
        if (!listNftPickerOpen) return;
        const onPointerDown = (e: PointerEvent) => {
            const el = listNftPickerRef.current;
            if (el && !el.contains(e.target as Node)) setListNftPickerOpen(false);
        };
        document.addEventListener("pointerdown", onPointerDown);
        return () => document.removeEventListener("pointerdown", onPointerDown);
    }, [listNftPickerOpen]);

    const selectedOwnedNft = ownedProductNfts.find((n) => n.objectId === selectedListNftId);
    const listFloorMist = selectedOwnedNft
        ? marketplaceListingMinPriceMist(selectedOwnedNft.tier)
        : 0n;

    const actionsLocked = mpBusy || disableActions;

    const walletNormalized = currentAccount?.address?.trim()
        ? normalizeSuiAddress(currentAccount.address.trim())
        : "";

    const myActiveListings = useMemo(() => {
        if (!walletNormalized) return [];
        return marketplaceListings.filter(
            (row) => normalizeSuiAddress(row.seller) === walletNormalized,
        );
    }, [marketplaceListings, walletNormalized]);

    const cancelMyListing = useCallback(
        (listingIdStr: string) => {
            const raw = listingIdStr.trim();
            if (!currentAccount?.address || !effectivePackageId || !raw) return;
            setMpBusy(true);
            void (async () => {
                try {
                    const id = BigInt(raw);
                    const tx = await buildCancelListingTransaction(
                        suiClient,
                        effectivePackageId,
                        onchainEnv.marketplaceId,
                        id,
                    );
                    const signed = await signAndExecute({ transaction: tx });
                    const digest = txDigestFromSignResult(signed);
                    if (digest) {
                        await suiClient.waitForTransaction({
                            digest,
                            options: { showEffects: true },
                        });
                    }
                    await refreshMarketplace();
                    dispatchEconomyRefresh();
                    clearErrors();
                } catch (e: unknown) {
                    report(mapApiErrorMessage(e, "Cancel listing failed."));
                } finally {
                    setMpBusy(false);
                }
            })();
        },
        [
            clearErrors,
            currentAccount?.address,
            effectivePackageId,
            onchainEnv.marketplaceId,
            refreshMarketplace,
            report,
            signAndExecute,
            suiClient,
        ],
    );

    if (!onchainEnv.marketplaceReady) {
        return (
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4">
                <h3 className="text-sm font-semibold">Marketplace</h3>
                <p className="mt-1 text-xs text-[var(--muted)]">
                    Set <code className="text-[10px]">VITE_FANTASTIC_FARM_MARKETPLACE_OBJECT_ID</code> (and package /
                    registry) to list and buy <code className="text-[10px]">FarmProductNft</code> for FC.
                </p>
            </div>
        );
    }

    return (
        <>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <h3 className="text-sm font-semibold">Marketplace</h3>
            {!currentAccount?.address ? (
                <p className="mt-2 text-xs text-[var(--muted)]">Connect a wallet in the header to list or buy.</p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={mpBusy || !currentAccount}
                    onClick={() => {
                        setMpBusy(true);
                        void refreshMarketplace()
                            .then(() => clearErrors())
                            .catch((e: unknown) => report(mapApiErrorMessage(e, "Marketplace refresh failed.")))
                            .finally(() => setMpBusy(false));
                    }}
                    className="rounded-md border border-[var(--border)] px-3 py-1.5 text-xs hover:brightness-110 disabled:opacity-50"
                >
                    Refresh listings &amp; my FarmProductNft
                </button>
            </div>
            {localError && !onError ? (
                <p className="mt-2 text-xs text-rose-500" role="alert">
                    {localError}
                </p>
            ) : null}
            <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--card)]/50 p-3">
                <p className="text-xs font-medium text-[var(--text)]">
                    Your FarmProductNft listings on Marketplace
                </p>
                {/* <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                    Chỉ bạn có thể hủy (sign transaction). NFT sẽ về lại ví; bảng bên dưới và số NFT trong ví cập nhật sau khi RPC xác nhận.
                </p> */}
                {!currentAccount?.address ? (
                    <p className="mt-2 text-xs text-[var(--muted)]">Kết nối ví để xem listing của bạn.</p>
                ) : myActiveListings.length === 0 ? (
                    <p className="mt-2 text-xs text-[var(--muted)]">
                        Currently no active listings of yours on Marketplace.
                    </p>
                ) : (
                    <ul className="mt-3 space-y-2">
                        {myActiveListings.map((row) => (
                            <li
                                key={`mine-${row.listingId}`}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--border)]/70 bg-[var(--surface)] px-2 py-2"
                            >
                                <div className="flex min-w-0 max-w-[18rem] items-center gap-2">
                                    {row.nftImageUrl ? (
                                        <img
                                            src={row.nftImageUrl}
                                            alt=""
                                            className="h-10 w-10 shrink-0 rounded-md bg-[var(--card)] object-cover ring-1 ring-[var(--border)]"
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--card)] text-[10px] text-[var(--muted)] ring-1 ring-[var(--border)]">
                                            NFT
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <div className="truncate font-medium text-[var(--text)]">
                                            {row.nftLabel ?? "Farm product NFT"}
                                        </div>
                                        <div className="text-[10px] text-[var(--muted)]">{row.priceFcDisplay}</div>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    disabled={actionsLocked || walletTxPending}
                                    onClick={() => cancelMyListing(row.listingId)}
                                    className="shrink-0 rounded bg-zinc-800 px-3 py-1.5 text-xs text-zinc-100 hover:brightness-110 disabled:opacity-50"
                                >
                                    Cancel
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left text-xs">
                    <thead>
                        <tr className="border-b border-[var(--border)] text-[var(--muted)]">
                            <th className="py-1 pr-2">NFT</th>
                            <th className="py-1 pr-2">Seller</th>
                            <th className="py-1 pr-2">Price</th>
                            <th className="py-1"> </th>
                        </tr>
                    </thead>
                    <tbody>
                        {marketplaceListings.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="py-2 text-[var(--muted)]">
                                    No active listings
                                </td>
                            </tr>
                        ) : (
                            marketplaceListings.map((row) => {
                                const isSeller =
                                    Boolean(walletNormalized) &&
                                    normalizeSuiAddress(row.seller) === walletNormalized;
                                return (
                                    <tr key={row.listingId} className="border-b border-[var(--border)]/60">
                                        <td className="py-1.5 pr-2">
                                            <div className="flex max-w-[14rem] items-center gap-2">
                                                {row.nftImageUrl ? (
                                                    <img
                                                        src={row.nftImageUrl}
                                                        alt=""
                                                        className="h-10 w-10 shrink-0 rounded-md bg-[var(--card)] object-cover ring-1 ring-[var(--border)]"
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-[var(--card)] text-[10px] text-[var(--muted)] ring-1 ring-[var(--border)]">
                                                        NFT
                                                    </div>
                                                )}
                                                <span className="truncate text-[var(--text)]">
                                                    {row.nftLabel ?? "Farm product NFT"}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-1.5 pr-2">{shortenAddress(row.seller)}</td>
                                        <td className="py-1.5 pr-2">{row.priceFcDisplay}</td>
                                        <td className="py-1.5">
                                            {!isSeller ? (
                                                <button
                                                    type="button"
                                                    disabled={
                                                        actionsLocked || walletTxPending || !currentAccount
                                                    }
                                                    onClick={() => {
                                                        if (!currentAccount?.address) return;
                                                        setMpBusy(true);
                                                        void (async () => {
                                                            try {
                                                                const { coinObjectIds } = await pickFcCoinObjects(
                                                                    suiClient,
                                                                    currentAccount.address,
                                                                    effectiveCoinType,
                                                                    BigInt(row.priceMist),
                                                                );
                                                                const tx = await buildBuyFarmProductListingTransaction(
                                                                    suiClient,
                                                                    effectivePackageId,
                                                                    onchainEnv.marketplaceId,
                                                                    BigInt(row.listingId),
                                                                    coinObjectIds,
                                                                );
                                                                const signed = await signAndExecute({
                                                                    transaction: tx,
                                                                });
                                                                const digest = txDigestFromSignResult(signed);
                                                                if (digest) {
                                                                    await suiClient.waitForTransaction({
                                                                        digest,
                                                                        options: { showEffects: true },
                                                                    });
                                                                }
                                                                await refreshMarketplace();
                                                                dispatchEconomyRefresh();
                                                                clearErrors();
                                                                const label =
                                                                    row.nftLabel?.trim() || "Farm product NFT";
                                                                setBuySuccess({
                                                                    open: true,
                                                                    description: `Đã mua ${label} với ${row.priceFcDisplay} FC.`,
                                                                    digest,
                                                                });
                                                            } catch (e: unknown) {
                                                                report(
                                                                    mapApiErrorMessage(
                                                                        e,
                                                                        "Buy listing failed — check FC balance, listing id, and wallet approval.",
                                                                    ),
                                                                );
                                                            } finally {
                                                                setMpBusy(false);
                                                            }
                                                        })();
                                                    }}
                                                    className="rounded bg-indigo-900/80 px-2 py-1 text-indigo-100 disabled:opacity-50"
                                                >
                                                    Buy (FC)
                                                </button>
                                            ) : (
                                                <span className="text-[var(--muted)]">Your listing</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
            <div className="mt-4 border-t border-[var(--border)] pt-3">
                <p className="text-xs font-medium">List a FarmProductNft</p>
                <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                    Min ask = 1.2 × tier design FC × test scale (on-chain). NFT leaves your wallet until sold or you
                    cancel.
                </p>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
                    <div ref={listNftPickerRef} className="relative min-w-0">
                        <span className="mb-1 block text-[11px] text-[var(--muted)]">NFT</span>
                        <button
                            type="button"
                            disabled={ownedProductNfts.length === 0 || actionsLocked}
                            onClick={() => setListNftPickerOpen((o) => !o)}
                            aria-expanded={listNftPickerOpen}
                            aria-haspopup="listbox"
                            className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-left text-xs text-[var(--text)] outline-none transition hover:brightness-105 focus-visible:ring-2 focus-visible:ring-[var(--accent)]/50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {selectedOwnedNft ? (
                                <>
                                    {selectedOwnedNft.imageUrl ? (
                                        <img
                                            src={selectedOwnedNft.imageUrl}
                                            alt=""
                                            className="h-9 w-9 shrink-0 rounded-md bg-[var(--surface)] object-cover ring-1 ring-[var(--border)]"
                                        />
                                    ) : (
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--surface)] text-[10px] text-[var(--muted)] ring-1 ring-[var(--border)]">
                                            NFT
                                        </div>
                                    )}
                                    <span className="min-w-0 flex-1 truncate font-medium">{selectedOwnedNft.label}</span>
                                </>
                            ) : (
                                <span className="flex-1 text-[var(--muted)]">
                                    Chưa có FarmProductNft trong ví
                                </span>
                            )}
                            <span className="shrink-0 text-[var(--muted)]" aria-hidden>
                                ▾
                            </span>
                        </button>
                        {listNftPickerOpen && ownedProductNfts.length > 0 ? (
                            <ul
                                role="listbox"
                                className="absolute left-0 right-0 z-30 mt-1 max-h-52 overflow-auto rounded-lg border border-[var(--border)] bg-[var(--card)] py-1 shadow-lg"
                            >
                                {ownedProductNfts.map((n) => (
                                    <li key={n.objectId} role="presentation">
                                        <button
                                            type="button"
                                            role="option"
                                            aria-selected={n.objectId === selectedListNftId}
                                            onClick={() => {
                                                setSelectedListNftId(n.objectId);
                                                setListNftPickerOpen(false);
                                            }}
                                            className={`flex w-full items-center gap-2 px-2 py-2 text-left text-xs transition hover:bg-[var(--surface)] ${
                                                n.objectId === selectedListNftId ? "bg-[var(--surface)]/90" : ""
                                            }`}
                                        >
                                            {n.imageUrl ? (
                                                <img
                                                    src={n.imageUrl}
                                                    alt=""
                                                    className="h-9 w-9 shrink-0 rounded-md bg-[var(--surface)] object-cover ring-1 ring-[var(--border)]"
                                                />
                                            ) : (
                                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--surface)] text-[10px] text-[var(--muted)] ring-1 ring-[var(--border)]">
                                                    NFT
                                                </div>
                                            )}
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate font-medium text-[var(--text)]">
                                                    {n.label}
                                                </span>
                                                <span className="block truncate font-mono text-[10px] text-[var(--muted)]">
                                                    {shortenAddress(n.objectId)}
                                                </span>
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                        {ownedProductNfts.length === 0 && currentAccount?.address ? (
                            <p className="mt-1 text-[10px] leading-snug text-[var(--muted)]">
                                Cần ví trùng address với header; FC chỉ là coin. Đã list rồi thì NFT nằm trong
                                Marketplace — không hiện ở đây. Trên explorer, type phải là{" "}
                                <code className="text-[10px]">&lt;PACKAGE&gt;::farm_nft::FarmProductNft</code>.
                            </p>
                        ) : null}
                    </div>
                    <div className="min-w-0">
                        <label htmlFor="farm-list-price-fc" className="mb-1 block text-[11px] text-[var(--muted)]">
                            Price (FC)
                        </label>
                        <input
                            type="number"
                            id="farm-list-price-fc"
                            value={listPriceFc}
                            onChange={(e) => setListPriceFc(e.target.value)}
                            autoComplete="off"
                            inputMode="decimal"
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-xs text-[var(--text)]"
                        />
                    </div>
                </div>
                {selectedOwnedNft ? (
                    <p className="mt-2 text-[10px] text-[var(--muted)]">
                        On-chain floor (k=1.2 × tier design FC × scale{" "}
                        {ECONOMY_ONCHAIN_SCALE_NUM.toString()}/{ECONOMY_ONCHAIN_SCALE_DEN.toString()}): ≥{" "}
                        {formatFcFromMist(String(listFloorMist))} FC
                    </p>
                ) : null}
                <button
                    type="button"
                    disabled={actionsLocked || walletTxPending || !currentAccount || !selectedListNftId}
                    onClick={() => {
                        setMpBusy(true);
                        void (async () => {
                            try {
                                if (!selectedOwnedNft) return;
                                const mist = fcMistFromDecimalInput(listPriceFc);
                                const tx = await buildListFarmProductTransaction(
                                    suiClient,
                                    effectivePackageId,
                                    onchainEnv.marketplaceId,
                                    selectedListNftId,
                                    selectedOwnedNft.tier,
                                    mist,
                                );
                                const signed = await signAndExecute({ transaction: tx });
                                const digest = txDigestFromSignResult(signed);
                                if (digest) {
                                    await suiClient.waitForTransaction({
                                        digest,
                                        options: { showEffects: true },
                                    });
                                }
                                await refreshMarketplace();
                                dispatchEconomyRefresh();
                                clearErrors();
                            } catch (e: unknown) {
                                report(mapApiErrorMessage(e, "List NFT failed."));
                            } finally {
                                setMpBusy(false);
                            }
                        })();
                    }}
                    className="mt-3 w-full rounded-lg bg-emerald-900/80 px-3 py-2 text-xs font-medium text-emerald-50 disabled:opacity-50 sm:w-auto"
                >
                    Sign list transaction
                </button>
            </div>
        </div>
        <TxSuccessDialog
            open={buySuccess.open}
            onClose={() => setBuySuccess((s) => ({ ...s, open: false }))}
            title="Mua NFT thành công"
            description={buySuccess.description}
            digest={buySuccess.digest}
        />
        </>
    );
}
