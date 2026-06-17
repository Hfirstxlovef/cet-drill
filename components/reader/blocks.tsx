"use client";

import { useMemo } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { cn, letter } from "@/lib/utils";
import type { SectionDTO, QuestionDTO } from "@/lib/cet/types";
import type { SubjFeedback } from "@/lib/prompts/cet/grade";

type AnswerMap = Record<string, string>;

export interface SubjProps {
  feedback: Record<string, { kind: string; feedback: SubjFeedback }>;
  gradingQid: string | null;
  onGrade: (qid: string) => void;
}

export function SectionBlock({
  section,
  answers,
  onAnswer,
  submitted,
  subj,
}: {
  section: SectionDTO;
  answers: AnswerMap;
  onAnswer: (qid: string, val: string) => void;
  submitted: boolean;
  subj?: SubjProps;
}) {
  const common = { answers, onAnswer, submitted };
  switch (section.kind) {
    case "banked_cloze":
      return <BankedClozeBlock section={section} {...common} />;
    case "matching":
      return <MatchingBlock section={section} {...common} />;
    case "careful_reading":
      return <CarefulReadingBlock section={section} {...common} />;
    case "writing":
      return <FreeTextBlock section={section} {...common} kind="writing" subj={subj} />;
    case "translation":
      return <FreeTextBlock section={section} {...common} kind="translation" subj={subj} />;
    default:
      return <ListeningBlock section={section} {...common} />;
  }
}

/* ---------- 单选题行（听力 / 仔细阅读） ---------- */
function McqQuestion({
  q,
  answers,
  onAnswer,
  submitted,
}: {
  q: QuestionDTO;
  answers: AnswerMap;
  onAnswer: (qid: string, val: string) => void;
  submitted: boolean;
}) {
  const chosen = answers[q.id] ?? "";
  const opts = q.options ?? [];
  return (
    <div id={`q-${q.id}`} className="mb-4 scroll-mt-16">
      {q.stem && (
        <div className="flex gap-2 mb-1.5">
          <span className="font-semibold tabular-nums">{q.number}.</span>
          <span>
            {q.stem}
            {q.origin === "ai" && (
              <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-accent px-1 py-0.5 align-middle text-[10px] text-accent-foreground">
                <Sparkles className="w-2.5 h-2.5" />AI
              </span>
            )}
          </span>
        </div>
      )}
      {!q.stem && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="font-semibold tabular-nums">{q.number}.</span>
          {q.origin === "ai" && (
            <span className="inline-flex items-center gap-0.5 rounded bg-accent px-1 py-0.5 text-[10px] text-accent-foreground">
              <Sparkles className="w-2.5 h-2.5" />AI
            </span>
          )}
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 pl-1">
        {opts.map((opt, i) => {
          const L = letter(i);
          const isChosen = chosen === L;
          const isCorrect = submitted && q.correct === L;
          const isWrongPick = submitted && isChosen && q.correct !== L;
          return (
            <button
              key={i}
              type="button"
              disabled={submitted}
              onClick={() => onAnswer(q.id, L)}
              className={cn(
                "flex items-start gap-2 text-left rounded px-2 py-1 transition-colors",
                !submitted && "hover:bg-muted",
                isChosen && !submitted && "bg-accent",
                isCorrect && "bg-ok/15 ring-1 ring-ok",
                isWrongPick && "bg-bad/15 ring-1 ring-bad"
              )}
            >
              <span
                className={cn(
                  "flex-shrink-0 w-5 h-5 rounded-full border grid place-items-center text-[11px] mt-0.5",
                  isChosen ? "border-primary text-primary font-medium" : "border-muted-foreground/50",
                  isCorrect && "border-ok text-ok",
                  isWrongPick && "border-bad text-bad"
                )}
              >
                {L}
              </span>
              <span className="leading-snug">{opt}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ListeningBlock({
  section,
  answers,
  onAnswer,
  submitted,
}: {
  section: SectionDTO;
  answers: AnswerMap;
  onAnswer: (qid: string, val: string) => void;
  submitted: boolean;
}) {
  return (
    <div>
      {section.instruction && <p data-block-id={`sec-${section.id}-dir`} className="directions text-sm mb-3">{section.instruction}</p>}
      {section.questions.map((q) => (
        <McqQuestion key={q.id} q={q} answers={answers} onAnswer={onAnswer} submitted={submitted} />
      ))}
    </div>
  );
}

function CarefulReadingBlock({
  section,
  answers,
  onAnswer,
  submitted,
}: {
  section: SectionDTO;
  answers: AnswerMap;
  onAnswer: (qid: string, val: string) => void;
  submitted: boolean;
}) {
  return (
    <div>
      {section.title && <h3 className="text-center font-semibold mb-3">{section.title}</h3>}
      {section.passage && (
        <div data-block-id={`sec-${section.id}-passage`} className="exam-prose whitespace-pre-wrap mb-5 text-foreground/95">
          {section.passage}
        </div>
      )}
      {section.questions.map((q) => (
        <McqQuestion key={q.id} q={q} answers={answers} onAnswer={onAnswer} submitted={submitted} />
      ))}
    </div>
  );
}

/* ---------- 字母下拉（选词填空 / 信息匹配） ---------- */
function LetterPicker({
  value,
  letters,
  correct,
  submitted,
  onChange,
}: {
  value: string;
  letters: string[];
  correct?: string | null;
  submitted: boolean;
  onChange: (v: string) => void;
}) {
  const ok = submitted && correct && value === correct;
  const wrongPick = submitted && value && value !== correct;
  const showCorrect = submitted && correct && value !== correct; // 答错或未答都显示正确答案
  return (
    <>
      <select
        value={value}
        disabled={submitted}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "mx-1 inline-block min-w-[3.2rem] rounded border bg-background px-1 py-0.5 text-center font-mono text-sm align-baseline",
          !submitted && "border-primary/50",
          ok && "border-ok text-ok bg-ok/10",
          wrongPick && "border-bad text-bad bg-bad/10"
        )}
      >
        <option value="">__</option>
        {letters.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
      </select>
      {showCorrect && (
        <span className="mx-0.5 inline-flex items-center rounded bg-ok/15 px-1 font-mono text-xs text-ok align-baseline">
          ✓{correct}
        </span>
      )}
    </>
  );
}

function BankedClozeBlock({
  section,
  answers,
  onAnswer,
  submitted,
}: {
  section: SectionDTO;
  answers: AnswerMap;
  onAnswer: (qid: string, val: string) => void;
  submitted: boolean;
}) {
  const bank = section.wordBank ?? [];
  const letters = bank.map((b) => b.letter);
  const qByNum = useMemo(() => {
    const m = new Map<number, QuestionDTO>();
    section.questions.forEach((q) => q.number != null && m.set(q.number, q));
    return m;
  }, [section.questions]);

  // 把 passage 按 [26]…[35] 切开，空位渲染成下拉
  const parts = (section.passage ?? "").split(/\[(\d+)\]/);
  return (
    <div>
      {section.instruction && <p data-block-id={`sec-${section.id}-dir`} className="directions text-sm mb-3">{section.instruction}</p>}
      <div data-block-id={`sec-${section.id}-passage`} className="exam-prose whitespace-pre-wrap mb-5">
        {parts.map((part, i) => {
          if (i % 2 === 1) {
            const num = parseInt(part, 10);
            const q = qByNum.get(num);
            if (!q) return <span key={i}>[{part}]</span>;
            return (
              <span key={i} id={`q-${q.id}`} className="whitespace-nowrap scroll-mt-16">
                <sup className="text-[10px] text-muted-foreground">{num}</sup>
                <LetterPicker
                  value={answers[q.id] ?? ""}
                  letters={letters}
                  correct={q.correct}
                  submitted={submitted}
                  onChange={(v) => onAnswer(q.id, v)}
                />
              </span>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </div>
      <div className="border border-border rounded-lg p-4 bg-muted/30">
        <div className="text-xs text-muted-foreground mb-2">Word Bank</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 text-sm">
          {bank.map((b) => (
            <div key={b.letter}>
              <span className="font-mono font-medium mr-1.5">{b.letter}.</span>
              {b.word}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MatchingBlock({
  section,
  answers,
  onAnswer,
  submitted,
}: {
  section: SectionDTO;
  answers: AnswerMap;
  onAnswer: (qid: string, val: string) => void;
  submitted: boolean;
}) {
  const paras = section.paragraphs ?? [];
  const letters = paras.map((p) => p.letter);
  return (
    <div>
      {section.instruction && <p data-block-id={`sec-${section.id}-dir`} className="directions text-sm mb-3">{section.instruction}</p>}
      {section.title && <h3 className="text-center font-semibold mb-3">{section.title}</h3>}

      <div className="space-y-2 mb-5">
        {section.questions.map((q) => (
          <div id={`q-${q.id}`} key={q.id} className="flex items-start gap-2 scroll-mt-16">
            <span className="tabular-nums font-semibold mt-0.5">{q.number}.</span>
            <LetterPicker
              value={answers[q.id] ?? ""}
              letters={letters}
              correct={q.correct}
              submitted={submitted}
              onChange={(v) => onAnswer(q.id, v)}
            />
            <span className="flex-1">{q.stem}</span>
          </div>
        ))}
      </div>

      <div className="exam-prose space-y-3">
        {paras.map((p) => (
          <p key={p.letter} data-block-id={`sec-${section.id}-para-${p.letter}`}>
            <span className="font-semibold mr-1">{p.letter})</span>
            {p.text}
          </p>
        ))}
      </div>
    </div>
  );
}

/* ---------- 写作 / 翻译（自由文本，M0 仅采集，M1 接 AI 批改） ---------- */
function FreeTextBlock({
  section,
  answers,
  onAnswer,
  submitted,
  kind,
  subj,
}: {
  section: SectionDTO;
  answers: AnswerMap;
  onAnswer: (qid: string, val: string) => void;
  submitted: boolean;
  kind: "writing" | "translation";
  subj?: SubjProps;
}) {
  const q = section.questions[0];
  const fb = q && subj ? subj.feedback[q.id] : undefined;
  const grading = q && subj ? subj.gradingQid === q.id : false;
  return (
    <div>
      {section.instruction && <p data-block-id={`sec-${section.id}-dir`} className="directions text-sm mb-2">{section.instruction}</p>}
      {section.passage && (
        <div data-block-id={`sec-${section.id}-passage`} className="exam-prose mb-4">
          {section.passage}
        </div>
      )}
      {q && (
        <textarea
          value={answers[q.id] ?? ""}
          onChange={(e) => onAnswer(q.id, e.target.value)}
          disabled={submitted}
          placeholder={kind === "writing" ? "在此作答（建议 120–180 词）…" : "在此输入译文…"}
          className="w-full min-h-[180px] rounded-lg border border-border bg-background p-3 text-sm leading-relaxed focus:outline-none focus:border-primary font-serif"
        />
      )}

      {submitted && q && (
        <div className="mt-3">
          {fb ? (
            <SubjectiveFeedback fb={fb.feedback} kind={kind} />
          ) : grading ? (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> AI 批改中…
            </div>
          ) : answers[q.id]?.trim() ? (
            <button
              onClick={() => subj?.onGrade(q.id)}
              className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <Sparkles className="w-3.5 h-3.5" /> 批改失败，点击重试
            </button>
          ) : (
            <div className="text-sm text-muted-foreground">未作答，不计分</div>
          )}
        </div>
      )}

      {submitted && q?.referenceText && (
        <div className="mt-3 border border-ok/40 rounded-lg p-3 bg-ok/5">
          <div className="text-xs text-ok mb-1">参考{kind === "writing" ? "范文" : "译文"}</div>
          <div className="exam-prose text-sm whitespace-pre-wrap">{q.referenceText}</div>
        </div>
      )}
    </div>
  );
}

function SubjectiveFeedback({
  fb,
  kind,
}: {
  fb: SubjFeedback;
  kind: "writing" | "translation";
}) {
  return (
    <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="font-medium">AI 批改</span>
        {fb.scoreText && (
          <span className="ml-auto text-sm font-semibold text-primary">{fb.scoreText}</span>
        )}
      </div>
      {fb.dimensions?.length > 0 && (
        <table className="w-full text-xs">
          <tbody>
            {fb.dimensions.map((d, i) => (
              <tr key={i} className="border-t border-border/50 align-top">
                <td className="py-1 pr-2 whitespace-nowrap text-muted-foreground">{d.name}</td>
                <td className="py-1 pr-2 whitespace-nowrap font-medium">{d.score}</td>
                <td className="py-1">{d.comment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {fb.problems?.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-1">主要问题</div>
          <ul className="list-disc pl-5 text-sm space-y-0.5">
            {fb.problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}
      {fb.improved && (
        <div>
          <div className="text-xs font-medium mb-1">高分{kind === "writing" ? "改写版" : "译文"}</div>
          <div className="exam-prose text-sm whitespace-pre-wrap rounded bg-card p-2 border border-border">
            {fb.improved}
          </div>
        </div>
      )}
      {fb.expressions?.length > 0 && (
        <div>
          <div className="text-xs font-medium mb-1">可复用表达</div>
          <div className="flex flex-wrap gap-1.5">
            {fb.expressions.map((e, i) => (
              <span key={i} className="text-xs rounded bg-muted px-1.5 py-0.5">
                {e}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
