const AUTH_STORAGE_KEY = "fantastic_farm_auth_v1";

export type StoredAuth = {
    accessToken: string;
    walletAddress: string;
};

export function getStoredAuth(): StoredAuth | null {
    try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw) as unknown;
        if (
            typeof parsed === "object" &&
            parsed !== null &&
            "accessToken" in parsed &&
            "walletAddress" in parsed &&
            typeof (parsed as StoredAuth).accessToken === "string" &&
            typeof (parsed as StoredAuth).walletAddress === "string"
        ) {
            return {
                accessToken: (parsed as StoredAuth).accessToken,
                walletAddress: (parsed as StoredAuth).walletAddress.toLowerCase().trim(),
            };
        }
    } catch {
        // ignore
    }
    return null;
}

export function setStoredAuth(params: StoredAuth) {
    localStorage.setItem(
        AUTH_STORAGE_KEY,
        JSON.stringify({
            accessToken: params.accessToken,
            walletAddress: params.walletAddress.toLowerCase().trim(),
        })
    );
}

export function clearStoredAuth() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
}
