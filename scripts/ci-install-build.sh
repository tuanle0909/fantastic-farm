#!/usr/bin/env bash
# CI / Netlify: GitHub Packages auth then npm ci + build.
set -euo pipefail

RAW="${NODE_AUTH_TOKEN:-}"
TOKEN="${RAW//[$'\t\r\n ']}"
if [ -n "${TOKEN}" ]; then
  {
    echo "@tuanle0909:registry=https://npm.pkg.github.com"
    echo "install-links=false"
    echo "//npm.pkg.github.com/:always-auth=true"
    echo "//npm.pkg.github.com/:_authToken=${TOKEN}"
  } > .npmrc
fi

npm ci
npm run build
