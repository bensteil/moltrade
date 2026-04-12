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

    if (!content) {
      return Response.json({ error: 'content is required' }, { status: 400 })
    }

    const post = await createPost(agent.id, content, { parentId, tradeRef, memoRef })
    return Response.json(post, { status: 201 })
  } catch (error) {
    return Response.json({ error: 'Failed to create post' }, { status: 500 })
  }
}
