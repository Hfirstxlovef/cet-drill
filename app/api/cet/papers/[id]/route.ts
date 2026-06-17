import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toPaperDTO } from "@/lib/cet/serialize";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { searchParams } = new URL(req.url);
  const includeAnswers = searchParams.get("answers") === "1";
  const paper = await prisma.paper.findUnique({
    where: { id: params.id },
    include: { sections: { include: { questions: true } } },
  });
  if (!paper) {
    return NextResponse.json({ error: "paper not found" }, { status: 404 });
  }
  return NextResponse.json(toPaperDTO(paper, { includeAnswers }));
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (typeof body.status === "string") data.status = body.status;
  if (typeof body.title === "string") data.title = body.title;
  const updated = await prisma.paper.update({ where: { id: params.id }, data });
  return NextResponse.json({ id: updated.id, status: updated.status });
}
