import "dotenv/config";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import { createHash } from "crypto";
import path from "path";
import { prisma } from "../lib/db";
import { discoverPapers, listExamDirs, parseSetNo } from "./ingest/discover";
import { linkPaperAudio } from "./ingest/audio";

// 审计 / 修复全库听力音频接入。
//
//   npx tsx scripts/audit-audio.ts                 # 只审计，输出报告（只读）
//   npx tsx scripts/audit-audio.ts --fix "2025年06月"  # 修复匹配考期：按期望源 relink（强制覆盖）
//   npx tsx scripts/audit-audio.ts --fix           # 修复全部考期的音频偏差（谨慎）
//
// 期望音频映射 = 修正后的 discover.pickMp3 选法 + link-audio 的「第3套回退第2套」：
//   - 目录仅1个mp3 → 所有套共用
//   - 否则按文件名「第N套/音频N」精确命中；第1套兜底取无套号的中性文件；第3套回退第2套。
const ROOT = path.join(process.cwd(), "四级真题+答案+听力（2025.6-2015.06）");
const AUDIO_DIR = path.join(process.cwd(), "public", "audio");

const md5cache = new Map<string, string>();
function md5(file: string): string | null {
  if (!existsSync(file)) return null;
  const cached = md5cache.get(file);
  if (cached) return cached;
  const h = createHash("md5").update(readFileSync(file)).digest("hex");
  md5cache.set(file, h);
  return h;
}
const sh = (h: string | null | undefined) => (h ? h.slice(0, 8) : "—");

// 递归收集目录里的听力音频文件
function listMp3(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = path.join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(mp3|m4a)$/i.test(name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

// 某套的期望源 mp3（与 ingest/discover + link-audio 同策略）
function expectedMp3(mp3s: string[], setNo: number): string | null {
  if (mp3s.length === 0) return null;
  if (mp3s.length === 1) return mp3s[0];
  const exact = mp3s.find((f) => parseSetNo(path.basename(f)) === setNo);
  if (exact) return exact;
  if (setNo === 1) {
    const untagged = mp3s.filter((f) => parseSetNo(path.basename(f)) == null);
    return untagged[0] ?? null;
  }
  if (setNo === 3) return expectedMp3(mp3s, 2); // 第3套回退第2套
  return null;
}

const LISTEN_KINDS = ["listening_news", "listening_conv", "listening_passage"];

interface Issue {
  level: "ERR" | "WARN" | "INFO";
  paper: string;
  msg: string;
}

async function main() {
  const fix = process.argv.includes("--fix");
  const filter = process.argv.find((a, i) => i >= 2 && !a.startsWith("--") && a !== "--fix");

  const dirs = listExamDirs(ROOT);
  // 按考期目录建：年月 -> 该期 mp3 列表
  const mp3sByPeriod = new Map<string, string[]>(); // "y-m" -> abs paths
  const setsBySource = new Map<string, number>(); // "y-m" -> 源识别套数
  for (const dir of dirs) {
    const srcs = discoverPapers(dir);
    if (srcs.length === 0) continue;
    const { year, month } = srcs[0];
    const key = `${year}-${month}`;
    mp3sByPeriod.set(key, listMp3(dir));
    const setCount = srcs[0].multiSet ? 3 : new Set(srcs.map((s) => s.setNo)).size;
    setsBySource.set(key, Math.max(setsBySource.get(key) ?? 0, setCount));
  }

  const papers = await prisma.paper.findMany({
    where: { source: "real" },
    select: { id: true, year: true, month: true, setNo: true, title: true, status: true },
    orderBy: [{ year: "asc" }, { month: "asc" }, { setNo: "asc" }],
  });

  const issues: Issue[] = [];
  const add = (level: Issue["level"], paper: string, msg: string) => issues.push({ level, paper, msg });

  // 期次 -> {setNo -> dbMd5}，供「同期第1/2套是否相同」判断
  const dbMd5ByPeriodSet = new Map<string, Map<number, string | null>>();
  const expMd5ByPeriodSet = new Map<string, Map<number, string | null>>(); // 期望源 md5，用于区分「单轨期次合法相同」与「错挂」
  const referencedFiles = new Set<string>(); // 被 audioUrl 引用的 public/audio 文件名

  let fixed = 0;

  for (const p of papers) {
    const label = p.title ?? `${p.year}.${p.month} set${p.setNo}`;
    const key = `${p.year}-${p.month}`;
    const setNo = p.setNo ?? 1;
    const mp3s = mp3sByPeriod.get(key) ?? [];

    const secs = await prisma.section.findMany({
      where: { paperId: p.id },
      select: { kind: true, audioUrl: true },
    });
    const listenSecs = secs.filter((s) => LISTEN_KINDS.includes(s.kind));

    // 试卷结构粗检
    if (p.status !== "ready") add("WARN", label, `状态=${p.status}（非 ready）`);
    if (secs.length === 0) {
      add("ERR", label, "无任何 section（空卷）");
      continue;
    }
    const missingKinds = ["writing", "banked_cloze", "matching", "careful_reading", "translation"].filter(
      (k) => !secs.some((s) => s.kind === k)
    );
    if (missingKinds.length) add("WARN", label, `缺小节：${missingKinds.join("、")}`);
    if (listenSecs.length === 0) {
      add("ERR", label, "无听力 section");
      continue;
    }
    if (listenSecs.length < 3) add("WARN", label, `听力 section 仅 ${listenSecs.length}/3 节`);

    // 期望源
    const expSrc = expectedMp3(mp3s, setNo);
    const expMd5 = expSrc ? md5(expSrc) : null;

    // --fix：DB 与期望不符则强制 relink
    if (fix && (!filter || dirsMatchFilter(key, filter, dirs))) {
      const fileNow = path.join(AUDIO_DIR, `${p.id}.mp3`);
      const md5Now = md5(fileNow);
      const hasUrl = listenSecs.every((s) => s.audioUrl);
      if (expSrc && (!hasUrl || md5Now !== expMd5)) {
        await linkPaperAudio(p.id, expSrc);
        md5cache.delete(fileNow);
        add("INFO", label, `已修复 → 源 ${path.basename(expSrc)}（${sh(md5Now)} → ${sh(expMd5)}）`);
        fixed++;
      }
    }

    // 重新读取（fix 后可能变化）
    const secs2 = fix
      ? await prisma.section.findMany({ where: { paperId: p.id }, select: { kind: true, audioUrl: true } })
      : secs;
    const listen2 = secs2.filter((s) => LISTEN_KINDS.includes(s.kind));

    // 1) audioUrl 覆盖
    const withUrl = listen2.filter((s) => s.audioUrl);
    if (withUrl.length === 0) {
      add("ERR", label, `听力全部缺 audioUrl（源${expSrc ? "可补:" + path.basename(expSrc) : "缺失"}）`);
      dbMd5ByPeriodSet.set(key, (dbMd5ByPeriodSet.get(key) ?? new Map()).set(setNo, null));
      continue;
    }
    if (withUrl.length < listen2.length) add("WARN", label, `${listen2.length - withUrl.length}/${listen2.length} 听力节缺 audioUrl`);

    // 2) 文件存在性 + MD5
    const urls = new Set(withUrl.map((s) => s.audioUrl!));
    if (urls.size > 1) add("WARN", label, `听力各节 audioUrl 不一致：${[...urls].join(" / ")}`);
    const url = withUrl[0].audioUrl!;
    const fileName = path.basename(url);
    referencedFiles.add(fileName);
    const file = path.join(AUDIO_DIR, fileName);
    const dbMd5 = md5(file);
    if (!dbMd5) {
      add("ERR", label, `audioUrl 指向的文件不存在：${url}`);
    } else {
      const periodMd5s = new Set(mp3s.map((m) => md5(m)).filter(Boolean) as string[]);
      if (expMd5) {
        if (dbMd5 !== expMd5)
          add("ERR", label, `音频内容不符：库内 ${sh(dbMd5)}，应为 ${sh(expMd5)}（${path.basename(expSrc!)}）`);
      } else if (periodMd5s.size > 0) {
        if (!periodMd5s.has(dbMd5)) add("ERR", label, `音频不属于本考期任何源文件（库内 ${sh(dbMd5)}）`);
        else add("INFO", label, `音频属本期源但无法定位到具体套（库内 ${sh(dbMd5)}）`);
      } else {
        add("INFO", label, `本考期源目录无 mp3，无法校验内容（库内 ${sh(dbMd5)}）`);
      }
    }
    const m = dbMd5ByPeriodSet.get(key) ?? new Map<number, string | null>();
    m.set(setNo, dbMd5);
    dbMd5ByPeriodSet.set(key, m);
    const em = expMd5ByPeriodSet.get(key) ?? new Map<number, string | null>();
    em.set(setNo, expMd5);
    expMd5ByPeriodSet.set(key, em);
  }

  // 3) 同期「第1套 == 第2套」判定（错挂特征）。仅当该期「本应有不同的第1/2套源」时才算错挂；
  //    单轨期次（全期仅1个听力文件，三套合法共用）不报。第2套==第3套属合法（不报）。
  for (const [key, m] of dbMd5ByPeriodSet) {
    const em = expMd5ByPeriodSet.get(key) ?? new Map();
    const s1 = m.get(1), s2 = m.get(2), s3 = m.get(3);
    const e1 = em.get(1), e2 = em.get(2), e3 = em.get(3);
    if (s1 && s2 && s1 === s2 && e1 && e2 && e1 !== e2)
      add("ERR", `${key}`, `第1套与第2套音频完全相同（${sh(s1)}）——应为不同录音，疑似错挂`);
    if (s1 && s3 && s1 === s3 && s1 !== s2 && e1 && e3 && e1 !== e3)
      add("WARN", `${key}`, `第1套与第3套音频相同（${sh(s1)}）`);
  }

  // 4) 套数完整性
  const dbSetsByPeriod = new Map<string, Set<number>>();
  for (const p of papers) {
    const key = `${p.year}-${p.month}`;
    (dbSetsByPeriod.get(key) ?? dbSetsByPeriod.set(key, new Set()).get(key)!).add(p.setNo ?? 1);
  }
  for (const [key, expCount] of setsBySource) {
    const have = dbSetsByPeriod.get(key)?.size ?? 0;
    if (have < expCount) add("WARN", key, `入库 ${have} 套，源识别 ${expCount} 套（疑缺套）`);
  }

  // 5) 孤儿音频文件（public/audio 里没被任何 audioUrl 引用的）
  const audioFiles = existsSync(AUDIO_DIR) ? readdirSync(AUDIO_DIR).filter((f) => /\.mp3$/i.test(f)) : [];
  const orphans = audioFiles.filter((f) => !referencedFiles.has(f));
  for (const o of orphans) add("INFO", "public/audio", `孤儿文件（无卷引用）：${o}`);

  // ---- 报告 ----
  const errs = issues.filter((i) => i.level === "ERR");
  const warns = issues.filter((i) => i.level === "WARN");
  const infos = issues.filter((i) => i.level === "INFO");

  console.log(`\n========== 审计报告 ==========`);
  console.log(`真题卷：${papers.length} 套；听力音频文件：${audioFiles.length} 个`);
  if (fix) console.log(`本次修复：${fixed} 套`);
  console.log(`\n❌ 错误 ${errs.length}：`);
  errs.forEach((i) => console.log(`   [${i.paper}] ${i.msg}`));
  console.log(`\n⚠️  警告 ${warns.length}：`);
  warns.forEach((i) => console.log(`   [${i.paper}] ${i.msg}`));
  console.log(`\nℹ️  提示 ${infos.length}：`);
  infos.forEach((i) => console.log(`   [${i.paper}] ${i.msg}`));
  console.log(`\n========== 结束（错误${errs.length} / 警告${warns.length} / 提示${infos.length}）==========`);
}

// 期次 key("y-m") 是否落在 filter 指定的考期目录内
function dirsMatchFilter(periodKey: string, filter: string, dirs: string[]): boolean {
  const [y, m] = periodKey.split("-").map(Number);
  return dirs.some((d) => {
    const b = path.basename(d);
    if (!b.includes(filter)) return false;
    const mm = b.match(/(\d{4})\s*年\s*0?(\d{1,2})\s*月/) || b.match(/(\d{4})[.](\d{1,2})/);
    return mm ? Number(mm[1]) === y && Number(mm[2]) === m : false;
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
