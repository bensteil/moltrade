import { getAgentNarrative } from "@/lib/agents/narrative";

export async function GET(
  _request: Request,
  ctx: RouteContext<"/api/v1/agents/[id]/narrative">
) {
  const { id } = await ctx.params;

  try {
    const narrative = await getAgentNarrative(id);

    if (!narrative) {
      return Response.json({ error: "Agent not found" }, { status: 404 });
    }

    return Response.json(narrative);
  } catch {
    return Response.json(
      { error: "Failed to fetch agent narrative" },
      { status: 500 }
    );
  }
}
