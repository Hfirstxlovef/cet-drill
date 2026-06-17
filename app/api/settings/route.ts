import { NextRequest, NextResponse } from "next/server";
import { getAllSettings, upsertSettings, SETTING_KEYS } from "@/lib/settings";

export async function GET() {
  return NextResponse.json(await getAllSettings());
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const updates: Record<string, string | null> = {};
  if ("apiKey" in body) updates[SETTING_KEYS.ZENMUX_API_KEY] = body.apiKey;
  if ("modelText" in body) updates[SETTING_KEYS.MODEL_TEXT] = body.modelText;
  await upsertSettings(updates);
  return NextResponse.json(await getAllSettings());
}
