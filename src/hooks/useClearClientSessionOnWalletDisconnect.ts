import { useEffect, useRef } from "react";
import { useCurrentWallet } from "@mysten/dapp-kit";
import { clearClientGameSession } from "../services/clientSessionClear";

/**
 * Khi user ngắt ví từ bất kỳ đâu, xóa JWT + pending trên client.
 */
export function useClearClientSessionOnWalletDisconnect() {
    const { connectionStatus } = useCurrentWallet();
    const wasConnected = useRef(false);

    useEffect(() => {
        if (connectionStatus === "connected") {
            wasConnected.current = true;
            return;
        }
        if (connectionStatus === "disconnected" && wasConnected.current) {
            wasConnected.current = false;
            clearClientGameSession();
        }
    }, [connectionStatus]);
}
