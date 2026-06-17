"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiGet, apiSend } from "@/lib/api";
import { cn, letter } from "@/lib/utils";
import { SECTION_LABEL, type PaperDTO } from "@/lib/cet/types";
import { SectionBlock } from "./blocks";
import { AudioPlayer } from "./AudioPlayer";
import { AnswerCard, type CardEntry } from "./AnswerCard";
import { ReportView, type Breakdown, type AiReport } from "./ReportView";
import { WordLookupArea } from "./WordLookupArea";
import {
  AnnotationToolbar,
  AnnotationLayer,
  HL_COLORS,
  type AnnMode,
  type Annotation,
} from "./annotations";
import { ChevronLeft, ListChecks, Loader2, Check, Send } from "lucide-react";

type Item = {
  questionId: string;
  userAnswer: string | null;
  aiFeedback?: { kind: string; feedback: any } | null;
};

export function ExamReader({
  attemptId,
  initialPaper,
  initialItems,
  initialSubmitted,
  initialReport,
}: {
  attemptId: string;
  initialPaper: PaperDTO;
  initialItems: Item[];
  initialSubmitted: boolean;
  initialReport: { breakdown?: Breakdown; ai?: AiReport } | null;
}) {
  const [paper, setPaper] = useState(initialPaper);
  const [submitted, setSubmitted] = useState(initialSubmitted);
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const a: Record<string, string> = {};
    for (const it of initialItems) if (it.userAnswer) a[it.questionId] = it.userAnswer;
    return a;
  });
  const [breakdown, setBreakdown] = useState<Breakdown | null>(initialReport?.breakdown ?? null);
  const [ai, setAi] = useState<AiReport | null>(initialReport?.ai ?? null);
  const [cardOpen, setCardOpen] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  const lastSaved = useRef<Record<string, string>>({ ...answers });

  // 标注
  const [annMode, setAnnMode] = useState<AnnMode>("none");
  const [annColor, setAnnColor] = useState(HL_COLORS[0]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const annStack = useRef<string[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);

  // 主观题 AI 批改
  const [subjFeedback, setSubjFeedback] = useState<Record<string, { kind: string; feedback: any }>>(
    () => {
      const m: Record<string, { kind: string; feedback: any }> = {};
      for (const it of initialItems) if (it.aiFeedback) m[it.questionId] = it.aiFeedback;
      return m;
    }
  );
  const [gradingQid, setGradingQid] = useState<string | null>(null);

  // 答题卡条目
  const cardEntries = useMemo<CardEntry[]>(() => {
    const entries: CardEntry[] = [];
    for (const s of paper.sections) {
      const group = SECTION_LABEL[s.kind] ?? s.kind;
      for (const q of s.questions) {
        if (q.number == null) continue;
        let letters: string[] = [];
        if (q.type === "mcq") letters = (q.options ?? [1, 2, 3, 4]).map((_, i) => letter(i));
        else if (q.type === "banked") letters = (s.wordBank ?? []).map((b) => b.letter);
        else if (q.type === "matching") letters = (s.paragraphs ?? []).map((p) => p.letter);
        else continue;
        entries.push({ number: q.number, qid: q.id, letters, group, correct: q.correct });
      }
    }
    return entries.sort((a, b) => a.number - b.number);
  }, [paper]);

  // 防抖保存脏作答
  const saveDirty = useCallback(async () => {
    const dirty = Object.entries(answers).filter(
      ([k, v]) => v !== (lastSaved.current[k] ?? "")
    );
    if (dirty.length === 0) return;
    setSaveState("saving");
    for (const [questionId, userAnswer] of dirty) {
      try {
        await apiSend(`/api/cet/attempts/${attemptId}/answer`, "PUT", { questionId, userAnswer });
        lastSaved.current[questionId] = userAnswer;
      } catch {
        /* 留待下次重试 */
      }
    }
    setSaveState("saved");
  }, [answers, attemptId]);

  useEffect(() => {
    if (submitted) return;
    const t = setTimeout(saveDirty, 700);
    return () => clearTimeout(t);
  }, [answers, submitted, saveDirty]);

  const onAnswer = (qid: string, val: string) => {
    if (submitted) return;
    setAnswers((a) => ({ ...a, [qid]: val }));
  };

  const onJump = (qid: string) => {
    document.getElementById(`q-${qid}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // 只统计客观题（cardEntries），否则作文/翻译两个文本框会把已答算成 57/55
  const objectiveCount = cardEntries.length;
  const answeredCount = cardEntries.reduce(
    (n, e) => n + (answers[e.qid]?.length ? 1 : 0),
    0
  );

  const submit = async () => {
    if (!confirm("确认交卷？交卷后将批改客观题，并自动用 AI 批改作文 / 翻译（约需半分钟，视答题长度），然后显示答案与解析。")) return;
    setSubmitting(true);
    try {
      await saveDirty();
      const bd = await apiSend<Breakdown>(`/api/cet/attempts/${attemptId}/grade`, "POST");
      // 重新拉取（带答案的 paper + 批改结果 + 主观题 AI 反馈）
      const fresh = await apiGet<{ paper: PaperDTO; items: Item[] }>(`/api/cet/attempts/${attemptId}`);
      setPaper(fresh.paper);
      const sf: Record<string, { kind: string; feedback: any }> = {};
      for (const it of fresh.items ?? []) if (it.aiFeedback) sf[it.questionId] = it.aiFeedback;
      setSubjFeedback(sf);
      setBreakdown(bd);
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      alert("交卷失败：" + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const generateAi = async () => {
    setAiLoading(true);
    try {
      const r = await apiSend<AiReport>(`/api/cet/attempts/${attemptId}/report`, "POST");
      setAi(r);
    } catch (e: any) {
      alert("AI 报告生成失败：" + e.message);
    } finally {
      setAiLoading(false);
    }
  };

  // 标注：加载 / 新建 / 删除 / 撤销
  useEffect(() => {
    apiGet<{ items: Annotation[] }>(`/api/cet/annotations?paperId=${paper.id}`)
      .then((r) => setAnnotations(r.items))
      .catch(() => {});
  }, [paper.id]);
  const createAnn = useCallback(
    async (a: Omit<Annotation, "id">) => {
      try {
        const created = await apiSend<Annotation>("/api/cet/annotations", "POST", {
          paperId: paper.id,
          ...a,
        });
        setAnnotations((xs) => [...xs, created]);
        annStack.current.push(created.id);
      } catch {}
    },
    [paper.id]
  );
  const eraseAnn = useCallback(async (id: string) => {
    setAnnotations((xs) => xs.filter((x) => x.id !== id));
    annStack.current = annStack.current.filter((x) => x !== id);
    try {
      await apiSend(`/api/cet/annotations?id=${id}`, "DELETE");
    } catch {}
  }, []);
  const undoAnn = useCallback(() => {
    const id = annStack.current.pop();
    if (id) eraseAnn(id);
  }, [eraseAnn]);

  const gradeSubjective = useCallback(
    async (qid: string) => {
      setGradingQid(qid);
      try {
        const r = await apiSend<{ kind: string; feedback: any; breakdown?: Breakdown }>(
          `/api/cet/attempts/${attemptId}/grade-subjective`,
          "POST",
          { questionId: qid }
        );
        setSubjFeedback((m) => ({ ...m, [qid]: { kind: r.kind, feedback: r.feedback } }));
        if (r.breakdown) setBreakdown(r.breakdown); // 批改结果并回报告总分
      } catch (e) {
        // 自动/手动批改失败：不弹窗打扰，题旁会显示「点击重试」
        console.error("grade-subjective failed", e);
      } finally {
        setGradingQid(null);
      }
    },
    [attemptId]
  );

  // 交卷后（含刷新重进）：对已作答但还没批改结果的主观题，自动批改一次
  const autoGradedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!submitted) return;
    for (const s of paper.sections) {
      if (s.kind !== "writing" && s.kind !== "translation") continue;
      const q = s.questions[0];
      if (!q || subjFeedback[q.id] || autoGradedRef.current.has(q.id)) continue;
      if (!(answers[q.id] ?? "").trim()) continue; // 未作答不批改
      autoGradedRef.current.add(q.id);
      gradeSubjective(q.id);
    }
  }, [submitted, paper, subjFeedback, answers, gradeSubjective]);

  return (
    <div className="dark min-h-screen bg-background text-foreground">
      {/* 顶栏 */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/90 backdrop-blur px-4 py-2.5">
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-4 h-4" /> 题库
        </Link>
        <div className="font-medium truncate max-w-[160px]">{paper.title}</div>
        <div className="mx-auto rounded-md border border-border bg-card px-2 py-1">
          <AnnotationToolbar
            mode={annMode}
            setMode={setAnnMode}
            color={annColor}
            setColor={setAnnColor}
            onUndo={undoAnn}
            canUndo={annStack.current.length > 0}
          />
        </div>
        <div className="flex items-center gap-3 text-sm">
          {!submitted && (
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
              {saveState === "saving" ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> 保存中
                </>
              ) : saveState === "saved" ? (
                <>
                  <Check className="w-3.5 h-3.5 text-ok" /> 已保存
                </>
              ) : null}
            </span>
          )}
          <span className="text-xs text-muted-foreground tabular-nums">
            已答 {answeredCount}/{objectiveCount}
          </span>
          <button
            onClick={() => setCardOpen((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs hover:bg-muted"
          >
            <ListChecks className="w-3.5 h-3.5" /> 答题卡
          </button>
          {!submitted && (
            <button
              onClick={submit}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {submitting ? "批改中…" : "交卷"}
            </button>
          )}
        </div>
      </header>

      <div className="flex">
        <main className="flex-1 min-w-0">
          <WordLookupArea paperId={paper.id} enabled={annMode === "none"}>
            <div ref={contentRef} className="relative mx-auto max-w-3xl px-6 py-8">
              <AnnotationLayer
                containerRef={contentRef}
                annotations={annotations}
                mode={annMode}
                color={annColor}
                recomputeKey={submitted}
                onCreate={createAnn}
                onErase={eraseAnn}
              />
              <div className="exam-prose relative" style={{ zIndex: 10 }}>
            <h1 className="text-center text-2xl font-bold mb-8 font-serif">{paper.title}</h1>
            {submitted && breakdown && (
              <ReportView breakdown={breakdown} ai={ai} onGenerateAi={generateAi} aiLoading={aiLoading} />
            )}
            {paper.sections.map((s, i) => {
              // 听力是单段连续录音覆盖整个 Part II——播放器只在首个听力 section 出现一次
              const isFirstListening =
                s.kind.startsWith("listening") &&
                !paper.sections[i - 1]?.kind?.startsWith("listening");
              return (
                <section key={s.id} className="mb-10">
                  <div className="mb-3 border-b border-border pb-1.5 text-sm font-semibold tracking-wide text-primary">
                    {romanPart(i, paper)} · {SECTION_LABEL[s.kind] ?? s.kind}
                  </div>
                  {isFirstListening &&
                    (s.audioUrl ? (
                      <AudioPlayer src={s.audioUrl} />
                    ) : (
                      <div className="my-3 flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                        🎧 本套听力暂无音频（官方未提供录音），以下仅列题目与选项。
                      </div>
                    ))}
                  <SectionBlock
                    section={s}
                    answers={answers}
                    onAnswer={onAnswer}
                    submitted={submitted}
                    subj={{ feedback: subjFeedback, gradingQid, onGrade: gradeSubjective }}
                  />
                </section>
              );
            })}
            {!submitted && (
              <div className="py-8 text-center">
                <button
                  onClick={submit}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {submitting ? "批改中…（含 AI 作文/翻译）" : "交卷并批改"}
                </button>
              </div>
            )}
              </div>
            </div>
          </WordLookupArea>
        </main>

        {cardOpen && (
          <aside className="hidden lg:block w-72 flex-shrink-0 border-l border-border">
            <div className="sticky top-[49px] max-h-[calc(100vh-49px)] overflow-auto">
              <AnswerCard
                entries={cardEntries}
                answers={answers}
                onAnswer={onAnswer}
                submitted={submitted}
                onJump={onJump}
              />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

// 部分序号：按 section 出现顺序粗略映射到 Part I–IV（写作/听力/阅读/翻译）
function romanPart(i: number, paper: PaperDTO): string {
  const kind = paper.sections[i]?.kind ?? "";
  if (kind === "writing") return "Part I";
  if (kind.startsWith("listening")) return "Part II";
  if (["banked_cloze", "matching", "careful_reading"].includes(kind)) return "Part III";
  if (kind === "translation") return "Part IV";
  return "";
}
