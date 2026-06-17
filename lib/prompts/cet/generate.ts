import { chatJson } from "../../zenmux";
import { CET_SKILL_BASE } from "./skill";

// M2 出题：以 CET 辅导大脑为系统提示，按题型生成**全新原创题**（禁止照抄真题），
// 输出形状对齐 scripts/ingest/structure.ts，便于直接落库复用阅读器/判分。
export type Difficulty = "easy" | "medium" | "hard";
const DIFF_CN: Record<Difficulty, string> = { easy: "略低于四级", medium: "贴近四级真题", hard: "略高于四级（拔高）" };

const GEN_SYSTEM =
  CET_SKILL_BASE +
  `\n你现在是四级命题老师，按要求产出**原创**题目（绝不照抄、改写任何真题原文）。题目须地道、自洽、答案唯一可判，干扰项符合四级常见干扰类型。只输出符合要求的 JSON 对象，不要任何解释文字。`;

async function gen<T>(user: string): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < 2; i++) {
    try {
      return await chatJson<T>({
        messages: [
          { role: "system", content: GEN_SYSTEM },
          { role: "user", content: user },
        ],
        temperature: i === 0 ? 0.8 : 0.95, // 出题要多样，温度偏高；失败再升一档重试
        maxTokens: 4000,
      });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

export interface GenMcq {
  stem: string;
  options: string[]; // 4 个纯文本，无字母前缀
  correct: string; // A/B/C/D
  knowledgeTag: string; // 题型/考点
}
export interface GenCareful {
  title: string;
  passage: string;
  questions: GenMcq[];
}
export function generateCareful(opts: { difficulty: Difficulty; tagFocus?: string[]; topic?: string }): Promise<GenCareful> {
  const focus = opts.tagFocus?.length ? `本组题重点考查这些考点/题型：${opts.tagFocus.join("、")}。` : "题型覆盖主旨、细节、推理、词义、态度等常见类型。";
  return gen<GenCareful>(
    `出一篇四级「仔细阅读」原创短文 + 5 道四选一题。难度：${DIFF_CN[opts.difficulty]}。${opts.topic ? `话题围绕：${opts.topic}。` : ""}${focus}
输出 JSON：
{
  "title": "短文标题",
  "passage": "260–350 词的英文短文（原创）",
  "questions": [ {"stem":"题干","options":["A正文","B正文","C正文","D正文"],"correct":"A","knowledgeTag":"题型/考点(中文)"} , … 共 5 题 ]
}`
  );
}

export interface GenBanked {
  instruction: string;
  passage: string; // 含 [1]…[10]
  wordBank: { letter: string; word: string }[]; // 15 项 A–O
  answers: Record<string, string>; // "1".."10" → 字母
}
export function generateBanked(opts: { difficulty: Difficulty; topic?: string }): Promise<GenBanked> {
  return gen<GenBanked>(
    `出一篇四级「选词填空」原创题。难度：${DIFF_CN[opts.difficulty]}。${opts.topic ? `话题：${opts.topic}。` : ""}
输出 JSON：
{
  "instruction": "Directions 英文",
  "passage": "英文篇章，10 个空原位写成 [1] [2] … [10]",
  "wordBank": [{"letter":"A","word":"..."}, … 共 15 项 A–O（含 5 个干扰词）],
  "answers": {"1":"对应字母", … "10":"字母"}
}`
  );
}

export interface GenMatching {
  instruction: string;
  title: string;
  paragraphs: { letter: string; text: string }[];
  statements: { stem: string; correct: string }[]; // correct = 段落字母
}
export function generateMatching(opts: { difficulty: Difficulty; topic?: string }): Promise<GenMatching> {
  return gen<GenMatching>(
    `出一篇四级「信息匹配（长篇阅读）」原创题。难度：${DIFF_CN[opts.difficulty]}。${opts.topic ? `话题：${opts.topic}。` : ""}
输出 JSON：
{
  "instruction": "Directions 英文",
  "title": "文章标题",
  "paragraphs": [{"letter":"A","text":"段落英文"}, … 8–10 段],
  "statements": [{"stem":"陈述句英文","correct":"对应段落字母"}, … 10 条]
}`
  );
}

export interface GenEssay {
  instruction: string;
  prompt: string;
  referenceText: string;
}
export function generateEssay(opts: { difficulty: Difficulty; topic?: string }): Promise<GenEssay> {
  return gen<GenEssay>(
    `出一道四级「写作」原创题 + 高分范文。难度：${DIFF_CN[opts.difficulty]}。${opts.topic ? `话题：${opts.topic}。` : ""}
输出 JSON：
{ "instruction": "Directions 英文（含建议词数 120–180）", "prompt": "写作任务英文要求", "referenceText": "一篇高分参考范文（英文，120–180 词）" }`
  );
}

export interface GenTranslation {
  instruction: string;
  passage: string; // 中文段
  referenceText: string; // 参考英文译文
}
export function generateTranslation(opts: { difficulty: Difficulty; topic?: string }): Promise<GenTranslation> {
  return gen<GenTranslation>(
    `出一道四级「汉译英」原创题 + 参考译文。难度：${DIFF_CN[opts.difficulty]}。${opts.topic ? `话题：${opts.topic}（贴近四级常考的中国文化/社会/经济）。` : "话题贴近四级常考的中国文化/社会/经济。"}
输出 JSON：
{ "instruction": "Directions 英文", "passage": "一段约 140–160 字的中文原文", "referenceText": "对应的高分参考英文译文" }`
  );
}
