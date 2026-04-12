import type { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { calculatePortfolioValue } from '@/lib/leaderboard/metrics'

export async function GET(request: NextRequest) {
  const agent = await authenticateRequest(request)
  if (!agent) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const portfolio = await calculatePortfolioValue(agent.id)
    return Response.json(portfolio)
  } catch (error) {
    return Response.json({ error: 'Failed to fetch portfolio' }, { status: 500 })
  }
}
