import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { ApiError, requestJson } from "./apiClient";
import type { ApiResponse, GameLoadData } from "../types/api";
import { SUI_CLOCK_OBJECT_ID } from "../config/onchain";

export type MintFarmProductProofResponse = {
    packageId: string;
    registryObjectId: string;
    proofBcsBase64: string;
    signatureBase64: string;
    nonce: string;
    expiresAtMs: string;
    speciesCode: number;
    tierCode: number;
};

export async function requestMintFarmProductProof(pendingMintId: string): Promise<MintFarmProductProofResponse> {
    const res = await requestJson<ApiResponse<MintFarmProductProofResponse>>("/onchain/mint-farm-product-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingMintId }),
    });
    if (!res?.data) {
        throw new Error("Invalid farm product mint proof response");
    }
    return res.data;
}

/** Removes matching `pendingFarmProductMints` after on-chain `farm_registry::mint_farm_product`. */
export async function finalizeFarmProductMintOnChain(txDigest: string, pendingMintId: string) {
    return requestJson<ApiResponse<GameLoadData>>("/onchain/finalize-farm-product-mint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txDigest, pendingMintId }),
    });
}

/** `useSignAndExecuteTransaction`: digest is usually top-level; tolerate minor wallet shape drift. */
export function extractSignAndExecuteTransactionDigest(result: unknown): string | undefined {
    if (!result || typeof result !== "object") return undefined;
    const r = result as Record<string, unknown>;
    const top = r.digest ?? r.transactionDigest;
    if (typeof top === "string" && top.trim().length > 0) return top.trim();
    const data = r.data;
    if (data && typeof data === "object") {
        const inner = data as Record<string, unknown>;
        const d = inner.digest ?? inner.transactionDigest;
        if (typeof d === "string" && d.trim().length > 0) return d.trim();
    }
    return undefined;
}

function isProbablyBackendTxIndexingError(err: unknown): boolean {
    const msg =
        err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
    const m = msg.toLowerCase();
    return (
        m.includes("could not load transaction") ||
        m.includes("check digest and rpc") ||
        m.includes("transaction not found")
    );
}

/**
 * Ensures finalize runs after tx is observable on-chain; retries BE when indexing lags — prevents stuck
 * "Đợi thu" + "Mint proof already issued" until reservation TTL.
 */
export async function finalizeFarmProductMintAfterWalletSubmit(
    suiClient: SuiJsonRpcClient,
    signAndExecuteResult: unknown,
    pendingMintId: string,
): Promise<ApiResponse<GameLoadData>> {
    const digest = extractSignAndExecuteTransactionDigest(signAndExecuteResult);
    if (!digest) {
        throw new Error("Missing transaction digest from wallet — cannot finalize mint.");
    }

    await suiClient.waitForTransaction({
        digest,
        options: { showEffects: true, showEvents: true },
        timeout: 90_000,
        pollInterval: 2_000,
    });

    const delaysMs = [0, 1_500, 3_000, 6_000];
    let lastErr: unknown;
    for (const waitMs of delaysMs) {
        if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
        try {
            const res = await finalizeFarmProductMintOnChain(digest, pendingMintId.trim());
            if (!res?.data) throw new Error("Finalize returned no game snapshot");
            return res;
        } catch (e) {
            lastErr = e;
            if (isProbablyBackendTxIndexingError(e)) continue;
            throw e;
        }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        out[i] = bin.charCodeAt(i);
    }
    return out;
}

/** Build PTB: user pays gas; proof must match JWT wallet (enforced on BE + Move). */
export function buildMintFarmProductTransaction(data: MintFarmProductProofResponse): Transaction {
    const proofBytes = base64ToBytes(data.proofBcsBase64);
    const signatureBytes = base64ToBytes(data.signatureBase64);

    const tx = new Transaction();
    tx.moveCall({
        target: `${data.packageId}::farm_registry::mint_farm_product`,
        arguments: [
            tx.object(data.registryObjectId),
            tx.object(SUI_CLOCK_OBJECT_ID),
            tx.pure.vector("u8", Array.from(proofBytes)),
            tx.pure.vector("u8", Array.from(signatureBytes)),
        ],
    });
    return tx;
}
