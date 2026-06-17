"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { apiGet, apiSend } from "@/lib/api";
import { SECTION_LABEL, type PaperDTO, type SectionDTO } from "@/lib/cet/types";
import { Loader2, Check, ClipboardCheck } from "lucide-react";

export default function ReviewPage({ params }: { params: { paperId: string } }) {
  const router = useRouter();
  const [paper, setPaper] = useState<PaperDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    (async () => {
      const p = await apiGet<PaperDTO>(`/api/cet/papers/${params.paperId}?answers=1`);
      setPaper(p);
      setLoading(false);
    })();
  }, [params.paperId]);

  const saveQ = async (id: string, patch: { correct?: string; knowledgeTag?: string }) => {
    await apiSend(`/api/cet/questions/${id}`, "PUT", patch);
  };

  const markReady = async () => {
    setMarking(true);
    try {
      await apiSend(`/api/cet/papers/${params.paperId}`, "PUT", { status: "ready" });
      router.push("/");
    } finally {
      setMarking(false);
    }
  };

  if (loading)
    return (
      <AppShell>
        <div className="p-8 text-sm text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> 加载中…
        </div>
      </AppShell>
    );
  if (!paper)
    return (
      <AppShell>
        <div className="p-8">未找到该卷。</div>
      </AppShell>
    );

  const objectiveSections = paper.sections.filter((s) =>
    s.questions.some((q) => ["mcq", "banked", "matching"].includes(q.type))
  );

  return (
    <AppShell>
      <div className="p-8 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-semibold">校对答案</h1>
          <button
            onClick={markReady}
            disabled={marking}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {marking ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4" />}
            确认无误，标记为可练习
          </button>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          {paper.title} · 核对客观题答案与题型标签（可直接修改，失焦自动保存）。
        </p>

        <div className="space-y-6">
          {objectiveSections.map((s) => (
            <ReviewSection key={s.id} section={s} onSave={saveQ} />
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function ReviewSection({
  section,
  onSave,
}: {
  section: SectionDTO;
  onSave: (id: string, patch: { correct?: string; knowledgeTag?: string }) => Promise<void>;
}) {
  return (
    <section className="border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-muted/50 text-sm font-medium">
        {SECTION_LABEL[section.kind] ?? section.kind}
        {section.title ? ` · ${section.title}` : ""}
      </div>
      <div className="divide-y divide-border">
        {section.questions.map((q) => (
          <div key={q.id} className="flex items-center gap-3 px-4 py-2 text-sm">
            <span className="w-8 text-muted-foreground tabular-nums">{q.number}</span>
            <input
              defaultValue={q.correct ?? ""}
              onBlur={(e) => onSave(q.id, { correct: e.target.value.trim().toUpperCase() })}
              className="w-14 px-2 py-1 border border-border rounded text-center font-mono uppercase bg-background"
              maxLength={1}
            />
            <input
              defaultValue={q.knowledgeTag ?? ""}
              onBlur={(e) => onSave(q.id, { knowledgeTag: e.target.value.trim() })}
              placeholder="题型/考点"
              className="flex-1 px-2 py-1 border border-border rounded text-xs bg-background"
            />
            {q.stem && (
              <span className="flex-[2] text-xs text-muted-foreground truncate hidden md:block">
                {q.stem}
              </span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
