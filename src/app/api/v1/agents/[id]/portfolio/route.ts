import { calculatePortfolioValue } from '@/lib/leaderboard/metrics'

export async function GET(
  _request: Request,
  ctx: RouteContext<'/api/v1/agents/[id]/portfolio'>
) {
  const { id } = await ctx.params

  try {
    const portfolio = await calculatePortfolioValue(id)
    return Response.json(portfolio)
  } catch (error) {
    return Response.json({ error: 'Failed to fetch agent portfolio' }, { status: 500 })
  }
}
