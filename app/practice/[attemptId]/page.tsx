import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { toPaperDTO } from "@/lib/cet/serialize";
import { ExamReader } from "@/components/reader/ExamReader";

export const dynamic = "force-dynamic";

export default async function PracticePage({
  params,
}: {
  params: { attemptId: string };
}) {
  const attempt = await prisma.attempt.findUnique({
    where: { id: params.attemptId },
    include: {
      paper: { include: { sections: { include: { questions: true } } } },
      items: true,
    },
  });
  if (!attempt) notFound();

  const submitted = !!attempt.submittedAt;
  const paper = toPaperDTO(attempt.paper, { includeAnswers: submitted });
  const items = attempt.items.map((i) => ({
    questionId: i.questionId,
    userAnswer: i.userAnswer,
    aiFeedback: i.aiFeedbackJson ? JSON.parse(i.aiFeedbackJson) : null,
  }));
  const report = attempt.reportJson ? JSON.parse(attempt.reportJson) : null;

  return (
    <ExamReader
      attemptId={attempt.id}
      initialPaper={paper}
      initialItems={items}
      initialSubmitted={submitted}
      initialReport={report}
    />
  );
}
