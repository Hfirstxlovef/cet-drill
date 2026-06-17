import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toPaperDTO } from "@/lib/cet/serialize";

export const dynamic = "force-dynamic";

export async function GET(
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
  const submitted = !!attempt.submittedAt;
  return NextResponse.json({
    id: attempt.id,
    paperId: attempt.paperId,
    mode: attempt.mode,
    submittedAt: attempt.submittedAt,
    totalScore: attempt.totalScore,
    report: attempt.reportJson ? JSON.parse(attempt.reportJson) : null,
    // 交卷后才下发答案/解析
    paper: toPaperDTO(attempt.paper, { includeAnswers: submitted }),
    items: attempt.items.map((i) => ({
      questionId: i.questionId,
      userAnswer: i.userAnswer,
      isCorrect: i.isCorrect,
      aiFeedback: i.aiFeedbackJson ? JSON.parse(i.aiFeedbackJson) : null,
    })),
  });
}
