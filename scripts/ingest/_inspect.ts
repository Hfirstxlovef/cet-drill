import "dotenv/config";
import { prisma } from "../../lib/db";

(async () => {
  const paper = await prisma.paper.findFirst({
    where: { source: "real" },
    orderBy: { createdAt: "desc" },
    include: {
      sections: { orderBy: { order: "asc" }, include: { questions: { orderBy: { number: "asc" } } } },
    },
  });
  if (!paper) {
    console.log("no paper");
    return;
  }
  console.log("Paper:", paper.title, "| status:", paper.status);
  for (const s of paper.sections) {
    console.log(`\n[${s.order}] ${s.kind}  Q=${s.questions.length}  ${s.title ?? ""}`);
    if (s.wordBankJson)
      console.log(
        "  wordBank:",
        JSON.parse(s.wordBankJson).map((w: any) => `${w.letter}:${w.word}`).join("  ")
      );
    if (s.paragraphsJson)
      console.log("  paragraphs:", JSON.parse(s.paragraphsJson).length, "段");
    if (s.passage)
      console.log("  passage:", s.passage.slice(0, 140).replace(/\n/g, " "), "…");
    for (const q of s.questions.slice(0, 2)) {
      console.log("   Q", {
        n: q.number,
        type: q.type,
        correct: q.correct,
        tag: q.knowledgeTag,
        opts: q.optionsJson ? JSON.parse(q.optionsJson).length : 0,
        stem: (q.stem ?? "").slice(0, 70),
      });
    }
  }
  await prisma.$disconnect();
})();
