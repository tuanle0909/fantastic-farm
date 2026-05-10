#!/usr/bin/env bash
# Vercel runs this as Install Command so npm can fetch @tuanle0909/fantastic-farm-shared from GPR.
set -euo pipefail
if [ -n "${NODE_AUTH_TOKEN:-}" ]; then
  printf '%s\n' "//npm.pkg.github.com/:_authToken:${NODE_AUTH_TOKEN}" >> .npmrc
fi
npm install
