import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chatJson } from "@/lib/zenmux";
import { buildGradeMessages, type SubjFeedback, type SubjKind } from "@/lib/prompts/cet/grade";
import {
  SECTION_LABEL,
  SECTION_WEIGHT,
  MACRO_OF,
  SUBJ_FULL_BAND,
  CET_TOTAL,
  CET_PASS,
  type SectionKind,
  type MacroSection,
} from "@/lib/cet/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const OBJECTIVE = ["mcq", "banked", "matching"];
const r1 = (n: number) => Math.round(n * 10) / 10;

type SubjStatus = "graded" | "blank" | "error";

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const attempt = await prisma.attempt.findUnique({
    where: { id: params.id },
    include: {
      paper: { include: { sections: { include: { questions: true } } } },
      items: true,
    },
  });
  if (!attempt) {
    return NextResponse.json({ error: "attempt not found" }, { status: 404 });
  }

  const answerOf = new Map(attempt.items.map((i) => [i.questionId, i.userAnswer]));

  const bySection: Record<string, { label: string; correct: number; total: number; scaled: number }> = {};
  const byTag: Record<string, { correct: number; total: number }> = {};
  const macro: Record<MacroSection, number> = { listening: 0, reading: 0, writing: 0, translation: 0 };

  // ---- 客观题：按 710 权重算分 ----
  for (const section of attempt.paper.sections) {
    const skey = section.kind as SectionKind;
    const weight = SECTION_WEIGHT[skey] ?? 1;
    const macroKey = MACRO_OF[skey];
    for (const q of section.questions) {
      if (!OBJECTIVE.includes(q.type)) continue;
      const ua = (answerOf.get(q.id) ?? "").trim().toUpperCase();
      const correct = (q.correct ?? "").trim().toUpperCase();
      const isCorrect = !!ua && !!correct && ua === correct;

      bySection[skey] ??= { label: SECTION_LABEL[skey] ?? skey, correct: 0, total: 0, scaled: 0 };
      bySection[skey].total++;
      if (isCorrect) {
        bySection[skey].correct++;
        bySection[skey].scaled += weight;
        if (macroKey) macro[macroKey] += weight;
      }

      // byTag 仅供 /drill 弱项出题定位，不再在报告中展示
      const tag = q.knowledgeTag || "未分类";
      byTag[tag] ??= { correct: 0, total: 0 };
      byTag[tag].total++;
      if (isCorrect) byTag[tag].correct++;

      // 落库 isCorrect（未作答的也建条目，便于报告统计）
      await prisma.attemptItem.upsert({
        where: { attemptId_questionId: { attemptId: attempt.id, questionId: q.id } },
        update: { isCorrect },
        create: { attemptId: attempt.id, questionId: q.id, userAnswer: ua || null, isCorrect },
      });
    }
  }

  // ---- 主观题（写作/翻译）：交卷即并行 AI 批改，并入总分 ----
  const subjSections = attempt.paper.sections.filter(
    (s) => s.kind === "writing" || s.kind === "translation"
  );
  const subjective = await Promise.all(
    subjSections.map(async (section) => {
      const skey = section.kind as SectionKind;
      const label = SECTION_LABEL[skey] ?? skey;
      const macroKey = MACRO_OF[skey];
      const weight = SECTION_WEIGHT[skey] ?? 7.1;
      const q = section.questions[0];
      const base = { kind: skey, label, band: 0, scaled: 0 };
      if (!q) return { ...base, status: "blank" as SubjStatus };

      const userAnswer = (answerOf.get(q.id) ?? "").trim();
      if (!userAnswer) return { ...base, status: "blank" as SubjStatus };

      // 交卷即批改：失败重试一次，仍失败则标 error（不阻断交卷）
      const messages = buildGradeMessages(q.type as SubjKind, {
        prompt: section.passage ?? section.instruction ?? "",
        reference: q.referenceText,
        userAnswer,
      });
      let feedback: SubjFeedback | null = null;
      for (let i = 0; i < 2 && !feedback; i++) {
        try {
          feedback = await chatJson<SubjFeedback>({ messages, temperature: 0.5, maxTokens: 3000 });
        } catch {
          /* 重试 */
        }
      }
      if (!feedback) return { ...base, status: "error" as SubjStatus };

      const band = Math.max(0, Math.min(SUBJ_FULL_BAND, Number(feedback.band) || 0));
      const scaled = r1(band * weight);
      await prisma.attemptItem.upsert({
        where: { attemptId_questionId: { attemptId: attempt.id, questionId: q.id } },
        update: { aiFeedbackJson: JSON.stringify({ kind: q.type, feedback }) },
        create: {
          attemptId: attempt.id,
          questionId: q.id,
          userAnswer,
          aiFeedbackJson: JSON.stringify({ kind: q.type, feedback }),
        },
      });
      if (macroKey) macro[macroKey] += scaled;
      return { kind: skey, label, band, scaled, status: "graded" as SubjStatus };
    })
  );

  const scaled = {
    listening: r1(macro.listening),
    reading: r1(macro.reading),
    writing: r1(macro.writing),
    translation: r1(macro.translation),
    total: r1(Math.min(CET_TOTAL, macro.listening + macro.reading + macro.writing + macro.translation)),
    pass: CET_PASS,
  };

  const breakdown = {
    scaled,
    bySection: Object.entries(bySection)
      .map(([kind, v]) => ({ kind, ...v, scaled: r1(v.scaled) }))
      .sort((a, b) => a.correct / a.total - b.correct / b.total),
    subjective,
    byTag: Object.entries(byTag)
      .map(([tag, v]) => ({ tag, ...v }))
      .sort((a, b) => a.correct / a.total - b.correct / b.total),
  };

  await prisma.attempt.update({
    where: { id: attempt.id },
    data: {
      submittedAt: new Date(),
      totalScore: scaled.total,
      reportJson: JSON.stringify({ breakdown }),
    },
  });

  return NextResponse.json(breakdown);
}
