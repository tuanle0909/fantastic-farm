import { useMemo, useState } from "react";
import {
    AVATAR_CANVAS_PX,
    EYES_LAYER_URL,
    baseLayerUrl,
    maleHairVariants,
    maleOutfitVariants,
} from "../config/avatarAssetUrls";
import type { AvatarGenderId } from "../config/avatarAssetUrls";

/**
 * Stacks full-canvas SVGs: base (rear) → outfit → eyes → hair (front).
 * Asset positions come from authoring (1024×1024).
 */
export default function AvatarDesignerView() {
    const [gender, setGender] = useState<AvatarGenderId>("male");
    const [hairId, setHairId] = useState<string>("hair1");
    const [outfitId, setOutfitId] = useState<string>("outfit1");
    const showEyesOverlay = true;

    const baseUrl = baseLayerUrl(gender);
    const hairUrl =
        gender === "male" ? maleHairVariants.find((h) => h.id === hairId)?.url ?? "" : "";
    const outfitUrl =
        gender === "male" ? maleOutfitVariants.find((o) => o.id === outfitId)?.url ?? "" : "";

    const stackLayers = useMemo(() => {
        const layers: { key: string; src: string }[] = [{ key: "base", src: baseUrl }];
        if (outfitUrl) layers.push({ key: "outfit", src: outfitUrl });
        if (showEyesOverlay) layers.push({ key: "eyes", src: EYES_LAYER_URL });
        if (hairUrl) layers.push({ key: "hair", src: hairUrl });
        return layers;
    }, [baseUrl, outfitUrl, hairUrl, showEyesOverlay]);

    return (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="shrink-0 space-y-2">
                <h2 className="text-lg font-semibold text-[var(--text)]">Avatar</h2>
                <div
                    className="relative mx-auto overflow-hidden rounded-xl border border-[var(--border)] bg-[#f6f4ef]"
                    style={{ width: 320, height: 320 }}
                >
                    {stackLayers.map(({ key, src }, i) => (
                        <img
                            key={`${key}-${i}`}
                            src={src}
                            alt=""
                            width={AVATAR_CANVAS_PX}
                            height={AVATAR_CANVAS_PX}
                            className="pointer-events-none absolute left-0 top-0 h-full w-full select-none object-contain"
                            style={{ zIndex: i }}
                        />
                    ))}
                </div>
            </div>
            <div className="min-w-0 flex-1 space-y-5">
                <section className="space-y-2">
                    <label className="block text-xs font-medium text-[var(--text)]">Gender</label>
                    <div className="flex flex-wrap gap-2">
                        {(["male", "female"] as const).map((g) => (
                            <button
                                key={g}
                                type="button"
                                onClick={() => setGender(g)}
                                className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize transition ${
                                    gender === g
                                        ? "bg-[var(--accent)] text-[var(--accent-text)]"
                                        : "border border-[var(--border)] bg-[var(--card)] text-[var(--text)] hover:brightness-95"
                                }`}
                            >
                                {g === "male" ? "Male" : "Female"}
                            </button>
                        ))}
                    </div>
                    {/* {gender === "female" ? (
                        <p className="text-xs text-amber-200/90">
                            Chưa có thư mục hair/outfit riêng cho female trong repo — chỉ hiển thị base +
                            optional eyes.
                        </p>
                    ) : null} */}
                </section>

                <section className="space-y-2">
                    <label className="block text-xs font-medium text-[var(--text)]">
                        Outfit
                    </label>
                    <select
                        value={gender === "male" ? outfitId : "none"}
                        disabled={gender !== "male"}
                        onChange={(e) => setOutfitId(e.target.value)}
                        className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] disabled:opacity-50"
                    >
                        {maleOutfitVariants.map((o) => (
                            <option key={o.id} value={o.id}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </section>
 
                {/* <section className="space-y-2">
                    <label className="flex items-center gap-2 text-xs font-medium text-[var(--text)]">
                        <input
                            type="checkbox"
                            checked={showEyesOverlay}
                            onChange={(e) => setShowEyesOverlay(e.target.checked)}
                            className="accent-[var(--accent)]"
                        />
                        Hiện lớp mắt <span className="font-mono">eyes.svg</span>
                    </label>
                </section> */}
 
                <section className="space-y-2">
                    <label className="block text-xs font-medium text-[var(--text)]">
                        Hair
                    </label>
                    <select
                        value={gender === "male" ? hairId : "none"}
                        disabled={gender !== "male"}
                        onChange={(e) => setHairId(e.target.value)}
                        className="w-full max-w-sm rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] disabled:opacity-50"
                    >
                        {maleHairVariants.map((h) => (
                            <option key={h.id} value={h.id}>
                                {h.label}
                            </option>
                        ))}
                    </select>
                </section>
            </div>
        </div>
    );
}
