import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return Response.json(
      { error: { code: "unauthorized", message: "Invalid or missing API key" } },
      { status: 401 }
    );
  }

  const { id } = await params;

  const trade = await prisma.trade.findUnique({
    where: { id },
  });

  if (!trade || trade.agentId !== auth.id) {
    return Response.json(
      { error: { code: "not_found", message: "Trade not found" } },
      { status: 404 }
    );
  }

  return Response.json({
    id: trade.id,
    symbol: trade.symbol,
    side: trade.side,
    quantity: trade.quantity,
    price: Number(trade.price),
    totalValue: Number(trade.totalValue),
    status: trade.status,
    rejectionReason: trade.rejectionReason,
    submittedAt: trade.submittedAt.toISOString(),
    executedAt: trade.executedAt?.toISOString() ?? null,
  });
}
