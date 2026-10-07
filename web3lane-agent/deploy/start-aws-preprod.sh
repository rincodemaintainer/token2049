#!/usr/bin/env bash
set -euo pipefail

: "${WEB3LANE_WALLET_SECRET_ARN:?Set the exact Secrets Manager ARN for the wallet env}"
: "${WEB3LANE_API_BASE_URL:?Set the public HTTPS API URL}"
case "$WEB3LANE_API_BASE_URL" in
  https://*) ;;
  *) echo 'WEB3LANE_API_BASE_URL must be HTTPS' >&2; exit 1 ;;
esac

if [[ ${EUID} -ne 0 ]]; then
  echo 'Run as root on the SSM-managed runner host' >&2
  exit 1
fi
if docker container inspect web3lane-runner >/dev/null 2>&1; then
  echo 'web3lane-runner already exists; inspect its job state before replacing it' >&2
  exit 1
fi

install -d -m 0700 /etc/wallet-qa /etc/wallet-qa/private
install -d -m 0700 -o 10001 -g 10001 /var/lib/wallet-qa/data

normalize_secret='import json, os, sys
raw, path, kind = sys.argv[1:]
required = ({"QMS_TEST_WALLET_ADDRESS", "QMS_TEST_WALLET_PASSWORD", "QMS_TEST_WALLET_MNEMONIC", "X402_PAY_TO"}
            if kind == "wallet" else {"MPS_RUNTIME_TOKEN"})
if raw.lstrip().startswith("{"):
    values = json.loads(raw)
    if not isinstance(values, dict) or any(not isinstance(value, str) for value in values.values()):
        raise SystemExit("Secret must be a string key/value object")
    content = "".join(f"{key}={json.dumps(values[key])}\n" for key in sorted(required) if key in values)
else:
    lines = [line for line in raw.splitlines() if line.strip()]
    values = dict(line.split("=", 1) for line in lines if "=" in line)
    content = raw if raw.endswith("\n") else raw + "\n"
if set(values) != required or any(not values[key].strip() for key in required):
    raise SystemExit("Secret must contain exactly the required env keys")
if kind == "wallet" and values["QMS_TEST_WALLET_ADDRESS"].strip("\"\x27").lower() != "0x6ba7c2cb493834d922028ee7b2c33ab99b0c6210":
    raise SystemExit("Wallet address differs from the approved Qwap runner")
fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
os.write(fd, content.encode())
os.close(fd)'
wallet_ref="{{resolve:secretsmanager:${WEB3LANE_WALLET_SECRET_ARN}:SecretString}}"
/usr/local/bin/asm-exec -- python3 -c "$normalize_secret" "$wallet_ref" /etc/wallet-qa/wallet.env wallet
chown root:10001 /etc/wallet-qa/wallet.env
chmod 0640 /etc/wallet-qa/wallet.env

pay_to="$(python3 - <<'PY'
from pathlib import Path
value = next(line.split('=', 1)[1] for line in Path('/etc/wallet-qa/wallet.env').read_text().splitlines() if line.startswith('X402_PAY_TO='))
print(value.strip().strip('"').strip("'"))
PY
)"
case "$pay_to" in
  addr_test1*) ;;
  *) echo 'X402_PAY_TO is not a Cardano testnet address' >&2; exit 1 ;;
esac

{
  printf 'WEB3LANE_RUNNER_ADAPTER=/app/live-runner/qwap-runner.mjs\n'
  printf 'X402_PAY_TO=%s\n' "$pay_to"
  printf 'X402_RESOURCE_URL=%s/x402/jobs\n' "${WEB3LANE_API_BASE_URL%/}"
} > /etc/wallet-qa/service.env

if [[ -n ${WEB3LANE_MPS_ENV_SECRET_ARN:-} || -n ${MPS_URL:-} ]]; then
  : "${WEB3LANE_MPS_ENV_SECRET_ARN:?Set the exact MPS env secret ARN}"
  : "${MPS_URL:?Set the reachable Masumi payment service URL}"
  mps_ref="{{resolve:secretsmanager:${WEB3LANE_MPS_ENV_SECRET_ARN}:SecretString}}"
  /usr/local/bin/asm-exec -- python3 -c "$normalize_secret" "$mps_ref" /etc/wallet-qa/mps-runtime.env mps
  printf 'MPS_URL=%s\n' "$MPS_URL" >> /etc/wallet-qa/service.env
  cat /etc/wallet-qa/mps-runtime.env >> /etc/wallet-qa/service.env
fi
chmod 0600 /etc/wallet-qa/service.env

docker run -d --name web3lane-runner --init --restart unless-stopped \
  --stop-timeout 20 --read-only --shm-size 1g \
  --tmpfs /tmp:rw,nosuid,nodev,size=1g \
  --cap-drop ALL --security-opt no-new-privileges:true \
  -p 127.0.0.1:21950:21950 \
  --env-file /etc/wallet-qa/service.env \
  -e AGENT_API_HOST=0.0.0.0 -e AGENT_API_PORT=21950 \
  -e WEB3LANE_DATA_ROOT=/app/.local \
  -e WEB3LANE_API_CLIENTS_FILE=/app/.local/api-clients.json \
  --mount type=bind,source=/var/lib/wallet-qa/data,target=/app/.local \
  --mount type=bind,source=/etc/wallet-qa/wallet.env,target=/app/.env,readonly \
  --mount type=bind,source=/etc/wallet-qa/private,target=/run/web3lane/private,readonly \
  --mount type=bind,source=/opt/wallet-qa/metamask-chrome-13.13.1,target=/app/.cache-synpress/metamask-chrome-13.13.1,readonly \
  web3lane-paid-browser:preprod >/dev/null

curl -fsS --retry 10 --retry-delay 3 http://127.0.0.1:21950/availability
