import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { chatJson } from "@/lib/zenmux";
import { buildDefineMessages } from "@/lib/prompts/cet/define";

export const runtime = "nodejs";

export interface DictEntry {
  pos: string;
  meaning: string;
}

export async function POST(req: NextRequest) {
  const { word, context } = await req.json();
  const key = String(word ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z'-]/g, "");
  if (!key) {
    return NextResponse.json({ error: "word required" }, { status: 400 });
  }

  // 命中缓存
  const cached = await prisma.dict.findUnique({ where: { word: key } });
  if (cached) {
    return NextResponse.json({
      word: key,
      phonetic: cached.phonetic,
      entries: JSON.parse(cached.entriesJson) as DictEntry[],
    });
  }

  try {
    const res = await chatJson<{ phonetic?: string; entries?: DictEntry[] }>({
      messages: buildDefineMessages(key, typeof context === "string" ? context : undefined),
      temperature: 0.2,
      maxTokens: 600,
    });
    const entries = (res.entries ?? []).filter((e) => e && e.meaning);
    const phonetic = res.phonetic ?? "";
    if (entries.length === 0) {
      return NextResponse.json({ error: "无释义" }, { status: 502 });
    }
    await prisma.dict.create({
      data: { word: key, phonetic, entriesJson: JSON.stringify(entries) },
    });
    return NextResponse.json({ word: key, phonetic, entries });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}
