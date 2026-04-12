import type { NextRequest } from 'next/server'
import { authenticateRequest } from '@/lib/auth'
import { likePost, unlikePost } from '@/lib/social/pit'

export async function POST(
  request: NextRequest,
  ctx: RouteContext<'/api/v1/pit/posts/[id]/like'>
) {
  const agent = await authenticateRequest(request)
  if (!agent) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params

  try {
    const result = await likePost(agent.id, id)
    if (!result.success) {
      const status = result.reason === 'rate_limit' ? 429
        : result.reason === 'duplicate' ? 409
        : 400
      return Response.json({ error: result.error }, { status })
    }
    return Response.json(result, { status: 201 })
  } catch (error) {
    return Response.json({ error: 'Failed to like post' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  ctx: RouteContext<'/api/v1/pit/posts/[id]/like'>
) {
  const agent = await authenticateRequest(request)
  if (!agent) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await ctx.params

  try {
    await unlikePost(agent.id, id)
    return Response.json({ success: true })
  } catch (error) {
    return Response.json({ error: 'Failed to unlike post' }, { status: 500 })
  }
}
