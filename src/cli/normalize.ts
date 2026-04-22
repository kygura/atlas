import { fileURLToPath } from "node:url";
import { HardFiltersSchema, FlightResultsSchema, type FlightResult, type HardFilters } from "../ingestion/schemas";
import { diffDays, fileExists, readJsonFile, resolveRootDir, rootPath, todayIso, writeJsonFile, isIsoDate } from "../utils/common";

type RawAttempt = Record<string, unknown>;

export type NormalizeFailure = {
  index: number;
  reason: string;
};

export type NormalizeResult = {
  results: FlightResult[];
  failures: NormalizeFailure[];
};

function stringValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function numberValue(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

function dateValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    if (isIsoDate(trimmed)) {
      return trimmed;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return undefined;
}

function readNested(record: RawAttempt, path: string[]): unknown {
  let current: unknown = record;
  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function maybeSource(value: unknown): "kiwi" | "lastminute" | undefined {
  if (value === "kiwi" || value === "lastminute") {
    return value;
  }
  return undefined;
}

function buildFlightResult(attempt: RawAttempt, filters: HardFilters, index: number): FlightResult | NormalizeFailure {
  const source = maybeSource(stringValue(attempt.source, attempt.provider));
  const origin = stringValue(attempt.origin, attempt.from, attempt.origin_iata, readNested(attempt, ["route", "origin"]));
  const destination = stringValue(attempt.destination, attempt.to, attempt.destination_iata, attempt.iata, readNested(attempt, ["route", "destination"]));
  const destinationName = stringValue(attempt.destination_name, attempt.destinationName, attempt.city, attempt.name, destination);
  const snapshotDate = dateValue(attempt.snapshot_date) ?? todayIso();
  const travelWindowStart = dateValue(
    attempt.travel_window_start,
    attempt.window_start,
    attempt.departure_date,
    readNested(attempt, ["window", "start"])
  );
  const travelWindowEnd = dateValue(
    attempt.travel_window_end,
    attempt.window_end,
    attempt.return_date,
    readNested(attempt, ["window", "end"]),
    travelWindowStart
  );
  const priceEconomy = numberValue(
    attempt.price_economy_eur,
    attempt.economy_price_eur,
    readNested(attempt, ["price", "economy_eur"]),
    readNested(attempt, ["prices", "economy"]),
    attempt.price
  );
  const priceBusiness = numberValue(
    attempt.price_business_eur,
    attempt.business_price_eur,
    readNested(attempt, ["price", "business_eur"]),
    readNested(attempt, ["prices", "business"])
  );
  const stops = Math.trunc(numberValue(attempt.stops, readNested(attempt, ["route", "stops"])) ?? 0);
  const bestLayover = stringValue(
    attempt.best_layover,
    Array.isArray(attempt.layovers) ? attempt.layovers[0] : undefined,
    readNested(attempt, ["route", "best_layover"])
  ) ?? null;
  const travelTimeHours = numberValue(
    attempt.travel_time_hours,
    attempt.duration_hours,
    readNested(attempt, ["travel_time", "hours"]),
    readNested(attempt, ["route", "travel_time_hours"])
  );
  const bookingUrl = stringValue(
    attempt.booking_url,
    attempt.deep_link,
    attempt.url,
    readNested(attempt, ["booking", "url"])
  ) ?? null;
  const searchError = stringValue(attempt.search_error, attempt.error, attempt.failure_reason) ?? null;

  if (!source || !origin || !destination || !destinationName || !travelWindowStart || !travelWindowEnd || travelTimeHours == null) {
    return { index, reason: "missing required source, route, travel window, or duration fields" };
  }

  if (searchError) {
    return { index, reason: `search failed: ${searchError}` };
  }

  const daysOut = Math.trunc(numberValue(attempt.days_out) ?? diffDays(snapshotDate, travelWindowStart));
  const flightId = `${origin}-${destination}-${travelWindowStart}`;
  const result: FlightResult = {
    flight_id: flightId,
    source,
    origin,
    destination,
    destination_name: destinationName,
    travel_window_start: travelWindowStart,
    travel_window_end: travelWindowEnd,
    days_out: daysOut,
    price_economy_eur: priceEconomy,
    price_business_eur: priceBusiness,
    stops,
    best_layover: bestLayover,
    travel_time_hours: travelTimeHours,
    booking_url: bookingUrl,
    snapshot_date: snapshotDate,
    search_error: null
  };

  if (result.stops > filters.max_stops) {
    return { index, reason: `${result.flight_id} exceeds max_stops` };
  }
  if (result.travel_time_hours > filters.max_travel_time_hours) {
    return { index, reason: `${result.flight_id} exceeds max_travel_time_hours` };
  }
  if (result.price_economy_eur == null) {
    return { index, reason: `${result.flight_id} missing economy price` };
  }
  if (
    result.price_economy_eur < filters.budget_economy_eur.min ||
    result.price_economy_eur > filters.budget_economy_eur.max
  ) {
    return { index, reason: `${result.flight_id} outside budget_economy_eur bounds` };
  }
  if (result.source === "lastminute" && result.days_out > filters.lastminute_window_days) {
    return { index, reason: `${result.flight_id} outside lastminute window` };
  }

  return FlightResultsSchema.element.parse(result);
}

function dedupeKey(result: FlightResult): string {
  return `${result.origin}-${result.destination}-${result.travel_window_start}-${result.travel_window_end}`;
}

function choosePreferred(left: FlightResult, right: FlightResult): FlightResult {
  const leftPrice = left.price_economy_eur ?? Number.POSITIVE_INFINITY;
  const rightPrice = right.price_economy_eur ?? Number.POSITIVE_INFINITY;
  if (leftPrice !== rightPrice) {
    return leftPrice < rightPrice ? left : right;
  }
  if (Boolean(left.booking_url) !== Boolean(right.booking_url)) {
    return left.booking_url ? left : right;
  }
  if (left.travel_time_hours !== right.travel_time_hours) {
    return left.travel_time_hours < right.travel_time_hours ? left : right;
  }
  return left.source === "lastminute" ? left : right;
}

export function normalizeAndFilter(rawAttempts: RawAttempt[], filters: HardFilters): NormalizeResult {
  const normalized: FlightResult[] = [];
  const failures: NormalizeFailure[] = [];

  rawAttempts.forEach((attempt, index) => {
    const result = buildFlightResult(attempt, filters, index);
    if ("reason" in result) {
      failures.push(result);
      return;
    }
    normalized.push(result);
  });

  const deduped = new Map<string, FlightResult>();
  for (const result of normalized) {
    const key = dedupeKey(result);
    const current = deduped.get(key);
    deduped.set(key, current ? choosePreferred(current, result) : result);
  }

  const results = [...deduped.values()].sort((left, right) =>
    left.flight_id.localeCompare(right.flight_id)
  );

  return { results, failures };
}

export function runNormalize(rootDir?: string): NormalizeResult {
  const resolvedRoot = resolveRootDir(rootDir);
  const rawPath = rootPath(resolvedRoot, "tmp", "raw_results.json");
  if (!fileExists(rawPath)) {
    throw new Error(`Missing input file: ${rawPath}`);
  }

  const filters = HardFiltersSchema.parse(readJsonFile(rootPath(resolvedRoot, "config", "hard_filters.json")));
  const rawAttempts = readJsonFile<RawAttempt[]>(rawPath);
  const output = normalizeAndFilter(rawAttempts, filters);
  writeJsonFile(rootPath(resolvedRoot, "tmp", "flight_results.json"), output.results);
  return output;
}

const isMain = fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const output = runNormalize();
  for (const failure of output.failures) {
    console.log(`Filtered raw result ${failure.index}: ${failure.reason}`);
  }
  console.log(`Normalized ${output.results.length} results.`);
}
