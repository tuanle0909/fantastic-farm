import { useEffect, useState } from "react";
import { ConnectButton } from "@mysten/dapp-kit";
import type { ThemeMode } from "../stores/uiStore";

interface AppHeaderProps {
    themeMode: ThemeMode;
    onThemeChange: (mode: ThemeMode) => void;
    isWalletConnected: boolean;
    displayIdentity: string;
    displayWalletName: string;
    /** Gold / level when session is valid (optional). */
    economySummary?: string;
}

function useResolvedDark(themeMode: ThemeMode): boolean {
    const [systemPrefersDark, setSystemPrefersDark] = useState(() =>
        typeof window !== "undefined" ? window.matchMedia("(prefers-color-scheme: dark)").matches : false
    );

    useEffect(() => {
        const media = window.matchMedia("(prefers-color-scheme: dark)");
        const onChange = () => setSystemPrefersDark(media.matches);
        onChange();
        media.addEventListener("change", onChange);
        return () => media.removeEventListener("change", onChange);
    }, []);

    if (themeMode === "dark") {
        return true;
    }
    if (themeMode === "light") {
        return false;
    }
    return systemPrefersDark;
}

function IconSun({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2.25a.75.75 0 01.75.75v2.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM7.5 12a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM18.894 6.166a.75.75 0 00-1.06-1.06l-1.591 1.59a.75.75 0 101.06 1.061l1.591-1.59zM21.75 12a.75.75 0 01-.75.75h-2.25a.75.75 0 010-1.5H21a.75.75 0 01.75.75zM17.834 18.894a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 10-1.061 1.06l1.59 1.591zM12 18a.75.75 0 01.75.75V21a.75.75 0 01-1.5 0v-2.25A.75.75 0 0112 18zM7.758 17.303a.75.75 0 00-1.061-1.06l-1.591 1.59a.75.75 0 001.06 1.061l1.591-1.59zM6 12a.75.75 0 01-.75.75H3a.75.75 0 010-1.5h2.25A.75.75 0 016 12zM6.697 7.757a.75.75 0 001.06-1.06l-1.59-1.591a.75.75 0 00-1.061 1.06l1.59 1.591z" />
        </svg>
    );
}

function IconMoon({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path
                fillRule="evenodd"
                d="M9.528 1.718a.75.75 0 01.162.819A8.97 8.97 0 009 6a9 9 0 009 9 8.97 8.97 0 003.463-.69.75.75 0 01.981.98 10.503 10.503 0 01-9.694 6.46c-5.799 0-10.5-4.701-10.5-10.5 0-4.368 2.667-8.112 6.46-9.694a.75.75 0 01.818.162z"
                clipRule="evenodd"
            />
        </svg>
    );
}

function IconDoc({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
        </svg>
    );
}

function FarmThemeToggle({
    themeMode,
    onThemeChange,
}: {
    themeMode: ThemeMode;
    onThemeChange: (mode: ThemeMode) => void;
}) {
    const isDark = useResolvedDark(themeMode);

    return (
        <div
            className="flex items-center gap-0 rounded-xl border border-[var(--border)] p-0.5"
            style={{ background: "var(--card)" }}
            role="group"
            aria-label="Theme"
        >
            <button
                type="button"
                onClick={() => onThemeChange("light")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    !isDark ? "bg-[var(--theme-pill)] text-[var(--text)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
            >
                <IconSun className="h-4 w-4" />
                Light
            </button>
            <button
                type="button"
                onClick={() => onThemeChange("dark")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                    isDark ? "bg-[var(--nav-inactive)] text-[var(--text)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--text)]"
                }`}
            >
                <IconMoon className="h-4 w-4" />
                Dark
            </button>
        </div>
    );
}

export default function AppHeader({
    themeMode,
    onThemeChange,
    isWalletConnected,
    displayIdentity,
    displayWalletName,
    economySummary: _economySummary,
}: AppHeaderProps) {
    return (
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-2 py-2.5 shadow-[0_6px_20px_rgba(0,0,0,0.06)] sm:gap-3 sm:px-4">
            <div className="min-w-0 text-left">
                <h1 className="text-sm font-bold tracking-tight text-[var(--text)] sm:text-base lg:text-lg">
                    Welcome back !
                </h1>
            </div>
            <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 sm:gap-3">
                <FarmThemeToggle themeMode={themeMode} onThemeChange={onThemeChange} />
                <div className="hidden min-w-0 max-w-[200px] items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-left text-xs sm:flex">
                    {isWalletConnected ? (
                        <>
                            <IconDoc className="h-4 w-4 shrink-0 text-[var(--muted)]" />
                            <div className="min-w-0">
                                <p className="truncate font-semibold text-[var(--text)]">{displayIdentity || "—"}</p>
                                <p className="truncate text-[10px] text-[var(--muted)]">{displayWalletName}</p>
                            </div>
                        </>
                    ) : (
                        <p className="text-[var(--muted)]">Connect your wallet</p>
                    )}
                </div>
                <div className="farm-connect [&_button]:rounded-xl [&_button]:border [&_button]:border-[var(--border)] [&_button]:bg-[var(--surface)] [&_button]:px-3 [&_button]:py-1.5 [&_button]:text-xs [&_button]:font-semibold">
                    <ConnectButton connectText="Connect" />
                </div>
            </div>
        </header>
    );
}
