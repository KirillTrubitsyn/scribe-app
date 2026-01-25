import { NextResponse } from "next/server";

export async function GET() {
  // TODO: Implement fetching recordings from Supabase
  return NextResponse.json({ recordings: [] });
}

export async function POST(request: Request) {
  // TODO: Implement creating a new recording
  const body = await request.json();
  return NextResponse.json({ success: true, data: body });
}
