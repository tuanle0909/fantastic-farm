import { useSignAndExecuteTransaction, useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { useMemo, useState } from "react";
import { getOnchainIdsFromEnv } from "../config/onchain";
import { mapApiErrorMessage } from "../services/apiClient";
import {
    buildBuyFcWithSuiTransaction,
    fcMistFromDecimalInput,
    formatFcFromMist,
    netFcMintedForPaidSuiMist,
    suiMistToBuyAtLeastFcMist,
} from "../services/marketplaceService";
import { dispatchEconomyRefresh } from "../hooks/useHeaderEconomy";

/**
 * On-ramp: nhập **số FC muốn mua** → client tính SUI cần trừ (phí 5% giống Move) → `buy_fc_with_sui`.
 */
const BUY_FC_AMOUNT_INPUT_ID = "buy-fc-amount";

export default function BuyFcPanel() {
    const currentAccount = useCurrentAccount();
    const suiClient = useSuiClient();
    const { mutateAsync: signAndExecute, isPending: walletTxPending } = useSignAndExecuteTransaction();
    const onchainEnv = getOnchainIdsFromEnv();
    const [fcAmountInput, setFcAmountInput] = useState("1");
    const [busy, setBusy] = useState(false);
    const [localError, setLocalError] = useState("");

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

    return (
        <div className="relative z-50 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 pointer-events-auto">
            <h3 className="text-sm font-semibold">Buy FC</h3>
            {missingRegistry ? (
                <div className="mt-3 rounded-lg border border-amber-900/50 bg-amber-950/25 px-3 py-2 text-[11px] text-amber-100/95">
                    <p className="font-medium text-amber-50">Buy FC is not enabled — missing env</p>
                    <p className="mt-1 text-amber-100/85">
                        Add to <code className="text-[10px]">react-client/.env</code> and{" "}
                        <span className="font-medium">restart Vite</span> (
                        <code className="text-[10px]">VITE_*</code> is read only at start):
                    </p>
                    <pre className="mt-2 overflow-x-auto rounded bg-black/30 px-2 py-1.5 text-[10px] text-amber-50/90">
                        VITE_FANTASTIC_FARM_FC_MINT_REGISTRY_OBJECT_ID=0x...
                    </pre>
                    <p className="mt-2 text-amber-100/85">
                        After publishing package with <code className="text-[10px]">FcMintRegistry</code>: in publish tx,{" "}
                        <strong>Created Objects</strong> — type ends with{" "}
                        <code className="text-[10px]">::fantastic_coin::FcMintRegistry</code>, owner{" "}
                        <strong>Shared</strong>.
                    </p>
                </div>
            ) : null}
            {!currentAccount?.address ? (
                <p className="mt-2 text-xs text-[var(--muted)]">Kết nối ví ở header để ký giao dịch.</p>
            ) : null}
            <div className="mt-3">
                <label htmlFor={BUY_FC_AMOUNT_INPUT_ID} className="block text-[11px] text-[var(--muted)]">
                    Số FC muốn mua
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
            {/* {quote ? (
                <p className="mt-2 text-[11px] text-[var(--muted)]">
                    Ước tính: trừ{" "}
                    <span className="font-medium text-[var(--text)]">{formatFcFromMist(quote.paySuiMist.toString())} SUI</span>{" "}
                    từ gas coin → nhận{" "}
                    <span className="font-medium text-[var(--text)]">{formatFcFromMist(quote.mintedFcMist.toString())} FC</span>
                    {quote.mintedFcMist > quote.wantFcMist ? (
                        <span className="text-[var(--muted)]"> (làm tròn phí on-chain, hơi hơn mức bạn gõ)</span>
                    ) : null}
                    .
                </p>
            ) : fcAmountInput.trim() ? (
                <p className="mt-2 text-[11px] text-rose-400/90">Số FC không hợp lệ (ví dụ 1 hoặc 0.5).</p>
            ) : null} */}
            {localError ? <p className="mt-2 text-xs text-rose-500">{localError}</p> : null}
            <button
                type="button"
                disabled={busy || walletTxPending || !canSubmit || !quote}
                onClick={() => {
                    setBusy(true);
                    setLocalError("");
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
                            await signAndExecute({ transaction: tx });
                            dispatchEconomyRefresh();
                        } catch (e: unknown) {
                            setLocalError(mapApiErrorMessage(e, "Buy FC failed."));
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
        </div>
    );
}
