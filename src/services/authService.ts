import { setStoredAuth } from "./authStorage";
import { requestJson } from "./apiClient";
import type { AccountProfile, ApiResponse, WalletLoginData } from "../types/api";

export async function loginWithWallet(params: {
    walletAddress: string;
    signature: string;
    bytes: string;
}): Promise<WalletLoginData> {
    const payload = await requestJson<ApiResponse<WalletLoginData>>("/auth/wallet-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
        skipAuth: true,
    });

    const data = payload?.data;
    if (!data?.accessToken || !data?.username) {
        throw new Error("Invalid login response from server");
    }

    setStoredAuth({
        accessToken: data.accessToken,
        walletAddress: data.walletAddress,
    });

    return data;
}

/** Validates stored JWT with the server; keeps token in localStorage on success. */
export async function fetchSession(): Promise<AccountProfile> {
    const payload = await requestJson<ApiResponse<AccountProfile>>("/auth/me", {
        method: "GET",
    });

    if (!payload?.data?.userId) {
        throw new Error("Invalid session response from server");
    }

    return payload.data;
}
