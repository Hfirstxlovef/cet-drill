"use client";

import { Check, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import type { AutosaveStatus } from "@/lib/useAutosave";

export function SaveStatus({
  status,
  lastSavedAt,
  error,
  onRetry,
}: {
  status: AutosaveStatus;
  lastSavedAt: Date | null;
  error: string | null;
  onRetry?: () => void;
}) {
  if (status === "saving") {
    return (
      <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> 保存中…
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="text-xs text-destructive inline-flex items-center gap-1">
        <AlertCircle className="w-3.5 h-3.5" />
        保存失败
        {onRetry && (
          <button
            onClick={onRetry}
            className="ml-1 inline-flex items-center gap-0.5 underline hover:no-underline"
          >
            <RefreshCw className="w-3 h-3" /> 重试
          </button>
        )}
      </span>
    );
  }
  if (status === "saved" || lastSavedAt) {
    return (
      <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
        <Check className="w-3.5 h-3.5 text-ok" /> 已保存
        {lastSavedAt && (
          <span className="text-muted-foreground/70">
            {lastSavedAt.toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        )}
      </span>
    );
  }
  return null;
}
