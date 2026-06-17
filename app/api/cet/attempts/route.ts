import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const attempts = await prisma.attempt.findMany({
    orderBy: { startedAt: "desc" },
    include: { paper: { select: { title: true } } },
  });
  return NextResponse.json({
    items: attempts.map((a) => ({
      id: a.id,
      paperId: a.paperId,
      paperTitle: a.paper.title,
      mode: a.mode,
      startedAt: a.startedAt,
      submittedAt: a.submittedAt,
      totalScore: a.totalScore,
    })),
  });
}

export async function POST(req: NextRequest) {
  const { paperId, mode } = await req.json();
  if (!paperId) {
    return NextResponse.json({ error: "paperId required" }, { status: 400 });
  }
  const paper = await prisma.paper.findUnique({ where: { id: paperId } });
  if (!paper) {
    return NextResponse.json({ error: "paper not found" }, { status: 404 });
  }
  const attempt = await prisma.attempt.create({
    data: { paperId, mode: mode ?? "full" },
  });
  return NextResponse.json({ id: attempt.id });
}
