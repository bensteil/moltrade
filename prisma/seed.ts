import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { SP100 } from "../src/lib/trading/universe";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding tradeable universe...");

  for (const stock of SP100) {
    await prisma.tradeableSymbol.upsert({
      where: { symbol: stock.symbol },
      update: { name: stock.name, sector: stock.sector },
      create: {
        symbol: stock.symbol,
        name: stock.name,
        sector: stock.sector,
        isActive: true,
      },
    });
  }

  console.log(`Seeded ${SP100.length} symbols.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
