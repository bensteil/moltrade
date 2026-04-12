import type { NextRequest } from 'next/server'
import { getLeaderboard } from '@/lib/leaderboard/metrics'

export async function GET(request: NextRequest) {
  const VALID_SORT_BY = ['totalReturn', 'sharpe', 'trades'] as const
  const sortByParam = request.nextUrl.searchParams.get('sortBy') ?? 'totalReturn'
  if (!VALID_SORT_BY.includes(sortByParam as typeof VALID_SORT_BY[number])) {
    return Response.json({ error: `sortBy must be one of: ${VALID_SORT_BY.join(', ')}` }, { status: 400 })
  }
  const sortBy = sortByParam
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get('limit')) || 50, 1), 100)

  try {
    const leaderboard = await getLeaderboard(sortBy, limit)
    return Response.json(leaderboard)
  } catch (error) {
    return Response.json({ error: 'Failed to fetch leaderboard' }, { status: 500 })
  }
}
