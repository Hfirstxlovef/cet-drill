import "dotenv/config";
import { execFileSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import os from "os";
import path from "path";
import { prisma } from "../lib/db";
import { discoverPapers, listExamDirs } from "./ingest/discover";

// 对所有「待校对」真题卷的扫描版解析 PDF 做本机 OCR（pdftoppm 渲染 + macOS Vision），
// 输出文本缓存到 scripts/.ocr-cache/<y>-<mm>-s<set>.txt。全程离线免费，不调任何模型。
const ROOT = path.join(process.cwd(), "四级真题+答案+听力（2025.6-2015.06）");
const CACHE = path.join(process.cwd(), "scripts", ".ocr-cache");
const SWIFT = path.join(process.cwd(), "scripts", "ocr.swift");

function ocrPdf(pdf: string): string {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "ocr-"));
  try {
    execFileSync("pdftoppm", ["-png", "-r", "180", pdf, path.join(tmp, "pg")], { stdio: "ignore", maxBuffer: 1 << 30 });
    return execFileSync("swift", [SWIFT, tmp], { encoding: "utf8", maxBuffer: 1 << 30 });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  const review = await prisma.paper.findMany({
    where: { source: "real", status: "review" },
    select: { year: true, month: true, setNo: true },
  });
  const need = new Set(review.map((p) => `${p.year}-${p.month}-${p.setNo}`));
  console.log(`待校对卷 ${need.size} 套`);

  const jobs: { key: string; y: number; m: number; s: number; pdf: string }[] = [];
  for (const dir of listExamDirs(ROOT)) {
    for (const src of discoverPapers(dir)) {
      const key = `${src.year}-${src.month}-${src.setNo}`;
      if (!need.has(key)) continue;
      const pdf = src.combined ? src.paperPdf : src.answerPdf;
      if (pdf) jobs.push({ key, y: src.year, m: src.month, s: src.setNo, pdf });
    }
  }
  const have = new Set(jobs.map((j) => j.key));
  const noFile = [...need].filter((k) => !have.has(k));
  console.log(`可 OCR（有解析）：${jobs.length} 套；无答案文件跳过：${noFile.length} 套（${noFile.join(", ") || "无"}）\n`);

  let done = 0;
  for (const j of jobs) {
    const out = path.join(CACHE, `${j.y}-${String(j.m).padStart(2, "0")}-s${j.s}.txt`);
    if (existsSync(out)) { console.log(`⏭ ${j.key} 已有缓存`); done++; continue; }
    try {
      const t = ocrPdf(j.pdf);
      writeFileSync(out, t);
      done++;
      console.log(`✅ ${j.key} → ${path.basename(out)} (${t.length}字 · ${path.basename(j.pdf)})`);
    } catch (e: any) {
      console.log(`❌ ${j.key} OCR失败：${e?.message ?? e}`);
    }
  }
  console.log(`\nOCR 完成 ${done}/${jobs.length}，缓存在 scripts/.ocr-cache/`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
