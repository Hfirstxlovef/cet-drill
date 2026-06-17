import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { SECTION_LABEL, type SectionKind } from "@/lib/cet/types";
import {
  generateCareful,
  generateBanked,
  generateMatching,
  generateEssay,
  generateTranslation,
  type Difficulty,
} from "@/lib/prompts/cet/generate";

export const runtime = "nodejs";
export const maxDuration = 300;

// 可由 AI 生成的题型（不含听力——需 TTS）
const GENERATABLE: SectionKind[] = ["careful_reading", "banked_cloze", "matching", "writing", "translation"];

type Origin = "ai" | "real";
interface BuiltQ {
  type: "mcq" | "banked" | "matching" | "essay" | "translation";
  stem?: string | null;
  options?: string[] | null;
  correct?: string | null;
  referenceText?: string | null;
  knowledgeTag?: string | null;
  points: number;
  origin: Origin;
  localBlank?: number; // banked：原始空位序（用于重排 passage 的 [n] 与全局题号对齐）
}
interface Built {
  kind: SectionKind;
  title?: string | null;
  instruction?: string | null;
  passage?: string | null;
  wordBank?: { letter: string; word: string }[] | null;
  paragraphs?: { letter: string; text: string }[] | null;
  questions: BuiltQ[];
}

// ── 由生成器产物构造「待写入 section」 ──
async function buildAi(kind: SectionKind, difficulty: Difficulty, tagFocus: string[], topic?: string): Promise<Built | null> {
  try {
    if (kind === "careful_reading") {
      const r = await generateCareful({ difficulty, tagFocus, topic });
      return {
        kind,
        title: r.title,
        passage: r.passage,
        questions: (r.questions ?? []).map((q) => ({ type: "mcq", stem: q.stem, options: q.options, correct: q.correct, knowledgeTag: q.knowledgeTag, points: 2, origin: "ai" })),
      };
    }
    if (kind === "banked_cloze") {
      const r = await generateBanked({ difficulty, topic });
      return {
        kind,
        instruction: r.instruction,
        passage: r.passage,
        wordBank: r.wordBank,
        questions: Object.entries(r.answers ?? {}).map(([n, letter]) => ({ type: "banked", correct: letter, knowledgeTag: "选词填空", points: 1, origin: "ai", localBlank: Number(n) })),
      };
    }
    if (kind === "matching") {
      const r = await generateMatching({ difficulty, topic });
      return {
        kind,
        title: r.title,
        instruction: r.instruction,
        paragraphs: r.paragraphs,
        questions: (r.statements ?? []).map((s) => ({ type: "matching", stem: s.stem, correct: s.correct, knowledgeTag: "信息匹配", points: 1, origin: "ai" })),
      };
    }
    if (kind === "writing") {
      const r = await generateEssay({ difficulty, topic });
      return { kind, instruction: r.instruction, passage: r.prompt, questions: [{ type: "essay", referenceText: r.referenceText, knowledgeTag: "写作", points: 15, origin: "ai" }] };
    }
    if (kind === "translation") {
      const r = await generateTranslation({ difficulty, topic });
      return { kind, instruction: r.instruction, passage: r.passage, questions: [{ type: "translation", referenceText: r.referenceText, knowledgeTag: "翻译", points: 15, origin: "ai" }] };
    }
  } catch {
    return null; // 单题型生成失败 → 跳过，不中断整卷
  }
  return null;
}

// ── 取一份真题同型 section 复制进来（mixReal 穿插用） ──
async function buildReal(kind: SectionKind): Promise<Built | null> {
  const secs = await prisma.section.findMany({
    where: { kind, paper: { source: "real", status: "ready" }, questions: { some: {} } },
    include: { questions: true },
    take: 60,
  });
  if (!secs.length) return null;
  const s = secs[Math.floor(Math.random() * secs.length)];
  return {
    kind,
    title: s.title,
    instruction: s.instruction,
    passage: s.passage,
    wordBank: s.wordBankJson ? JSON.parse(s.wordBankJson) : null,
    paragraphs: s.paragraphsJson ? JSON.parse(s.paragraphsJson) : null,
    questions: s.questions
      .slice()
      .sort((a, b) => (a.number ?? 0) - (b.number ?? 0))
      .map((q) => ({
        type: q.type as BuiltQ["type"],
        stem: q.stem,
        options: q.optionsJson ? JSON.parse(q.optionsJson) : null,
        correct: q.correct,
        referenceText: q.referenceText,
        knowledgeTag: q.knowledgeTag,
        points: q.points,
        origin: "real" as Origin,
        localBlank: q.type === "banked" ? q.number ?? undefined : undefined,
      })),
  };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const driver: "weakness" | "type" = body.driver === "weakness" ? "weakness" : "type";
  const difficulty: Difficulty = ["easy", "medium", "hard"].includes(body.difficulty) ? body.difficulty : "medium";
  const mixReal: boolean = !!body.mixReal;
  const topic: string | undefined = body.topic || undefined;

  let kinds: SectionKind[] = [];
  let tagFocus: string[] = [];
  let titleHint = "";

  if (driver === "weakness") {
    if (!body.baseAttemptId) return NextResponse.json({ error: "缺少 baseAttemptId" }, { status: 400 });
    const attempt = await prisma.attempt.findUnique({ where: { id: body.baseAttemptId } });
    if (!attempt?.reportJson) return NextResponse.json({ error: "该练习还没有可用的报告（先交卷）" }, { status: 400 });
    const breakdown = JSON.parse(attempt.reportJson).breakdown;
    const weakSecs = (breakdown.bySection ?? [])
      .filter((s: any) => s.total > 0)
      .sort((a: any, b: any) => a.correct / a.total - b.correct / b.total)
      .map((s: any) => s.kind as SectionKind)
      .filter((k: SectionKind) => GENERATABLE.includes(k));
    kinds = weakSecs.slice(0, 2);
    if (!kinds.length) kinds = ["careful_reading"];
    tagFocus = (breakdown.byTag ?? [])
      .filter((t: any) => t.total > 0 && t.correct / t.total < 0.6)
      .slice(0, 4)
      .map((t: any) => t.tag);
    titleHint = "弱项强化";
  } else {
    const req = (Array.isArray(body.types) ? body.types : []).filter((k: SectionKind) => GENERATABLE.includes(k));
    kinds = req.length ? req : ["careful_reading"];
    titleHint = kinds.map((k) => SECTION_LABEL[k]).join("+");
  }

  const carefulCount = Math.min(Math.max(Number(body.count) || 1, 1), 3); // 仔细阅读篇数 1–3

  // 生成 / 取真题，组装 built sections（穿插：每个 kind 先 AI 后真题）
  const built: Built[] = [];
  for (const kind of kinds) {
    const times = kind === "careful_reading" ? carefulCount : 1;
    for (let i = 0; i < times; i++) {
      const ai = await buildAi(kind, difficulty, tagFocus, topic);
      if (ai && ai.questions.length) built.push(ai);
      if (mixReal) {
        const real = await buildReal(kind);
        if (real && real.questions.length) built.push(real);
      }
    }
  }
  if (!built.length) return NextResponse.json({ error: "AI 生成失败，请重试或换题型" }, { status: 502 });

  // 写库：新建 ai 卷 + sections + questions + attempt
  const mmdd = `${String(new Date().getMonth() + 1).padStart(2, "0")}${String(new Date().getDate()).padStart(2, "0")}`;
  const paper = await prisma.paper.create({
    data: { level: "CET4", source: "ai", status: "ready", title: `AI 练习 · ${titleHint} · ${mmdd}` },
  });

  let order = 0;
  let num = 1;
  for (const b of built) {
    let passage = b.passage ?? null;
    // banked：把 passage 的 [n] 重排成全局题号，并按空位序给题号
    let bankedQs = b.questions;
    if (b.kind === "banked_cloze") {
      bankedQs = b.questions.slice().sort((a, z) => (a.localBlank ?? 0) - (z.localBlank ?? 0));
      const base = bankedQs.length ? bankedQs[0].localBlank ?? 1 : 1;
      const start = num;
      if (passage) passage = passage.replace(/\[(\d+)\]/g, (_, d) => `[${start + (Number(d) - base)}]`);
    }
    const section = await prisma.section.create({
      data: {
        paperId: paper.id,
        order: order++,
        kind: b.kind,
        title: b.title ?? null,
        instruction: b.instruction ?? null,
        passage,
        wordBankJson: b.wordBank ? JSON.stringify(b.wordBank) : null,
        paragraphsJson: b.paragraphs ? JSON.stringify(b.paragraphs) : null,
      },
    });
    const qs = b.kind === "banked_cloze" ? bankedQs : b.questions;
    for (const q of qs) {
      const objective = q.type === "mcq" || q.type === "banked" || q.type === "matching";
      const number = objective ? num++ : null;
      await prisma.question.create({
        data: {
          sectionId: section.id,
          number,
          type: q.type,
          stem: q.stem ?? null,
          optionsJson: q.options ? JSON.stringify(q.options) : null,
          correct: q.correct ?? null,
          referenceText: q.referenceText ?? null,
          knowledgeTag: q.knowledgeTag ?? null,
          points: q.points,
          blankIndex: q.type === "banked" && number ? number - 1 : null,
          origin: q.origin,
        },
      });
    }
  }

  const attempt = await prisma.attempt.create({ data: { paperId: paper.id, mode: "drill" } });
  return NextResponse.json({ attemptId: attempt.id, paperId: paper.id });
}
