"use client";

import { cn } from "@/lib/utils";
import { CET_TOTAL } from "@/lib/cet/types";

export interface Breakdown {
  // 新版（710 分制）
  scaled?: {
    total: number;
    listening: number;
    reading: number;
    writing: number;
    translation: number;
    pass: number;
  };
  bySection: { kind: string; label: string; correct: number; total: number; scaled?: number }[];
  subjective?: { kind: string; label: string; band: number; scaled: number; status: string }[];
  // 旧版兼容字段
  totalScore?: number;
  maxScore?: number;
  byTag?: { tag: string; correct: number; total: number }[];
}

export interface AiReport {
  ability?: string;
  weakness?: string;
  recommendations?: string[];
}

const SUBJ_NOTE: Record<string, string> = { blank: "未作答", error: "待批改" };

export function ReportView({
  breakdown,
  ai,
  onGenerateAi,
  aiLoading,
}: {
  breakdown: Breakdown;
  ai?: AiReport | null;
  onGenerateAi?: () => void;
  aiLoading?: boolean;
}) {
  const scaled = breakdown.scaled;
  const subjStatus = (kind: string) =>
    breakdown.subjective?.find((s) => s.kind === kind)?.status;

  return (
    <div className="mb-8 rounded-xl border border-border bg-card/60 p-5">
      {scaled ? (
        <NewHeader scaled={scaled} subjStatus={subjStatus} />
      ) : (
        <LegacyHeader breakdown={breakdown} />
      )}

      {/* 分项正确率（grade 已按正确率升序） */}
      <div className="mt-5">
        <div className="text-xs text-muted-foreground mb-2">
          客观分项正确率{scaled ? "（按正确率升序）" : ""}
        </div>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
          {breakdown.bySection.map((s) => (
            <Bar key={s.kind} label={s.label} correct={s.correct} total={s.total} />
          ))}
        </div>
      </div>

      {/* 旧报告才显示「薄弱题型」；新报告已并入分项 + 主观 */}
      {!scaled && breakdown.byTag && breakdown.byTag.length > 0 && (
        <div className="mt-4">
          <div className="text-xs text-muted-foreground mb-2">薄弱题型（按正确率升序）</div>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {breakdown.byTag.slice(0, 6).map((t) => (
              <Bar key={t.tag} label={t.tag} correct={t.correct} total={t.total} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 border-t border-border pt-4">
        {ai ? (
          <div className="space-y-3 text-sm">
            {ai.ability && (
              <div>
                <div className="font-medium mb-1">能力分析</div>
                <p className="text-foreground/90 whitespace-pre-wrap">{ai.ability}</p>
              </div>
            )}
            {ai.weakness && (
              <div>
                <div className="font-medium mb-1">不足诊断</div>
                <p className="text-foreground/90 whitespace-pre-wrap">{ai.weakness}</p>
              </div>
            )}
            {ai.recommendations && ai.recommendations.length > 0 && (
              <div>
                <div className="font-medium mb-1">训练推荐</div>
                <ul className="list-disc pl-5 space-y-1 text-foreground/90">
                  {ai.recommendations.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          onGenerateAi && (
            <button
              onClick={onGenerateAi}
              disabled={aiLoading}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {aiLoading ? "AI 分析中…" : "✨ 生成 AI 能力 / 不足 / 训练推荐"}
            </button>
          )
        )}
      </div>
    </div>
  );
}

/* ---------- 新版头部：710 分制 ---------- */
function NewHeader({
  scaled,
  subjStatus,
}: {
  scaled: NonNullable<Breakdown["scaled"]>;
  subjStatus: (kind: string) => string | undefined;
}) {
  const passed = scaled.total >= scaled.pass;
  const passLeft = (scaled.pass / CET_TOTAL) * 100;
  const fill = Math.min(100, (scaled.total / CET_TOTAL) * 100);
  const macros = [
    { key: "listening", label: "听力", val: scaled.listening, full: 248.5 },
    { key: "reading", label: "阅读", val: scaled.reading, full: 248.5 },
    { key: "writing", label: "写作", val: scaled.writing, full: 106.5 },
    { key: "translation", label: "翻译", val: scaled.translation, full: 106.5 },
  ];

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-lg font-semibold">成绩报告</h2>
        <div className="text-sm text-muted-foreground">
          预估总分{" "}
          <span className="text-2xl font-semibold text-foreground">{scaled.total}</span>
          {" / "}
          {CET_TOTAL}
          <span
            className={cn(
              "ml-2 rounded px-1.5 py-0.5 text-xs",
              passed ? "bg-ok/15 text-ok" : "bg-muted text-muted-foreground"
            )}
          >
            {passed ? "达及格线" : `及格线 ${scaled.pass}`}
          </span>
        </div>
      </div>

      {/* 710 总分条 + 425 及格线刻度 */}
      <div className="relative h-2.5 rounded-full bg-muted overflow-hidden mb-1">
        <div
          className={cn("h-full rounded-full", passed ? "bg-ok" : "bg-amber-500")}
          style={{ width: `${fill}%` }}
        />
      </div>
      <div className="relative h-3 mb-4">
        <div
          className="absolute -top-3 flex flex-col items-center -translate-x-1/2"
          style={{ left: `${passLeft}%` }}
        >
          <div className="h-3 w-px bg-foreground/40" />
          <span className="text-[10px] text-muted-foreground">{scaled.pass}</span>
        </div>
      </div>

      {/* 四宏观板块（对齐真实成绩单口径） */}
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
        {macros.map((m) => {
          const note = (m.key === "writing" || m.key === "translation") ? SUBJ_NOTE[subjStatus(m.key) ?? ""] : undefined;
          return <ScoreBar key={m.key} label={m.label} value={m.val} max={m.full} note={note} />;
        })}
      </div>
    </div>
  );
}

/* ---------- 旧报告头部（兼容历史 attempt） ---------- */
function LegacyHeader({ breakdown }: { breakdown: Breakdown }) {
  const total = breakdown.totalScore ?? 0;
  const max = breakdown.maxScore ?? 0;
  const pct = max ? Math.round((total / max) * 100) : 0;
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-lg font-semibold">成绩报告</h2>
      <div className="text-sm text-muted-foreground">
        客观题 <span className="text-2xl font-semibold text-foreground">{total}</span>
        {" / "}
        {max} 分（{pct}%）
      </div>
    </div>
  );
}

/* 点数条：得分 / 满分（1 位小数） */
function ScoreBar({
  label,
  value,
  max,
  note,
}: {
  label: string;
  value: number;
  max: number;
  note?: string;
}) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {note ? <span className="text-amber-500">{note}</span> : `${value} / ${max}`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full",
            pct >= 70 ? "bg-ok" : pct >= 40 ? "bg-amber-500" : "bg-bad"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* 正确率条：答对 / 总题数 */
function Bar({ label, correct, total }: { label: string; correct: number; total: number }) {
  const pct = total ? Math.round((correct / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">
          {correct}/{total}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full",
            pct >= 70 ? "bg-ok" : pct >= 40 ? "bg-amber-500" : "bg-bad"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
