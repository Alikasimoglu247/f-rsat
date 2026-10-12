import { Prisma } from "@prisma/client";
type Observation = {
  id?: string;
  price: Prisma.Decimal.Value;
  observedAt: Date | string;
};
export function recentPriceDrops(
  listingId: string,
  observations: Observation[],
  now = new Date(),
) {
  const byTime = new Map<number, Set<string>>();
  for (const p of observations) {
    const time = new Date(p.observedAt).getTime();
    let price: Prisma.Decimal;
    try {
      price = new Prisma.Decimal(p.price);
    } catch {
      continue;
    }
    if (
      !Number.isFinite(time) ||
      time > now.getTime() ||
      !price.isFinite() ||
      price.lte(0)
    )
      continue;
    const values = byTime.get(time) ?? new Set<string>();
    values.add(price.toFixed(2));
    byTime.set(time, values);
  }
  const rows = [...byTime].sort((a, b) => a[0] - b[0]);
  const events: {
    key: string;
    listingId: string;
    previousPrice: string;
    newPrice: string;
    amount: string;
    percentage: string;
    observedAt: Date;
  }[] = [];
  let previous: Prisma.Decimal | null = null;
  for (const [time, values] of rows) {
    // Contradictory simultaneous observations cannot establish a valid previous price.
    if (values.size !== 1) {
      previous = null;
      continue;
    }
    const current = new Prisma.Decimal([...values][0]);
    if (
      previous &&
      current.lt(previous) &&
      time >= now.getTime() - 7 * 86400_000
    ) {
      const amount = previous.minus(current);
      events.push({
        key: `${listingId}:${time}:${previous.toFixed(2)}:${current.toFixed(2)}`,
        listingId,
        previousPrice: previous.toFixed(2),
        newPrice: current.toFixed(2),
        amount: amount.toFixed(2),
        percentage: amount.div(previous).mul(100).toFixed(4),
        observedAt: new Date(time),
      });
    }
    previous = current;
  }
  return events;
}
