import "dotenv/config";
import { extractPdfText, cleanText, sliceParts, sliceSections } from "./extract";

const PAPER = process.argv[2];
if (!PAPER) {
  console.error("用法: tsx scripts/ingest/_probe.ts <paper.pdf>");
  process.exit(1);
}

const clean = cleanText(extractPdfText(PAPER));
console.log("clean chars:", clean.length);

const parts = sliceParts(clean);
for (const k of ["I", "II", "III", "IV"] as const) {
  const t = parts[k];
  console.log(`\n===== Part ${k} (${t?.length ?? 0} chars) =====`);
  console.log((t ?? "(MISSING)").slice(0, 160).replace(/\n/g, " ⏎ "));
}

console.log("\n----- Part III 内部 Section -----");
const s3 = sliceSections(parts["III"] ?? "");
for (const k of ["A", "B", "C"] as const) {
  console.log(
    `Section ${k}: ${s3[k]?.length ?? 0} chars | ${(s3[k] ?? "").slice(0, 110).replace(/\n/g, " ⏎ ")}`
  );
}
console.log("\n----- Part II 内部 Section -----");
const s2 = sliceSections(parts["II"] ?? "");
for (const k of ["A", "B", "C"] as const) {
  console.log(`Section ${k}: ${s2[k]?.length ?? 0} chars`);
}
