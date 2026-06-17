"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { apiGet, apiSend } from "@/lib/api";
import { Loader2, FileText, Play, Sparkles, ClipboardCheck, ChevronDown, History } from "lucide-react";
import { cn } from "@/lib/utils";

type AttemptSummary = {
  id: string;
  submittedAt: string;
  totalScore: number | null;
};

type Paper = {
  id: string;
  title: string;
  level: string;
  source: string;
  status: string;
  year: number | null;
  month: number | null;
  setNo: number | null;
  sectionCount: number;
  questionCount: number;
  attempts: AttemptSummary[];
};

// submittedAt 是 Prisma DateTime 序列化出的 ISO 字符串，直接 new Date(iso) 解析。
// 旧代码误用 Number(iso) → NaN → 「Invalid Date」。无效/缺失时回退为友好文案。
function fmtAttemptDate(iso: string | null | undefined): string {
  if (!iso) return "未记录时间";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "未记录时间";
  return d.toLocaleString("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HomePage() {
  const router = useRouter();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiGet<{ items: Paper[] }>("/api/cet/papers?source=real");
      setPapers(r.items);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const startPractice = async (paperId: string) => {
    setStartingId(paperId);
    try {
      const a = await apiSend<{ id: string }>("/api/cet/attempts", "POST", {
        paperId,
      });
      router.push(`/practice/${a.id}`);
    } catch (e: any) {
      alert(e.message);
      setStartingId(null);
    }
  };

  // 按年份分组（年份倒序；组内沿用 API 的月/套排序）
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const groups = useMemo(() => {
    const m = new Map<number, Paper[]>();
    for (const p of papers) {
      const y = p.year ?? 0;
      if (!m.has(y)) m.set(y, []);
      m.get(y)!.push(p);
    }
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, [papers]);
  const readyCount = useMemo(() => papers.filter((p) => p.status === "ready").length, [papers]);
  const toggleYear = (y: number) =>
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(y)) n.delete(y);
      else n.add(y);
      return n;
    });

  return (
    <AppShell>
      <div className="p-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">题库</h1>
            <p className="text-sm text-muted-foreground mt-1">
              四级真题，按年份分类。点开即可在线作答、AI 批改。
              {!loading && papers.length > 0 && (
                <span className="ml-1">共 {papers.length} 套 · {readyCount} 套可直接练。</span>
              )}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-muted-foreground py-12 text-center">
            <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> 加载中…
          </div>
        ) : papers.length === 0 ? (
          <div className="text-sm text-muted-foreground py-16 text-center border border-dashed border-border rounded-lg">
            <FileText className="w-8 h-8 mx-auto mb-3 opacity-40" />
            <div>题库为空。</div>
            <div className="mt-1 text-xs">
              运行 <code className="bg-muted px-1.5 py-0.5 rounded">npm run ingest</code> 导入一套真题，或先到「设置」配置 API Key。
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map(([year, ps]) => {
              const open = !collapsed.has(year);
              return (
                <div key={year}>
                  <button
                    onClick={() => toggleYear(year)}
                    className="flex w-full items-center gap-2 border-b border-border pb-1.5 mb-2 text-left"
                  >
                    <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", !open && "-rotate-90")} />
                    <span className="text-base font-semibold">{year ? `${year} 年` : "未分类"}</span>
                    <span className="text-xs text-muted-foreground">{ps.length} 套</span>
                  </button>
                  {open && (
                    <div className="space-y-2">
                      {ps.map((p) => (
                        <PaperRow key={p.id} p={p} starting={startingId === p.id} onStart={startPractice} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function PaperRow({
  p,
  starting,
  onStart,
}: {
  p: Paper;
  starting: boolean;
  onStart: (id: string) => void;
}) {
  const [histOpen, setHistOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg bg-card hover:border-primary/50 transition-colors">
      <div className="flex items-center gap-4 p-4">
        <div className="w-12 h-12 rounded bg-muted flex items-center justify-center flex-shrink-0">
          <FileText className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{p.title}</div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            <SourceBadge source={p.source} />
            <StatusBadge status={p.status} />
            <span>
              {p.sectionCount} 部分 · {p.questionCount} 题
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {p.attempts.length > 0 && (
            <button
              onClick={() => setHistOpen((v) => !v)}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm border border-border hover:bg-muted",
                histOpen && "bg-muted"
              )}
            >
              <History className="w-4 h-4" />
              <span className="hidden sm:inline">历史</span>
              <span className="text-xs text-muted-foreground">{p.attempts.length}</span>
            </button>
          )}
          {p.status === "review" ? (
            <Link
              href={`/review/${p.id}`}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium border border-border hover:bg-muted"
            >
              <ClipboardCheck className="w-4 h-4" /> 校对答案
            </Link>
          ) : (
            <button
              onClick={() => onStart(p.id)}
              disabled={starting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              开始练习
            </button>
          )}
        </div>
      </div>
      {histOpen && p.attempts.length > 0 && (
        <div className="border-t border-border px-4 py-3 space-y-1.5">
          {p.attempts.map((a) => (
            <Link
              key={a.id}
              href={`/practice/${a.id}`}
              className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors"
            >
              <span className="text-muted-foreground">
                {fmtAttemptDate(a.submittedAt)}
              </span>
              <span className={cn("font-medium tabular-nums", a.totalScore != null && a.totalScore >= 425 ? "text-ok" : "text-foreground")}>
                {a.totalScore != null ? `${a.totalScore} 分` : "待批改"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function SourceBadge({ source }: { source: string }) {
  return source === "ai" ? (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-accent text-accent-foreground">
      <Sparkles className="w-3 h-3" /> AI 仿真
    </span>
  ) : (
    <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-foreground/70">真题</span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ready: "bg-ok/15 text-ok",
    review: "bg-amber-500/15 text-amber-600",
    ingesting: "bg-muted text-muted-foreground",
  };
  const label: Record<string, string> = {
    ready: "可练习",
    review: "待校对",
    ingesting: "导入中",
  };
  return (
    <span className={cn("px-1.5 py-0.5 rounded text-[10px]", map[status] ?? "bg-muted")}>
      {label[status] ?? status}
    </span>
  );
}
