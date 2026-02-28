output "droplet_ip" {
  description = "Public IP address of the Stridetastic droplet"
  value       = digitalocean_droplet.stridetastic.ipv4_address
}

output "droplet_url" {
  description = "HTTPS URL for the application"
  value       = "https://${var.domain}"
}

output "grafana_url" {
  description = "Grafana dashboard URL"
  value       = "https://${var.domain}/grafana/"
}

output "api_url" {
  description = "API documentation URL"
  value       = "https://${var.domain}/api/docs"
}

output "ssh_command" {
  description = "SSH command to connect to the droplet"
  value       = "ssh -i ${var.ssh_private_key_path} root@${digitalocean_droplet.stridetastic.ipv4_address}"
  sensitive   = true
}
