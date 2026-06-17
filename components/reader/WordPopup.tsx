"use client";

import { useEffect } from "react";
import { Volume2, Plus, Check, X, Loader2 } from "lucide-react";
import type { DictEntry } from "@/app/api/cet/define/route";

export interface LookupState {
  word: string;
  rect: DOMRect;
  loading: boolean;
  error?: string | null;
  phonetic?: string | null;
  entries?: DictEntry[];
}

export function WordPopup({
  state,
  added,
  adding,
  onSpeak,
  onAdd,
  onClose,
}: {
  state: LookupState;
  added: boolean;
  adding: boolean;
  onSpeak: () => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  // 关闭：Esc
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const W = 300;
  const left = Math.min(Math.max(8, state.rect.left), window.innerWidth - W - 8);
  const belowTop = state.rect.bottom + 8;
  const placeAbove = belowTop > window.innerHeight - 180;
  const style: React.CSSProperties = placeAbove
    ? { left, bottom: window.innerHeight - state.rect.top + 8, width: W }
    : { left, top: belowTop, width: W };

  return (
    <div
      data-no-lookup
      className="fixed z-50 rounded-lg border border-border bg-card text-card-foreground shadow-xl"
      style={style}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-2 px-3 pt-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-serif text-lg font-semibold">{state.word}</span>
            {state.phonetic && (
              <span className="font-mono text-sm text-muted-foreground">{state.phonetic}</span>
            )}
          </div>
        </div>
        <button onClick={onSpeak} title="发音" className="p-1 text-muted-foreground hover:text-primary">
          <Volume2 className="w-4 h-4" />
        </button>
        <button onClick={onClose} title="关闭" className="p-1 text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="border-t border-border mx-3 my-2" />

      <div className="px-3 pb-2 max-h-56 overflow-auto text-sm">
        {state.loading ? (
          <div className="text-muted-foreground inline-flex items-center gap-1.5 py-1">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> 查询中…
          </div>
        ) : state.error ? (
          <div className="text-destructive py-1">{state.error}</div>
        ) : (
          <div className="space-y-1.5">
            {(state.entries ?? []).map((e, i) => (
              <div key={i} className="flex gap-2">
                {e.pos && <span className="italic text-muted-foreground shrink-0">{e.pos}</span>}
                <span>{e.meaning}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {!state.loading && !state.error && (
        <div className="border-t border-border px-3 py-2">
          <button
            onClick={onAdd}
            disabled={adding || added}
            className="inline-flex items-center gap-1.5 text-xs rounded-md px-2.5 py-1 border border-border hover:bg-muted disabled:opacity-60"
          >
            {added ? (
              <>
                <Check className="w-3.5 h-3.5 text-ok" /> 已加入生词本
              </>
            ) : adding ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> 加入中
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" /> 加入生词本
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
