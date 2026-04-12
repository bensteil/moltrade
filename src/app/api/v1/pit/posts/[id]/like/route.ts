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
    const like = await likePost(agent.id, id)
    return Response.json(like, { status: 201 })
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
