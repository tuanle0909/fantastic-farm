import { useState } from "react";
import { mapApiErrorMessage } from "../services/apiClient";
import { buyFeed } from "../services/gameService";
import { dispatchEconomyRefresh } from "../hooks/useHeaderEconomy";

const SHOP_ROWS = [
    { itemKey: "wheat", label: "Wheat", hint: "Feed chickens (5g each)" },
    { itemKey: "grass", label: "Grass", hint: "Feed goat / sheep / cow (8g each)" },
    { itemKey: "golden_wheat", label: "Golden wheat", hint: "Premium feed · 25g" },
    { itemKey: "golden_grass", label: "Golden grass", hint: "Premium feed · 40g" },
] as const;

export default function StoreView() {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [ok, setOk] = useState("");

    const buy = async (itemKey: string) => {
        setBusy(true);
        setError("");
        setOk("");
        try {
            await buyFeed(itemKey, 1);
            dispatchEconomyRefresh();
            setOk(`Bought 1× ${itemKey}.`);
        } catch (e: unknown) {
            setError(mapApiErrorMessage(e, "Purchase failed."));
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="rounded-xl bg-[var(--surface)] p-6 text-[var(--text)]">
            <h2 className="text-2xl font-semibold">Shop</h2>
            <p className="mt-2 text-sm text-[var(--muted)]">Spend gold on feed. Prices match GDD v4 base costs.</p>
            {error ? <p className="mt-3 text-sm text-rose-500">{error}</p> : null}
            {ok ? <p className="mt-3 text-sm text-emerald-600 dark:text-emerald-400">{ok}</p> : null}
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {SHOP_ROWS.map((row) => (
                    <li
                        key={row.itemKey}
                        className="flex flex-col gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4"
                    >
                        <div>
                            <p className="font-semibold">{row.label}</p>
                            <p className="text-xs text-[var(--muted)]">{row.hint}</p>
                        </div>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void buy(row.itemKey)}
                            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm font-medium hover:brightness-110 disabled:opacity-50"
                        >
                            Buy 1
                        </button>
                    </li>
                ))}
            </ul>
        </section>
    );
}
