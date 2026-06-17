import { copyFile, mkdir } from "fs/promises";
import { readdirSync, statSync } from "fs";
import path from "path";
import { prisma } from "../../lib/db";

// 在目录（含子目录）里找听力 mp3：优先文件名含「全1套」或「听力」的，否则取第一个。
export function findListeningMp3(dirAbs: string): string | null {
  const walk = (d: string): string[] => {
    const out: string[] = [];
    for (const name of readdirSync(d)) {
      const p = path.join(d, name);
      if (statSync(p).isDirectory()) out.push(...walk(p));
      else if (/\.mp3$/i.test(name)) out.push(p);
    }
    return out;
  };
  const mp3s = walk(dirAbs);
  if (mp3s.length === 0) return null;
  return mp3s.find((f) => /全1套|听力/.test(path.basename(f))) ?? mp3s[0];
}

// 把一套卷的听力 mp3 拷进 public/audio/<paperId>.mp3，
// 并把 web 路径 /audio/<paperId>.mp3 写到该卷所有 listening_* section 的 audioUrl。
// 选「拷贝进 public」而非流式 API：Next 静态文件天然支持 HTTP Range，
// <audio> 拖动/seek 直接可用，无需手写 206。返回写入的 web 路径。
export async function linkPaperAudio(paperId: string, srcMp3Abs: string): Promise<string> {
  const destDir = path.join(process.cwd(), "public", "audio");
  await mkdir(destDir, { recursive: true });
  await copyFile(srcMp3Abs, path.join(destDir, `${paperId}.mp3`));

  const audioUrl = `/audio/${paperId}.mp3`;
  const { count } = await prisma.section.updateMany({
    where: { paperId, kind: { startsWith: "listening" } },
    data: { audioUrl },
  });
  console.log(`   🎧 已接入听力音频 → ${audioUrl}（更新 ${count} 个听力 section）`);
  return audioUrl;
}
