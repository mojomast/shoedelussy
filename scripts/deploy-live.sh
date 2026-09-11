#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${1:-/home/mojo/projects/strudelussy-live}"
LOCKFILE="/tmp/shoedelussy-deploy-live.lock"

exec 9>"${LOCKFILE}"
flock -n 9 || exit 0

cd "${REPO_ROOT}"

git fetch origin main
git reset --hard origin/main

pnpm install --dir "${REPO_ROOT}/ui" --frozen-lockfile
pnpm install --dir "${REPO_ROOT}/server" --frozen-lockfile

(cd "${REPO_ROOT}/ui" && VITE_DMX_BRIDGE_URL="${VITE_DMX_BRIDGE_URL:-https://dmxdemo.ussyco.de}" pnpm build)

pkill -f "${REPO_ROOT}/scripts/public_proxy.py" || true
pkill -f "${REPO_ROOT}/scripts/run_worker.sh" || true
pkill -f "${REPO_ROOT}/scripts/dmx_demo_site.py" || true

# Do not let background child processes inherit the deploy lock fd.
exec 9>&-

nohup bash "${REPO_ROOT}/scripts/run_worker.sh" >/tmp/shoedelussy-live-worker.log 2>&1 &
nohup python3 "${REPO_ROOT}/scripts/public_proxy.py" >/tmp/shoedelussy-live-proxy.log 2>&1 &
nohup python3 "${REPO_ROOT}/scripts/dmx_demo_site.py" >/tmp/shoedelussy-dmx-demo.log 2>&1 &
