/** Thanh độ no: giá trị API là satiety 0–100 (100 = no đủ). */
export function SatietyBar({ value, className = "" }: { value: number; className?: string }) {
    const pct = Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
    const fillClass =
        pct > 50 ? "bg-emerald-500" : pct > 25 ? "bg-amber-500" : pct > 0 ? "bg-orange-600" : "bg-rose-600";

    return (
        <div className={`w-full min-w-[140px] max-w-[280px] ${className}`}>
            <div className="mb-0.5 flex justify-between gap-2 text-[10px] text-[var(--muted)]">
                <span>Độ no (satiety)</span>
                <span className="tabular-nums text-[var(--text)]">{pct}%</span>
            </div>
            <div
                className="h-2.5 w-full overflow-hidden rounded-full border border-[var(--border)] bg-[var(--surface)]"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Satiety ${pct} percent`}
            >
                <div
                    className={`h-full rounded-full transition-[width] duration-300 ease-out ${fillClass}`}
                    style={{ width: `${pct}%` }}
                />
            </div>
            <p className="mt-0.5 text-[9px] text-[var(--muted)]">Thanh = độ no (100% no đủ, thấp = đói hơn).</p>
        </div>
    );
}
