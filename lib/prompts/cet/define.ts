import type { ChatMessage } from "../../zenmux";

export function buildDefineMessages(word: string, context?: string): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "你是简明英汉词典。给出英文单词的国际音标(IPA)、词性与简明中文释义。只输出 JSON，不要多余文字。",
    },
    {
      role: "user",
      content: `单词：${word}
${context ? `出现的句子：${context}\n` : ""}请输出 JSON：
{
  "phonetic": "/.../（美式 IPA，带斜杠；不确定可留空字符串）",
  "entries": [
    { "pos": "词性（n./v./adj./adv./prep. 等）", "meaning": "简明中文释义，多个义项用分号分隔" }
  ]
}
entries 给 1–3 个最常见义项；若给了句子，把最贴合该语境的义项排在第一。`,
    },
  ];
}
