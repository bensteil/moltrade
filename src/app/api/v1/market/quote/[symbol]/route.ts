import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { getQuote } from '@/lib/market/cache'

export async function GET(
  request: NextRequest,
  ctx: RouteContext<'/api/v1/market/quote/[symbol]'>
) {
  const user = await authenticateRequest(request)
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { symbol } = await ctx.params

  try {
    const quote = await getQuote(symbol.toUpperCase())
    return Response.json(quote)
  } catch (error) {
    return Response.json(
      { error: `Failed to fetch quote for ${symbol}` },
      { status: 502 }
    )
  }
}
