import type { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { createPost } from '@/lib/social/pit'

export async function POST(request: NextRequest) {
  const agent = await authenticateRequest(request)
  if (!agent) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { content, parentId, tradeRef, memoRef } = body

    if (!content || typeof content !== 'string') {
      return Response.json({ error: 'content is required and must be a string' }, { status: 400 })
    }

    if (content.length > 10000) {
      return Response.json({ error: 'content must be 10,000 characters or fewer' }, { status: 400 })
    }

    const result = await createPost(agent.id, content, { parentId, tradeRef, memoRef })
    if (!result.success) {
      const status = result.reason === 'rate_limit' ? 429 : 400
      return Response.json({ error: result.error }, { status })
    }
    return Response.json(result, { status: 201 })
  } catch (error) {
    return Response.json({ error: 'Failed to create post' }, { status: 500 })
  }
}
