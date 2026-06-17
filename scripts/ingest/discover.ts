import { readdirSync, statSync } from "fs";
import path from "path";

// 一套卷的来源文件（发现层产物，喂给 ingestPaper）
export interface PaperSource {
  year: number;
  month: number;
  setNo: number;
  paperPdf: string; // 真题 PDF 绝对路径（combined 时同 answerPdf）
  answerPdf: string | null; // 解析/答案 PDF；缺失则 null（→ 客观题待校对）
  mp3: string | null; // 该套听力音频
  combined: boolean; // 真题+答案合在一个 PDF
  multiSet: boolean; // 「N 套合一文件」，由 ingest 按 Part I 切分成多套
}

const CN_NUM: Record<string, number> = { 一: 1, 二: 2, 三: 3 };

function listFiles(dir: string, ext: RegExp): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = path.join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (ext.test(name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

function parseYearMonth(s: string): { year: number; month: number } | null {
  const m = s.match(/(\d{4})\s*年\s*0?(\d{1,2})\s*月/) || s.match(/(\d{4})[.](\d{1,2})\b/);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

// 文件名若带可解析的年月且与目录不符 → 是「串门」误放文件（资源夹里确有此情况，如 2016.12 混入 2020 文件）
function fileBelongs(base: string, ym: { year: number; month: number }): boolean {
  const fym = parseYearMonth(base);
  return !fym || (fym.year === ym.year && fym.month === ym.month);
}

// 从文件名取套号：第1套/第一套/（第1套）/【第N套】…（必须有「第…套」，避免把「（3套）」「（2023.03）」误判）
// 兜底再认「音频N/听力N」这类无「第…套」的写法（如 2025.06「四级音频1.MP3」），
// 数字须紧跟在 音频/听力 之后（"听力音频第2套" 里 音频后是"第"，不会误命中 → 仍走上面的「第2套」规则）。
export function parseSetNo(base: string): number | null {
  const m = base.match(/第\s*([1-3])\s*套/);
  if (m) return Number(m[1]);
  const cn = base.match(/第\s*([一二三])\s*套/);
  if (cn) return CN_NUM[cn[1]] ?? null;
  const alt = base.match(/(?:音频|听力)\s*0?([1-3])(?![0-9])/);
  if (alt) return Number(alt[1]);
  return null;
}

const ANSWER_RE = /解析|答案|详解|参考/;
const COMBINED_RE = /原卷及答案|真题及答案|真题\+答案|真题及解析/;
const MULTISET_RE = /[（(]\s*3\s*套\s*[）)]|全\s*3\s*套|3\s*套.*无水印/;
const NOT_PAPER_RE = /听力原文|原文译文|答题卡|高频词汇/; // 非真题卷文件

function dupKey(file: string): string {
  return path
    .basename(file)
    .replace(/\(\d+\)(?=\.[a-z]+$)/i, "")
    .replace(/\.pdf\.pdf$/i, ".pdf")
    .replace(/\.\.pdf$/i, ".pdf");
}

function dedup(files: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const f of files) {
    const k = dupKey(f);
    const prev = byKey.get(k);
    if (!prev || path.basename(f).length < path.basename(prev).length) byKey.set(k, f);
  }
  return [...byKey.values()];
}

function preferAnswer(cands: string[]): string {
  return cands.find((f) => /解析|详解/.test(path.basename(f))) ?? cands[0];
}

// 扫描一个考期目录 → 该考期所有套的来源文件
export function discoverPapers(dirAbs: string): PaperSource[] {
  const dirName = path.basename(dirAbs);
  const ym = parseYearMonth(dirName);
  if (!ym) {
    console.log(`   ⚠ 目录名解析不出年月，跳过：${dirName}`);
    return [];
  }

  // 去重 + 剔非真题 + 剔串门文件
  const pdfs = dedup(listFiles(dirAbs, /\.pdf$/i)).filter(
    (f) => !NOT_PAPER_RE.test(path.basename(f)) && fileBelongs(path.basename(f), ym)
  );
  const mp3s = listFiles(dirAbs, /\.(mp3|m4a)$/i).filter((f) => fileBelongs(path.basename(f), ym));

  const isAns = (f: string) => ANSWER_RE.test(path.basename(f)) && !COMBINED_RE.test(path.basename(f));
  const papers = pdfs.filter((f) => !isAns(f));
  const answers = pdfs.filter(isAns);

  const pickMp3 = (setNo: number): string | null => {
    if (mp3s.length === 0) return null;
    if (mp3s.length === 1) return mp3s[0];
    const exact = mp3s.find((f) => parseSetNo(path.basename(f)) === setNo);
    if (exact) return exact;
    // 回退：只取「无显式套号」的中性文件，绝不抢别套已标注的 mp3
    // （旧逻辑直接取 mp3s[0]，会让第1套抢到按读取顺序排在首位的「第2套」文件）。
    const untagged = mp3s.filter((f) => parseSetNo(path.basename(f)) == null);
    return setNo === 1 && untagged.length ? untagged[0] : null;
  };
  const pickAnswer = (setNo: number): string | null => {
    const cand = answers.filter((f) => parseSetNo(path.basename(f)) === setNo);
    if (cand.length) return preferAnswer(cand);
    const noNum = answers.filter((f) => parseSetNo(path.basename(f)) == null);
    return setNo === 1 && noNum.length ? preferAnswer(noNum) : null;
  };

  let result: PaperSource[];

  // 「N 套合一文件」：整目录用单条 multiSet 源，由 ingest 切分成 1/2/3
  const multi = papers.find((f) => MULTISET_RE.test(path.basename(f)) && parseSetNo(path.basename(f)) == null);
  if (multi) {
    const multiAns = answers.find((f) => parseSetNo(path.basename(f)) == null) ?? answers[0] ?? null;
    result = [
      { year: ym.year, month: ym.month, setNo: 1, paperPdf: multi, answerPdf: multiAns, mp3: pickMp3(1), combined: false, multiSet: true },
    ];
  } else {
    const bySet = new Map<number, PaperSource>();
    for (const pf of papers) {
      const base = path.basename(pf);
      const combined = COMBINED_RE.test(base);
      const setNo = parseSetNo(base) ?? 1;
      const src: PaperSource = {
        year: ym.year,
        month: ym.month,
        setNo,
        paperPdf: pf,
        answerPdf: combined ? pf : pickAnswer(setNo),
        mp3: pickMp3(setNo),
        combined,
        multiSet: false,
      };
      const prev = bySet.get(setNo);
      // 同套冲突时优先「可复制可搜索」的（文字层更可能干净）
      if (!prev || (/可复制可搜索/.test(base) && !/可复制可搜索/.test(path.basename(prev.paperPdf)))) bySet.set(setNo, src);
    }
    result = [...bySet.values()].sort((a, b) => a.setNo - b.setNo);
  }

  console.log(`   📁 ${dirName} → ${ym.year}.${String(ym.month).padStart(2, "0")}：识别 ${result.length} ${result[0]?.multiSet ? "(多套合一)" : "套"}`);
  for (const s of result) {
    console.log(
      `      set${s.setNo}: 真题=${path.basename(s.paperPdf)}` +
        ` | 答案=${s.answerPdf ? path.basename(s.answerPdf) : "∅"}` +
        ` | mp3=${s.mp3 ? "✓" : "∅"}${s.combined ? " [合卷]" : ""}${s.multiSet ? " [多套合一]" : ""}`
    );
  }
  return result;
}

// 资源夹下所有考期目录
export function listExamDirs(rootAbs: string): string[] {
  return readdirSync(rootAbs)
    .map((n) => path.join(rootAbs, n))
    .filter((p) => statSync(p).isDirectory());
}
