#!/usr/bin/env bash
# CI / Netlify / Vercel (build hook): GitHub Packages auth then npm ci + build.
set -euo pipefail
if [ -n "${NODE_AUTH_TOKEN:-}" ]; then
  printf '%s\n' "//npm.pkg.github.com/:_authToken:${NODE_AUTH_TOKEN}" >> .npmrc
fi
npm ci
npm run build
