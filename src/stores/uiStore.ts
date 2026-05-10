import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";

interface UiStoreState {
    themeMode: ThemeMode;
    isMobileViewport: boolean;
    setThemeMode: (mode: ThemeMode) => void;
    setMobileViewport: (isMobile: boolean) => void;
}

export const useUiStore = create<UiStoreState>()(
    persist(
        (set) => ({
            themeMode: "system",
            isMobileViewport: false,
            setThemeMode: (mode) => set({ themeMode: mode }),
            setMobileViewport: (isMobile) => set({ isMobileViewport: isMobile }),
        }),
        {
            name: "fantastic-ui-store",
            partialize: (state) => ({ themeMode: state.themeMode }),
        }
    )
);
