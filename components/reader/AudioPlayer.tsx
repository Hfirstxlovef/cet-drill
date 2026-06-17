"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, RotateCw, Headphones } from "lucide-react";
import { cn } from "@/lib/utils";

// 倍速循环顺序
const RATES = [1, 1.25, 1.5, 0.75];

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

// 行内听力播放器：单段连续录音覆盖整个 Part II。
// 控件：播放/暂停 · ±10s · 进度拖动 · 当前/总时长 · 倍速。
export function AudioPlayer({ src }: { src: string }) {
  const ref = useRef<HTMLAudioElement>(null);
  const seekingRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    const onMeta = () => setDur(a.duration || 0);
    const onTime = () => {
      if (!seekingRef.current) setCur(a.currentTime);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onPause);
    return () => {
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onPause);
    };
  }, []);

  // 倍速：src 重载会复位 playbackRate，统一在此同步
  useEffect(() => {
    if (ref.current) ref.current.playbackRate = rate;
  }, [rate, src]);

  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };

  const skip = (d: number) => {
    const a = ref.current;
    if (!a) return;
    a.currentTime = Math.min(Math.max(0, a.currentTime + d), a.duration || 0);
    setCur(a.currentTime);
  };

  const onScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    setCur(t);
    if (ref.current) ref.current.currentTime = t;
  };

  const cycleRate = () => setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length]);

  const pct = dur ? (cur / dur) * 100 : 0;

  return (
    <div className="my-3 flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2 text-sm select-none">
      <audio ref={ref} src={src} preload="metadata" />
      <Headphones className="w-4 h-4 flex-shrink-0 text-muted-foreground" />

      <button
        type="button"
        onClick={toggle}
        title={playing ? "暂停" : "播放"}
        aria-label={playing ? "暂停" : "播放"}
        className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-primary text-primary-foreground hover:opacity-90"
      >
        {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 translate-x-[1px]" />}
      </button>

      <button
        type="button"
        onClick={() => skip(-10)}
        title="后退 10 秒"
        aria-label="后退 10 秒"
        className="inline-flex flex-shrink-0 items-center text-muted-foreground hover:text-foreground"
      >
        <RotateCcw className="w-4 h-4" />
        <span className="ml-0.5 text-[10px] tabular-nums">10</span>
      </button>
      <button
        type="button"
        onClick={() => skip(10)}
        title="前进 10 秒"
        aria-label="前进 10 秒"
        className="inline-flex flex-shrink-0 items-center text-muted-foreground hover:text-foreground"
      >
        <span className="mr-0.5 text-[10px] tabular-nums">10</span>
        <RotateCw className="w-4 h-4" />
      </button>

      <span className="flex-shrink-0 tabular-nums text-xs text-muted-foreground">{fmt(cur)}</span>

      <input
        type="range"
        min={0}
        max={dur || 0}
        step="any"
        value={cur}
        onChange={onScrub}
        onPointerDown={() => (seekingRef.current = true)}
        onPointerUp={() => (seekingRef.current = false)}
        aria-label="播放进度"
        className={cn(
          "h-1.5 flex-1 cursor-pointer appearance-none rounded-full",
          "[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:cursor-pointer",
          "[&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:cursor-pointer"
        )}
        style={{
          background: `linear-gradient(to right, hsl(var(--primary)) ${pct}%, hsl(var(--muted)) ${pct}%)`,
        }}
      />

      <span className="flex-shrink-0 tabular-nums text-xs text-muted-foreground">{fmt(dur)}</span>

      <button
        type="button"
        onClick={cycleRate}
        title="播放速度"
        aria-label="播放速度"
        className="flex-shrink-0 rounded border border-border px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground hover:text-foreground"
      >
        {rate}×
      </button>
    </div>
  );
}
