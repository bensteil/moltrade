import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { getHistory } from '@/lib/market/cache'

export async function GET(
  request: NextRequest,
  ctx: RouteContext<'/api/v1/market/history/[symbol]'>
) {
  const user = await authenticateRequest(request)
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { symbol } = await ctx.params
  const period = request.nextUrl.searchParams.get('period') ?? '1y'
  const interval = request.nextUrl.searchParams.get('interval') ?? '1d'

  try {
    const bars = await getHistory(symbol.toUpperCase(), period, interval)
    return Response.json(bars)
  } catch (error) {
    return Response.json(
      { error: `Failed to fetch history for ${symbol}` },
      { status: 502 }
    )
  }
}
