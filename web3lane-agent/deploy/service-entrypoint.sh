#!/bin/sh
set -eu

data_root="${WEB3LANE_DATA_ROOT:-/app/.local}"
clients_file="${WEB3LANE_API_CLIENTS_FILE:-$data_root/api-clients.json}"
runner_adapter="${WEB3LANE_RUNNER_ADAPTER:-}"

if [ -z "$runner_adapter" ]; then
  echo "WEB3LANE_RUNNER_ADAPTER must name the trusted runner adapter" >&2
  exit 64
fi
case "$runner_adapter" in
  /*) ;;
  *) echo "WEB3LANE_RUNNER_ADAPTER must be an absolute in-container path" >&2; exit 64 ;;
esac
if [ ! -f "$runner_adapter" ]; then
  echo "Trusted runner adapter is not mounted: $runner_adapter" >&2
  exit 64
fi
if [ ! -f "$clients_file" ]; then
  echo "Missing operator-provisioned API client hashes: $clients_file" >&2
  exit 64
fi

Xvfb "$DISPLAY" -screen 0 1365x1024x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &
exec node agent-api.mjs
