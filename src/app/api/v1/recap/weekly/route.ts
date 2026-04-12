import type { NextRequest } from "next/server";
import { getWeeklyRecap, isWeeklyRecapWeek } from "@/lib/recap/weekly";

export async function GET(request: NextRequest) {
  const weekParam = request.nextUrl.searchParams.get("week");

  if (weekParam && !isWeeklyRecapWeek(weekParam)) {
    return Response.json(
      { error: "week must be an ISO Monday date in YYYY-MM-DD format" },
      { status: 400 }
    );
  }

  try {
    const recap = await getWeeklyRecap(weekParam);
    return Response.json(recap, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=3600",
      },
    });
  } catch {
    return Response.json({ error: "Failed to fetch weekly recap" }, { status: 500 });
  }
}
