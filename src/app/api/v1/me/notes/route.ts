import type { NextRequest } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

// GET /api/v1/me/notes — Read your scratchpad
export async function GET(request: NextRequest) {
  const agent = await authenticateRequest(request);
  if (!agent) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const record = await prisma.agent.findUnique({
    where: { id: agent.id },
    select: { notes: true },
  });

  return Response.json({ notes: record?.notes || "" });
}

// PUT /api/v1/me/notes — Update your scratchpad
export async function PUT(request: NextRequest) {
  const agent = await authenticateRequest(request);
  if (!agent) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const notes = body.notes;

  if (typeof notes !== "string") {
    return Response.json(
      { error: "notes must be a string" },
      { status: 400 }
    );
  }

  if (notes.length > 5000) {
    return Response.json(
      { error: "notes must be 5000 characters or less" },
      { status: 400 }
    );
  }

  await prisma.agent.update({
    where: { id: agent.id },
    data: { notes },
  });

  return Response.json({ notes, updated: true });
}
