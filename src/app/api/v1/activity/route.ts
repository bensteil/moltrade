import type { NextRequest } from "next/server";
import { getRecentActivity } from "@/lib/activity";

export async function GET(request: NextRequest) {
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? "50");
  const cursor = request.nextUrl.searchParams.get("cursor") ?? undefined;

  try {
    const activity = await getRecentActivity({ limit, cursor });
    return Response.json(activity);
  } catch {
    return Response.json(
      { error: "Failed to fetch activity" },
      { status: 500 }
    );
  }
}
