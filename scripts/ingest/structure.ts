import { chatJson } from "../../lib/zenmux";

const PARSER_SYSTEM =
  "你是严谨的 CET-4 真题解析器。只依据给定文本提取结构化信息，绝不编造、补全、改写或翻译任何内容。" +
  "保留英文原文（含标点）。只输出符合要求的 JSON 对象，不要任何解释文字。";

async function parse<T>(user: string): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < 2; i++) {
    try {
      return await chatJson<T>({
        messages: [
          { role: "system", content: PARSER_SYSTEM },
          { role: "user", content: user },
        ],
        temperature: i === 0 ? 0.1 : 0.3,
        maxTokens: 8000,
      });
    } catch (e) {
      lastErr = e; // JSON 偶发不合法，换温度重试一次
    }
  }
  throw lastErr;
}

export interface WordBankItem {
  letter: string;
  word: string;
}
export interface BankedClozeResult {
  instruction: string;
  passage: string; // 十个空替换为 [26]…[35]
  wordBank: WordBankItem[];
  blanks: number[];
}
export async function structureBankedCloze(text: string): Promise<BankedClozeResult> {
  return parse<BankedClozeResult>(
    `这是 CET-4 阅读 Section A「选词填空」的原文。请提取为 JSON：
{
  "instruction": "Directions 段英文原文",
  "passage": "带空篇章的英文原文；把十个空位（题号 26–35）原位替换成 [26] [27] … [35] 这样的标记",
  "wordBank": [{"letter":"A","word":"..."}, … 共 15 项 A–O],
  "blanks": [26,27,28,29,30,31,32,33,34,35]
}

原文：
"""
${text}
"""`
  );
}

export interface MatchParagraph {
  letter: string;
  text: string;
}
export interface MatchingResult {
  instruction: string;
  title: string;
  paragraphs: MatchParagraph[];
  statements: { number: number; stem: string }[];
}
export async function structureMatching(text: string): Promise<MatchingResult> {
  return parse<MatchingResult>(
    `这是 CET-4 阅读 Section B「信息匹配 / 长篇阅读」的原文。请提取为 JSON：
{
  "instruction": "Directions 段英文原文",
  "title": "文章标题",
  "paragraphs": [{"letter":"A","text":"该段英文原文"}, … 直到最后一段],
  "statements": [{"number":36,"stem":"该陈述英文原文"}, … 到 45]
}

原文：
"""
${text}
"""`
  );
}

export interface McqQuestion {
  number: number;
  stem: string | null;
  options: string[]; // 4 个纯文本，不含 "A." 前缀
}
export interface CarefulPassage {
  title: string | null;
  text: string;
  questions: McqQuestion[];
}
export interface CarefulReadingResult {
  passages: CarefulPassage[];
}
export async function structureCarefulReading(
  text: string
): Promise<CarefulReadingResult> {
  return parse<CarefulReadingResult>(
    `这是 CET-4 阅读 Section C「仔细阅读」的原文，含 2 篇文章（Passage One 题 46–50，Passage Two 题 51–55）。请提取为 JSON：
{
  "passages": [
    {
      "title": "标题或 null",
      "text": "篇章英文原文",
      "questions": [
        {"number":46,"stem":"题干英文原文","options":["选项A正文","选项B正文","选项C正文","选项D正文"]},
        … 到 50
      ]
    },
    { "title": …, "text": …, "questions": [ … 51 到 55 ] }
  ]
}
注意：options 是 4 个纯文本，去掉 "A." "B." 这类字母前缀，按 A、B、C、D 顺序排列。

原文：
"""
${text}
"""`
  );
}

export interface ListeningResult {
  questions: McqQuestion[];
}
export async function structureListening(text: string): Promise<ListeningResult> {
  return parse<ListeningResult>(
    `这是 CET-4 听力的一个 Section 原文。题目本身通过录音播放，试卷上只印选项。请提取为 JSON：
{
  "questions": [
    {"number":1,"stem":null,"options":["选项A正文","选项B正文","选项C正文","选项D正文"]},
    … 该 Section 内全部题号
  ]
}
options 去掉字母前缀，按 A、B、C、D 顺序。stem 一律为 null。

原文：
"""
${text}
"""`
  );
}

export interface WritingResult {
  instruction: string;
  prompt: string;
}
export async function structureWriting(text: string): Promise<WritingResult> {
  return parse<WritingResult>(
    `这是 CET-4 写作部分原文。请提取为 JSON：
{ "instruction": "Directions 段英文原文", "prompt": "写作任务的英文要求正文" }

原文：
"""
${text}
"""`
  );
}

export interface TranslationResult {
  instruction: string;
  passage: string;
}
// 翻译结构简单（Directions + 一段中文），本地解析即可——避开中文段导致的 JSON 解析问题。
export function structureTranslation(text: string): TranslationResult {
  const body = text.replace(/^Part\s+IV[^\n]*\n/i, "").trim();
  const lines = body.split("\n");
  const firstCjk = lines.findIndex((l) => /[一-鿿]/.test(l));
  if (firstCjk === -1) return { instruction: body, passage: "" };
  const instruction = lines.slice(0, firstCjk).join(" ").replace(/\s+/g, " ").trim();
  const passage = lines
    .slice(firstCjk)
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return { instruction, passage };
}

export interface AnswerKeyResult {
  answers: Record<string, string>; // "1":"D" … "55":"C"
  tags: Record<string, string>; // 题号→题型/考点
  writingSample: string | null;
  translationSample: string | null;
}
export async function parseAnswerKey(answerText: string): Promise<AnswerKeyResult> {
  return chatJson<AnswerKeyResult>({
    messages: [
      { role: "system", content: PARSER_SYSTEM },
      {
        role: "user",
        content: `这是某套 CET-4 真题的「答案与详解」原文。请提取为 JSON：
{
  "answers": { "1":"正确选项字母", … 直到该卷最后一题（通常 55） },
  "tags": { "题号":"该题题型或考点（如 事实细节题/推理判断题/主旨题/词义题 等，用解析里出现的中文标签）" },
  "writingSample": "参考范文全文（英文），没有则 null",
  "translationSample": "参考译文全文（英文），没有则 null"
}
只提取确实出现的题号。listening/选词填空/匹配/仔细阅读的答案都用字母。

原文：
"""
${answerText}
"""`,
      },
    ],
    temperature: 0.1,
    maxTokens: 8000,
  });
}
