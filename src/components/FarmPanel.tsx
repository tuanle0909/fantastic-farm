import { useCallback, useEffect, useState } from "react";
import { feedChoiceLabels } from "../gameplay/gddUi";
import { mapApiErrorMessage } from "../services/apiClient";
import { SatietyBar } from "./SatietyBar";
import { feedAnimal, loadGameData } from "../services/gameService";
import { dispatchEconomyRefresh } from "../hooks/useHeaderEconomy";
import type { GameLoadData } from "../types/api";

type AnimalRow = {
    _id?: string;
    displayName?: string;
    species?: string;
    satiety?: number;
    isStarter?: boolean;
};

export default function FarmPanel() {
    const [data, setData] = useState<GameLoadData | null>(null);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const reload = useCallback(async () => {
        setError("");
        try {
            const d = await loadGameData();
            setData(d);
        } catch (e: unknown) {
            setError(mapApiErrorMessage(e, "Failed to load farm."));
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const onFeed = async (animalId: string, premium: boolean) => {
        setBusy(true);
        setError("");
        try {
            await feedAnimal(animalId, premium);
            dispatchEconomyRefresh();
            await reload();
        } catch (e: unknown) {
            setError(mapApiErrorMessage(e, "Feed failed."));
        } finally {
            setBusy(false);
        }
    };

    const animals = (data?.animals ?? []) as AnimalRow[];

    return (
        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--text)]">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Farm (server)</h3>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => void reload()}
                    className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:brightness-110 disabled:opacity-50"
                >
                    Sync
                </button>
            </div>
            {error ? <p className="mb-2 text-xs text-rose-500">{error}</p> : null}
            {animals.length === 0 ? (
                <p className="text-xs text-[var(--muted)]">
                    No animals yet. Hatch a starter egg from Inventory (needs wheat to feed after).
                </p>
            ) : (
                <ul className="space-y-2">
                    {animals.map((a) => {
                        const feedLbl = feedChoiceLabels(a.species);
                        return (
                        <li
                            key={String(a._id)}
                            className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs"
                        >
                            <div className="min-w-0 flex-1 space-y-1.5">
                                <div>
                                    <span className="font-medium">{a.displayName ?? a.species}</span>
                                    <span className="ml-2 text-[var(--muted)]">
                                        {a.species}
                                        {a.isStarter ? " · starter" : ""}
                                    </span>
                                </div>
                                <SatietyBar value={a.satiety ?? 0} />
                            </div>
                            <div className="flex shrink-0 gap-1">
                                <button
                                    type="button"
                                    disabled={busy || !a._id}
                                    onClick={() => a._id && void onFeed(a._id, false)}
                                    className="rounded bg-emerald-900/70 px-2 py-1 text-emerald-100 hover:bg-emerald-800 disabled:opacity-50"
                                >
                                    {feedLbl.regular}
                                </button>
                                <button
                                    type="button"
                                    disabled={busy || !a._id}
                                    onClick={() => a._id && void onFeed(a._id, true)}
                                    className="rounded bg-amber-900/70 px-2 py-1 text-amber-100 hover:bg-amber-800 disabled:opacity-50"
                                >
                                    {feedLbl.premium}
                                </button>
                            </div>
                        </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
