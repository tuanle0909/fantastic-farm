import { useSignAndExecuteTransaction, useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { useMemo, useState } from "react";
import { getOnchainIdsFromEnv } from "../config/onchain";
import { mapApiErrorMessage } from "../services/apiClient";
import {
    buildBuyFcWithSuiTransaction,
    fcMistFromDecimalInput,
    formatFcFromMist,
    netFcMintedForPaidSuiMist,
    netSuiMistFromSellFcMist,
    suiMistToBuyAtLeastFcMist,
} from "../services/marketplaceService";
import { dispatchEconomyRefresh } from "../hooks/useHeaderEconomy";
import { extractSuiTxDigest } from "../utils/extractSuiTxDigest";
import TxSuccessDialog from "./TxSuccessDialog";

/**
 * On-ramp: FC amount → client computes SUI to pay (5% fee like Move) → `buy_fc_with_sui`.
 */
const BUY_FC_AMOUNT_INPUT_ID = "buy-fc-amount";
const ONE_FC_MIST = 1_000_000_000n;

type TxFeedback = {
    open: boolean;
    variant: "success" | "error";
    title: string;
    description?: string;
    digest?: string;
};

const closedFeedback: TxFeedback = {
    open: false,
    variant: "success",
    title: "",
};

export default function BuyFcPanel() {
    const currentAccount = useCurrentAccount();
    const suiClient = useSuiClient();
    const { mutateAsync: signAndExecute, isPending: walletTxPending } = useSignAndExecuteTransaction();
    const onchainEnv = getOnchainIdsFromEnv();
    const [fcAmountInput, setFcAmountInput] = useState("1");
    const [busy, setBusy] = useState(false);
    const [txFeedback, setTxFeedback] = useState<TxFeedback>(closedFeedback);

    const missingRegistry = !onchainEnv.fcMintRegistryObjectId.trim();
    const canSubmit = onchainEnv.fcOnrampReady && Boolean(currentAccount?.address?.trim());

    const quote = useMemo(() => {
        const t = fcAmountInput.trim();
        if (!t) return null;
        try {
            const wantFcMist = fcMistFromDecimalInput(t);
            const paySuiMist = suiMistToBuyAtLeastFcMist(wantFcMist);
            const mintedFcMist = netFcMintedForPaidSuiMist(paySuiMist);
            return {
                paySuiMist,
                mintedFcMist,
                wantFcMist,
            };
        } catch {
            return null;
        }
    }, [fcAmountInput]);

    const sellOneFcNetSuiDisplay = useMemo(
        () => formatFcFromMist(netSuiMistFromSellFcMist(ONE_FC_MIST).toString()),
        [],
    );

    return (
        <div className="relative z-50 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 pointer-events-auto">
            <h3 className="text-sm font-semibold">Buy FC</h3>
            {missingRegistry ? (
                <div className="mt-3 rounded-lg border border-amber-900/50 bg-amber-950/25 px-3 py-2 text-[11px] text-amber-100/95">
                    <p className="font-medium text-amber-50">Buy FC is not enabled — missing env</p>
                    <p className="mt-1 text-amber-100/85">
                        Add to <code className="text-[10px]">react-client/.env</code> and restart Vite (
                        <code className="text-[10px]">VITE_*</code> is read only at build/start):
                    </p>
                    <pre className="mt-2 overflow-x-auto rounded bg-black/30 px-2 py-1.5 text-[10px] text-amber-50/90">
                        VITE_FANTASTIC_FARM_FC_MINT_REGISTRY_OBJECT_ID=0x...
                    </pre>
                    <p className="mt-2 text-amber-100/85">
                        After publishing: in the publish tx <strong>Created Objects</strong>, find type ending with{" "}
                        <code className="text-[10px]">::fantastic_coin::FcMintRegistry</code> (owner <strong>Shared</strong>
                        ).
                    </p>
                </div>
            ) : null}
            {!currentAccount?.address ? (
                <p className="mt-2 text-xs text-[var(--muted)]">Connect a wallet in the header to sign.</p>
            ) : null}
            <div className="mt-3">
                <label htmlFor={BUY_FC_AMOUNT_INPUT_ID} className="block text-[11px] text-[var(--muted)]">
                    FC amount to buy
                </label>
                <input
                    id={BUY_FC_AMOUNT_INPUT_ID}
                    name={BUY_FC_AMOUNT_INPUT_ID}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    spellCheck={false}
                    value={fcAmountInput}
                    onChange={(e) => setFcAmountInput(e.target.value)}
                    className="mt-0.5 w-full max-w-[220px] rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs text-[var(--text)]"
                />
            </div>
            <p className="mt-2 text-[11px] text-[var(--muted)] leading-snug">
                Reference when you sell FC later:{" "}
                <span className="font-medium text-[var(--text)]">1 FC → about {sellOneFcNetSuiDisplay} SUI</span> to
                your wallet (after 10% withdrawal fee).
            </p>
            {quote ? (
                <p className="mt-2 text-[11px] text-[var(--muted)] leading-snug">
                    Estimate: pay ≈{" "}
                    <span className="font-medium text-[var(--text)]">
                        {formatFcFromMist(quote.paySuiMist.toString())} SUI
                    </span>{" "}
                    from your gas coin → receive at least{" "}
                    <span className="font-medium text-[var(--text)]">
                        {formatFcFromMist(quote.wantFcMist.toString())} FC
                    </span>{" "}
                    minted (~
                    <span className="font-medium text-[var(--text)]">
                        {formatFcFromMist(quote.mintedFcMist.toString())} FC
                    </span>{" "}
                    after 5% mint fee / on-chain rounding).
                </p>
            ) : fcAmountInput.trim() ? (
                <p className="mt-2 text-[11px] text-rose-400/90">Invalid FC amount (e.g. 1 or 0.5).</p>
            ) : null}
            <button
                type="button"
                disabled={busy || walletTxPending || !canSubmit || !quote}
                onClick={() => {
                    setBusy(true);
                    void (async () => {
                        try {
                            const wantFcMist = fcMistFromDecimalInput(fcAmountInput);
                            const paySuiMist = suiMistToBuyAtLeastFcMist(wantFcMist);
                            const tx = await buildBuyFcWithSuiTransaction(
                                suiClient,
                                onchainEnv.packageId,
                                onchainEnv.fcMintRegistryObjectId,
                                paySuiMist,
                            );
                            const signed = await signAndExecute({ transaction: tx });
                            const digest = extractSuiTxDigest(signed);
                            if (digest) {
                                await suiClient.waitForTransaction({
                                    digest,
                                    options: { showEffects: true },
                                });
                            }
                            dispatchEconomyRefresh();
                            const minted = netFcMintedForPaidSuiMist(paySuiMist);
                            setTxFeedback({
                                open: true,
                                variant: "success",
                                title: "Buy FC succeeded",
                                description: `You should see about ${formatFcFromMist(minted.toString())} FC in your wallet (5% mint fee already applied on-chain).`,
                                digest,
                            });
                        } catch (e: unknown) {
                            setTxFeedback({
                                open: true,
                                variant: "error",
                                title: "Buy FC failed",
                                description: mapApiErrorMessage(
                                    e,
                                    "The wallet rejected the transaction or the RPC returned an error.",
                                ),
                            });
                        } finally {
                            setBusy(false);
                        }
                    })();
                }}
                className="mt-3 rounded bg-sky-900/80 px-3 py-2 text-xs font-medium text-sky-50 disabled:opacity-50"
            >
                {missingRegistry
                    ? "Need VITE_FANTASTIC_FARM_FC_MINT_REGISTRY_OBJECT_ID"
                    : quote
                      ? `Sign — buy ~${formatFcFromMist(quote.mintedFcMist.toString())} FC`
                      : "Enter FC amount"}
            </button>
            <TxSuccessDialog
                open={txFeedback.open}
                onClose={() => setTxFeedback(closedFeedback)}
                title={txFeedback.title}
                description={txFeedback.description}
                digest={txFeedback.digest}
                variant={txFeedback.variant}
            />
        </div>
    );
}
