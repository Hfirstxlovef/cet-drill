import { prisma } from "../../lib/db";
import { extractPdfText, cleanText, sliceParts, sliceSections } from "./extract";
import {
  structureBankedCloze,
  structureMatching,
  structureCarefulReading,
  structureListening,
  structureWriting,
  structureTranslation,
  parseAnswerKey,
  type AnswerKeyResult,
} from "./structure";
import { linkPaperAudio } from "./audio";
import type { PaperSource } from "./discover";

export interface IngestResult {
  label: string; // 2022.06 set1
  status: "ok" | "skipped" | "failed";
  reason?: string;
  paperId?: string;
  qCount?: number;
  noAns?: number;
  paperStatus?: string; // ready | review
}

const MIN_PAPER_CHARS = 1500; // 低于此判定无文字层（扫描件）
const MIN_ANSWER_CHARS = 300;

const pad = (n: number) => String(n).padStart(2, "0");
const emptyKey = (): AnswerKeyResult => ({ answers: {}, tags: {}, writingSample: null, translationSample: null });

function ans(key: AnswerKeyResult, n: number) {
  return { correct: key.answers?.[String(n)] ?? null, tag: key.tags?.[String(n)] ?? null };
}

async function safe<T>(name: string, fn: () => Promise<T> | T): Promise<T | null> {
  try {
    return await fn();
  } catch (e: any) {
    console.log(`     · ${name} 结构化失败：${e?.message ?? e}`);
    return null;
  }
}

// 合卷（真题+答案一文件）：在首个答案标记处切成 [试卷, 答案]
function splitCombined(text: string): [string, string] {
  const m = text.match(/参考答案|答案速查|答案与?解析|答案详解|听力(原文|材料)|【\s*答案/);
  if (m && m.index != null && m.index > 1000) return [text.slice(0, m.index), text.slice(m.index)];
  return [text, ""];
}

// N 套合一文件：以「Part I … Writing」为每套起点切分
function splitMultiSet(text: string): { setNo: number; text: string }[] {
  const re = /Part\s+I\b[\s\S]{0,80}?Writing/g;
  const idxs: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) idxs.push(m.index);
  if (idxs.length < 2) return [{ setNo: 1, text }];
  return idxs.slice(0, 3).map((idx, i) => ({ setNo: i + 1, text: text.slice(idx, idxs[i + 1]) }));
}

// 多套合一答案：按「第N套」标记切分（尽力而为，切不动则全归 set1）
function splitMultiSetAnswers(text: string): { setNo: number; text: string }[] {
  if (!text) return [];
  const re = /第\s*([1-3一二三])\s*套/g;
  const map: Record<string, number> = { 一: 1, 二: 2, 三: 3, "1": 1, "2": 2, "3": 3 };
  const marks: { setNo: number; idx: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) marks.push({ setNo: map[m[1]], idx: m.index });
  if (marks.length < 2) return [{ setNo: 1, text }];
  const out: { setNo: number; text: string }[] = [];
  for (let i = 0; i < marks.length; i++) {
    if (out.some((o) => o.setNo === marks[i].setNo)) continue;
    out.push({ setNo: marks[i].setNo, text: text.slice(marks[i].idx, marks[i + 1]?.idx) });
  }
  return out;
}

function mkTitle(year: number, month: number, setNo: number) {
  return `${year}年${month}月 英语四级真题（第${setNo}套）`;
}

// 删除某槽（年/月/套）已有的真题卷及其练习记录
async function deleteSlot(year: number, month: number, setNo: number) {
  const olds = await prisma.paper.findMany({ where: { year, month, setNo, source: "real" }, select: { id: true } });
  for (const o of olds) await prisma.attempt.deleteMany({ where: { paperId: o.id } });
  await prisma.paper.deleteMany({ where: { id: { in: olds.map((o) => o.id) } } });
}

// 把已抽好的单套文本结构化并写库
async function writeOne(
  year: number,
  month: number,
  setNo: number,
  paperText: string,
  answerText: string,
  mp3: string | null,
  label: string
): Promise<IngestResult> {
  // 幂等：已 ready 则跳过（支持中断续跑，且保护 2022.06 已有练习/音频）
  const existing = await prisma.paper.findFirst({
    where: { year, month, setNo, source: "real" },
  });
  if (existing?.status === "ready") return { label, status: "skipped", reason: "已入库(ready)" };

  const parts = sliceParts(paperText);
  // 文字层损坏（字符碎裂/无空格，pdftotext 切不出小节）→ 跳过并清理同槽垃圾，省下模型调用。
  // 仅以「阅读 Part III」为判据：损坏卷 III=0；残卷（缺听力但阅读完好）仍应入库。
  if ((parts.III?.length ?? 0) < 400) {
    await deleteSlot(year, month, setNo);
    return { label, status: "skipped", reason: `文字层损坏/结构不可识别(阅读${parts.III?.length ?? 0}字)·需OCR` };
  }
  const read = sliceSections(parts.III ?? "");
  const listen = sliceSections(parts.II ?? "");

  const key = answerText ? (await safe("答案key", () => parseAnswerKey(answerText))) ?? emptyKey() : emptyKey();

  const [writing, listenA, listenB, listenC, banked, matching, careful, translation] = [
    await safe("写作", () => structureWriting(parts.I ?? "")),
    await safe("听力A", () => structureListening(listen.A ?? "")),
    await safe("听力B", () => structureListening(listen.B ?? "")),
    await safe("听力C", () => structureListening(listen.C ?? "")),
    await safe("选词填空", () => structureBankedCloze(read.A ?? "")),
    await safe("信息匹配", () => structureMatching(read.B ?? "")),
    await safe("仔细阅读", () => structureCarefulReading(read.C ?? "")),
    await safe("翻译", () => structureTranslation(parts.IV ?? "")),
  ];

  // 删旧（非 ready 的同 年/月/套）再插
  await deleteSlot(year, month, setNo);

  const paper = await prisma.paper.create({
    data: { level: "CET4", year, month, setNo, title: mkTitle(year, month, setNo), source: "real", status: "review" },
  });

  let order = 0;
  const mkSection = (data: any) => prisma.section.create({ data: { paperId: paper.id, order: order++, ...data } });

  if (writing) {
    const s = await mkSection({ kind: "writing", instruction: writing.instruction, passage: writing.prompt });
    await prisma.question.create({
      data: { sectionId: s.id, type: "essay", points: 15, referenceText: key.writingSample ?? null, knowledgeTag: "写作" },
    });
  }

  const listenMap: [any, string][] = [
    [listenA, "listening_news"],
    [listenB, "listening_conv"],
    [listenC, "listening_passage"],
  ];
  for (const [res, kind] of listenMap) {
    if (!res) continue;
    const s = await mkSection({ kind });
    for (const q of res.questions ?? []) {
      const { correct, tag } = ans(key, q.number);
      await prisma.question.create({
        data: { sectionId: s.id, number: q.number, type: "mcq", stem: q.stem ?? null, optionsJson: JSON.stringify(q.options ?? []), correct, knowledgeTag: tag },
      });
    }
  }

  if (banked) {
    const s = await mkSection({ kind: "banked_cloze", instruction: banked.instruction, passage: banked.passage, wordBankJson: JSON.stringify(banked.wordBank ?? []) });
    for (const n of banked.blanks ?? []) {
      const { correct } = ans(key, n);
      await prisma.question.create({ data: { sectionId: s.id, number: n, type: "banked", correct, blankIndex: n - 26, knowledgeTag: "选词填空" } });
    }
  }

  if (matching) {
    const s = await mkSection({ kind: "matching", instruction: matching.instruction, title: matching.title, paragraphsJson: JSON.stringify(matching.paragraphs ?? []) });
    for (const st of matching.statements ?? []) {
      const { correct } = ans(key, st.number);
      await prisma.question.create({ data: { sectionId: s.id, number: st.number, type: "matching", stem: st.stem, correct, knowledgeTag: "信息匹配" } });
    }
  }

  if (careful) {
    for (const p of careful.passages ?? []) {
      const s = await mkSection({ kind: "careful_reading", title: p.title ?? null, passage: p.text });
      for (const q of p.questions ?? []) {
        const { correct, tag } = ans(key, q.number);
        await prisma.question.create({
          data: { sectionId: s.id, number: q.number, type: "mcq", stem: q.stem ?? null, optionsJson: JSON.stringify(q.options ?? []), correct, points: 2, knowledgeTag: tag },
        });
      }
    }
  }

  if (translation) {
    const s = await mkSection({ kind: "translation", instruction: translation.instruction, passage: translation.passage });
    await prisma.question.create({
      data: { sectionId: s.id, type: "translation", points: 15, referenceText: key.translationSample ?? null, knowledgeTag: "翻译" },
    });
  }

  if (mp3) {
    try { await linkPaperAudio(paper.id, mp3); } catch (e: any) { console.log(`     · 音频接入失败：${e?.message ?? e}`); }
  }

  const qCount = await prisma.question.count({ where: { section: { paperId: paper.id } } });
  const objective = await prisma.question.count({ where: { section: { paperId: paper.id }, type: { in: ["mcq", "banked", "matching"] } } });
  const noAns = await prisma.question.count({
    where: { section: { paperId: paper.id }, type: { in: ["mcq", "banked", "matching"] }, correct: null },
  });
  // 答案覆盖足够 → 直接可练；否则待校对
  const paperStatus = objective > 0 && noAns <= Math.ceil(objective * 0.1) ? "ready" : "review";
  await prisma.paper.update({ where: { id: paper.id }, data: { status: paperStatus } });

  return { label, status: "ok", paperId: paper.id, qCount, noAns, paperStatus };
}

// 入库一个来源（multiSet 会展开成多套）
export async function ingestPaper(src: PaperSource): Promise<IngestResult[]> {
  const base = `${src.year}.${pad(src.month)} set${src.setNo}`;
  let paperText: string;
  try {
    paperText = cleanText(extractPdfText(src.paperPdf));
  } catch (e: any) {
    return [{ label: base, status: "failed", reason: "抽取失败:" + (e?.message ?? e) }];
  }
  if (paperText.length < MIN_PAPER_CHARS)
    return [{ label: base, status: "skipped", reason: `无文字层(${paperText.length}字)·需OCR` }];

  let answerText = "";
  if (src.combined) {
    const [p, a] = splitCombined(paperText);
    paperText = p;
    answerText = a;
  } else if (src.answerPdf) {
    try {
      const t = cleanText(extractPdfText(src.answerPdf));
      if (t.length >= MIN_ANSWER_CHARS) answerText = t;
    } catch {
      /* 答案抽取失败 → 留空，置 review */
    }
  }

  if (src.multiSet) {
    const pParts = splitMultiSet(paperText);
    const aParts = splitMultiSetAnswers(answerText);
    const out: IngestResult[] = [];
    for (const pp of pParts) {
      const at = aParts.find((a) => a.setNo === pp.setNo)?.text ?? "";
      out.push(await writeOne(src.year, src.month, pp.setNo, pp.text, at, pp.setNo === 1 ? src.mp3 : null, `${src.year}.${pad(src.month)} set${pp.setNo}`));
    }
    return out;
  }

  return [await writeOne(src.year, src.month, src.setNo, paperText, answerText, src.mp3, base)];
}
