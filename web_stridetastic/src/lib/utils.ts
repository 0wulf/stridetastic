import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString();
}

export function formatUptime(seconds?: number): string {
  if (!seconds) return "Unknown";
  
  const days = Math.floor(seconds / (24 * 3600));
  const hours = Math.floor((seconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatBatteryLevel(level?: number): string {
  if (level === undefined || level === null) return "Unknown";
  return `${level}%`;
}

export function getRSSIColor(rssi: number): string {
  if (rssi >= -50) return "#10b981"; // green
  if (rssi >= -70) return "#f59e0b"; // yellow
  if (rssi >= -90) return "#ef4444"; // red
  return "#6b7280"; // gray
}

export function getSNRColor(snr: number): string {
  if (snr >= 10) return "#10b981"; // green - excellent SNR
  if (snr >= 5) return "#84cc16"; // light green - good SNR
  if (snr >= 0) return "#f59e0b"; // yellow - acceptable SNR
  if (snr >= -5) return "#f97316"; // orange - poor SNR
  return "#ef4444"; // red - very poor SNR
}

export function getBatteryColor(level?: number): string {
  if (!level) return "#6b7280";
  if (level >= 60) return "#10b981"; // green
  if (level >= 30) return "#f59e0b"; // yellow
  return "#ef4444"; // red
}
