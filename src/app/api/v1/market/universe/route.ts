import { authenticateRequest } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const user = await authenticateRequest(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const symbols = await prisma.tradeableSymbol.findMany({
    where: { isActive: true },
    select: {
      symbol: true,
      name: true,
      sector: true,
      marketCap: true,
    },
    orderBy: { symbol: "asc" },
  });

  return Response.json({ symbols });
}
