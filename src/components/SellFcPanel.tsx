import { useSignAndExecuteTransaction, useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { useMemo, useState } from "react";
import { getOnchainIdsFromEnv } from "../config/onchain";
import { mapApiErrorMessage } from "../services/apiClient";
import {
    buildSellFcForSuiTransaction,
    fcMistFromDecimalInput,
    formatFcFromMist,
    netSuiMistFromSellFcMist,
    pickFcCoinObjects,
} from "../services/marketplaceService";
import { dispatchEconomyRefresh } from "../hooks/useHeaderEconomy";
import { extractSuiTxDigest } from "../utils/extractSuiTxDigest";
import TxSuccessDialog from "./TxSuccessDialog";

/**
 * Off-ramp: burn FC on-chain → receive SUI from `sui_reserve` (10% withdrawal fee to studio).
 */
const SELL_FC_AMOUNT_INPUT_ID = "sell-fc-amount";

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

export default function SellFcPanel() {
    const currentAccount = useCurrentAccount();
    const suiClient = useSuiClient();
    const { mutateAsync: signAndExecute, isPending: walletTxPending } = useSignAndExecuteTransaction();
    const onchainEnv = getOnchainIdsFromEnv();
    const [fcAmountInput, setFcAmountInput] = useState("1");
    const [busy, setBusy] = useState(false);
    const [txFeedback, setTxFeedback] = useState<TxFeedback>(closedFeedback);

    const missingRegistry = !onchainEnv.fcMintRegistryObjectId.trim();
    const addr = currentAccount?.address?.trim();
    const canSubmit = onchainEnv.fcOnrampReady && Boolean(addr);

    const quote = useMemo(() => {
        const t = fcAmountInput.trim();
        if (!t) return null;
        try {
            const fcMist = fcMistFromDecimalInput(t);
            const netSuiMist = netSuiMistFromSellFcMist(fcMist);
            return { fcMist, netSuiMist };
        } catch {
            return null;
        }
    }, [fcAmountInput]);

    return (
        <div className="relative z-50 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 pointer-events-auto">
            <h3 className="text-sm font-semibold">Sell FC</h3>
            {missingRegistry ? (
                <div className="mt-3 rounded-lg border border-amber-900/50 bg-amber-950/25 px-3 py-2 text-[11px] text-amber-100/95">
                    <p className="font-medium text-amber-50">Sell FC is not enabled — missing env</p>
                    <p className="mt-2 text-amber-100/85">
                        Use the same <code className="text-[10px]">VITE_FANTASTIC_FARM_FC_MINT_REGISTRY_OBJECT_ID</code>{" "}
                        as Buy FC. The package must expose <code className="text-[10px]">sell_fc_for_sui</code>.
                    </p>
                </div>
            ) : null}
            {!addr ? (
                <p className="mt-2 text-xs text-[var(--muted)]">Connect a wallet in the header to sign.</p>
            ) : null}
            <div className="mt-3">
                <label htmlFor={SELL_FC_AMOUNT_INPUT_ID} className="block text-[11px] text-[var(--muted)]">
                    FC amount to sell
                </label>
                <input
                    id={SELL_FC_AMOUNT_INPUT_ID}
                    name={SELL_FC_AMOUNT_INPUT_ID}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    spellCheck={false}
                    value={fcAmountInput}
                    onChange={(e) => setFcAmountInput(e.target.value)}
                    className="mt-0.5 w-full max-w-[220px] rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs text-[var(--text)]"
                />
            </div>
            {quote ? (
                <p className="mt-2 text-[11px] text-[var(--muted)] leading-snug">
                    Estimate: sell{" "}
                    <span className="font-medium text-[var(--text)]">{formatFcFromMist(quote.fcMist.toString())} FC</span>
                    {" → "}receive about{" "}
                    <span className="font-medium text-[var(--text)]">
                        {formatFcFromMist(quote.netSuiMist.toString())} SUI
                    </span>{" "}
                    (after 10% fee).
                </p>
            ) : fcAmountInput.trim() ? (
                <p className="mt-2 text-[11px] text-rose-400/90">Invalid FC amount.</p>
            ) : null}
            <button
                type="button"
                disabled={busy || walletTxPending || !canSubmit || !quote || !addr}
                onClick={() => {
                    if (!addr || !quote) return;
                    setBusy(true);
                    void (async () => {
                        try {
                            const { coinObjectIds, totalBalance } = await pickFcCoinObjects(
                                suiClient,
                                addr,
                                onchainEnv.coinType,
                                quote.fcMist,
                            );
                            const tx = await buildSellFcForSuiTransaction(
                                suiClient,
                                onchainEnv.packageId,
                                onchainEnv.fcMintRegistryObjectId,
                                addr,
                                quote.fcMist,
                                coinObjectIds,
                                totalBalance,
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
                            setTxFeedback({
                                open: true,
                                variant: "success",
                                title: "Sell FC succeeded",
                                description: `You should receive about ${formatFcFromMist(quote.netSuiMist.toString())} SUI (after 10% fee).`,
                                digest,
                            });
                        } catch (e: unknown) {
                            const msg = mapApiErrorMessage(e, "Sell FC failed.");
                            const extra =
                                msg.includes("EWithdrawInsufficientReserve") || msg.includes("insufficient reserve")
                                    ? "\n\nReserve SUI only fills when users buy FC (new mint). Ensure the contract `sui_reserve` is funded."
                                    : "";
                            setTxFeedback({
                                open: true,
                                variant: "error",
                                title: "Sell FC failed",
                                description: msg + extra,
                            });
                        } finally {
                            setBusy(false);
                        }
                    })();
                }}
                className="mt-3 rounded bg-amber-950/80 px-3 py-2 text-xs font-medium text-amber-50 hover:brightness-110 disabled:opacity-50"
            >
                {missingRegistry
                    ? "Need VITE_FANTASTIC_FARM_FC_MINT_REGISTRY_OBJECT_ID"
                    : quote
                      ? `Sign — sell ~${formatFcFromMist(quote.netSuiMist.toString())} SUI`
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
