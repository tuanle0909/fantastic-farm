/** Best-effort digest from dapp-kit `signAndExecute` / wallet result. */
export function extractSuiTxDigest(result: unknown): string | undefined {
    if (result && typeof result === "object" && "digest" in result) {
        const digest = (result as { digest: unknown }).digest;
        return typeof digest === "string" && digest.length > 0 ? digest : undefined;
    }
    return undefined;
}
