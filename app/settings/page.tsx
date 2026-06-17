"use client";

import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { apiGet, apiSend } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Loader2, Save, RefreshCw, Eye, EyeOff, Check, Search, X } from "lucide-react";

type Settings = {
  apiKeyMasked: string | null;
  apiKeySource: "db" | "env" | "none";
  modelText: string;
};

type ModelItem = {
  id: string;
  display_name?: string;
  owned_by?: string;
  output_modalities?: string[];
};

function isTextModel(m: ModelItem): boolean {
  const out = new Set(m.output_modalities ?? []);
  if (out.size === 0) return true; // 未知按文本处理
  return out.has("text");
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [modelText, setModelText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [models, setModels] = useState<ModelItem[] | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsErr, setModelsErr] = useState<string | null>(null);

  const load = async () => {
    const s = await apiGet<Settings>("/api/settings");
    setSettings(s);
    setModelText(s.modelText);
  };
  useEffect(() => {
    load();
  }, []);

  const refreshModels = async () => {
    setModelsLoading(true);
    setModelsErr(null);
    try {
      const r = await apiGet<{ models: ModelItem[] }>("/api/zenmux/models");
      setModels(r.models.filter(isTextModel));
    } catch (e: any) {
      setModelsErr(e.message);
    } finally {
      setModelsLoading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setErr(null);
    try {
      const payload: Record<string, string> = { modelText };
      if (apiKey.trim()) payload.apiKey = apiKey.trim();
      const fresh = await apiSend<Settings>("/api/settings", "PUT", payload);
      setSettings(fresh);
      setApiKey("");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const clearKey = async () => {
    if (!confirm("确定清除数据库里保存的 API Key？")) return;
    setSaving(true);
    try {
      const fresh = await apiSend<Settings>("/api/settings", "PUT", { apiKey: null });
      setSettings(fresh);
    } finally {
      setSaving(false);
    }
  };

  const sourceLabel =
    settings?.apiKeySource === "db"
      ? "数据库"
      : settings?.apiKeySource === "env"
        ? ".env"
        : "未配置";

  return (
    <AppShell>
      <div className="p-8 max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold mb-1">设置</h1>
        <p className="text-sm text-muted-foreground mb-6">
          配置 ZenMux API Key 与文本模型。出题、批改、报告都走这个模型。
        </p>

        <section className="bg-card border border-border rounded-lg p-5 mb-5">
          <h2 className="font-medium mb-3">API Key</h2>
          {settings && (
            <div className="text-xs text-muted-foreground mb-3">
              当前生效：
              {settings.apiKeyMasked ? (
                <>
                  <code className="bg-muted px-1.5 py-0.5 rounded ml-1">
                    {settings.apiKeyMasked}
                  </code>
                  <span className="ml-2 text-muted-foreground/70">
                    来源：{sourceLabel}
                  </span>
                </>
              ) : (
                <span className="text-destructive ml-1">未配置</span>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ai-v1-..."
                className="w-full px-3 py-2 pr-10 border border-border rounded text-sm focus:outline-none focus:border-primary font-mono bg-background"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {settings?.apiKeySource === "db" && (
              <button
                onClick={clearKey}
                className="px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded border border-border"
              >
                清除
              </button>
            )}
          </div>
        </section>

        <section className="bg-card border border-border rounded-lg p-5 mb-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium">文本模型</h2>
            <button
              onClick={refreshModels}
              disabled={modelsLoading}
              className="text-sm text-primary hover:underline disabled:opacity-50 flex items-center gap-1"
            >
              {modelsLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {models ? "重新获取" : "获取可用模型"}
            </button>
          </div>
          {modelsErr && (
            <div className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2 mb-3">
              {modelsErr}
            </div>
          )}
          <ModelPicker value={modelText} onChange={setModelText} suggestions={models} />
          <p className="text-xs text-muted-foreground mt-2">
            推荐 <code className="font-mono">anthropic/claude-sonnet-4.6</code>。
          </p>
        </section>

        {err && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded px-3 py-2 mb-3">
            {err}
          </div>
        )}
        <button
          onClick={save}
          disabled={saving}
          className="bg-primary text-primary-foreground px-5 py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-2"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saved ? (
            <Check className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saved ? "已保存" : "保存设置"}
        </button>
      </div>
    </AppShell>
  );
}

function ModelPicker({
  value,
  onChange,
  suggestions,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: ModelItem[] | null;
}) {
  const [showList, setShowList] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  const filtered = (() => {
    if (!suggestions) return [];
    const q = query.trim().toLowerCase();
    if (!q) return suggestions;
    return suggestions.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        (m.owned_by ?? "").toLowerCase().includes(q)
    );
  })();

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="anthropic/claude-sonnet-4.6"
          className="flex-1 px-3 py-2 border border-border rounded text-sm font-mono focus:outline-none focus:border-primary bg-background"
        />
        {suggestions && (
          <button
            type="button"
            onClick={() => {
              setShowList((v) => !v);
              setTimeout(() => searchRef.current?.focus(), 0);
            }}
            className="px-3 py-2 text-sm text-primary hover:bg-muted rounded border border-border whitespace-nowrap"
          >
            {showList ? "收起" : `从 ${suggestions.length} 个里选`}
          </button>
        )}
      </div>
      {showList && suggestions && (
        <div className="mt-2 border border-border rounded bg-card shadow-sm">
          <div className="relative border-b border-border">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filtered.length === 1) {
                  onChange(filtered[0].id);
                  setShowList(false);
                } else if (e.key === "Escape") setShowList(false);
              }}
              placeholder="搜索模型 id…"
              className="w-full pl-9 pr-9 py-2 text-xs focus:outline-none bg-transparent"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="max-h-56 overflow-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-sm text-muted-foreground text-center">
                无匹配
              </div>
            ) : (
              filtered.map((m) => {
                const selected = m.id === value;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      onChange(m.id);
                      setShowList(false);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-sm hover:bg-muted flex items-center justify-between gap-3",
                      selected && "bg-accent"
                    )}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {selected && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                      <code className="font-mono text-xs truncate">{m.id}</code>
                    </span>
                    {m.owned_by && (
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">
                        {m.owned_by}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
