import "dotenv/config";
import path from "path";
import { prisma } from "../lib/db";
import { discoverPapers, listExamDirs } from "./ingest/discover";
import { linkPaperAudio } from "./ingest/audio";

// 给「已入库(ready) 但听力 section 缺 audioUrl」的卷补接听力音频。
//
// 背景：ingest 对 ready 卷幂等跳过（连同音频接入步骤一起跳过），所以当音频
// 文件晚于入库才到位时，不会被自动补上 —— 本脚本即用于补这一类缺口。
// 未来新卷由 ingest 首次入库时自动接入，无需再跑此脚本。
//
// 用法：
//   npx tsx scripts/link-audio.ts "2025年12月"   # 仅处理目录名含该子串的考期
//   npx tsx scripts/link-audio.ts                 # 扫描整个资源夹，补所有缺口
//
// 每套的 mp3 由 discoverPapers() 按套号匹配（与正式 ingest 同一逻辑）。
// 第3套通常无独立听力文件 —— CET 二、三套听力同一音频（本仓 2025.12 目录
// 「第三套听力与第二套一样，不单独提供.txt」即为佐证），故第3套回退用第2套的 mp3。
const ROOT = path.join(process.cwd(), "四级真题+答案+听力（2025.6-2015.06）");

// 该卷是否「有听力小节但至少一节缺 audioUrl」——只有这种才需要补。
async function listeningAudioMissing(paperId: string): Promise<boolean> {
  const secs = await prisma.section.findMany({
    where: { paperId, kind: { startsWith: "listening" } },
    select: { audioUrl: true },
  });
  if (secs.length === 0) return false; // 无听力小节（写作/翻译类）→ 无需音频
  return secs.some((s) => !s.audioUrl); // 空串或 null 都算缺
}

async function main() {
  const filter = process.argv[2]; // 可选：考期目录名子串
  const dirs = listExamDirs(ROOT).filter((d) => !filter || path.basename(d).includes(filter));
  if (dirs.length === 0) {
    console.log(`未匹配到考期目录${filter ? `（子串：${filter}）` : ""}`);
    return;
  }

  let linked = 0;
  let already = 0;
  let noSrc = 0;

  for (const dir of dirs) {
    const sources = discoverPapers(dir);
    if (sources.length === 0) continue;

    // setNo -> mp3 绝对路径
    const mp3BySet = new Map<number, string>();
    for (const s of sources) if (s.mp3) mp3BySet.set(s.setNo, s.mp3);
    const set2Mp3 = mp3BySet.get(2);

    const { year, month } = sources[0];
    const papers = await prisma.paper.findMany({
      where: { year, month, source: "real", status: "ready" },
      select: { id: true, setNo: true, title: true },
    });

    for (const p of papers) {
      const setNo = p.setNo ?? 1;
      let mp3 = mp3BySet.get(setNo);
      if (!mp3 && setNo === 3 && set2Mp3) mp3 = set2Mp3; // 第3套回退第2套
      if (!mp3) {
        noSrc++;
        continue;
      }
      if (!(await listeningAudioMissing(p.id))) {
        already++;
        continue;
      }
      const url = await linkPaperAudio(p.id, mp3);
      console.log(`✅ ${p.title} → ${url}（源：${path.basename(mp3)}）`);
      linked++;
    }
  }

  console.log(`\n完成：新接入 ${linked} 套；已有音频 ${already} 套；无音频源 ${noSrc} 套。`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
