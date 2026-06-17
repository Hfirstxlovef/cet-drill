import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if ("correct" in body) data.correct = body.correct;
  if ("knowledgeTag" in body) data.knowledgeTag = body.knowledgeTag;
  if ("referenceText" in body) data.referenceText = body.referenceText;
  const q = await prisma.question.update({ where: { id: params.id }, data });
  return NextResponse.json({ id: q.id });
}
