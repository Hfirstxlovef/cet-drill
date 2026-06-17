import { CET_SKILL_BASE } from "./skill";
import type { ChatMessage } from "../../zenmux";

export type SubjKind = "essay" | "translation";

export interface GradeInput {
  prompt: string; // 写作题目 / 翻译中文段
  reference?: string | null; // 参考范文 / 标准译文
  userAnswer: string;
}

export interface SubjFeedback {
  band: number; // 0–15 档次分（折算 710：band × 7.1）
  scoreText: string;
  dimensions: { name: string; score: string; comment: string }[];
  problems: string[];
  improved: string;
  expressions: string[];
}

const SCHEMA_HINT = `请输出 JSON（只输出 JSON）：
{
  "band": 13,
  "scoreText": "估分与等级（如 13/15，中上）",
  "dimensions": [ {"name":"维度名","score":"评分/星级","comment":"简评"} ],
  "problems": ["主要问题，逐条"],
  "improved": "高分版全文",
  "expressions": ["可复用的地道表达，逐条"]
}
其中 band 是 0–15 的数字档次分（与 scoreText 的分子一致），用于折算总分。`;

export function buildGradeMessages(kind: SubjKind, input: GradeInput): ChatMessage[] {
  if (kind === "translation") {
    return [
      {
        role: "system",
        content:
          CET_SKILL_BASE +
          "\n你现在是四级翻译批改老师，按 CET-4 翻译评分维度严谨批改，给出可操作的修改。",
      },
      {
        role: "user",
        content: `【中文原文】
${input.prompt}

${input.reference ? `【参考译文】\n${input.reference}\n\n` : ""}【考生译文】
${input.userAnswer || "(未作答)"}

请从 信息完整度、意思准确性、语法、自然地道、中式英语 维度批改：dimensions 用这些维度；problems 写主要误译/漏译/中式英语问题；improved 给一版高分译文；expressions 给可复用表达。
${SCHEMA_HINT}`,
      },
    ];
  }
  return [
    {
      role: "system",
      content:
        CET_SKILL_BASE +
        "\n你现在是四级写作批改老师，按 CET-4 作文评分维度严谨批改，给出可操作的修改。",
    },
    {
      role: "user",
      content: `【写作题目】
${input.prompt}

${input.reference ? `【参考范文】\n${input.reference}\n\n` : ""}【考生作文】
${input.userAnswer || "(未作答)"}

请从 内容切题度、结构完整度、逻辑连贯性、语法准确性、词汇丰富度、句式多样性、语言自然度、模板痕迹 维度评分：dimensions 用这些维度；problems 写主要问题；improved 给高分改写版；expressions 给可复用表达。
${SCHEMA_HINT}`,
    },
  ];
}
