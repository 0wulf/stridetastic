"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HardDriveDownload, Loader2, PlayCircle, Square, Trash2 } from "lucide-react";

import { apiClient } from "@/lib/api";
import type { CaptureSession } from "@/types";
import type { Interface } from "@/types/interface";
import RefreshButton from "./RefreshButton";
import { useAutoRefresh } from "@/hooks/useAutoRefresh";

interface FormState {
  name: string;
  interfaceId?: number;
}

const statusColors: Record<string, string> = {
  RUNNING: "bg-emerald-100 text-emerald-700",
  COMPLETED: "bg-blue-100 text-blue-700",
  ERROR: "bg-red-100 text-red-700",
  CANCELLED: "bg-yellow-100 text-yellow-700",
};

function formatDate(dateString?: string | null) {
  if (!dateString) return "-";
  try {
    return new Intl.DateTimeFormat("default", {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(new Date(dateString));
  } catch (error) {
    console.error("Failed to format date", error);
    return dateString;
  }
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

export default function CapturesPanel() {
  const [sessions, setSessions] = useState<CaptureSession[]>([]);
  const [interfaces, setInterfaces] = useState<Interface[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(() => ({
    name: "capture",
  }));
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      try {
        setLoading(true);
        const [sessionsResponse, interfacesResponse] = await Promise.all([
          apiClient.getCaptureSessions(),
          apiClient.getInterfaces(),
        ]);
        if (!mounted) return;
        setSessions(sessionsResponse.data);
        setInterfaces(interfacesResponse.data);
      } catch (err) {
        console.error("Failed to load capture data", err);
        if (mounted) setError("Unable to load capture sessions.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    bootstrap();
    return () => {
      mounted = false;
    };
  }, []);

  const runningSessions = useMemo(() => sessions.filter((session) => session.status === "RUNNING"), [sessions]);

  const refreshSessions = useCallback(async () => {
    if (refreshing || loading) {
      return;
    }
    try {
      setRefreshing(true);
      const response = await apiClient.getCaptureSessions();
      setSessions(response.data);
      setError(null);
    } catch (err) {
      console.error("Failed to refresh sessions", err);
      setError("Unable to refresh capture sessions.");
    } finally {
      setRefreshing(false);
    }
  }, [loading, refreshing]);

  useAutoRefresh(refreshSessions, { intervalMs: 60_000 });

  const handleDeleteCapture = async (sessionId: string) => {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;
    if (session.status === "RUNNING") {
      setError("Stop or cancel the capture before deleting it.");
      return;
    }
    const confirmed = window.confirm(`Delete capture "${session.name}"? This action cannot be undone.`);
    if (!confirmed) return;
    setDeletingId(sessionId);
    setError(null);
    try {
      await apiClient.deleteCapture(sessionId);
      await refreshSessions();
    } catch (err) {
      console.error("Failed to delete capture", err);
      setError("Unable to delete the capture session.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteAllCaptures = async () => {
    if (sessions.length === 0) return;
    const confirmed = window.confirm("Delete all capture sessions and files? This action cannot be undone.");
    if (!confirmed) return;
    setDeletingAll(true);
    setError(null);
    try {
      await apiClient.deleteAllCaptures();
      await refreshSessions();
    } catch (err) {
      console.error("Failed to delete captures", err);
      setError("Unable to delete capture sessions.");
    } finally {
      setDeletingAll(false);
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target;
    setFormState((prev) => ({
      ...prev,
      [name]: name === "interfaceId" ? (value ? Number(value) : undefined) : value,
    }));
  };

  const handleStartCapture = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await apiClient.startCapture({
  name: formState.name.trim() || "capture",
        interface_id: formState.interfaceId,
      });
      await refreshSessions();
      setFormState((prev) => ({
        ...prev,
        name: "capture",
      }));
    } catch (err) {
      console.error("Failed to start capture", err);
      setError("Unable to start the capture session.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleStopCapture = async (sessionId: string) => {
    try {
      await apiClient.stopCapture(sessionId);
      await refreshSessions();
    } catch (err) {
      console.error("Failed to stop capture", err);
      setError("Unable to stop the capture session.");
    }
  };

  const handleCancelCapture = async (sessionId: string) => {
    try {
      await apiClient.cancelCapture(sessionId);
      await refreshSessions();
    } catch (err) {
      console.error("Failed to cancel capture", err);
      setError("Unable to cancel the capture session.");
    }
  };

  const handleDownload = async (session: CaptureSession) => {
    try {
      const blob = await apiClient.downloadCapture(session.id);
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = session.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download capture", err);
      setError("Unable to download the capture file.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Capture Sessions</h1>
          <p className="mt-1 text-sm text-gray-600">
            Start, stop, and download Wireshark-compatible captures to analyze Meshtastic traffic.
          </p>
        </div>
        <div className="flex gap-2">
          <RefreshButton
            onRefresh={refreshSessions}
            isRefreshing={refreshing}
            disabled={refreshing || deletingAll}
            size="sm"
          />
          <button
            onClick={handleDeleteAllCaptures}
            className="inline-flex items-center rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-red-100 disabled:text-red-300"
            disabled={deletingAll || sessions.length === 0}
          >
            {deletingAll ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            Delete All
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-medium text-gray-900">New Capture Session</h2>
        <p className="mt-1 text-sm text-gray-600">
          Choose an interface and start recording packets.
        </p>

  <form onSubmit={handleStartCapture} className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="block text-sm font-medium text-gray-700">Name</span>
            <input
              type="text"
              name="name"
              value={formState.name}
              onChange={handleInputChange}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="capture"
              required
            />
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-gray-700">Interface</span>
            <select
              name="interfaceId"
              value={formState.interfaceId ?? ""}
              onChange={handleInputChange}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="">Automatic</option>
              {interfaces.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.display_name} ({item.name})
                </option>
              ))}
            </select>
          </label>

          <div className="md:col-span-2 flex justify-end">
            <button
              type="submit"
              disabled={submitting || runningSessions.length > 0}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
              Start Capture
            </button>
          </div>

          {runningSessions.length > 0 && (
            <p className="md:col-span-3 text-sm text-amber-600">
              We recommend keeping only one capture active at a time to avoid filling up storage.
            </p>
          )}
        </form>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">Capture History</h2>
          <span className="text-sm text-gray-500">{sessions.length} captures</span>
        </div>

        {loading ? (
          <div className="flex h-32 items-center justify-center text-gray-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading captures…
          </div>
        ) : sessions.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            No captures yet. Start one to begin saving capture packets.
          </div>
        ) : (
          <div className="mt-6 overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium uppercase tracking-wider text-gray-500">Name</th>
                  <th className="px-4 py-3 text-left font-medium uppercase tracking-wider text-gray-500">Interface</th>
                  <th className="px-4 py-3 text-left font-medium uppercase tracking-wider text-gray-500">Started</th>
                  <th className="px-4 py-3 text-left font-medium uppercase tracking-wider text-gray-500">Last Packet</th>
                  <th className="px-4 py-3 text-left font-medium uppercase tracking-wider text-gray-500">Packets</th>
                  <th className="px-4 py-3 text-left font-medium uppercase tracking-wider text-gray-500">Size</th>
                  <th className="px-4 py-3 text-right font-medium uppercase tracking-wider text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {sessions.map((session) => {
                  const statusClass = statusColors[session.status] ?? "bg-gray-100 text-gray-700";
                  return (
                    <tr key={session.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{session.name}</div>
                        <div className={`mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClass}`}>
                          {session.status}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {session.interface_name ?? "Automatic"}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(session.started_at)}</td>
                      <td className="px-4 py-3 text-gray-600">{formatDate(session.last_packet_at)}</td>
                      <td className="px-4 py-3 text-gray-600">{session.packet_count.toLocaleString()}</td>
                      <td className="px-4 py-3 text-gray-600">{formatBytes(session.file_size)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          {session.status === "RUNNING" ? (
                            <button
                              onClick={() => handleStopCapture(session.id)}
                              className="inline-flex items-center rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-red-100 disabled:text-red-300"
                              disabled={deletingAll}
                            >
                              <Square className="mr-1.5 h-4 w-4" /> Stop
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDownload(session)}
                              className="inline-flex items-center rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-blue-100 disabled:text-blue-300"
                              disabled={deletingId === session.id || deletingAll}
                            >
                              <HardDriveDownload className="mr-1.5 h-4 w-4" /> Download
                            </button>
                          )}
                          {session.status === "RUNNING" ? (
                            <button
                              onClick={() => handleCancelCapture(session.id)}
                              className="inline-flex items-center rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-semibold text-amber-600 hover:bg-amber-50 disabled:cursor-not-allowed disabled:border-amber-100 disabled:text-amber-300"
                              disabled={deletingAll}
                            >
                              Cancel
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDeleteCapture(session.id)}
                              className="inline-flex items-center rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-red-100 disabled:text-red-300"
                              disabled={deletingId === session.id || deletingAll}
                            >
                              {deletingId === session.id ? (
                                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="mr-1.5 h-4 w-4" />
                              )}
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
