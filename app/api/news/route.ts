import { fetchFinancialNews } from "@/lib/data-service";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query") || "market";

    const news = await fetchFinancialNews(query);
    return NextResponse.json({ feed: news || [] });
  } catch (error) {
    return NextResponse.json({ feed: [], error: String(error) }, { status: 200 });
  }
}
