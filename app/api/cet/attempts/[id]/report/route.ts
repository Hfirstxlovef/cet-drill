import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chatJson } from "@/lib/zenmux";
import { buildReportMessages } from "@/lib/prompts/cet/skill";
import { SECTION_LABEL, type SectionKind } from "@/lib/cet/types";

export const runtime = "nodejs";
export const maxDuration = 120;

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
  if (!attempt.submittedAt) {
    return NextResponse.json({ error: "尚未交卷" }, { status: 400 });
  }

  const correctMap = new Map(attempt.items.map((i) => [i.questionId, i.isCorrect]));
  const stored = attempt.reportJson ? JSON.parse(attempt.reportJson) : {};
  const breakdown = stored.breakdown ?? { bySection: [] };

  const missed: {
    number: number | null;
    tag: string | null;
    section: string;
    stem?: string | null;
  }[] = [];
  for (const s of attempt.paper.sections) {
    for (const q of s.questions) {
      if (!["mcq", "banked", "matching"].includes(q.type)) continue;
      if (correctMap.get(q.id) === false) {
        missed.push({
          number: q.number,
          tag: q.knowledgeTag,
          section: SECTION_LABEL[s.kind as SectionKind] ?? s.kind,
          stem: q.stem,
        });
      }
    }
  }

  const ai = await chatJson<{
    ability: string;
    weakness: string;
    recommendations: string[];
  }>({
    messages: buildReportMessages({
      paperTitle: attempt.paper.title,
      scaled: breakdown.scaled,
      bySection: breakdown.bySection ?? [],
      subjective: breakdown.subjective ?? [],
      missed,
    }),
    temperature: 0.6,
    maxTokens: 2500,
  });

  await prisma.attempt.update({
    where: { id: attempt.id },
    data: { reportJson: JSON.stringify({ ...stored, ai }) },
  });

  return NextResponse.json(ai);
}
