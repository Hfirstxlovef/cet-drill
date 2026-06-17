"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BookText, Library, NotebookPen, Settings, Wand2 } from "lucide-react";

const navItems = [
  { href: "/", label: "题库", icon: Library, match: (p: string) => p === "/" || p.startsWith("/practice") || p.startsWith("/review") },
  { href: "/drill", label: "AI 练习", icon: Wand2, match: (p: string) => p.startsWith("/drill") },
  { href: "/errors", label: "错题本", icon: NotebookPen, match: (p: string) => p.startsWith("/errors") },
  { href: "/vocab", label: "生词本", icon: BookText, match: (p: string) => p.startsWith("/vocab") },
  { href: "/settings", label: "设置", icon: Settings, match: (p: string) => p.startsWith("/settings") },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex h-screen bg-background">
      <aside className="w-52 bg-muted/40 border-r border-border flex flex-col">
        <div className="px-4 py-4 border-b border-border">
          <div className="font-semibold text-foreground leading-tight">
            CET 试题对练
          </div>
          <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">
            真题 + AI 仿真 · 行内作答 · AI 批改
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-foreground/80 hover:bg-muted"
                )}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 text-[11px] text-muted-foreground border-t border-border">
          四级 CET-4 · 本地练习
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
