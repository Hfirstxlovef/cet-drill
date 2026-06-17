// CET 辅导大脑：从 cet-skill-main/SKILL.md 蒸馏出的系统提示基座。
// 用于：能力报告、（后续）出题与批改。默认中文输出。

export const CET_SKILL_BASE = `你是一位资深的大学英语四六级（CET-4 / CET-6）备考辅导专家。
- 默认用**中文**与考生交流，反馈要具体、可操作，避免空话套话。
- 熟悉四级题型与评分：写作、听力、选词填空(26–35)、信息匹配(36–45)、仔细阅读(46–55)、翻译。
- 阅读干扰项常见类型：细节正确但偏离重点、概念偷换、范围过宽/过窄、因果倒置、张冠李戴、态度极性反转、时间/条件错配、过度推断、把例子当结论、把让步当作者立场、关键词复现但逻辑不支撑、合理但非最佳。
- 诊断时优先依据题型/考点标签与错题分布，给出有针对性的提升建议，而非泛泛而谈。`;

export interface ReportInput {
  paperTitle: string;
  scaled?: {
    total: number;
    listening: number;
    reading: number;
    writing: number;
    translation: number;
    pass: number;
  };
  bySection: { label: string; correct: number; total: number }[];
  subjective?: { kind: string; label: string; band: number; status: string }[];
  missed: { number: number | null; tag: string | null; section: string; stem?: string | null }[];
}

export function buildReportMessages(input: ReportInput) {
  const sec = input.bySection
    .map((s) => `- ${s.label}：${s.correct}/${s.total}`)
    .join("\n");

  const subjOf = Object.fromEntries((input.subjective ?? []).map((s) => [s.kind, s]));
  const subjLine = (kind: "writing" | "translation", full: number) => {
    const s = subjOf[kind];
    if (!s || s.status === "blank") return "未作答";
    if (s.status === "error") return "待批改";
    return `${s.band}/15（约 ${Math.round((s.band / 15) * full * 10) / 10}/${full}）`;
  };
  const scaled = input.scaled
    ? `预估总分 ${input.scaled.total} / 710（及格线 ${input.scaled.pass}）
- 听力：${input.scaled.listening} / 248.5
- 阅读：${input.scaled.reading} / 248.5
- 写作：${subjLine("writing", 106.5)}
- 翻译：${subjLine("translation", 106.5)}`
    : "（无）";

  const missed = input.missed
    .slice(0, 30)
    .map((m) => `- 第${m.number ?? "?"}题（${m.section}/${m.tag ?? "未分类"}）${m.stem ? "：" + m.stem.slice(0, 80) : ""}`)
    .join("\n");

  const user = `这是考生刚完成的一套四级真题「${input.paperTitle}」的作答统计（含 AI 批改的写作/翻译），请据此生成能力诊断报告。

## 预估得分（710 分制）
${scaled}

## 客观分项正确率
${sec || "（无）"}

## 做错的题
${missed || "（无错题）"}

请输出 JSON：
{
  "ability": "能力分析：结合分项与预估得分，客观指出考生当前水平与相对强项（150 字内）",
  "weakness": "不足诊断：定位最薄弱的题型/能力点，结合错题类型说明可能的原因（200 字内）",
  "recommendations": ["3–5 条具体、可执行的针对性训练建议，每条一句话，落到题型/技巧/练习量上"]
}
只输出 JSON。`;

  return [
    { role: "system" as const, content: CET_SKILL_BASE },
    { role: "user" as const, content: user },
  ];
}
