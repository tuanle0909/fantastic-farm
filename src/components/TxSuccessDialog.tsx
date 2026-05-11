type TxSuccessDialogProps = {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    digest?: string;
    /** Error styling (no explorer link unless digest is set). */
    variant?: "success" | "error";
};

function suiTxExplorerUrl(digest: string): string {
    const net = (import.meta.env.VITE_SUI_NETWORK ?? "testnet").trim() || "testnet";
    return `https://suiscan.xyz/${net}/tx/${digest}`;
}

/**
 * Small modal after on-chain success, or to surface wallet / RPC errors in the same layout.
 */
export default function TxSuccessDialog({
    open,
    onClose,
    title,
    description,
    digest,
    variant = "success",
}: TxSuccessDialogProps) {
    if (!open) return null;

    const isError = variant === "error";
    const txUrl = digest ? suiTxExplorerUrl(digest) : null;

    const panelClass = isError
        ? "border-rose-500/40 bg-[var(--card)] ring-1 ring-rose-500/15"
        : "border-[var(--border)] bg-[var(--card)]";

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4"
            role="presentation"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="tx-success-title"
                className={`w-full max-w-sm rounded-2xl border p-5 shadow-[0_20px_50px_rgba(0,0,0,0.35)] ${panelClass}`}
                onClick={(e) => e.stopPropagation()}
            >
                <h3
                    id="tx-success-title"
                    className={`text-base font-semibold ${isError ? "text-rose-600 dark:text-rose-400" : "text-[var(--text)]"}`}
                >
                    {title}
                </h3>
                {description ? (
                    <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed whitespace-pre-wrap">{description}</p>
                ) : null}
                {txUrl ? (
                    <a
                        href={txUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-block text-sm font-medium text-sky-600 underline decoration-sky-600/40 underline-offset-2 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300"
                    >
                        View on Suiscan
                    </a>
                ) : null}
                <button
                    type="button"
                    onClick={onClose}
                    className={
                        isError
                            ? "mt-4 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm font-semibold text-[var(--text)] hover:brightness-105"
                            : "mt-4 w-full rounded-xl bg-[var(--accent)] px-3 py-2.5 text-sm font-semibold text-[var(--accent-text)] hover:brightness-105"
                    }
                >
                    Close
                </button>
            </div>
        </div>
    );
}
