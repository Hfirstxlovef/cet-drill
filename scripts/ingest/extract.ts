import { execFileSync } from "node:child_process";

/** 用 poppler 的 pdftotext -layout 抽取文字层（这些真题/解析 PDF 都可复制可搜索）。 */
export function extractPdfText(path: string): string {
  return execFileSync("pdftotext", ["-layout", path, "-"], {
    maxBuffer: 128 * 1024 * 1024,
    encoding: "utf8",
  });
}

const WATERMARK_RES: RegExp[] = [
  /https?:\/\/\S+/i,
  /微信公众号/,
  /顶尖考研/,
  /zhenti\.burningvocabulary/i,
  /可复制可搜索/,
];

/** 去水印行、纯页码行，归一行内多余空格，折叠多空行。 */
export function cleanText(raw: string): string {
  const kept: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) {
      kept.push("");
      continue;
    }
    if (WATERMARK_RES.some((re) => re.test(t))) continue;
    if (/^\d{1,3}$/.test(t)) continue; // 纯页码
    if (/^第\s*\d+\s*页/.test(t)) continue;
    kept.push(line.replace(/[ \t]{2,}/g, "  ").replace(/\s+$/, ""));
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function indexOfRe(text: string, re: RegExp, from = 0): number {
  const m = re.exec(text.slice(from));
  return m ? from + m.index : -1;
}

/** 按 Part I/II/III/IV 切成四块。
 *  注意：部分 PDF 的罗马数字会被 pdftotext 渲染错（实测「Part III」→「Part in」），
 *  故改为锚定**稳定的英文小节名**（Writing/Listening/Reading/Translation），
 *  并按考试固定顺序依次向后查找，保序且不误命中正文里的同词。 */
export function sliceParts(paper: string): Record<"I" | "II" | "III" | "IV", string> {
  const anchors: { key: "I" | "II" | "III" | "IV"; res: RegExp[] }[] = [
    { key: "I", res: [/Part\s+I\b/, /\bWriting\b/] },
    { key: "II", res: [/Listening\s+Comprehension/i, /Part\s+II\b/] },
    { key: "III", res: [/Reading\s+Comprehension/i, /Part\s+III\b/] },
    { key: "IV", res: [/Part\s+IV\b/, /\bTranslation\b/] },
  ];
  const positions: { key: "I" | "II" | "III" | "IV"; idx: number }[] = [];
  let from = 0;
  for (const a of anchors) {
    let idx = -1;
    for (const re of a.res) {
      idx = indexOfRe(paper, re, from);
      if (idx >= 0) break;
    }
    positions.push({ key: a.key, idx });
    if (idx >= 0) from = idx + 1; // 保序：下一部分从本部分之后再找
  }
  const res = {} as Record<"I" | "II" | "III" | "IV", string>;
  for (let i = 0; i < positions.length; i++) {
    const cur = positions[i];
    if (cur.idx < 0) continue;
    const next = positions.slice(i + 1).find((p) => p.idx > cur.idx);
    res[cur.key] = paper.slice(cur.idx, next ? next.idx : undefined).trim();
  }
  return res;
}

/** 在某个 Part 内切 Section A/B/C。 */
export function sliceSections(partText: string): {
  A?: string;
  B?: string;
  C?: string;
} {
  const iA = indexOfRe(partText, /Section\s+A\b/);
  const iB = indexOfRe(partText, /Section\s+B\b/);
  const iC = indexOfRe(partText, /Section\s+C\b/);
  const out: { A?: string; B?: string; C?: string } = {};
  if (iA >= 0) out.A = partText.slice(iA, iB >= 0 ? iB : iC >= 0 ? iC : undefined).trim();
  if (iB >= 0) out.B = partText.slice(iB, iC >= 0 ? iC : undefined).trim();
  if (iC >= 0) out.C = partText.slice(iC).trim();
  return out;
}
