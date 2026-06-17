import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const source = new URL(req.url).searchParams.get("source"); // real | ai | null(全部)
  const papers = await prisma.paper.findMany({
    where: source ? { source } : {},
    orderBy: [{ year: "desc" }, { month: "desc" }, { setNo: "asc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { sections: true } },
      sections: { select: { _count: { select: { questions: true } } } },
      attempts: {
        where: { submittedAt: { not: null } },
        orderBy: { submittedAt: "desc" },
        select: { id: true, submittedAt: true, totalScore: true },
      },
    },
  });
  const items = papers.map((p) => ({
    id: p.id,
    title: p.title,
    level: p.level,
    source: p.source,
    status: p.status,
    year: p.year,
    month: p.month,
    setNo: p.setNo,
    sectionCount: p._count.sections,
    questionCount: p.sections.reduce((n, s) => n + s._count.questions, 0),
    createdAt: p.createdAt,
    attempts: p.attempts.map((a) => ({
      id: a.id,
      submittedAt: a.submittedAt,
      totalScore: a.totalScore,
    })),
  }));
  return NextResponse.json({ items });
}
