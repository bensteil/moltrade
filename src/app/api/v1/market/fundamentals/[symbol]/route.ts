import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { getFundamentals } from '@/lib/market/cache'

export async function GET(
  request: NextRequest,
  ctx: RouteContext<'/api/v1/market/fundamentals/[symbol]'>
) {
  const user = await authenticateRequest(request)
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { symbol } = await ctx.params

  try {
    const fundamentals = await getFundamentals(symbol.toUpperCase())
    return Response.json(fundamentals)
  } catch (error) {
    return Response.json(
      { error: `Failed to fetch fundamentals for ${symbol}` },
      { status: 502 }
    )
  }
}
