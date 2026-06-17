"use client";

import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { apiGet, apiSend } from "@/lib/api";
import { Loader2, Volume2, Trash2, BookText } from "lucide-react";

type Vocab = {
  id: string;
  word: string;
  context: string | null;
  definition: string | null;
  createdAt: string;
};

function speak(word: string) {
  try {
    const u = new SpeechSynthesisUtterance(word);
    u.lang = "en-US";
    u.rate = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  } catch {}
}

export default function VocabPage() {
  const [items, setItems] = useState<Vocab[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiGet<{ items: Vocab[] }>("/api/cet/vocab");
      setItems(r.items);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const del = async (id: string) => {
    await apiSend(`/api/cet/vocab?id=${id}`, "DELETE");
    setItems((xs) => xs.filter((x) => x.id !== id));
  };

  return (
    <AppShell>
      <div className="p-8 max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold mb-1">生词本</h1>
        <p className="text-sm text-muted-foreground mb-6">
          做题时在阅读器里点单词即可查词并收藏到这里。
        </p>
        {loading ? (
          <div className="text-sm text-muted-foreground py-12 text-center">
            <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> 加载中…
          </div>
        ) : items.length === 0 ? (
          <div className="text-sm text-muted-foreground py-16 text-center border border-dashed border-border rounded-lg">
            <BookText className="w-8 h-8 mx-auto mb-3 opacity-40" />
            还没有生词。去练习页点单词试试。
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((v) => (
              <div key={v.id} className="flex items-start gap-3 p-3 border border-border rounded-lg bg-card">
                <button
                  onClick={() => speak(v.word)}
                  className="mt-0.5 p-1 text-muted-foreground hover:text-primary"
                  title="发音"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="font-serif font-medium">{v.word}</div>
                  {v.definition && (
                    <div className="text-sm text-foreground/90 mt-0.5">{v.definition}</div>
                  )}
                  {v.context && (
                    <div className="text-xs text-muted-foreground mt-1 italic line-clamp-2">
                      {v.context}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => del(v.id)}
                  className="p-1 text-muted-foreground hover:text-destructive"
                  title="删除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
