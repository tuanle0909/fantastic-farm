import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import logoImage from "../assets/logo.png";

export interface NavItem {
    label: string;
    to: string;
}

interface AppSidebarProps {
    items: NavItem[];
    pathname: string;
}

function IconGame({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
        </svg>
    );
}

function IconInventory({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            />
        </svg>
    );
}

function IconShop({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
            />
        </svg>
    );
}

function IconGameplay({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h16" />
        </svg>
    );
}

function IconMarketplace({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 10h18M3 14h18M6 6h12v12H6V6z M9 10v4m6-4v4"
            />
        </svg>
    );
}

function IconAvatar({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM4 21v-1a6 6 0 0112 0v1"
            />
        </svg>
    );
}

const iconByPath: Record<string, ComponentType<{ className?: string }>> = {
    "/game": IconGame,
    "/gameplay": IconGameplay,
    "/inventory": IconInventory,
    "/marketplace": IconMarketplace,
    "/store": IconShop,
    "/avatar": IconAvatar,
};

export default function AppSidebar({ items, pathname }: AppSidebarProps) {
    return (
        <aside className="w-full shrink-0 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[0_6px_24px_rgba(0,0,0,0.08)] lg:w-[220px]">
            <Link to="/game" className="mb-4 block">
                <img
                    src={logoImage}
                    alt="Fantastic Farm"
                    className="h-auto w-full max-w-[200px] object-contain"
                />
            </Link>
            <nav className="flex flex-col gap-2">
                {items.map((item) => {
                    const isActive = pathname === item.to;
                    const Icon = iconByPath[item.to] ?? IconGame;
                    return (
                        <Link
                            key={item.to}
                            to={item.to}
                            className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                                isActive
                                    ? "bg-[var(--accent)] text-[var(--accent-text)] shadow-[0_2px_12px_rgba(162,215,41,0.45)]"
                                    : "bg-[var(--nav-inactive)] text-[var(--nav-inactive-text)] hover:brightness-95"
                            }`}
                        >
                            <Icon className="h-5 w-5 shrink-0 opacity-90" />
                            {item.label}
                        </Link>
                    );
                })}
            </nav>
        </aside>
    );
}
