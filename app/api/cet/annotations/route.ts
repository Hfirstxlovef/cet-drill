import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const paperId = searchParams.get("paperId");
  if (!paperId) return NextResponse.json({ error: "paperId required" }, { status: 400 });
  const items = await prisma.annotation.findMany({
    where: { paperId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({
    items: items.map((a) => ({
      id: a.id,
      kind: a.kind,
      color: a.color,
      note: a.note,
      target: JSON.parse(a.targetJson),
    })),
  });
}

export async function POST(req: NextRequest) {
  const { paperId, kind, color, target, note } = await req.json();
  if (!paperId || !kind || !target) {
    return NextResponse.json({ error: "paperId, kind, target required" }, { status: 400 });
  }
  const a = await prisma.annotation.create({
    data: {
      paperId,
      kind,
      color: color ?? null,
      note: note ?? null,
      targetJson: JSON.stringify(target),
    },
  });
  return NextResponse.json({
    id: a.id,
    kind: a.kind,
    color: a.color,
    note: a.note,
    target,
  });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.annotation.delete({ where: { id } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
