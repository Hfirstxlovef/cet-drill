"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiSend } from "@/lib/api";
import { WordPopup, type LookupState } from "./WordPopup";
import type { DictEntry } from "@/app/api/cet/define/route";

const isWordChar = (c: string) => /[A-Za-z'’-]/.test(c);

function caretRange(x: number, y: number): Range | null {
  const doc = document as any;
  if (doc.caretRangeFromPoint) return doc.caretRangeFromPoint(x, y);
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y);
    if (!p) return null;
    const r = document.createRange();
    r.setStart(p.offsetNode, p.offset);
    r.collapse(true);
    return r;
  }
  return null;
}

function wordAtPoint(x: number, y: number): { word: string; rect: DOMRect; range: Range; context: string } | null {
  const range = caretRange(x, y);
  if (!range) return null;
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;
  const text = node.textContent ?? "";
  let off = Math.min(range.startOffset, text.length - 1);
  if (off < 0) return null;
  if (!isWordChar(text[off] ?? "") && !isWordChar(text[off - 1] ?? "")) return null;
  let s = off, e = off;
  while (s > 0 && isWordChar(text[s - 1])) s--;
  while (e < text.length && isWordChar(text[e])) e++;
  const raw = text.slice(s, e).replace(/^['’-]+|['’-]+$/g, "");
  if (!raw || !/[A-Za-z]/.test(raw)) return null;
  const wr = document.createRange();
  wr.setStart(node, s);
  wr.setEnd(node, e);
  const rect = wr.getBoundingClientRect();
  // 取所在句子作为语境
  let cs = s, ce = e;
  while (cs > 0 && !/[.?!。？！]/.test(text[cs - 1])) cs--;
  while (ce < text.length && !/[.?!。？！]/.test(text[ce])) ce++;
  const context = text.slice(cs, Math.min(ce + 1, text.length)).trim().slice(0, 200);
  return { word: raw, rect, range: wr, context };
}

function speak(word: string) {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(word);
    u.lang = "en-US";
    u.rate = 0.9;
    synth.speak(u);
  } catch {
    /* 无 TTS 能力则忽略 */
  }
}

export function WordLookupArea({
  children,
  paperId,
  enabled = true,
}: {
  children: React.ReactNode;
  paperId?: string;
  enabled?: boolean;
}) {
  const [lookup, setLookup] = useState<LookupState | null>(null);
  const [added, setAdded] = useState(false);
  const [adding, setAdding] = useState(false);
  const ctxRef = useRef<string>("");
  const cache = useRef<Map<string, { phonetic?: string | null; entries: DictEntry[] }>>(new Map());

  const close = useCallback(() => {
    setLookup(null);
    setAdded(false);
    window.getSelection?.()?.removeAllRanges();
  }, []);

  const onMouseDown = (e: React.MouseEvent) => {
    if (!enabled) return; // 标注模式下让位给文本选区
    const target = e.target as HTMLElement;
    if (target.closest("[data-no-lookup]")) return; // 弹卡内部
    if (target.closest("button, select, textarea, input, a")) {
      close();
      return;
    }
    const hit = wordAtPoint(e.clientX, e.clientY);
    if (!hit) {
      close();
      return;
    }
    // 选中并发音
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(hit.range);
    speak(hit.word);
    ctxRef.current = hit.context;
    setAdded(false);

    const key = hit.word.toLowerCase();
    const cached = cache.current.get(key);
    if (cached) {
      setLookup({ word: hit.word, rect: hit.rect, loading: false, phonetic: cached.phonetic, entries: cached.entries });
      return;
    }
    setLookup({ word: hit.word, rect: hit.rect, loading: true });
    apiSend<{ phonetic?: string; entries: DictEntry[] }>("/api/cet/define", "POST", {
      word: hit.word,
      context: hit.context,
    })
      .then((r) => {
        cache.current.set(key, { phonetic: r.phonetic, entries: r.entries });
        setLookup((cur) =>
          cur && cur.word === hit.word
            ? { ...cur, loading: false, phonetic: r.phonetic, entries: r.entries }
            : cur
        );
      })
      .catch((err) => {
        setLookup((cur) =>
          cur && cur.word === hit.word ? { ...cur, loading: false, error: "查询失败" } : cur
        );
      });
  };

  // 滚动时关闭（定位会失效）
  useEffect(() => {
    if (!lookup) return;
    const onScroll = () => close();
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [lookup, close]);

  const onAdd = async () => {
    if (!lookup || !lookup.entries) return;
    setAdding(true);
    try {
      const definition = lookup.entries.map((e) => `${e.pos} ${e.meaning}`).join("; ");
      await apiSend("/api/cet/vocab", "POST", {
        word: lookup.word,
        context: ctxRef.current,
        definition: lookup.phonetic ? `${lookup.phonetic} ${definition}` : definition,
        paperId,
      });
      setAdded(true);
    } catch {
      /* ignore */
    } finally {
      setAdding(false);
    }
  };

  return (
    <div onMouseDown={onMouseDown}>
      {children}
      {lookup && (
        <WordPopup
          state={lookup}
          added={added}
          adding={adding}
          onSpeak={() => speak(lookup.word)}
          onAdd={onAdd}
          onClose={close}
        />
      )}
    </div>
  );
}
