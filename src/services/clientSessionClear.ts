import { clearStoredAuth } from "./authStorage";
import { clearPendingSession } from "./pendingInventorySession";

/** Cùng key với UnityView — lưu ví last login để UX "continue" */
export const LAST_WALLET_ADDRESS_KEY = "last_connected_wallet_address";

/**
 * Gọi khi user ngắt ví: xóa JWT, pending inventory, flag ví.
 * Idempotent, an toàn gọi nhiều lần.
 */
export function clearClientGameSession() {
    clearStoredAuth();
    clearPendingSession();
    try {
        localStorage.removeItem(LAST_WALLET_ADDRESS_KEY);
    } catch {
        // ignore
    }
}
