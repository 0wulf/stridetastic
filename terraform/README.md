# Stridetastic — Terraform Deployment

Deploy Stridetastic to a single DigitalOcean droplet with Docker Compose, Nginx reverse proxy, Let's Encrypt SSL, and GitHub Actions CI/CD.

## Architecture

```
Internet → DO Firewall (22, 80, 443) → Droplet ($6/mo, 1GB RAM)
  └── Docker Compose
      ├── nginx (80→443 redirect, HTTPS termination)
      │   ├── /         → Next.js frontend (:3000)
      │   ├── /api/     → Django API (:8000)
      │   ├── /admin/   → Django admin
      │   └── /grafana/ → Grafana dashboards (:3000)
      ├── timescaledb (PostgreSQL)
      ├── redis
      ├── celery (worker + beat)
      └── grafana
```

## Prerequisites

1. **Terraform** ≥ 1.5.0 — [Install guide](https://developer.hashicorp.com/terraform/install)
2. **DigitalOcean account** — [Sign up](https://cloud.digitalocean.com/registrations/new)
3. **DuckDNS account** — [Sign up](https://www.duckdns.org/) and register `stridetastic` subdomain

## Step-by-Step Deployment

### 1. Create a DigitalOcean API Token

1. Go to [API Tokens](https://cloud.digitalocean.com/account/api/tokens)
2. Click **Generate New Token**
3. Name: `stridetastic-terraform`
4. Scopes: **Full Access** (Read + Write)
5. Copy the token (you won't see it again)

### 2. Set Up DuckDNS

1. Go to [DuckDNS](https://www.duckdns.org/) and log in
2. Register the subdomain `stridetastic` (or your chosen name)
3. Copy your **token** from the DuckDNS dashboard

### 3. Generate SSH Key

```bash
ssh-keygen -t ed25519 -f ~/.ssh/stridetastic_ed25519 -N ""
```

### 4. Configure Terraform Variables

```bash
cd terraform/
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your actual values:

```hcl
do_token             = "dop_v1_your_actual_token"
ssh_public_key_path  = "~/.ssh/stridetastic_ed25519.pub"
ssh_private_key_path = "~/.ssh/stridetastic_ed25519"
duckdns_token        = "your-duckdns-token"
certbot_email        = "your@email.com"
domain               = "stridetastic.duckdns.org"
app_repo_url         = "https://github.com/your-username/stridetastic.git"
```

### 5. Deploy

```bash
cd terraform/

# Initialize Terraform providers
terraform init

# Preview what will be created
terraform plan

# Deploy (takes ~5-10 minutes)
terraform apply
```

Terraform will:
1. Create a DigitalOcean droplet with Docker pre-installed
2. Set up a cloud firewall (ports 22, 80, 443 only)
3. Update DuckDNS to point to the droplet IP
4. Obtain a Let's Encrypt SSL certificate
5. Build and start all Docker containers
6. Run database migrations and seed data

### 6. Configure GitHub Actions (CI/CD)

Add these secrets in your GitHub repo at **Settings → Secrets and Variables → Actions**:

| Secret | Value |
|--------|-------|
| `DROPLET_IP` | The droplet IP (from `terraform output droplet_ip`) |
| `SSH_PRIVATE_KEY` | Contents of `~/.ssh/stridetastic_ed25519` |

Also create a **production** environment at **Settings → Environments → New environment**.

Now every push to `main` will automatically deploy.

## Access Points

After deployment:

| Service | URL |
|---------|-----|
| **Frontend** | `https://stridetastic.duckdns.org` |
| **API Docs** | `https://stridetastic.duckdns.org/api/docs` |
| **Admin** | `https://stridetastic.duckdns.org/admin/` |
| **Grafana** | `https://stridetastic.duckdns.org/grafana/` |

## Post-Deployment

### Create Django Admin User

```bash
ssh -i ~/.ssh/stridetastic_ed25519 root@$(terraform output -raw droplet_ip)
cd /opt/stridetastic/repo
docker compose -f compose.yaml -f compose.prod.yaml run --rm api_stridetastic python manage.py createsuperuser
```

### Update MQTT Configuration

Edit `/opt/stridetastic/.env` on the droplet, then:

```bash
cd /opt/stridetastic/repo
cp /opt/stridetastic/.env .env
docker compose -f compose.yaml -f compose.prod.yaml up -d
```

### View Logs

```bash
# All services
docker compose -f compose.yaml -f compose.prod.yaml logs -f

# Specific service
docker compose -f compose.yaml -f compose.prod.yaml logs -f api_stridetastic
```

### SSL Certificate Renewal

Certificates auto-renew via cron (`/etc/cron.d/certbot-renew`). To manually renew:

```bash
certbot renew
docker exec nginx_stridetastic nginx -s reload
```

## Updating Configuration

### Change Terraform Variables

```bash
cd terraform/
vim terraform.tfvars  # Edit values
terraform plan        # Preview changes
terraform apply       # Apply changes
```

> ⚠️ **Warning**: Changing most droplet settings will destroy and recreate the droplet. Use SSH for runtime config changes instead.

### Change .env on the Droplet

```bash
ssh -i ~/.ssh/stridetastic_ed25519 root@<DROPLET_IP>
vim /opt/stridetastic/.env
cd /opt/stridetastic/repo
cp /opt/stridetastic/.env .env
docker compose -f compose.yaml -f compose.prod.yaml up -d
```

## Teardown

```bash
cd terraform/
terraform destroy
```

This will:
- Delete the droplet and all data
- Remove the firewall
- Remove the SSH key from DigitalOcean

> ⚠️ **This is irreversible.** Back up your database first if needed.

## Troubleshooting

### Droplet out of memory (OOM)

The $6 droplet has only 1GB RAM with 2GB swap. If services are being killed:

```bash
# Check memory usage
free -h
docker stats --no-stream

# Upgrade to $12/mo (2GB RAM) — change in terraform.tfvars:
# droplet_size = "s-1vcpu-2gb"
```

### SSL certificate failed

```bash
# Check DuckDNS is pointing correctly
dig stridetastic.duckdns.org

# Retry certbot
certbot certonly --webroot -w /opt/stridetastic/certbot/www -d stridetastic.duckdns.org --non-interactive --agree-tos --email your@email.com

# Reload nginx
docker exec nginx_stridetastic nginx -s reload
```

### Services not starting

```bash
cd /opt/stridetastic/repo
docker compose -f compose.yaml -f compose.prod.yaml ps
docker compose -f compose.yaml -f compose.prod.yaml logs --tail=50
```

## Cost

| Resource | Monthly Cost |
|----------|-------------|
| Droplet (s-1vcpu-1gb) | $6 |
| Firewall | Free |
| DuckDNS | Free |
| Let's Encrypt | Free |
| **Total** | **$6/mo** |
