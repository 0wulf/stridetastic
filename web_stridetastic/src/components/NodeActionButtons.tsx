"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Target, Signal } from "lucide-react";
import { clearPublishingReturnFocus, setPublishingReturnFocus } from "@/lib/publishingNavigation";

interface NodeActionButtonsProps {
  nodeId?: string | number | null;
  orientation?: "horizontal" | "vertical";
  size?: "sm" | "md";
  className?: string;
  onBeforeNavigate?: () => void;
  currentTabOverride?: string | null;
}

type SupportedAction = "reachability-test" | "traceroute";

export function NodeActionButtons({
  nodeId,
  orientation = "horizontal",
  size = "md",
  className = "",
  onBeforeNavigate,
  currentTabOverride,
}: NodeActionButtonsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const originTabRaw = currentTabOverride ?? searchParams?.get("tab") ?? "overview";
  const originTab = originTabRaw || "overview";
  const shouldPreserveFocus =
    !!nodeId && (originTab === "overview" || originTab === "network");

  const handleLaunch = useCallback(
    (actionId: SupportedAction) => {
      if (!nodeId) {
        return;
      }

      const params = new URLSearchParams();
      params.set("tab", "actions");
      params.set("action", actionId);
      params.set("targetNode", String(nodeId));
      if (shouldPreserveFocus) {
        params.set("focusNode", String(nodeId));
      }
      if (originTab && originTab !== "actions") {
        params.set("returnTab", originTab);
      }

      onBeforeNavigate?.();

      if (shouldPreserveFocus) {
        setPublishingReturnFocus({ nodeId: String(nodeId), originTab });
      } else {
        clearPublishingReturnFocus();
      }

      router.push(`/dashboard?${params.toString()}`, { scroll: false });
    },
    [nodeId, onBeforeNavigate, originTab, router, shouldPreserveFocus]
  );

  const containerClasses = [
    "flex gap-2",
    orientation === "vertical" ? "flex-col" : "flex-row flex-wrap",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const buttonClasses = [
    "inline-flex items-center gap-2 rounded-md border border-gray-200 text-gray-700 transition-colors",
    "hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300",
    "disabled:opacity-50 disabled:cursor-not-allowed",
    size === "sm" ? "px-2.5 py-1.5 text-xs font-medium" : "px-3 py-2 text-sm font-semibold",
  ].join(" ");

  return (
    <div className={containerClasses}>
      <button
        type="button"
        className={buttonClasses}
        onClick={() => handleLaunch("reachability-test")}
        disabled={!nodeId}
      >
        <Target className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />
        <span>Test Reachability</span>
      </button>
      <button
        type="button"
        className={buttonClasses}
        onClick={() => handleLaunch("traceroute")}
        disabled={!nodeId}
      >
        <Signal className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />
        <span>Send Traceroute</span>
      </button>
    </div>
  );
}
