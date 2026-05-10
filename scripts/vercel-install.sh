#!/usr/bin/env bash
# Vercel Install Command: GPR auth must use _authToken=VALUE (equals), not a colon before the token.
set -euo pipefail

RAW="${NODE_AUTH_TOKEN:-}"
TOKEN="${RAW//[$'\t\r\n ']}"
if [ ${#TOKEN} -lt 20 ]; then
  echo "vercel-install.sh: NODE_AUTH_TOKEN missing or invalid on Vercel (Settings → Environment Variables)."
  exit 1
fi

{
  echo "@tuanle0909:registry=https://npm.pkg.github.com"
  echo "install-links=false"
  echo "//npm.pkg.github.com/:always-auth=true"
  echo "//npm.pkg.github.com/:_authToken=${TOKEN}"
} > .npmrc

npm install
