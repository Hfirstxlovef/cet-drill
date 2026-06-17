import "dotenv/config";
import path from "path";
import { existsSync, readFileSync } from "fs";
import { prisma } from "../lib/db";
import { chatJson } from "../lib/zenmux";
import { discoverPapers, listExamDirs, type PaperSource } from "./ingest/discover";
import { extractPdfText, cleanText, sliceParts, sliceSections } from "./ingest/extract";
import { parseAnswerKey } from "./ingest/structure";

// 一次性补全早先 ingest 漏掉的「仔细阅读 Section C（46–55）」。
//
// 根因：structureCarefulReading 要逐字复现两整篇文章 + 10 题 40 选项，输出超过
// parse() 写死的 maxTokens=8000 被截断 → JSON 不合法 → 两次重试都挂 → safe() 静默吞成
// null → if (careful) 整块跳过。受影响的 6 套各只入了 47 题（少 Section C 的 10 题）。
//
// 本脚本复刻入库管线到 read.C，但把 maxTokens 提到 16000，并在插库前做确定性校验
// （2 篇 / 各 5 题 / 题号 46–55 / 4 选项 / 题干与选项在原文中可查 / 答案齐全），
// 通过才写库。幂等：已存在 46 题的卷自动跳过。
//
//   npx tsx scripts/backfill-careful.ts            # 处理全部 6 套
//   npx tsx scripts/backfill-careful.ts --dry      # 只抽取+校验，不写库

const ROOT = path.join(process.cwd(), "四级真题+答案+听力（2025.6-2015.06）");
const OCR_CACHE = path.join(process.cwd(), "scripts", ".ocr-cache");
const DRY = process.argv.includes("--dry");

const TARGETS = [
  { year: 2017, month: 12, setNo: 2 },
  { year: 2018, month: 12, setNo: 2 },
  { year: 2019, month: 6, setNo: 2 },
  { year: 2019, month: 12, setNo: 2 },
  { year: 2021, month: 6, setNo: 1 },
  { year: 2025, month: 6, setNo: 2 },
];

// ── 以下三个 split 与 index.ts 内部逻辑保持一致（那边未导出，此处镜像） ──
function splitCombined(text: string): [string, string] {
  const m = text.match(/参考答案|答案速查|答案与?解析|答案详解|听力(原文|材料)|【\s*答案/);
  if (m && m.index != null && m.index > 1000) return [text.slice(0, m.index), text.slice(m.index)];
  return [text, ""];
}
function splitMultiSet(text: string): { setNo: number; text: string }[] {
  const re = /Part\s+I\b[\s\S]{0,80}?Writing/g;
  const idxs: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) idxs.push(m.index);
  if (idxs.length < 2) return [{ setNo: 1, text }];
  return idxs.slice(0, 3).map((idx, i) => ({ setNo: i + 1, text: text.slice(idx, idxs[i + 1]) }));
}
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

// 取出某套「试卷正文 + 答案正文」（复刻 ingestPaper 的抽取/切分）
function extractSetText(src: PaperSource, setNo: number): { paperText: string; answerText: string } {
  let paperText = cleanText(extractPdfText(src.paperPdf));
  let answerText = "";
  if (src.combined) {
    const [p, a] = splitCombined(paperText);
    paperText = p;
    answerText = a;
  } else if (src.answerPdf) {
    try {
      const t = cleanText(extractPdfText(src.answerPdf));
      if (t.length >= 300) answerText = t;
    } catch {
      /* 答案抽取失败 → 留空 */
    }
  }
  if (src.multiSet) {
    const pp = splitMultiSet(paperText).find((x) => x.setNo === setNo);
    const aa = splitMultiSetAnswers(answerText).find((x) => x.setNo === setNo);
    return { paperText: pp?.text ?? "", answerText: aa?.text ?? "" };
  }
  return { paperText, answerText };
}

interface McqQ { number: number; stem: string; options: string[] }
interface Passage { title: string | null; text: string; questions: McqQ[] }
interface CarefulResult { passages: Passage[] }

const PARSER_SYSTEM =
  "你是严谨的 CET-4 真题解析器。只依据给定文本提取结构化信息，绝不编造、补全、改写或翻译任何内容。" +
  "保留英文原文（含标点）。只输出符合要求的 JSON 对象，不要任何解释文字。";

// 与 structure.ts 同 prompt，但 maxTokens 提到 16000（避免双篇逐字复现被截断）
// + 多温度重试，最后再加一次「正文内双引号改单引号」的兜底（防长篇引文转义崩 JSON）。
async function structureCareful(text: string): Promise<CarefulResult> {
  const attempts: { temperature: number; sanitizeQuotes: boolean }[] = [
    { temperature: 0.1, sanitizeQuotes: false },
    { temperature: 0.3, sanitizeQuotes: false },
    { temperature: 0.2, sanitizeQuotes: true },
  ];
  let lastErr: unknown;
  for (const a of attempts) {
    try {
      return await structureOnce(text, a.temperature, a.sanitizeQuotes);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function structureOnce(text: string, temperature: number, sanitizeQuotes: boolean): Promise<CarefulResult> {
  const quoteNote = sanitizeQuotes
    ? `\n特别注意：text/stem/options 字段值内部如含英文双引号 "，一律改写成单引号 '，确保输出是合法 JSON（这一步不算改写内容）。`
    : "";
  return chatJson<CarefulResult>({
    messages: [
      { role: "system", content: PARSER_SYSTEM },
      {
        role: "user",
        content: `这是 CET-4 阅读 Section C「仔细阅读」的原文，含 2 篇文章（Passage One 题 46–50，Passage Two 题 51–55）。请提取为 JSON：
{
  "passages": [
    {
      "title": "标题或 null",
      "text": "篇章英文原文",
      "questions": [
        {"number":46,"stem":"题干英文原文","options":["选项A正文","选项B正文","选项C正文","选项D正文"]},
        … 到 50
      ]
    },
    { "title": …, "text": …, "questions": [ … 51 到 55 ] }
  ]
}
注意：options 是 4 个纯文本，去掉 "A." "B." 这类字母前缀，按 A、B、C、D 顺序排列。${quoteNote}

原文：
"""
${text}
"""`,
      },
    ],
    temperature,
    maxTokens: 16000,
  });
}

// 实词集合：小写、去非字母数字、长度 ≥4（滤掉 the/of/to 等高频虚词，降低误判）
function contentWords(s: string): string[] {
  return (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length >= 4);
}
// 候选片段的实词有多大比例出现在原文词集中（容忍 pdftotext 的 OCR 式讹误：fbr/modem/o f…）
function overlap(cand: string, srcSet: Set<string>): number {
  const ws = contentWords(cand);
  if (ws.length === 0) return 1;
  const hit = ws.filter((w) => srcSet.has(w)).length;
  return hit / ws.length;
}

// 确定性校验：结构精确 + 文本模糊比对（≥60% 实词命中原文）。返回错误列表，空 = 通过。
const MIN_OVERLAP = 0.6;
function verify(res: CarefulResult, sourceC: string): string[] {
  const errs: string[] = [];
  const srcSet = new Set(contentWords(sourceC));
  if (!res?.passages || res.passages.length !== 2) {
    errs.push(`应有 2 篇，实得 ${res?.passages?.length ?? 0}`);
    return errs;
  }
  const expectNums = [[46, 47, 48, 49, 50], [51, 52, 53, 54, 55]];
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  res.passages.forEach((p, i) => {
    if (!p.text || contentWords(p.text).length < 40) errs.push(`第${i + 1}篇正文过短/缺失`);
    else if (overlap(p.text, srcSet) < MIN_OVERLAP) errs.push(`第${i + 1}篇正文与原文重叠仅 ${pct(overlap(p.text, srcSet))}`);
    const qs = p.questions ?? [];
    if (qs.length !== 5) errs.push(`第${i + 1}篇应有 5 题，实得 ${qs.length}`);
    qs.forEach((q) => {
      if (!expectNums[i].includes(q.number)) errs.push(`题号 ${q.number} 不在预期 ${expectNums[i].join("/")}`);
      if (!q.options || q.options.length !== 4) errs.push(`题 ${q.number} 选项数=${q.options?.length ?? 0}（应 4）`);
      if (q.stem && overlap(q.stem, srcSet) < MIN_OVERLAP) errs.push(`题 ${q.number} 题干与原文重叠仅 ${pct(overlap(q.stem, srcSet))}`);
      (q.options ?? []).forEach((o, oi) => {
        if (o && overlap(o, srcSet) < MIN_OVERLAP) errs.push(`题 ${q.number} 选项${"ABCD"[oi]}与原文重叠仅 ${pct(overlap(o, srcSet))}`);
      });
    });
  });
  return errs;
}

async function main() {
  console.log(`🔧 补全仔细阅读${DRY ? "（dry-run，不写库）" : ""} · ${TARGETS.length} 套\n`);

  // 发现全部来源，建索引
  const srcIndex = new Map<string, PaperSource>();
  for (const dir of listExamDirs(ROOT)) {
    for (const s of discoverPapers(dir)) srcIndex.set(`${s.year}.${s.month}.${s.multiSet ? "multi" : s.setNo}`, s);
  }

  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const t of TARGETS) {
    const label = `${t.year}.${String(t.month).padStart(2, "0")} s${t.setNo}`;
    console.log(`\n▶ ${label}`);

    const paper = await prisma.paper.findFirst({
      where: { source: "real", year: t.year, month: t.month, setNo: t.setNo },
      include: { sections: { include: { questions: true } } },
    });
    if (!paper) {
      console.log(`   ❌ DB 中找不到该卷`);
      failed++;
      continue;
    }
    if (paper.sections.some((s) => s.questions.some((q) => q.number != null && q.number >= 46 && q.number <= 55))) {
      console.log(`   ⏭ 已存在 46–55，跳过（幂等）`);
      skipped++;
      continue;
    }

    // 找源文件（multiSet 与逐套两种索引键都试）
    const src = srcIndex.get(`${t.year}.${t.month}.${t.setNo}`) ?? srcIndex.get(`${t.year}.${t.month}.multi`);
    if (!src) {
      console.log(`   ❌ 找不到源 PDF`);
      failed++;
      continue;
    }

    const { paperText, answerText } = extractSetText(src, t.setNo);
    const parts = sliceParts(paperText);
    const read = sliceSections(parts.III ?? "");
    const sourceC = read.C ?? "";
    if (sourceC.length < 1000) {
      console.log(`   ❌ Section C 文本过短(${sourceC.length}字)，无法补全`);
      failed++;
      continue;
    }

    let res: CarefulResult;
    try {
      res = await structureCareful(sourceC);
    } catch (e: any) {
      console.log(`   ❌ 结构化失败：${e?.message ?? e}`);
      failed++;
      continue;
    }

    const errs = verify(res, sourceC);
    if (errs.length) {
      console.log(`   ❌ 校验未过：\n      - ${errs.join("\n      - ")}`);
      failed++;
      continue;
    }

    // 答案：从答案 key 取 46–55。图片版解析 PDF（pdftotext 抽空）回退读 OCR 缓存。
    let answerSrc = answerText;
    if (!answerSrc) {
      const cachePath = path.join(OCR_CACHE, `${t.year}-${String(t.month).padStart(2, "0")}-s${t.setNo}.txt`);
      if (existsSync(cachePath)) {
        answerSrc = readFileSync(cachePath, "utf8");
        console.log(`   ℹ 答案 PDF 无文字层，回退 OCR 缓存：${path.basename(cachePath)}`);
      }
    }
    let answers: Record<string, string> = {};
    let tags: Record<string, string> = {};
    if (answerSrc) {
      try {
        const key = await parseAnswerKey(answerSrc);
        answers = key.answers ?? {};
        tags = key.tags ?? {};
      } catch (e: any) {
        console.log(`   ⚠ 答案 key 解析失败：${e?.message ?? e}（仍写题面，答案留空待校对）`);
      }
    }
    const ansFor = (n: number) => answers[String(n)] ?? null;
    const tagFor = (n: number) => tags[String(n)] ?? null;
    const ansCount = [46, 47, 48, 49, 50, 51, 52, 53, 54, 55].filter((n) => ansFor(n)).length;

    console.log(
      `   ✓ 校验通过：2 篇 / 10 题 / 答案 ${ansCount}/10` + (DRY ? "" : " → 写库")
    );

    if (DRY) {
      done++;
      continue;
    }

    // 写库：翻译挪到 order 8，仔细阅读占 6/7（与正常卷一致）
    const translation = paper.sections.find((s) => s.kind === "translation");
    await prisma.$transaction(async (tx) => {
      if (translation && translation.order !== 8) {
        await tx.section.update({ where: { id: translation.id }, data: { order: 8 } });
      }
      const orders = [6, 7];
      for (let i = 0; i < res.passages.length; i++) {
        const p = res.passages[i];
        const sec = await tx.section.create({
          data: { paperId: paper.id, kind: "careful_reading", order: orders[i], title: p.title ?? null, passage: p.text },
        });
        for (const q of p.questions) {
          await tx.question.create({
            data: {
              sectionId: sec.id,
              number: q.number,
              type: "mcq",
              stem: q.stem ?? null,
              optionsJson: JSON.stringify(q.options),
              correct: ansFor(q.number),
              points: 2,
              knowledgeTag: tagFor(q.number),
            },
          });
        }
      }
    });
    console.log(`   ✅ 已补全 ${label} 仔细阅读 46–55`);
    done++;
  }

  console.log(`\n════════ 汇总 ════════`);
  console.log(`成功 ${done}｜跳过(已存在) ${skipped}｜失败 ${failed}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
