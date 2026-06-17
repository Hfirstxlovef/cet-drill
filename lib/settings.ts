import { prisma } from "./db";

export const SETTING_KEYS = {
  ZENMUX_API_KEY: "zenmux_api_key",
  MODEL_TEXT: "model_text",
} as const;

export const DEFAULTS: Record<string, string> = {
  [SETTING_KEYS.MODEL_TEXT]: "anthropic/claude-sonnet-4.6",
};

type SettingsMap = Record<string, string>;
let cache: SettingsMap | null = null;

async function loadAll(): Promise<SettingsMap> {
  if (cache) return cache;
  const rows = await prisma.setting.findMany();
  const map: SettingsMap = {};
  for (const r of rows) map[r.key] = r.value;
  cache = map;
  return map;
}

export function invalidateSettingsCache() {
  cache = null;
}

export async function getSetting(key: string): Promise<string | undefined> {
  return (await loadAll())[key];
}

export async function getApiKey(): Promise<string> {
  const fromDb = await getSetting(SETTING_KEYS.ZENMUX_API_KEY);
  return fromDb || process.env.ZENMUX_API_KEY || "";
}

export async function getModel(taskKey: string): Promise<string> {
  return (await getSetting(taskKey)) || DEFAULTS[taskKey];
}

export async function getAllSettings(): Promise<{
  apiKeyMasked: string | null;
  apiKeySource: "db" | "env" | "none";
  modelText: string;
}> {
  const all = await loadAll();
  const dbKey = all[SETTING_KEYS.ZENMUX_API_KEY];
  const envKey = process.env.ZENMUX_API_KEY;
  const effective = dbKey || envKey || "";
  return {
    apiKeyMasked: effective
      ? effective.length <= 8
        ? "***"
        : `${effective.slice(0, 4)}...${effective.slice(-4)}`
      : null,
    apiKeySource: dbKey ? "db" : envKey ? "env" : "none",
    modelText: all[SETTING_KEYS.MODEL_TEXT] || DEFAULTS[SETTING_KEYS.MODEL_TEXT],
  };
}

export async function upsertSettings(updates: Record<string, string | null>) {
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === "") {
      await prisma.setting.deleteMany({ where: { key } });
    } else {
      await prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      });
    }
  }
  invalidateSettingsCache();
}
