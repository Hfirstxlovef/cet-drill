"use client";

import { cn } from "@/lib/utils";

export interface CardEntry {
  number: number;
  qid: string;
  letters: string[];
  group: string;
  correct?: string | null;
}

export function AnswerCard({
  entries,
  answers,
  onAnswer,
  submitted,
  onJump,
}: {
  entries: CardEntry[];
  answers: Record<string, string>;
  onAnswer: (qid: string, val: string) => void;
  submitted: boolean;
  onJump?: (qid: string) => void;
}) {
  // 按 group 保序分组
  const groups: { name: string; items: CardEntry[] }[] = [];
  for (const e of entries) {
    let g = groups.find((x) => x.name === e.group);
    if (!g) {
      g = { name: e.group, items: [] };
      groups.push(g);
    }
    g.items.push(e);
  }

  return (
    <div className="text-sm">
      <div className="px-3 py-2 border-b border-border font-medium">答题卡</div>
      <div className="p-3 space-y-4">
        {groups.map((g) => (
          <div key={g.name}>
            <div className="text-[11px] text-muted-foreground mb-1.5">{g.name}</div>
            <div className="space-y-1">
              {g.items.map((e) => {
                const chosen = answers[e.qid] ?? "";
                return (
                  <div key={e.qid} className="flex items-center gap-1.5">
                    <button
                      onClick={() => onJump?.(e.qid)}
                      className="w-6 text-right text-xs text-muted-foreground tabular-nums hover:text-primary"
                      title="跳到该题"
                    >
                      {e.number}
                    </button>
                    <div className="flex flex-wrap gap-1">
                      {e.letters.map((L) => {
                        const isChosen = chosen === L;
                        const isCorrect = submitted && e.correct === L;
                        const isWrong = submitted && isChosen && e.correct !== L;
                        return (
                          <button
                            key={L}
                            disabled={submitted}
                            onClick={() => onAnswer(e.qid, L)}
                            className={cn(
                              "w-5 h-5 rounded-full border text-[10px] grid place-items-center transition-colors",
                              isChosen
                                ? "bg-primary text-primary-foreground border-primary"
                                : "border-muted-foreground/40 hover:border-primary",
                              isCorrect && "bg-ok text-white border-ok",
                              isWrong && "bg-bad text-white border-bad"
                            )}
                          >
                            {L}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
