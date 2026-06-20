import { NextResponse } from "next/server";
import { resolveIntent } from "@/lib/intent";

export async function POST(request: Request) {
  let payload: { intent?: unknown } = {};

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(resolveIntent(undefined));
  }

  return NextResponse.json(resolveIntent(payload.intent));
}
