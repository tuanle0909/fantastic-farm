const SESSION_KEY = "fantastic_farm_pending_inventory_v1";

type Stored = {
    walletAddress: string;
    entries: Record<string, number>;
};

function normalizeWallet(walletAddress: string) {
    return walletAddress.toLowerCase().trim();
}

export function loadPendingMapFromSession(walletAddress: string): Map<string, number> {
    const w = normalizeWallet(walletAddress);
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) {
            return new Map();
        }
        const parsed = JSON.parse(raw) as Stored;
        if (parsed.walletAddress !== w || !parsed.entries || typeof parsed.entries !== "object") {
            return new Map();
        }
        const map = new Map<string, number>();
        for (const [k, v] of Object.entries(parsed.entries)) {
            if (typeof v === "number" && v > 0 && Number.isFinite(v)) {
                map.set(k, Math.floor(v));
            }
        }
        return map;
    } catch {
        return new Map();
    }
}

export function savePendingMapToSession(walletAddress: string, map: Map<string, number>) {
    const w = normalizeWallet(walletAddress);
    if (map.size === 0) {
        try {
            const raw = sessionStorage.getItem(SESSION_KEY);
            if (!raw) {
                return;
            }
            const parsed = JSON.parse(raw) as Stored;
            if (parsed.walletAddress === w) {
                sessionStorage.removeItem(SESSION_KEY);
            }
        } catch {
            sessionStorage.removeItem(SESSION_KEY);
        }
        return;
    }

    const entries: Record<string, number> = {};
    for (const [k, v] of map) {
        entries[k] = v;
    }
    const payload: Stored = { walletAddress: w, entries };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
}

export function clearPendingSession() {
    sessionStorage.removeItem(SESSION_KEY);
}
