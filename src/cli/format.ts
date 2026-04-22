import { readdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { summarizeExecutionContext, readExecutionContext } from "../context/execution";
import { ScoredResultsSchema, type ExecutionContext, type ScoredResult } from "../ingestion/schemas";
import { readJsonFile, resolveRootDir, rootPath, todayIso } from "../utils/common";

export type FormatOptions = {
  generatedDate?: string;
  firstScan?: boolean;
  queryText?: string | null;
  defaultedParams?: string[];
  executionContext?: ExecutionContext | null;
};

function weatherPhrase(score: number): string {
  if (score >= 5) return "excellent seasonal conditions";
  if (score >= 4) return "strong weather window";
  if (score >= 3) return "mixed but workable conditions";
  if (score >= 2) return "volatile weather outlook";
  return "poor seasonal fit";
}

function searchResultsUrl(result: ScoredResult): string {
  const params = new URLSearchParams({
    from: result.flight.origin,
    to: result.flight.destination,
    departure: result.flight.travel_window_start,
    returning: result.flight.travel_window_end
  });
  return `https://www.google.com/travel/flights?${params.toString()}`;
}

function bookingLine(result: ScoredResult): string {
  const bookTarget = result.flight.booking_url ?? `[search results](${searchResultsUrl(result)})`;
  const price = result.flight.price_economy_eur == null ? "Price unavailable" : `€${result.flight.price_economy_eur.toFixed(0)}`;
  return `✈ ${price} · ${result.flight.stops} stop(s) · ${result.flight.travel_time_hours.toFixed(1)}h · Book → ${bookTarget}`;
}

function baselineNote(result: ScoredResult, firstScan: boolean): string {
  if (firstScan) {
    return "";
  }
  if (result.opportunity_reason) {
    return ` ${result.opportunity_reason}.`;
  }
  if (result.price_vs_baseline_pct == null) {
    return " Thin history for this route; baseline still forming.";
  }
  return ` ${result.price_vs_baseline_pct.toFixed(0)}% vs route median.`;
}

function tripLengthDays(result: ScoredResult): number {
  return Math.max(
    1,
    Math.round(
      (new Date(`${result.flight.travel_window_end}T00:00:00Z`).getTime() -
        new Date(`${result.flight.travel_window_start}T00:00:00Z`).getTime()) /
        86400000
    )
  );
}

function readQueryText(rootDir: string): string | null {
  const queryPath = rootPath(rootDir, "tmp", "inbound_query.txt");
  if (!existsSync(queryPath)) {
    return null;
  }
  const text = readFileSync(queryPath, "utf8").trim();
  return text || null;
}

function readDefaultedParams(rootDir: string): string[] {
  const defaultsPath = rootPath(rootDir, "tmp", "query_defaults.json");
  if (!existsSync(defaultsPath)) {
    return [];
  }

  const parsed = JSON.parse(readFileSync(defaultsPath, "utf8"));
  return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string" && value.length > 0) : [];
}

export function renderItinerary(scored: ScoredResult[], options: FormatOptions = {}): string {
  const generatedDate = options.generatedDate ?? todayIso();
  const ranked = [...scored]
    .filter((result) => !result.annotation.distortion_flag)
    .sort((left, right) => right.composite_score - left.composite_score)
    .slice(0, 5);
  const origin = ranked[0]?.flight.origin ?? scored[0]?.flight.origin ?? "UNK";
  const uniqueRoutes = new Set(scored.map((result) => `${result.flight.origin}-${result.flight.destination}`));
  const firstScan = options.firstScan ?? false;
  const executionContext = options.executionContext ?? null;
  const queryText = options.queryText?.trim() ?? executionContext?.request_text?.trim();
  const defaultedParams = options.defaultedParams ?? executionContext?.defaulted_params ?? [];
  const contextSummary = summarizeExecutionContext(executionContext);

  const lines: string[] = [`ATLAS — ${generatedDate} · from ${origin}`, ""];

  if (queryText) {
    lines.push(`Query intent: ${queryText}`);
    if (defaultedParams.length) {
      lines.push(`Defaults applied: ${defaultedParams.join(", ")}`);
    }
    if (contextSummary.length) {
      lines.push(`Execution context: ${contextSummary.join(" · ")}`);
    }
    lines.push("");
  }

  if (!ranked.length) {
    lines.push("No booking-ready options this run; all results were distorted or filtered out.", "");
  }

  ranked.forEach((result, index) => {
    const badge = result.opportunity_flag ? "⚡ " : "";
    lines.push(`${badge}#${index + 1} ${result.flight.destination_name} via ${result.flight.best_layover ?? "direct"}`);
    lines.push(bookingLine(result));
    lines.push(`📅 ${result.flight.travel_window_start} – ${result.flight.travel_window_end} (${tripLengthDays(result)} days)`);
    lines.push(`🌤 Weather: ${result.annotation.weather_score}/5 — ${weatherPhrase(result.annotation.weather_score)}`);
    lines.push(`👥 Crowds: ${result.annotation.crowd_level}`);
    lines.push(`💡 ${result.annotation.personal_flag}${baselineNote(result, firstScan)}`.trim());
    lines.push("");
  });

  const footer = `Dataset: ${scored.length} records across ${uniqueRoutes.size} routes · Updated ${generatedDate}${firstScan ? " · First scan." : ""}`;
  lines.push(footer);
  return `${lines.join("\n").trimEnd()}\n`;
}

export function runFormat(rootDir?: string): string {
  const resolvedRoot = resolveRootDir(rootDir);
  const scored = ScoredResultsSchema.parse(readJsonFile(rootPath(resolvedRoot, "tmp", "scored_results.json")));
  const executionContext = readExecutionContext(resolvedRoot);
  const dataDir = rootPath(resolvedRoot, "data");
  const dataFiles = existsSync(dataDir)
    ? readdirSync(dataDir).filter((entry) => entry.endsWith(".json"))
    : [];
  const firstScan = dataFiles.length <= 1 && scored.every((result) => result.price_vs_baseline_pct == null);
  const itinerary = renderItinerary(scored, {
    firstScan,
    queryText: readQueryText(resolvedRoot),
    defaultedParams: readDefaultedParams(resolvedRoot),
    executionContext
  });
  writeFileSync(rootPath(resolvedRoot, "tmp", "itinerary.txt"), itinerary, "utf8");
  return itinerary;
}

const isMain = fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  runFormat();
  console.log("Wrote tmp/itinerary.txt");
}
