import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** Repo root when this folder is the git root (e.g. github.com/.../fantastic-farm). */
const projectRoot = __dirname;
/** Parent of `react-client/` when inside monorepo (Fantastic Team). */
const monorepoRoot = path.resolve(__dirname, "..");

const avatarAssetsDir = existsSync(path.join(projectRoot, "avatar-assets"))
    ? path.join(projectRoot, "avatar-assets")
    : path.join(monorepoRoot, "avatar-assets");

const localSharedTsAtSibling = path.resolve(monorepoRoot, "shared/src/index.ts");
const localSharedTsNone = path.resolve(projectRoot, "node_modules/@fantastic-farm/shared/dist/index.js");
/** Monorepo: TS source from ../shared. Standalone clone: installed package from GitHub Packages. */
const sharedAlias = existsSync(localSharedTsAtSibling)
    ? localSharedTsAtSibling
    : localSharedTsNone;

const fsAllow = existsSync(path.join(monorepoRoot, "shared"))
    ? [monorepoRoot, projectRoot]
    : [projectRoot];

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        tailwindcss(),
        react(),
        babel({ presets: [reactCompilerPreset()] }),
    ],
    /** `shared` is built as CJS (`tsc`); Vite ESM imports need TS source or ESM dist. */
    resolve: {
        alias: {
            "@fantastic-farm/shared": sharedAlias,
            "@avatar-assets": avatarAssetsDir,
        },
    },
    server: {
        fs: {
            allow: fsAllow,
        },
    },
});
