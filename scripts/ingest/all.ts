import "dotenv/config";
import path from "path";
import { prisma } from "../../lib/db";
import { discoverPapers, listExamDirs } from "./discover";
import { ingestPaper, type IngestResult } from "./index";

// 批量入库资源夹下全部真题。
//   npx tsx scripts/ingest/all.ts                 # 全量
//   npx tsx scripts/ingest/all.ts 2025年06月       # 仅匹配目录名子串的考期（小样验证）
//   npx tsx scripts/ingest/all.ts 2020年07月 1     # 再限最多 N 套
const ROOT = path.join(process.cwd(), "四级真题+答案+听力（2025.6-2015.06）");
const FILTER = process.argv[2] || "";
const MAX = process.argv[3] ? Number(process.argv[3]) : Infinity;

async function main() {
  const dirs = listExamDirs(ROOT)
    .filter((d) => !FILTER || path.basename(d).includes(FILTER))
    .sort();
  console.log(`🗂  ${dirs.length} 个考期目录${FILTER ? `（过滤「${FILTER}」）` : ""}${MAX !== Infinity ? ` · 限 ${MAX} 套` : ""}\n`);

  const all: IngestResult[] = [];
  let n = 0;
  outer: for (const dir of dirs) {
    for (const src of discoverPapers(dir)) {
      if (n >= MAX) break outer;
      n++;
      const label = `${src.year}.${String(src.month).padStart(2, "0")} set${src.setNo}`;
      console.log(`\n[${n}] ▶ ${label} …`);
      try {
        for (const r of await ingestPaper(src)) {
          all.push(r);
          if (r.status === "ok") console.log(`✅ ${r.label} · ${r.qCount}题 缺答案${r.noAns} → ${r.paperStatus}`);
          else if (r.status === "skipped") console.log(`⏭  ${r.label} · ${r.reason}`);
          else console.log(`❌ ${r.label} · ${r.reason}`);
        }
      } catch (e: any) {
        all.push({ label, status: "failed", reason: e?.message ?? String(e) });
        console.log(`❌ ${label} · 异常：${e?.message ?? e}`);
      }
    }
  }

  // ──── 覆盖报告 ────
  const ok = all.filter((r) => r.status === "ok");
  const ready = ok.filter((r) => r.paperStatus === "ready");
  const review = ok.filter((r) => r.paperStatus === "review");
  const skipped = all.filter((r) => r.status === "skipped");
  const failed = all.filter((r) => r.status === "failed");
  console.log(`\n════════ 覆盖报告 ════════`);
  console.log(`总计 ${all.length} 套：✅ 成功 ${ok.length}（可练 ${ready.length} · 待校对 ${review.length}）｜⏭ 跳过 ${skipped.length}｜❌ 失败 ${failed.length}`);
  if (review.length) {
    console.log(`\n📝 待校对（答案不全，去 /review 补）：`);
    review.forEach((r) => console.log(`   ${r.label} · 缺答案 ${r.noAns}`));
  }
  if (skipped.length) {
    console.log(`\n⏭  跳过（多为扫描件需 OCR）：`);
    skipped.forEach((r) => console.log(`   ${r.label} · ${r.reason}`));
  }
  if (failed.length) {
    console.log(`\n❌ 失败：`);
    failed.forEach((r) => console.log(`   ${r.label} · ${r.reason}`));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
