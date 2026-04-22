import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ScanRecordSchema } from "../ingestion/schemas";

export type RouteBaseline = {
  median: number;
  count: number;
};

export function buildRouteKey(origin: string, destination: string): string {
  return `${origin}-${destination}`;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle] ?? 0;
}

export function getBaselines(dataDir: string): Record<string, RouteBaseline> {
  if (!existsSync(dataDir)) {
    return {};
  }

  const pricesByRoute = new Map<string, number[]>();
  const files = readdirSync(dataDir)
    .filter((entry) => entry.endsWith(".json"))
    .sort();

  for (const fileName of files) {
    try {
      const raw = JSON.parse(readFileSync(join(dataDir, fileName), "utf8"));
      const record = ScanRecordSchema.parse(raw);
      for (const result of record.results) {
        if (result.annotation.distortion_flag) {
          continue;
        }
        const price = result.flight.price_economy_eur;
        if (price == null || result.flight.search_error) {
          continue;
        }
        const key = buildRouteKey(result.flight.origin, result.flight.destination);
        const current = pricesByRoute.get(key) ?? [];
        current.push(price);
        pricesByRoute.set(key, current);
      }
    } catch {
      continue;
    }
  }

  return Object.fromEntries(
    [...pricesByRoute.entries()].map(([key, prices]) => [
      key,
      { median: median(prices), count: prices.length }
    ])
  );
}
