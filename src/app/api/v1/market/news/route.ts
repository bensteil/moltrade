import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { getNews } from '@/lib/market/cache'

export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request)
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const q = request.nextUrl.searchParams.get('q') ?? undefined
  const rawSymbols = request.nextUrl.searchParams.get('symbols')
  const symbols = rawSymbols
    ? rawSymbols
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    : undefined

  try {
    const news = await getNews(q, symbols)
    return Response.json(news)
  } catch (error) {
    return Response.json(
      { error: 'Failed to fetch news' },
      { status: 502 }
    )
  }
}
