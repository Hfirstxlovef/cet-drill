"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  MousePointer2,
  Highlighter,
  Underline,
  StickyNote,
  Eraser,
  Undo2,
} from "lucide-react";

export type AnnMode = "none" | "highlight" | "underline" | "note" | "erase";

export interface AnnTarget {
  blockId: string;
  start: number;
  end: number;
  quote: string;
}
export interface Annotation {
  id: string;
  kind: "highlight" | "underline" | "note";
  color: string | null;
  note: string | null;
  target: AnnTarget;
}

export const HL_COLORS = ["#fde047", "#86efac", "#93c5fd", "#f9a8d4"]; // 黄 绿 蓝 粉

/* ───────── 工具条 ───────── */
export function AnnotationToolbar({
  mode,
  setMode,
  color,
  setColor,
  onUndo,
  canUndo,
}: {
  mode: AnnMode;
  setMode: (m: AnnMode) => void;
  color: string;
  setColor: (c: string) => void;
  onUndo: () => void;
  canUndo: boolean;
}) {
  const Tool = ({
    m,
    icon: Icon,
    label,
  }: {
    m: AnnMode;
    icon: typeof Highlighter;
    label: string;
  }) => (
    <button
      type="button"
      onClick={() => setMode(mode === m ? "none" : m)}
      title={label}
      className={cn(
        "p-1.5 rounded hover:bg-muted transition-colors",
        mode === m && "bg-accent text-accent-foreground"
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
  return (
    <div className="flex items-center gap-0.5">
      <Tool m="none" icon={MousePointer2} label="选择 / 查词" />
      <div className="w-px h-5 bg-border mx-1" />
      <Tool m="highlight" icon={Highlighter} label="高亮" />
      {mode === "highlight" &&
        HL_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            title="高亮颜色"
            className={cn(
              "w-4 h-4 rounded-full border border-black/20 mx-0.5",
              color === c && "ring-2 ring-offset-1 ring-offset-background ring-foreground"
            )}
            style={{ background: c }}
          />
        ))}
      <Tool m="underline" icon={Underline} label="下划线" />
      <Tool m="note" icon={StickyNote} label="批注" />
      <Tool m="erase" icon={Eraser} label="橡皮（点标注即删）" />
      <div className="w-px h-5 bg-border mx-1" />
      <button
        type="button"
        onClick={onUndo}
        disabled={!canUndo}
        title="撤销"
        className="p-1.5 rounded hover:bg-muted disabled:opacity-40"
      >
        <Undo2 className="w-4 h-4" />
      </button>
    </div>
  );
}

/* ───────── 选区 ↔ 字符偏移 ───────── */
function offsetWithin(block: Element, node: Node, nodeOffset: number): number {
  let offset = 0;
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if (n === node) return offset + nodeOffset;
    offset += (n.textContent ?? "").length;
  }
  return offset;
}
function rangeFromOffsets(block: Element, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let acc = 0;
  let sNode: Node | null = null,
    eNode: Node | null = null;
  let sOff = 0,
    eOff = 0;
  let n: Node | null;
  while ((n = walker.nextNode())) {
    const len = (n.textContent ?? "").length;
    if (!sNode && acc + len >= start) {
      sNode = n;
      sOff = start - acc;
    }
    if (acc + len >= end) {
      eNode = n;
      eOff = end - acc;
      break;
    }
    acc += len;
  }
  if (!sNode || !eNode) return null;
  const r = document.createRange();
  try {
    r.setStart(sNode, sOff);
    r.setEnd(eNode, eOff);
  } catch {
    return null;
  }
  return r;
}

/* ───────── 标注层（overlay） ───────── */
interface RectSet {
  ann: Annotation;
  rects: { left: number; top: number; width: number; height: number }[];
}

export function AnnotationLayer({
  containerRef,
  annotations,
  mode,
  color,
  recomputeKey,
  onCreate,
  onErase,
}: {
  containerRef: React.RefObject<HTMLDivElement>;
  annotations: Annotation[];
  mode: AnnMode;
  color: string;
  recomputeKey?: unknown;
  onCreate: (a: Omit<Annotation, "id">) => void;
  onErase: (id: string) => void;
}) {
  const [sets, setSets] = useState<RectSet[]>([]);

  const recompute = useCallback(() => {
    const cont = containerRef.current;
    if (!cont) return;
    const base = cont.getBoundingClientRect();
    const out: RectSet[] = [];
    for (const ann of annotations) {
      const block = cont.querySelector(`[data-block-id="${ann.target.blockId}"]`);
      if (!block) continue;
      const range = rangeFromOffsets(block, ann.target.start, ann.target.end);
      if (!range) continue;
      const rects = Array.from(range.getClientRects()).map((r) => ({
        left: r.left - base.left,
        top: r.top - base.top,
        width: r.width,
        height: r.height,
      }));
      if (rects.length) out.push({ ann, rects });
    }
    setSets(out);
  }, [annotations, containerRef]);

  useEffect(() => {
    recompute();
    const onResize = () => recompute();
    window.addEventListener("resize", onResize);
    const ro = new ResizeObserver(() => recompute());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, [recompute, recomputeKey, containerRef]);

  // 选区捕获（高亮/下划线/批注模式）
  useEffect(() => {
    if (mode !== "highlight" && mode !== "underline" && mode !== "note") return;
    const cont = containerRef.current;
    if (!cont) return;
    const onUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!cont.contains(range.commonAncestorContainer)) return;
      const startEl =
        range.startContainer.nodeType === Node.TEXT_NODE
          ? range.startContainer.parentElement
          : (range.startContainer as Element);
      const block = startEl?.closest("[data-block-id]");
      if (!block) return;
      const blockId = block.getAttribute("data-block-id")!;
      const start = offsetWithin(block, range.startContainer, range.startOffset);
      const endEl =
        range.endContainer.nodeType === Node.TEXT_NODE
          ? range.endContainer.parentElement
          : (range.endContainer as Element);
      const endBlock = endEl?.closest("[data-block-id]");
      const end =
        endBlock === block
          ? offsetWithin(block, range.endContainer, range.endOffset)
          : (block.textContent ?? "").length;
      if (end <= start) return;
      const quote = (block.textContent ?? "").slice(start, end);
      let note: string | null = null;
      if (mode === "note") {
        note = window.prompt("批注内容：", "");
        if (note === null) {
          sel.removeAllRanges();
          return;
        }
      }
      onCreate({
        kind: mode === "note" ? "note" : mode,
        color: mode === "underline" ? null : color,
        note,
        target: { blockId, start, end, quote },
      });
      sel.removeAllRanges();
    };
    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, [mode, color, onCreate, containerRef]);

  return (
    <>
      {/* 高亮 / 下划线（文本下层） */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 0 }}>
        {sets.map(({ ann, rects }) =>
          rects.map((r, i) =>
            ann.kind === "underline" ? (
              <div
                key={ann.id + i}
                className="absolute"
                style={{
                  left: r.left,
                  top: r.top + r.height - 2,
                  width: r.width,
                  height: 2,
                  background: "hsl(var(--primary))",
                }}
              />
            ) : (
              <div
                key={ann.id + i}
                className="absolute rounded-[2px]"
                style={{
                  left: r.left,
                  top: r.top,
                  width: r.width,
                  height: r.height,
                  background: (ann.color || "#fde047") + "66",
                }}
              />
            )
          )
        )}
      </div>

      {/* 批注标记（文本上层，可点查看） */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 20 }}>
        {sets
          .filter((x) => x.ann.kind === "note" && x.ann.note)
          .map(({ ann, rects }) => {
            const last = rects[rects.length - 1];
            if (!last) return null;
            return (
              <span
                key={"n" + ann.id}
                title={ann.note || ""}
                className="absolute pointer-events-auto cursor-help text-[11px] select-none"
                style={{ left: last.left + last.width + 1, top: last.top - 4 }}
              >
                📝
              </span>
            );
          })}
      </div>

      {/* 橡皮交互层（文本上层，点击删除） */}
      {mode === "erase" && (
        <div className="absolute inset-0" style={{ zIndex: 30 }}>
          {sets.map(({ ann, rects }) =>
            rects.map((r, i) => (
              <div
                key={"e" + ann.id + i}
                onClick={() => onErase(ann.id)}
                className="absolute cursor-pointer rounded-[2px] ring-1 ring-bad/60 hover:bg-bad/25"
                style={{
                  left: r.left,
                  top: r.top,
                  width: r.width,
                  height: Math.max(r.height, 6),
                  background: "hsl(var(--bad) / 0.12)",
                }}
              />
            ))
          )}
        </div>
      )}
    </>
  );
}
