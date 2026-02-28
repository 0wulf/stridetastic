# --- Required Variables ---

variable "do_token" {
  description = "DigitalOcean API token"
  type        = string
  sensitive   = true
}

variable "ssh_public_key_path" {
  description = "Path to SSH public key file"
  type        = string
  default     = "~/.ssh/stridetastic_ed25519.pub"
}

variable "ssh_private_key_path" {
  description = "Path to SSH private key file (for provisioning)"
  type        = string
  default     = "~/.ssh/stridetastic_ed25519"
  sensitive   = true
}

variable "duckdns_token" {
  description = "DuckDNS authentication token"
  type        = string
  sensitive   = true
}

variable "certbot_email" {
  description = "Email for Let's Encrypt certificate notifications"
  type        = string
}

# --- Optional Variables ---

variable "region" {
  description = "DigitalOcean region"
  type        = string
  default     = "nyc1"
}

variable "droplet_size" {
  description = "Droplet size slug"
  type        = string
  default     = "s-1vcpu-1gb"
}

variable "domain" {
  description = "Domain name for the application"
  type        = string
  default     = "stridetastic.duckdns.org"
}

variable "app_repo_url" {
  description = "Git repository URL"
  type        = string
  default     = "https://github.com/zen/stridetastic.git"
}

variable "app_branch" {
  description = "Git branch to deploy"
  type        = string
  default     = "main"
}

# --- MQTT Configuration ---

variable "mqtt_broker_address" {
  description = "MQTT broker hostname"
  type        = string
  default     = "mqtt.meshtastic.org"
}

variable "mqtt_broker_port" {
  description = "MQTT broker port"
  type        = number
  default     = 1883
}

variable "mqtt_topic" {
  description = "MQTT topic to subscribe to"
  type        = string
  default     = "msh/US/2/e/#"
}

variable "mqtt_username" {
  description = "MQTT username"
  type        = string
  default     = "meshdev"
}

variable "mqtt_password" {
  description = "MQTT password"
  type        = string
  default     = "large4cats"
  sensitive   = true
}

variable "mqtt_tls" {
  description = "Enable MQTT TLS"
  type        = string
  default     = "false"
}

variable "mqtt_base_topic" {
  description = "MQTT base topic"
  type        = string
  default     = "msh/US/2/e"
}
