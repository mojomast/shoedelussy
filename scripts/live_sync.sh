#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="${1:-/home/mojo/projects/strudelussy-live}"
LOCKFILE="/tmp/shoedelussy-live-sync.lock"
export LIVE_WORKER_PORT="${LIVE_WORKER_PORT:-8790}"

exec 9>"${LOCKFILE}"
flock -n 9 || exit 0

cd "${REPO_ROOT}"

git fetch origin main

LOCAL_HEAD="$(git rev-parse HEAD)"
REMOTE_HEAD="$(git rev-parse origin/main)"
UPDATED=0

if [[ "${LOCAL_HEAD}" != "${REMOTE_HEAD}" ]]; then
  git reset --hard origin/main
  UPDATED=1
fi

if [[ ! -d "${REPO_ROOT}/ui/node_modules" ]]; then
  pnpm install --dir "${REPO_ROOT}/ui" --frozen-lockfile
  UPDATED=1
fi

if [[ ! -d "${REPO_ROOT}/server/node_modules" ]]; then
  pnpm install --dir "${REPO_ROOT}/server" --frozen-lockfile
  UPDATED=1
fi

if [[ ${UPDATED} -eq 1 || ! -f "${REPO_ROOT}/ui/dist/index.html" ]]; then
  (cd "${REPO_ROOT}/ui" && VITE_DMX_BRIDGE_URL="${VITE_DMX_BRIDGE_URL:-https://dmxdemo.ussyco.de}" pnpm build)
  pkill -f "${REPO_ROOT}/scripts/public_proxy.py" || true
  pkill -f "${REPO_ROOT}/scripts/run_worker.sh" || true
  pkill -f "${REPO_ROOT}/scripts/dmx_demo_site.py" || true
  # run_worker.sh's wrangler/workerd children can outlive the shell and keep the
  # worker port bound, so kill them explicitly before restarting.
  pkill -f "${REPO_ROOT}/server/node_modules" || true
  pkill -f "wrangler dev .*--port ${LIVE_WORKER_PORT}" || true
fi

# Do not let background child processes inherit the sync lock fd.
exec 9>&-

if ! pgrep -f "${REPO_ROOT}/scripts/run_worker.sh" >/dev/null; then
  nohup bash "${REPO_ROOT}/scripts/run_worker.sh" >/tmp/shoedelussy-live-worker.log 2>&1 &
fi

if ! pgrep -f "${REPO_ROOT}/scripts/public_proxy.py" >/dev/null; then
  nohup python3 "${REPO_ROOT}/scripts/public_proxy.py" >/tmp/shoedelussy-live-proxy.log 2>&1 &
fi

if ! pgrep -f "${REPO_ROOT}/scripts/dmx_demo_site.py" >/dev/null; then
  nohup python3 "${REPO_ROOT}/scripts/dmx_demo_site.py" >/tmp/shoedelussy-dmx-demo.log 2>&1 &
fi
