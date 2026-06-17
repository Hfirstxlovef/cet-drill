import { NextResponse } from "next/server";
import { listAvailableModels } from "@/lib/zenmux";

export const runtime = "nodejs";

export async function GET() {
  try {
    const models = await listAvailableModels();
    return NextResponse.json({ models });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? String(e) },
      { status: 500 }
    );
  }
}
