terraform {
  required_version = ">= 1.5.0"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.40"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "digitalocean" {
  token = var.do_token
}

# --- Secrets Generation ---

resource "random_password" "django_secret_key" {
  length  = 50
  special = true
}

resource "random_password" "db_password" {
  length  = 32
  special = false
}

# --- SSH Key ---

resource "digitalocean_ssh_key" "stridetastic" {
  name       = "stridetastic-deploy-key"
  public_key = file(var.ssh_public_key_path)
}

# --- Droplet ---

resource "digitalocean_droplet" "stridetastic" {
  image    = "ubuntu-24-04-x64"
  name     = "stridetastic"
  region   = var.region
  size     = var.droplet_size
  ssh_keys = [digitalocean_ssh_key.stridetastic.fingerprint]

  user_data = templatefile("${path.module}/templates/cloud-init.yaml", {
    domain         = var.domain
    duckdns_token  = var.duckdns_token
    app_repo_url   = var.app_repo_url
    app_branch     = var.app_branch
    deploy_ssh_key = file(var.ssh_public_key_path)
  })

  connection {
    type        = "ssh"
    user        = "root"
    private_key = file(var.ssh_private_key_path)
    host        = self.ipv4_address
  }

  # Wait for cloud-init to finish before running provisioners
  provisioner "remote-exec" {
    inline = [
      "cloud-init status --wait",
    ]
  }

  # Upload production .env
  provisioner "file" {
    content = templatefile("${path.module}/templates/env.prod.tftpl", {
      domain            = var.domain
      django_secret_key = random_password.django_secret_key.result
      db_password       = random_password.db_password.result
      allowed_hosts     = "${var.domain},localhost"
      mqtt_broker       = var.mqtt_broker_address
      mqtt_port         = var.mqtt_broker_port
      mqtt_topic        = var.mqtt_topic
      mqtt_username     = var.mqtt_username
      mqtt_password     = var.mqtt_password
      mqtt_tls          = var.mqtt_tls
      mqtt_base_topic   = var.mqtt_base_topic
    })
    destination = "/opt/stridetastic/.env"
  }

  # Upload production compose override
  provisioner "file" {
    source      = "${path.module}/templates/compose.prod.yaml"
    destination = "/opt/stridetastic/compose.prod.yaml"
  }

  # Upload initial nginx config (HTTP-only for certbot)
  provisioner "file" {
    source      = "${path.module}/templates/nginx-initial.conf"
    destination = "/opt/stridetastic/nginx/nginx.conf"
  }

  # Upload full nginx config (will replace initial after cert issuance)
  provisioner "file" {
    source      = "${path.module}/templates/nginx.conf"
    destination = "/opt/stridetastic/nginx/nginx-ssl.conf"
  }

  # Run initial deployment
  provisioner "remote-exec" {
    inline = [
      # Update DuckDNS with droplet IP
      "curl -s 'https://www.duckdns.org/update?domains=${replace(var.domain, ".duckdns.org", "")}&token=${var.duckdns_token}&ip='",
      # Wait for DNS propagation
      "sleep 15",
      # Copy .env into repo root so Docker build can pick up NEXT_PUBLIC_* vars
      "cp /opt/stridetastic/.env /opt/stridetastic/repo/.env",
      # Copy compose.prod.yaml into repo for docker compose context
      "cp /opt/stridetastic/compose.prod.yaml /opt/stridetastic/repo/compose.prod.yaml",
      # Copy nginx configs into repo
      "mkdir -p /opt/stridetastic/repo/nginx",
      "cp /opt/stridetastic/nginx/nginx.conf /opt/stridetastic/repo/nginx/nginx.conf",
      "cp /opt/stridetastic/nginx/nginx-ssl.conf /opt/stridetastic/repo/nginx/nginx-ssl.conf",
      # Deploy from repo directory
      "cd /opt/stridetastic/repo",
      "docker compose -f compose.yaml -f compose.prod.yaml build",
      "docker compose -f compose.yaml -f compose.prod.yaml up -d timescale_stridetastic redis_stridetastic",
      "sleep 10",
      # Start nginx with HTTP-only config for certbot
      "docker compose -f compose.yaml -f compose.prod.yaml up -d nginx_stridetastic",
      "sleep 5",
      # Get SSL certificate via HTTP-01 challenge
      "certbot certonly --webroot -w /opt/stridetastic/certbot/www -d ${var.domain} --non-interactive --agree-tos --email ${var.certbot_email}",
      # Swap to full SSL nginx config
      "cp /opt/stridetastic/repo/nginx/nginx-ssl.conf /opt/stridetastic/repo/nginx/nginx.conf",
      "docker compose -f compose.yaml -f compose.prod.yaml exec nginx_stridetastic nginx -s reload",
      # Run migrations and seed
      "docker compose -f compose.yaml -f compose.prod.yaml run --rm api_stridetastic python manage.py migrate",
      "docker compose -f compose.yaml -f compose.prod.yaml run --rm api_stridetastic python manage.py seeds || true",
      # Start all services
      "docker compose -f compose.yaml -f compose.prod.yaml up -d",
    ]
  }
}

# --- Firewall ---

resource "digitalocean_firewall" "stridetastic" {
  name = "stridetastic-fw"

  droplet_ids = [digitalocean_droplet.stridetastic.id]

  # SSH
  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # HTTP (for ACME challenge + redirect)
  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # HTTPS
  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  # All outbound TCP
  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  # All outbound UDP
  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  # ICMP outbound
  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}
