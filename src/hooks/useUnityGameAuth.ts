import { useEffect, useMemo, useState } from "react";
import { useCurrentAccount, useSignPersonalMessage } from "@mysten/dapp-kit";
import { dispatchEconomyRefresh } from "./useHeaderEconomy";
import { mapApiErrorMessage } from "../services/apiClient";
import { clearStoredAuth, getStoredAuth } from "../services/authStorage";
import { LAST_WALLET_ADDRESS_KEY } from "../services/clientSessionClear";
import { fetchSession, loginWithWallet } from "../services/authService";
import { REQUIRED_SUI_CHAIN } from "../config/chain";

export type UnityAuthState =
    | "idle"
    | "choose-wallet"
    | "signing"
    | "verifying"
    | "loading-game"
    | "in-game"
    | "error";

/**
 * Chọn ví → ký / restore session → trạng thái vào game (loading / in-game do view xử lý thêm).
 */
export function useUnityGameAuth() {
    const account = useCurrentAccount();
    const { mutateAsync: signPersonalMessage } = useSignPersonalMessage();
    const [authState, setAuthState] = useState<UnityAuthState>("idle");
    const [errorMessage, setErrorMessage] = useState("");
    const [signedPayload, setSignedPayload] = useState<{ signature: string; bytes: string } | null>(null);

    const isOnTestnet = useMemo(
        () => account?.chains?.includes(REQUIRED_SUI_CHAIN) ?? false,
        [account?.chains]
    );

    const isReturningWithKnownWallet = useMemo(() => {
        if (!account) {
            return false;
        }
        const lastConnectedWallet = localStorage.getItem(LAST_WALLET_ADDRESS_KEY);
        return lastConnectedWallet === account.address.toLowerCase();
    }, [account]);

    const canRenderGame = authState === "loading-game" || authState === "in-game";

    useEffect(() => {
        if (!account) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setAuthState("idle");
            setErrorMessage("");
            setSignedPayload(null);
            return;
        }
        if (!isOnTestnet) {
            setAuthState("error");
            setErrorMessage(`Wrong network. Please switch Slush Wallet to ${REQUIRED_SUI_CHAIN}.`);
            return;
        }

        const stored = getStoredAuth();
        if (stored && stored.walletAddress !== account.address.toLowerCase()) {
            clearStoredAuth();
        }

        if (!signedPayload) {
            const authForWallet = getStoredAuth();
            if (authForWallet && authForWallet.walletAddress === account.address.toLowerCase()) {
                let cancelled = false;
                setErrorMessage("");
                setAuthState("verifying");

                const restore = async () => {
                    try {
                        await fetchSession();
                        if (!cancelled) {
                            localStorage.setItem(LAST_WALLET_ADDRESS_KEY, account.address.toLowerCase());
                            dispatchEconomyRefresh();
                            setAuthState("loading-game");
                        }
                    } catch {
                        if (!cancelled) {
                            clearStoredAuth();
                            setAuthState("choose-wallet");
                        }
                    }
                };

                void restore();
                return () => {
                    cancelled = true;
                };
            }

            setAuthState("choose-wallet");
            return;
        }

        let cancelled = false;
        setErrorMessage("");
        setAuthState("verifying");

        const normalizedWallet = account.address.toLowerCase();

        const verify = async () => {
            await loginWithWallet({
                walletAddress: account.address,
                signature: signedPayload!.signature,
                bytes: signedPayload!.bytes,
            });

            if (!cancelled) {
                localStorage.setItem(LAST_WALLET_ADDRESS_KEY, normalizedWallet);
                dispatchEconomyRefresh();
                setAuthState("loading-game");
            }
        };

        verify().catch((error: unknown) => {
            if (!cancelled) {
                clearStoredAuth();
                setSignedPayload(null);
                setAuthState("error");
                setErrorMessage(mapApiErrorMessage(error, "Session verification failed."));
            }
        });

        return () => {
            cancelled = true;
        };
    }, [account, signedPayload, isOnTestnet]);

    const handleContinueWithConnectedWallet = async () => {
        try {
            setErrorMessage("");
            setAuthState("signing");
            const message = "Sign in to Fantastic Farm";
            const messageBytes = new TextEncoder().encode(message);
            const { signature, bytes } = await signPersonalMessage({
                message: messageBytes,
            });
            setSignedPayload({ signature, bytes });
        } catch (error) {
            setErrorMessage(mapApiErrorMessage(error, "Failed to sign message."));
            setAuthState("choose-wallet");
        }
    };

    return {
        account,
        authState,
        setAuthState,
        errorMessage,
        setErrorMessage,
        signedPayload,
        setSignedPayload,
        isOnTestnet,
        isReturningWithKnownWallet,
        canRenderGame,
        handleContinueWithConnectedWallet,
    };
}
