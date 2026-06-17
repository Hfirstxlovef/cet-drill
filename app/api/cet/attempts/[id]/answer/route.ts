import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// 单题作答的 autosave：upsert AttemptItem
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { questionId, userAnswer } = await req.json();
  if (!questionId) {
    return NextResponse.json({ error: "questionId required" }, { status: 400 });
  }
  // 交卷后即不可变：拒绝一切作答写入。交卷态的 paper DTO 会下发正确答案（用于解析展示），
  // 这道服务端守卫确保任何客户端（含旧/异常构建）都无法把答案键回写成 userAnswer 污染成绩。
  const attempt = await prisma.attempt.findUnique({
    where: { id: params.id },
    select: { submittedAt: true },
  });
  if (!attempt) {
    return NextResponse.json({ error: "attempt not found" }, { status: 404 });
  }
  if (attempt.submittedAt) {
    return NextResponse.json({ error: "attempt already submitted" }, { status: 409 });
  }
  await prisma.attemptItem.upsert({
    where: { attemptId_questionId: { attemptId: params.id, questionId } },
    update: { userAnswer },
    create: { attemptId: params.id, questionId, userAnswer },
  });
  return NextResponse.json({ ok: true });
}
