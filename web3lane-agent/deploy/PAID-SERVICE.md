# Paid/browser service host

This is one persistent Linux Docker service. Keep Eve and static reports on Vercel. Do not scale this Compose service: the durable lock deliberately prevents a second worker from processing the same payment state.

## Host layout

Create an operator-owned private directory outside this repository for service configuration. The Qwap-only trusted adapter is included in the image at `/app/live-runner/qwap-runner.mjs`. Keep the wallet environment file and current `metamask-chrome-13.13.1` extension outside the repository; mount both read-only.

Create a service environment file outside the repository. It must contain at least:

```dotenv
WEB3LANE_RUNNER_ADAPTER=/app/live-runner/qwap-runner.mjs
MPS_URL=https://<masumi-payment-service>
MPS_RUNTIME_TOKEN=<operator-provisioned-token>
```

`WEB3LANE_RUNNER_ADAPTER` must be an absolute in-container module path. The service refuses to start without the adapter and without the buyer-client file. The runner integration must reject a new checkout when it cannot use this adapter.

Provision `/app/.local/api-clients.json` in the persistent volume before starting. It contains only buyer IDs and SHA-256 token hashes:

```json
[{"id":"buyer-1","token_sha256":"64-lowercase-hex-sha256-of-bearer-token"}]
```

Each approved plan's `approval.requester_id` must equal this buyer ID. Do not put raw bearer tokens, seed phrases, wallet browser profiles, or keys in the image, Compose file, or repository.

Every checkout and status request must include `Authorization: Bearer <buyer-token>`. `/availability` and `/input_schema` remain public metadata. Rotate credentials by updating the hashes and restarting gracefully. Existing job records without `buyerId` are inaccessible through these endpoints until an operator assigns the verified owner.

## Trusted adapter contract

The absolute module must export a default object with these methods:

```ts
interface TrustedRunnerAdapter {
  supports(plan: ApprovedPlan): boolean | Promise<boolean>;
  run(context: {
    job: PaidJob;
    plan: ApprovedPlan;
    authorization: ExecutionAuthorization;
    outputDir: string;
  }): Promise<RecordedRun>;
}
```

`ApprovedPlan` is defined in `agent/lib/types.ts`; `RecordedRun` follows the [paid execution record contract](../reports/INPUT-CONTRACT.md). `authorization` contains the exact payment job, approved plan hash/version, one-time session ID, and start time issued by the host. The runner supplies observations and files; the agent does not author them. `supports` must reject every journey, chain, wallet, assertion, or signing action the adapter cannot actually verify.

The API checks support before issuing new payment terms. Its poller dispatches confirmed funded jobs one at a time, and rechecks funding before recording and finalization. Masumi checks fetch MPS state; x402 checks validate the persisted facilitator receipt. The runner claim is persisted before the browser starts. A crash or error requires inspection, with no automatic second wallet click. A mounted module is trusted host code, so its implementation and signing boundary must be reviewed before enabling any plan.

Run `npm run test:service` for the fixture-based authentication, ownership, restart, and execution tests. These checks neither sign a wallet transaction nor transfer funds.

## Start

From `web3lane-agent`, point Compose to the two operator-owned paths and start one replica:

```sh
export WEB3LANE_SERVICE_ENV_FILE=/etc/web3lane/paid-browser.env
export WEB3LANE_WALLET_ENV_FILE=/etc/web3lane/wallet.env
export WEB3LANE_PRIVATE_CONFIG_DIR=/etc/web3lane/private
export WEB3LANE_METAMASK_EXTENSION_DIR=/opt/web3lane/metamask-chrome-13.13.1
docker compose -f compose.service.yaml up -d --build
```

The API listens inside the container on `0.0.0.0:21950`, while Compose publishes it only on `127.0.0.1:21950`. Put an authenticated TLS reverse proxy on the same host in front of that local port. Do not expose port 21950 directly to the internet.

The named `paid-browser-data` volume is mounted at `/app/.local`, preserving payment jobs, approved-plan reservations, evidence, and the process lock. The container runs as UID/GID `10001`; provision an existing volume to that owner before first start, for example:

```sh
docker run --rm -u 0 -v web3lane-agent_paid-browser-data:/data alpine chown -R 10001:10001 /data
```

After a crash, an existing `agent-api.lock` is intentional: reconcile recorded payment and runner state before removing that lock and restarting. Do not add replicas.

## Readiness check

Before enabling checkout, run one Qwap-only Preprod job on the target Linux host and verify the MetaMask popup fields, the bounded signing request, RPC receipt, and sealed evidence bundle. The image build alone does not verify the browser under the host's Docker seccomp profile. Payments currently use Cardano Preprod only.
