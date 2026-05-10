import { useEffect, type Dispatch, type SetStateAction } from "react";
import { REQUIRED_SUI_CHAIN } from "../config/chain";
import type { GameLoadData } from "../types/api";
import type { UnityAuthState } from "./useUnityGameAuth";

type AccountLike = { address: string } | null | undefined;

/**
 * Khi web đã xác thực + Unity load xong + đã có snapshot server, báo in-game cho Unity (OnWalletConnected).
 */
export function useUnityOnWalletConnected(
    canRenderGame: boolean,
    isLoaded: boolean,
    authState: UnityAuthState,
    account: AccountLike,
    sendMessage: (gameObjectName: string, methodName: string, parameter?: string) => void,
    setAuthState: Dispatch<SetStateAction<UnityAuthState>>,
    gameSnapshot: GameLoadData | null
) {
    useEffect(() => {
        const address = account?.address;
        if (!canRenderGame || !isLoaded || authState !== "loading-game" || !address || !gameSnapshot) {
            return;
        }

        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAuthState("in-game");
        sendMessage(
            "Vit",
            "OnWalletConnected",
            JSON.stringify({
                walletAddress: address,
                chainId: REQUIRED_SUI_CHAIN,
                game: gameSnapshot,
            })
        );
    }, [
        canRenderGame,
        isLoaded,
        authState,
        account?.address,
        sendMessage,
        setAuthState,
        gameSnapshot,
    ]);
}
