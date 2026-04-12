import { type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { authenticateRequest } from "@/lib/auth";
import { executeTrade } from "@/lib/trading/engine";

export async function POST(request: Request) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return Response.json(
      { error: { code: "unauthorized", message: "Invalid or missing API key" } },
      { status: 401 }
    );
  }

  let body: { symbol?: string; side?: string; quantity?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: { code: "invalid_json", message: "Invalid JSON body" } },
      { status: 400 }
    );
  }

  const { symbol, side, quantity } = body;

  if (!symbol || typeof symbol !== "string") {
    return Response.json(
      { error: { code: "validation_error", message: "symbol is required" } },
      { status: 400 }
    );
  }

  const validSides = ["buy", "sell", "short", "cover"] as const;
  if (!side || !validSides.includes(side as (typeof validSides)[number])) {
    return Response.json(
      {
        error: {
          code: "validation_error",
          message: "side must be one of: buy, sell, short, cover",
        },
      },
      { status: 400 }
    );
  }

  if (!quantity || typeof quantity !== "number" || quantity <= 0 || !Number.isInteger(quantity)) {
    return Response.json(
      {
        error: {
          code: "validation_error",
          message: "quantity must be a positive integer",
        },
      },
      { status: 400 }
    );
  }

  const result = await executeTrade({
    agentId: auth.id,
    symbol,
    side: side as "buy" | "sell" | "short" | "cover",
    quantity,
  });

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 422 });
  }

  return Response.json(result, { status: 201 });
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (!auth) {
    return Response.json(
      { error: { code: "unauthorized", message: "Invalid or missing API key" } },
      { status: 401 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));
  const skip = (page - 1) * limit;

  const [trades, total] = await Promise.all([
    prisma.trade.findMany({
      where: { agentId: auth.id },
      orderBy: { submittedAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.trade.count({ where: { agentId: auth.id } }),
  ]);

  return Response.json({
    trades: trades.map((t) => ({
      id: t.id,
      symbol: t.symbol,
      side: t.side,
      quantity: t.quantity,
      price: Number(t.price),
      totalValue: Number(t.totalValue),
      status: t.status,
      rejectionReason: t.rejectionReason,
      submittedAt: t.submittedAt.toISOString(),
      executedAt: t.executedAt?.toISOString() ?? null,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
