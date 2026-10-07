# web3lane

## Hackathon deployment reference

Verified **2026-10-07**. Masumi, PostgreSQL, and the Web3lane runner share one EC2 instance in Singapore. Public HTTPS uses the existing API Gateway and internal load balancer.

### Deployed URLs

| Purpose | URL / configuration value |
| --- | --- |
| Masumi backend base URL (`MPS_URL`) | `https://lyru7d1wml.execute-api.ap-southeast-1.amazonaws.com` |
| Masumi REST API base URL | `https://lyru7d1wml.execute-api.ap-southeast-1.amazonaws.com/api/v1` |
| Masumi frontend / admin | [Open Masumi Admin](https://lyru7d1wml.execute-api.ap-southeast-1.amazonaws.com/admin/) |
| Masumi health | [Health endpoint](https://lyru7d1wml.execute-api.ap-southeast-1.amazonaws.com/api/v1/health) |
| Web3lane runner API base URL | `https://lyru7d1wml.execute-api.ap-southeast-1.amazonaws.com` |
| Web3lane runner availability | [Availability endpoint](https://lyru7d1wml.execute-api.ap-southeast-1.amazonaws.com/availability) |
| Masumi on the EC2 host | `http://127.0.0.1:3001` |
| Web3lane runner on the EC2 host | `http://127.0.0.1:21950` |

The Masumi frontend **is** the admin application; there is no separate frontend deployment URL. Nginx routes `/admin` and `/api/v1` to Masumi and other paths to the runner. No separate Web3lane report-frontend deployment URL is recorded here.

### Configuration values

```dotenv
# Agent/client configuration: MPS_URL must NOT include /api/v1.
MPS_URL=https://lyru7d1wml.execute-api.ap-southeast-1.amazonaws.com
MPS_RUNTIME_TOKEN=<read-pay-api-key-from-deployed-masumi-db>

# Masumi frontend build-time configuration (same-origin API).
NEXT_PUBLIC_PAYMENT_API_BASE_URL=/api/v1

# Masumi runtime: valid only inside the masumi-private Docker network.
DATABASE_URL=postgresql://mps:<URL_ENCODED_DB_PASSWORD>@masumi-postgres:5432/mps_hackathon
PORT=3001
```

Masumi API requests authenticate with a `token` header. Sign in to the admin UI with the existing `ADMIN_KEY` from the ignored `masumi-payment-service/.env`. Create the agent's read/pay runtime key in the deployed database; a key from your local database does not transfer automatically. Use an admin key only for administration.

PostgreSQL has **no public URL or published host port**. Its hostname is `masumi-postgres`, port `5432`, database `mps_hackathon`, and user `mps`. The password is deliberately omitted above. The deployment script rewrites the imported `DATABASE_URL` to this Docker hostname; `/etc/masumi/service.env` contains the effective deployed connection string.

### AWS resources

| Resource | Value |
| --- | --- |
| Account ID | `965932217813` |
| Region | `ap-southeast-1` (Singapore) |
| EC2 instance | `i-0c5c932fe61cd67dd` |
| EC2 console | [Instance details](https://ap-southeast-1.console.aws.amazon.com/ec2/home?region=ap-southeast-1#InstanceDetails:instanceId=i-0c5c932fe61cd67dd) |
| Instance type | `t4g.large` (ARM64) |
| EC2 public IPv4 | `13.229.44.243` |
| EC2 public DNS | `ec2-13-229-44-243.ap-southeast-1.compute.amazonaws.com` |
| EC2 private IPv4 | `172.31.40.18` |
| VPC | `vpc-0b8592a01061b8bbf` |
| Subnet | `subnet-02ec20edbdb646a56` |
| CloudFormation stack | `wallet-qa-preprod-runner` |
| API Gateway HTTP API ID | `lyru7d1wml` |
| Deployment source bucket | `wallet-qa-preprod-runner-sourcebucket-uzr1imhvtj5i` |
| Instance IAM role | `wallet-qa-preprod-runner-RunnerRole-1OVVyCFztjtJ` |
| Masumi secret-read inline policy | `ReadMasumiHackathonSecret` |

Use the HTTPS gateway URLs for applications. EC2's public IP/DNS are infrastructure addresses, not public admin endpoints, and may change after a stop/start. Manage the host through Systems Manager Session Manager, not public SSH.

### Secrets and files

| Purpose | Location |
| --- | --- |
| Masumi runtime secret | Secrets Manager: `masumi-hackathon/service-env` |
| Masumi secret ARN | `arn:aws:secretsmanager:ap-southeast-1:965932217813:secret:masumi-hackathon/service-env-dUEtMz` |
| Runner MPS API-key secret | Secrets Manager: `web3lane-preprod/mps-runtime-env` |
| Original local Masumi configuration | `masumi-payment-service/.env` (ignored) |
| Deployed source and scripts | `/opt/masumi` on EC2 |
| Imported runtime configuration | `/etc/masumi/runtime.json` on EC2 |
| Effective Masumi environment | `/etc/masumi/service.env` on EC2 |
| PostgreSQL environment | `/etc/masumi/postgres.env` on EC2 |
| Build / deployment logs | `/var/log/masumi-build.log`, `/var/log/masumi-deploy.log` |
| Private seed log | `/var/log/masumi-seed.log` (contains generated wallet secrets; root-only) |
| Active reverse proxy configuration | `/etc/nginx/conf.d/wallet-qa.conf` |

Secret values belong in the ignored environment file or Secrets Manager, never this README. Runtime files are root-only. Changing a Secrets Manager value does not automatically refresh files or restart containers.

### Containers and persistence

| Purpose | Value |
| --- | --- |
| Masumi container | `masumi-payment-service` |
| Masumi image | `masumi-payment-service:hackathon` |
| Migration / seed image | `masumi-payment-service:build` |
| PostgreSQL container / image | `masumi-postgres` / `postgres:17-alpine` |
| PostgreSQL persistent volume | `masumi-postgres-data` |
| Docker network | `masumi-private` |
| Existing runner container | `web3lane-runner` |

Masumi and PostgreSQL use `unless-stopped` restart policies. Database storage is a Docker volume on encrypted, retained EBS; it is not managed RDS or an independent backup. This deployment initialized a fresh database: local database records were not copied, and seeded wallets need funding before payment flows work.

### Useful commands

Use an authenticated AWS profile; add `--profile <profile-name>` when needed. Session Manager port forwarding also requires the local Session Manager plugin.

```sh
# Open a shell on the EC2 host.
rtk proxy aws ssm start-session --region ap-southeast-1 --target i-0c5c932fe61cd67dd

# Optional private Masumi access: open http://localhost:3001/admin/ afterward.
rtk proxy aws ssm start-session \
  --region ap-southeast-1 \
  --target i-0c5c932fe61cd67dd \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["3001"],"localPortNumber":["3001"]}'
```

Inside the EC2 session (RTK is not required on the host):

```sh
sudo docker ps
sudo docker exec -it masumi-postgres sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Deployment artifacts: [verified resource record](masumi-payment-service/deploy/aws-hackathon.json), [initial startup script](masumi-payment-service/deploy/start-aws-hackathon.sh), [API verification script](masumi-payment-service/deploy/verify-aws-hackathon.mjs), [Nginx configuration](masumi-payment-service/deploy/masumi-admin.nginx.conf), and [secret-read policy](masumi-payment-service/deploy/aws-secret-policy.json). The startup script is for initial provisioning and refuses to replace existing containers. The Nginx change and separate Masumi IAM policy were applied to the existing host/role outside the original CloudFormation template.
