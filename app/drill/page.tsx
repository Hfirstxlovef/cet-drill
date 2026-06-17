"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { apiGet, apiSend } from "@/lib/api";
import { Loader2, Wand2, Target, Layers, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "type" | "weakness";
type Difficulty = "easy" | "medium" | "hard";

const TYPE_OPTS = [
  { kind: "careful_reading", label: "仔细阅读" },
  { kind: "banked_cloze", label: "选词填空" },
  { kind: "matching", label: "信息匹配" },
  { kind: "writing", label: "写作" },
  { kind: "translation", label: "翻译" },
];
const DIFF_OPTS: { v: Difficulty; label: string }[] = [
  { v: "easy", label: "简单" },
  { v: "medium", label: "适中" },
  { v: "hard", label: "拔高" },
];

type Attempt = { id: string; paperTitle: string; submittedAt: string | null; totalScore: number | null };

export default function DrillPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("type");
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 按题型
  const [types, setTypes] = useState<string[]>(["careful_reading"]);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [count, setCount] = useState(1);
  const [mixRealType, setMixRealType] = useState(false);

  // 按弱项
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [baseAttemptId, setBaseAttemptId] = useState<string>("");
  const [mixRealWeak, setMixRealWeak] = useState(true);

  useEffect(() => {
    apiGet<{ items: Attempt[] }>("/api/cet/attempts")
      .then((r) => {
        const done = r.items.filter((a) => a.submittedAt);
        setAttempts(done);
        if (done[0]) setBaseAttemptId(done[0].id);
      })
      .catch(() => {});
  }, []);

  const toggleType = (k: string) =>
    setTypes((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]));

  const generate = async () => {
    setErr(null);
    setGenerating(true);
    try {
      const body =
        tab === "type"
          ? { driver: "type", types, difficulty, count, mixReal: mixRealType }
          : { driver: "weakness", baseAttemptId, mixReal: mixRealWeak };
      const r = await apiSend<{ attemptId: string }>("/api/cet/generate", "POST", body);
      router.push(`/practice/${r.attemptId}`);
    } catch (e: any) {
      setErr(e.message || "生成失败");
      setGenerating(false);
    }
  };

  const canGen = tab === "type" ? types.length > 0 : !!baseAttemptId;

  return (
    <AppShell>
      <div className="p-8 max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-1">
          <Wand2 className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-semibold">AI 练习</h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          在真题基础上即时生成原创题。与真题分开练习，可单独刷题或针对弱项强化。
        </p>

        {/* Tab 切换 */}
        <div className="inline-flex rounded-lg border border-border bg-card p-1 mb-6">
          <button
            onClick={() => setTab("type")}
            className={cn("inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium", tab === "type" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            <Layers className="w-4 h-4" /> 按题型组卷
          </button>
          <button
            onClick={() => setTab("weakness")}
            className={cn("inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium", tab === "weakness" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            <Target className="w-4 h-4" /> 按弱项强化
          </button>
        </div>

        {tab === "type" ? (
          <div className="space-y-5">
            <div>
              <div className="text-sm font-medium mb-2">题型（可多选）</div>
              <div className="flex flex-wrap gap-2">
                {TYPE_OPTS.map((o) => (
                  <button
                    key={o.kind}
                    onClick={() => toggleType(o.kind)}
                    className={cn("rounded-md border px-3 py-1.5 text-sm", types.includes(o.kind) ? "border-primary bg-accent text-accent-foreground" : "border-border hover:bg-muted")}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium mb-2">难度</div>
              <div className="flex gap-2">
                {DIFF_OPTS.map((d) => (
                  <button
                    key={d.v}
                    onClick={() => setDifficulty(d.v)}
                    className={cn("rounded-md border px-3 py-1.5 text-sm", difficulty === d.v ? "border-primary bg-accent text-accent-foreground" : "border-border hover:bg-muted")}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            {types.includes("careful_reading") && (
              <div>
                <div className="text-sm font-medium mb-2">仔细阅读篇数</div>
                <div className="flex gap-2">
                  {[1, 2, 3].map((n) => (
                    <button key={n} onClick={() => setCount(n)} className={cn("w-10 rounded-md border py-1.5 text-sm", count === n ? "border-primary bg-accent text-accent-foreground" : "border-border hover:bg-muted")}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={mixRealType} onChange={(e) => setMixRealType(e.target.checked)} className="rounded border-border" />
              掺入同题型真题一起练（真题 + AI 穿插）
            </label>
          </div>
        ) : (
          <div className="space-y-4">
            {attempts.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground text-center">
                还没有已交卷的练习。先去「题库」做一套真题并交卷，这里就能针对你的弱项出题。
              </div>
            ) : (
              <>
                <div>
                  <div className="text-sm font-medium mb-2">基于哪次练习的报告</div>
                  <div className="space-y-1.5 max-h-64 overflow-auto">
                    {attempts.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setBaseAttemptId(a.id)}
                        className={cn("w-full flex items-center gap-3 rounded-md border px-3 py-2 text-left text-sm", baseAttemptId === a.id ? "border-primary bg-accent" : "border-border hover:bg-muted")}
                      >
                        <span className="flex-1 truncate">{a.paperTitle}</span>
                        {a.totalScore != null && <span className="text-xs text-muted-foreground tabular-nums">{a.totalScore} 分</span>}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={mixRealWeak} onChange={(e) => setMixRealWeak(e.target.checked)} className="rounded border-border" />
                  弱项考点的真题一起穿插练
                </label>
              </>
            )}
          </div>
        )}

        {err && <div className="mt-4 text-sm text-bad">{err}</div>}

        <button
          onClick={generate}
          disabled={!canGen || generating}
          className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {generating ? "AI 出题中，约 10–40 秒…" : "生成并开始练习"}
        </button>
      </div>
    </AppShell>
  );
}
