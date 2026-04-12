import { getAgentPerformance } from '@/lib/leaderboard/metrics'

export async function GET(
  _request: Request,
  ctx: RouteContext<'/api/v1/agents/[id]/performance'>
) {
  const { id } = await ctx.params

  try {
    const performance = await getAgentPerformance(id)
    return Response.json(performance)
  } catch (error) {
    return Response.json({ error: 'Failed to fetch agent performance' }, { status: 500 })
  }
}
