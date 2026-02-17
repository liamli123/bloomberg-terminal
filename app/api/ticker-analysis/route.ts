import { analyzeTicker } from "@/lib/ticker-analysis";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = (searchParams.get("ticker") || "").trim().toUpperCase();
    const includeNews =
      searchParams.get("includeNews") === "1" || searchParams.get("includeNews") === "true";
    const force = searchParams.get("force") === "1" || searchParams.get("force") === "true";

    if (!ticker) {
      return NextResponse.json({ error: "Missing ticker query param" }, { status: 400 });
    }

    const analysis = await analyzeTicker(ticker, { includeNews, force });
    return NextResponse.json(analysis);
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to run ticker analysis",
        details: String(error),
      },
      { status: 500 }
    );
  }
}
