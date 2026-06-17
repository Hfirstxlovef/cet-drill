import "dotenv/config";
import { readFileSync, writeFileSync } from "fs";
import { parseAnswerKey } from "./ingest/structure";

// 用 app 的 parseAnswerKey(走 zenmux)从 OCR 出的解析文本里可靠提取 55 答案。
// 仅答案这一步走 zenmux；结构化仍由 ocr-ingest.py 的规则解析器(零成本)完成。
// 用法：npx tsx scripts/get-answers.ts <解析OCR.txt> <输出.json>
async function main() {
  const inFile = process.argv[2];
  const outFile = process.argv[3];
  const text = readFileSync(inFile, "utf8");
  const res = await parseAnswerKey(text);
  writeFileSync(outFile, JSON.stringify(res, null, 2));
  const n = Object.keys(res.answers ?? {}).length;
  console.log(`✅ 提取 ${n} 个答案 → ${outFile}`);
  const ans = res.answers ?? {};
  console.log(Object.keys(ans).sort((a, b) => +a - +b).map((k) => `${k}${ans[k]}`).join(" "));
}
main().catch((e) => { console.error(e); process.exit(1); });
