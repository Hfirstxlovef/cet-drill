import { AppShell } from "@/components/AppShell";
import { NotebookPen } from "lucide-react";

export default function ErrorsPage() {
  return (
    <AppShell>
      <div className="p-8 max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold mb-1">错题本</h1>
        <p className="text-sm text-muted-foreground mb-6">
          自动汇总历次练习中做错的题目，方便集中复习与重做。
        </p>
        <div className="text-sm text-muted-foreground py-16 text-center border border-dashed border-border rounded-lg">
          <NotebookPen className="w-8 h-8 mx-auto mb-3 opacity-40" />
          错题本开发中，敬请期待。
        </div>
      </div>
    </AppShell>
  );
}
