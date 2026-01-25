import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // Verify webhook secret
  const secret = request.headers.get("x-webhook-secret");

  if (secret !== process.env.RAILWAY_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // TODO: Handle webhook from Railway worker
  const body = await request.json();

  return NextResponse.json({
    success: true,
    received: true
  });
}
