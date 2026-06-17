// 阅读器 / API / 入库三方共享的结构化类型

export type SectionKind =
  | "writing"
  | "listening_news"
  | "listening_conv"
  | "listening_passage"
  | "banked_cloze"
  | "matching"
  | "careful_reading"
  | "translation";

export type QuestionType = "mcq" | "banked" | "matching" | "essay" | "translation";

export interface WordBankItem {
  letter: string; // A–O
  word: string;
}

export interface MatchParagraph {
  letter: string; // A–O / 至 S
  text: string;
}

export interface QuestionDTO {
  id: string;
  number: number | null; // 1–55；写作/翻译为 null
  type: QuestionType;
  stem: string | null;
  options: string[] | null; // ["A. ...", ...]，banked/matching 用 section 的词库/段落
  correct: string | null; // ready 卷在练习态不下发；校对/讲解才带
  referenceText: string | null;
  knowledgeTag: string | null;
  points: number;
  blankIndex: number | null;
  origin: string | null; // "real" | "ai"：AI 练习里区分真题/AI 穿插题
}

export interface SectionDTO {
  id: string;
  kind: SectionKind;
  order: number;
  title: string | null;
  instruction: string | null;
  passage: string | null;
  wordBank: WordBankItem[] | null;
  paragraphs: MatchParagraph[] | null;
  audioUrl: string | null;
  scriptText: string | null;
  questions: QuestionDTO[];
}

export interface PaperDTO {
  id: string;
  level: string;
  title: string;
  source: "real" | "ai" | string;
  year: number | null;
  month: number | null;
  setNo: number | null;
  status: string;
  sections: SectionDTO[];
}

export const SECTION_LABEL: Record<SectionKind, string> = {
  writing: "写作",
  listening_news: "听力 · 新闻",
  listening_conv: "听力 · 长对话",
  listening_passage: "听力 · 短文",
  banked_cloze: "选词填空",
  matching: "信息匹配",
  careful_reading: "仔细阅读",
  translation: "翻译",
};

// 真实四级 710 分制（线性估分）。官方为常模非线性折算，无法精确复刻，故称「预估」。
// 写作/翻译官方按 15 档评分 ×7.1 = 106.5，与听力短题/信息匹配同为 7.1 单位，模型自洽。
export type MacroSection = "listening" | "reading" | "writing" | "translation";

// 每题原始权重（客观题：权重 × 答对数；主观题：band(0–15) × 7.1）
export const SECTION_WEIGHT: Record<SectionKind, number> = {
  listening_news: 7.1,
  listening_conv: 7.1,
  listening_passage: 14.2,
  banked_cloze: 3.55,
  matching: 7.1,
  careful_reading: 14.2,
  writing: 7.1, // × band(0–15) → 106.5 满分
  translation: 7.1, // × band(0–15) → 106.5 满分
};

export const MACRO_OF: Record<SectionKind, MacroSection> = {
  listening_news: "listening",
  listening_conv: "listening",
  listening_passage: "listening",
  banked_cloze: "reading",
  matching: "reading",
  careful_reading: "reading",
  writing: "writing",
  translation: "translation",
};

export const MACRO_LABEL: Record<MacroSection, string> = {
  listening: "听力",
  reading: "阅读",
  writing: "写作",
  translation: "翻译",
};

export const MACRO_FULL: Record<MacroSection, number> = {
  listening: 248.5,
  reading: 248.5,
  writing: 106.5,
  translation: 106.5,
};

export const SUBJ_FULL_BAND = 15; // 写作/翻译档次满分
export const CET_TOTAL = 710;
export const CET_PASS = 425;
