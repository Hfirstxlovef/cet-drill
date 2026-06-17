import type {
  PaperDTO,
  SectionDTO,
  QuestionDTO,
  SectionKind,
  QuestionType,
} from "./types";

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

// Prisma 行（含 sections.questions）→ 前端 DTO。
// includeAnswers=false 时不下发 correct/referenceText（练习态防作弊）。
export function toPaperDTO(
  paper: any,
  { includeAnswers = false }: { includeAnswers?: boolean } = {}
): PaperDTO {
  const sections: SectionDTO[] = (paper.sections ?? [])
    .slice()
    .sort((a: any, b: any) => a.order - b.order)
    .map((s: any): SectionDTO => ({
      id: s.id,
      kind: s.kind as SectionKind,
      order: s.order,
      title: s.title ?? null,
      instruction: s.instruction ?? null,
      passage: s.passage ?? null,
      wordBank: parseJson(s.wordBankJson, null),
      paragraphs: parseJson(s.paragraphsJson, null),
      audioUrl: s.audioUrl ?? null,
      scriptText: s.scriptText ?? null,
      questions: (s.questions ?? [])
        .slice()
        .sort((a: any, b: any) => (a.number ?? 0) - (b.number ?? 0))
        .map(
          (q: any): QuestionDTO => ({
            id: q.id,
            number: q.number ?? null,
            type: q.type as QuestionType,
            stem: q.stem ?? null,
            options: parseJson(q.optionsJson, null),
            correct: includeAnswers ? q.correct ?? null : null,
            referenceText: includeAnswers ? q.referenceText ?? null : null,
            knowledgeTag: q.knowledgeTag ?? null,
            points: q.points ?? 1,
            blankIndex: q.blankIndex ?? null,
            origin: q.origin ?? null,
          })
        ),
    }));

  return {
    id: paper.id,
    level: paper.level,
    title: paper.title,
    source: paper.source,
    year: paper.year ?? null,
    month: paper.month ?? null,
    setNo: paper.setNo ?? null,
    status: paper.status,
    sections,
  };
}
