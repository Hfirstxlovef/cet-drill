import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await prisma.vocabMark.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const { word, context, definition, paperId } = await req.json();
  const w = String(word ?? "").trim();
  if (!w) return NextResponse.json({ error: "word required" }, { status: 400 });

  // 去重：同一个词已收藏则更新释义/语境
  const existing = await prisma.vocabMark.findFirst({ where: { word: w } });
  if (existing) {
    const updated = await prisma.vocabMark.update({
      where: { id: existing.id },
      data: { context: context ?? existing.context, definition: definition ?? existing.definition },
    });
    return NextResponse.json({ item: updated, created: false });
  }
  const item = await prisma.vocabMark.create({
    data: { word: w, context: context ?? null, definition: definition ?? null, paperId: paperId ?? null },
  });
  return NextResponse.json({ item, created: true });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.vocabMark.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
