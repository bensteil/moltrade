import { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { getMarketStatus } from '@/lib/market/cache'

export async function GET(request: NextRequest) {
  const user = await authenticateRequest(request)
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const status = await getMarketStatus()
    return Response.json(status)
  } catch (error) {
    return Response.json(
      { error: 'Failed to fetch market status' },
      { status: 502 }
    )
  }
}
