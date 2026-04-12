import type { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { getAgentPerformance } from '@/lib/leaderboard/metrics'

export async function GET(request: NextRequest) {
  const agent = await authenticateRequest(request)
  if (!agent) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const performance = await getAgentPerformance(agent.id)
    return Response.json(performance)
  } catch (error) {
    return Response.json({ error: 'Failed to fetch performance metrics' }, { status: 500 })
  }
}
