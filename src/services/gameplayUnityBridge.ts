/**
 * Bridge for Unity UI-only builds: React owns logic; Unity subscribes and renders.
 *
 * **Same-window (WebGL template script):**
 *   `window.addEventListener('fantastic-farm:gameplay', (e) => { const p = e.detail; ... })`
 *
 * **iframe wrapper:** listen to `window.addEventListener('message', ...)` and filter
 *   `event.data?.channel === 'fantastic-farm-gameplay'`.
 *
 * **Payload shape** mirrors `Vit.OnWalletConnected` JSON: `{ walletAddress, chainId, game }`.
 * Updates use `{ source, game }` so Unity can diff without full wallet resend.
 */
import { REQUIRED_SUI_CHAIN } from "../config/chain";
import type { GameLoadData } from "../types/api";

export const GAMEPLAY_BRIDGE_EVENT = "fantastic-farm:gameplay";

export type GameplayBridgePayload =
    | {
          kind: "wallet_and_game";
          walletAddress: string;
          chainId: string;
          game: GameLoadData;
      }
    | {
          kind: "game_updated";
          source: string;
          game: GameLoadData;
      };

declare global {
    interface Window {
        /** Last payload for late-mounting Unity or debugging. */
        __FANTASTIC_FARM_GAMEPLAY_LAST__?: GameplayBridgePayload;
    }
}

export function emitGameplayToUnity(payload: GameplayBridgePayload) {
    if (typeof window === "undefined") return;
    window.__FANTASTIC_FARM_GAMEPLAY_LAST__ = payload;
    window.dispatchEvent(new CustomEvent(GAMEPLAY_BRIDGE_EVENT, { detail: payload }));
    try {
        window.parent?.postMessage({ channel: "fantastic-farm-gameplay", payload }, "*");
    } catch {
        /* cross-origin restrictions */
    }
}

/** Initial sync after login — same JSON shape Unity expects from `OnWalletConnected`. */
export function emitWalletAndGame(walletAddress: string, game: GameLoadData) {
    emitGameplayToUnity({
        kind: "wallet_and_game",
        walletAddress,
        chainId: REQUIRED_SUI_CHAIN,
        game,
    });
}

export function emitGameUpdated(source: string, game: GameLoadData) {
    emitGameplayToUnity({ kind: "game_updated", source, game });
}

export function subscribeGameplayBridge(handler: (payload: GameplayBridgePayload) => void) {
    const fn = (e: Event) => {
        handler((e as CustomEvent<GameplayBridgePayload>).detail);
    };
    window.addEventListener(GAMEPLAY_BRIDGE_EVENT, fn);
    return () => window.removeEventListener(GAMEPLAY_BRIDGE_EVENT, fn);
}
