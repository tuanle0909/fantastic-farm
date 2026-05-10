
import { useEffect, useMemo } from "react";
import { useCurrentAccount, useCurrentWallet, useResolveSuiNSName } from "@mysten/dapp-kit";
import { useLocation, useNavigate } from "react-router-dom";
import UnityView from "./components/UnityView";
import GameplayView from "./components/GameplayView";
import { useUiStore } from "./stores/uiStore";
import AppHeader from "./components/AppHeader";
import AppSidebar from "./components/AppSidebar";
import MarketplaceView from "./components/MarketplaceView";
import AvatarDesignerView from "./components/AvatarDesignerView";
import { useClearClientSessionOnWalletDisconnect } from "./hooks/useClearClientSessionOnWalletDisconnect";
import { useHeaderEconomy } from "./hooks/useHeaderEconomy";
import { useOnChainFcMist } from "./hooks/useOnChainFcBalance";
import { formatFcFromMist } from "./services/marketplaceService";

const desktopOnlyQuery = "(max-width: 1023px)";
const shortenAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;
const validPathnames = new Set(["/", "/game", "/gameplay", "/store", "/inventory", "/marketplace", "/avatar"]);
const navItems = [
    { label: "Game", to: "/game" },
    { label: "Marketplace", to: "/marketplace" },
    { label: "Gameplay", to: "/gameplay" },
    { label: "Avatar", to: "/avatar" },
];

function AppLayout() {
    const location = useLocation();
    const navigate = useNavigate();
    const account = useCurrentAccount();
    const currentWallet = useCurrentWallet();
    const { data: suiNsName } = useResolveSuiNSName(account?.address);
    useClearClientSessionOnWalletDisconnect();
    const themeMode = useUiStore((state) => state.themeMode);
    const setThemeMode = useUiStore((state) => state.setThemeMode);
    const isMobileViewport = useUiStore((state) => state.isMobileViewport);
    const setMobileViewport = useUiStore((state) => state.setMobileViewport);

    useEffect(() => {
        const media = window.matchMedia(desktopOnlyQuery);
        const syncMobileState = () => {
            setMobileViewport(media.matches);
        };
        syncMobileState();
        media.addEventListener("change", syncMobileState);
        return () => {
            media.removeEventListener("change", syncMobileState);
        };
    }, [setMobileViewport]);

    useEffect(() => {
        const root = document.documentElement;
        const systemPreference = window.matchMedia("(prefers-color-scheme: dark)");

        const applyTheme = () => {
            const resolvedDark = themeMode === "dark" || (themeMode === "system" && systemPreference.matches);
            root.dataset.theme = resolvedDark ? "dark" : "light";
        };

        applyTheme();
        systemPreference.addEventListener("change", applyTheme);
        return () => {
            systemPreference.removeEventListener("change", applyTheme);
        };
    }, [themeMode]);

    const displayWalletName = useMemo(() => {
        if (currentWallet.connectionStatus !== "connected") {
            return "Wallet not connected";
        }
        return currentWallet.currentWallet.name;
    }, [currentWallet]);

    const displayIdentity = useMemo(() => {
        if (!account?.address) {
            return "";
        }
        return suiNsName ?? shortenAddress(account.address);
    }, [account, suiNsName]);

    const { economy } = useHeaderEconomy(Boolean(account));
    const onChainFcMist = useOnChainFcMist(Boolean(account));
    const economySummary = useMemo(() => {
        if (!account || economy.gold === undefined) {
            return "";
        }
        const parts = [`Gold ${economy.gold}`];
        /**
         * Mongo `fcBalance` = off-chain ledger (convert drops, etc.).
         * Mua FC (`buy_fc_with_sui`) và bán NFT marketplace chỉ đổi on-chain — dùng `getBalance` làm số FC header.
         */
        if (onChainFcMist !== null) {
            parts.push(`FC ${formatFcFromMist(onChainFcMist)} (ví)`);
        } else if (economy.fcBalance !== undefined) {
            parts.push(`FC ${economy.fcBalance} (ledger)`);
        }
        if (economy.level !== undefined) {
            parts.push(`Lv ${economy.level}`);
        }
        if (economy.storageSlots !== undefined) {
            parts.push(`Storage ${economy.storageSlots}`);
        }
        return parts.join(" · ");
    }, [account, economy, onChainFcMist]);
    const activeView =
        location.pathname === "/store"
            ? "store"
            : location.pathname === "/inventory"
              ? "inventory"
              : location.pathname === "/marketplace"
                ? "marketplace"
                : location.pathname === "/avatar"
                  ? "avatar"
                  : location.pathname === "/gameplay"
                  ? "gameplay"
                  : "game";

    useEffect(() => {
        if (location.pathname === "/") {
            navigate("/game", { replace: true });
            return;
        }
        if (!validPathnames.has(location.pathname)) {
            navigate("/game", { replace: true });
        }
    }, [location.pathname, navigate]);

    if (isMobileViewport) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] p-6 text-[var(--text)]">
                <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-center shadow-[0_10px_40px_rgba(0,0,0,0.25)]">
                    <h1 className="text-xl font-semibold">Desktop only</h1>
                    <p className="mt-2 text-sm text-[var(--muted)]">
                        This app is temporarily available for desktop screens only.
                    </p>
                </div>
            </div>
        );
    }

    const mainFrameClass =
        activeView === "game"
            ? "rounded-2xl border-2 border-[var(--border)] bg-[var(--card)] p-2 shadow-[0_6px_28px_rgba(0,0,0,0.1)] sm:p-3 lg:p-4"
            : "rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[0_6px_28px_rgba(0,0,0,0.08)] lg:p-5";
    const mainFrameClassGameplay =
        "rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[0_6px_28px_rgba(0,0,0,0.08)] lg:p-5 max-h-[min(90vh,920px)] overflow-y-auto";
    const mainFrameClassMarketplace =
        "rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[0_6px_28px_rgba(0,0,0,0.08)] lg:p-5 max-h-[min(90vh,920px)] overflow-y-auto";

    return (
        <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
            <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col p-3 sm:p-4 lg:p-6">
                <div className="flex min-h-0 flex-1 flex-col gap-4 rounded-[1.5rem] bg-[var(--shell)] p-3 shadow-[0_4px_32px_rgba(0,0,0,0.07)] sm:p-4 lg:flex-row lg:gap-5 lg:p-5">
                    <AppSidebar items={navItems} pathname={location.pathname} />

                    <div className="flex min-w-0 min-h-0 flex-1 flex-col gap-3 lg:gap-4">
                        <AppHeader
                            themeMode={themeMode}
                            onThemeChange={setThemeMode}
                            isWalletConnected={Boolean(account)}
                            displayIdentity={displayIdentity}
                            displayWalletName={displayWalletName}
                            economySummary={economySummary}
                        />

                        <main
                            className={
                                activeView === "gameplay"
                                    ? mainFrameClassGameplay
                                    : activeView === "marketplace"
                                      ? mainFrameClassMarketplace
                                      : mainFrameClass
                            }
                        >
                            {activeView === "marketplace" ? (
                                <section aria-label="Marketplace">
                                    <MarketplaceView />
                                </section>
                            ) : null}
                            {activeView === "avatar" ? (
                                <section aria-label="Avatar designer">
                                    <AvatarDesignerView />
                                </section>
                            ) : null}
                            {activeView === "gameplay" ? (
                                <section aria-label="Gameplay">
                                    <GameplayView />
                                </section>
                            ) : null}
                            {activeView === "game" ? (
                                <section aria-label="Game">
                                    <UnityView />
                                </section>
                            ) : null}
                        </main>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function App() {
    return <AppLayout />;
}
