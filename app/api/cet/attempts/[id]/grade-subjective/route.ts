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
  type SectionKind,
} from "@/lib/cet/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const r1 = (n: number) => Math.round(n * 10) / 10;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { questionId } = await req.json();
  if (!questionId) {
    return NextResponse.json({ error: "questionId required" }, { status: 400 });
  }
  const q = await prisma.question.findUnique({
    where: { id: questionId },
    include: { section: true },
  });
  if (!q || (q.type !== "essay" && q.type !== "translation")) {
    return NextResponse.json({ error: "非主观题" }, { status: 400 });
  }
  const item = await prisma.attemptItem.findUnique({
    where: { attemptId_questionId: { attemptId: params.id, questionId } },
  });
  const userAnswer = (item?.userAnswer ?? "").trim();
  if (!userAnswer) {
    return NextResponse.json({ error: "尚未作答，无法批改" }, { status: 400 });
  }

  const kind = q.type as SubjKind;
  const skey = q.section.kind as SectionKind; // writing | translation
  try {
    const feedback = await chatJson<SubjFeedback>({
      messages: buildGradeMessages(kind, {
        prompt: q.section.passage ?? q.section.instruction ?? "",
        reference: q.referenceText,
        userAnswer,
      }),
      temperature: 0.5,
      maxTokens: 3000,
    });
    await prisma.attemptItem.update({
      where: { attemptId_questionId: { attemptId: params.id, questionId } },
      data: { aiFeedbackJson: JSON.stringify({ kind, feedback }) },
    });

    // 把这次批改并回成绩报告（总分 + 该宏观板块得分），让事后/重试批改也计分
    const band = Math.max(0, Math.min(SUBJ_FULL_BAND, Number(feedback.band) || 0));
    const scaled = r1(band * (SECTION_WEIGHT[skey] ?? 7.1));
    let breakdown: any = undefined;
    const attempt = await prisma.attempt.findUnique({ where: { id: params.id } });
    const stored = attempt?.reportJson ? JSON.parse(attempt.reportJson) : null;
    if (stored?.breakdown?.scaled) {
      breakdown = stored.breakdown;
      const macroKey = MACRO_OF[skey]; // writing | translation
      breakdown.scaled[macroKey] = scaled;
      breakdown.scaled.total = r1(
        Math.min(
          CET_TOTAL,
          breakdown.scaled.listening + breakdown.scaled.reading +
            breakdown.scaled.writing + breakdown.scaled.translation
        )
      );
      const label = SECTION_LABEL[skey] ?? skey;
      const entry = (breakdown.subjective ??= []).find((s: any) => s.kind === skey);
      if (entry) Object.assign(entry, { band, scaled, status: "graded" });
      else breakdown.subjective.push({ kind: skey, label, band, scaled, status: "graded" });
      await prisma.attempt.update({
        where: { id: params.id },
        data: { totalScore: breakdown.scaled.total, reportJson: JSON.stringify({ ...stored, breakdown }) },
      });
    }

    return NextResponse.json({ kind, feedback, breakdown });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
