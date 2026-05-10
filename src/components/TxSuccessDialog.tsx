type TxSuccessDialogProps = {
    open: boolean;
    onClose: () => void;
    title: string;
    description?: string;
    digest?: string;
};

function suiTxExplorerUrl(digest: string): string {
    const net = (import.meta.env.VITE_SUI_NETWORK ?? "testnet").trim() || "testnet";
    return `https://suiscan.xyz/${net}/tx/${digest}`;
}

/**
 * Modal nhỏ sau giao dịch on-chain thành công (mua NFT, mint, v.v.).
 */
export default function TxSuccessDialog({ open, onClose, title, description, digest }: TxSuccessDialogProps) {
    if (!open) return null;

    const txUrl = digest ? suiTxExplorerUrl(digest) : null;

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
                className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-[0_20px_50px_rgba(0,0,0,0.35)]"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 id="tx-success-title" className="text-base font-semibold text-[var(--text)]">
                    {title}
                </h3>
                {description ? (
                    <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">{description}</p>
                ) : null}
                {txUrl ? (
                    <a
                        href={txUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-block text-sm font-medium text-sky-600 underline decoration-sky-600/40 underline-offset-2 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300"
                    >
                        Xem giao dịch trên Suiscan
                    </a>
                ) : null}
                <button
                    type="button"
                    onClick={onClose}
                    className="mt-4 w-full rounded-xl bg-[var(--accent)] px-3 py-2.5 text-sm font-semibold text-[var(--accent-text)] hover:brightness-105"
                >
                    Đóng
                </button>
            </div>
        </div>
    );
}
