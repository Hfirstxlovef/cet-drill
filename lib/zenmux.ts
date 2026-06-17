import OpenAI from "openai";
import { getApiKey, getModel, SETTING_KEYS } from "./settings";

async function getClient(): Promise<OpenAI> {
  const apiKey = await getApiKey();
  if (!apiKey) {
    throw new Error(
      "ZenMux API Key 未配置。请到「设置」页面填入 API Key（或在 .env 设置 ZENMUX_API_KEY）。"
    );
  }
  return new OpenAI({
    baseURL: process.env.ZENMUX_BASE_URL || "https://zenmux.ai/api/v1",
    apiKey,
  });
}

export async function getTextModel() {
  return getModel(SETTING_KEYS.MODEL_TEXT);
}

export type ChatRole = "system" | "user" | "assistant";
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export async function chat(opts: {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const client = await getClient();
  const model = opts.model ?? (await getTextModel());
  const res = await client.chat.completions.create({
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens,
  });
  return res.choices[0]?.message?.content ?? "";
}

export async function* chatStream(opts: {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}): AsyncGenerator<string> {
  const client = await getClient();
  const model = opts.model ?? (await getTextModel());
  const stream = await client.chat.completions.create({
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.maxTokens,
    stream: true,
  });
  for await (const chunk of stream) {
    const piece = chunk.choices[0]?.delta?.content;
    if (piece) yield piece;
  }
}

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1].trim();
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    return trimmed.slice(first, last + 1);
  }
  return trimmed;
}

// 尽力修复模型常见的畸形 JSON：字符串值里的「裸双引号」、未转义的换行/制表符、尾随逗号。
// 单次字符扫描，跟踪是否在字符串内：遇到 " 时向后看，若下一个非空白是结构符（, } ] :）或末尾
// 则视为合法收尾，否则当作内容里漏转义的引号并转义掉。对合法 JSON 无副作用（不触发任何改写）。
function repairJson(s: string): string {
  let out = "";
  let inStr = false;
  const isWs = (ch: string | undefined) =>
    ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "\\") {
        // 保留转义序列：原样拷贝反斜杠和它后面的字符
        out += c;
        if (i + 1 < s.length) out += s[++i];
        continue;
      }
      if (c === '"') {
        let j = i + 1;
        while (isWs(s[j])) j++;
        const next = s[j];
        if (next === undefined || next === "," || next === "}" || next === "]" || next === ":") {
          inStr = false; // 合法收尾引号
          out += c;
        } else {
          out += '\\"'; // 字符串内部漏转义的引号 → 补转义
        }
        continue;
      }
      if (c === "\n") { out += "\\n"; continue; }
      if (c === "\r") { out += "\\r"; continue; }
      if (c === "\t") { out += "\\t"; continue; }
      out += c;
      continue;
    }
    if (c === '"') {
      inStr = true;
      out += c;
      continue;
    }
    if (c === ",") {
      // 丢弃 } / ] 前的尾随逗号
      let j = i + 1;
      while (isWs(s[j])) j++;
      if (s[j] === "}" || s[j] === "]") continue;
    }
    out += c;
  }
  return out;
}

export async function chatJson<T = unknown>(opts: {
  model?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<T> {
  const client = await getClient();
  const model = opts.model ?? (await getTextModel());
  const res = await client.chat.completions.create({
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens,
    response_format: { type: "json_object" },
  });
  const raw = res.choices[0]?.message?.content ?? "{}";

  // 依次尝试：原文 → 抽取花括号/去围栏 → 修复畸形。命中即返回，对合法 JSON 第一次就过。
  const extracted = extractJson(raw);
  const attempts = [raw, extracted, repairJson(extracted)];
  let lastErr: unknown;
  for (const cand of attempts) {
    try {
      return JSON.parse(cand) as T;
    } catch (e) {
      lastErr = e;
    }
  }

  // 全部失败：打印模型原始输出便于诊断，再抛出更可读的错误（仍带底层解析信息）。
  console.error(
    `[chatJson] 模型返回无法解析为 JSON（model=${model}）。原始输出：\n${raw}`
  );
  throw new Error(
    `AI 返回的内容不是合法 JSON：${(lastErr as any)?.message ?? String(lastErr)}`
  );
}

export interface ZenMuxModel {
  id: string;
  display_name?: string;
  owned_by?: string;
  input_modalities?: string[];
  output_modalities?: string[];
  context_length?: number;
}

export async function listAvailableModels(): Promise<ZenMuxModel[]> {
  const client = await getClient();
  const res = await client.models.list();
  return res.data.map((m: any) => ({
    id: m.id,
    display_name: m.display_name,
    owned_by: m.owned_by,
    input_modalities: m.input_modalities,
    output_modalities: m.output_modalities,
    context_length: m.context_length,
  }));
}
