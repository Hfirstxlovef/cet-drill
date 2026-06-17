import "dotenv/config";
import path from "path";
import { execFileSync } from "child_process";
import { discoverPapers, listExamDirs } from "./discover";

// 预检：对 discover 选中的每份 paper/answer 做文字层体检（纯抽取，不调模型）。
// 输出真实覆盖矩阵，预测 ready / review / skip，跑全量前据此心里有数。
const ROOT = path.join(process.cwd(), "四级真题+答案+听力（2025.6-2015.06）");

function chars(f: string): number {
  try {
    return execFileSync("pdftotext", ["-layout", f, "-"], { maxBuffer: 256 * 1024 * 1024, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).length;
  } catch {
    return -1;
  }
}

let ready = 0, review = 0, skip = 0;
const skipList: string[] = [], reviewList: string[] = [];
for (const dir of listExamDirs(ROOT).sort()) {
  for (const s of discoverPapers(dir)) {
    const pc = chars(s.paperPdf);
    const ac = s.combined ? pc : s.answerPdf ? chars(s.answerPdf) : 0;
    const label = `${s.year}.${String(s.month).padStart(2, "0")} set${s.setNo}`;
    let verdict: string;
    if (pc < 1500) { verdict = "⏭ skip(无文字层)"; skip++; skipList.push(`${label} 真题${pc}字`); }
    else if (ac < 300) { verdict = "📝 review(无答案)"; review++; reviewList.push(`${label} 答案${ac}字`); }
    else { verdict = "✅ ready候选"; ready++; }
    console.log(`  ${label}: 真题${pc}字 / 答案${ac}字  ${verdict}`);
  }
}
console.log(`\n==== 预测：✅可练候选 ${ready} | 📝待校对(无答案) ${review} | ⏭跳过(扫描件) ${skip} ====`);
if (reviewList.length) console.log("📝 无答案：\n  " + reviewList.join("\n  "));
if (skipList.length) console.log("⏭ 扫描件：\n  " + skipList.join("\n  "));
