import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { getBatchQuotes } from '@/lib/market/cache'

const MAX_SYMBOLS = 20

export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request)
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const raw = request.nextUrl.searchParams.get('symbols')
  if (!raw) {
    return Response.json(
      { error: 'Missing required query parameter: symbols' },
      { status: 400 }
    )
  }

  const symbols = raw
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)

  if (symbols.length === 0) {
    return Response.json(
      { error: 'No valid symbols provided' },
      { status: 400 }
    )
  }

  if (symbols.length > MAX_SYMBOLS) {
    return Response.json(
      { error: `Too many symbols. Maximum is ${MAX_SYMBOLS}` },
      { status: 400 }
    )
  }

  try {
    const quotes = await getBatchQuotes(symbols)
    return Response.json(quotes)
  } catch (error) {
    return Response.json(
      { error: 'Failed to fetch batch quotes' },
      { status: 502 }
    )
  }
}
