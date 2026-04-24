import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ExecutionContextSchema,
  HardFiltersSchema,
  ScoredResultsSchema,
  ScanRecordSchema,
  type ExecutionContext,
  type HardFilters,
  type ScanRecord,
  type ScoredResult,
  type RunMode
} from "../ingestion/schemas";
import { resolveRootDir, rootPath } from "../utils/common";

export type PipelineArtifactKey =
  | "inbound_query"
  | "raw_results"
  | "flight_results"
  | "annotations"
  | "scored_results"
  | "itinerary"
  | "execution_context";

export type PipelineArtifactStatus = {
  key: PipelineArtifactKey;
  label: string;
  relative_path: string;
  exists: boolean;
  updated_at: string | null;
  item_count: number | null;
  note: string;
};

export type DashboardScanSummary = {
  file_name: string;
  scan_date: string;
  run_mode: RunMode;
  origin_resolved: string;
  query: string | null;
  itinerary_delivered: boolean;
  result_count: number;
  booking_ready_count: number;
  top_destination: string | null;
};

export type DashboardSnapshot = {
  generated_at: string;
  mode: RunMode | null;
  active_query: string | null;
  execution_context: ExecutionContext | null;
  hard_filters: HardFilters | null;
  itinerary_text: string | null;
  pipeline: PipelineArtifactStatus[];
  top_results: ScoredResult[];
  recent_scans: DashboardScanSummary[];
  metrics: {
    origin: string | null;
    total_results: number;
    booking_ready_results: number;
    distorted_results: number;
    opportunity_results: number;
    average_score: number | null;
    cheapest_price_eur: number | null;
  };
};

type ScanEntry = {
  fileName: string;
  record: ScanRecord;
};

function readOptionalText(filePath: string): string | null {
  if (!existsSync(filePath)) {
    return null;
  }
  const text = readFileSync(filePath, "utf8").trim();
  return text || null;
}

function readOptionalJson(filePath: string): unknown | null {
  if (!existsSync(filePath)) {
    return null;
  }
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function tryReadOptionalJson(filePath: string): { parsed: unknown | null; error: string | null } {
  if (!existsSync(filePath)) {
    return { parsed: null, error: null };
  }

  try {
    return { parsed: JSON.parse(readFileSync(filePath, "utf8")), error: null };
  } catch (error) {
    return {
      parsed: null,
      error: error instanceof Error ? error.message : "Unreadable JSON"
    };
  }
}

function readOptionalExecutionContext(filePath: string): ExecutionContext | null {
  const parsed = readOptionalJson(filePath);
  if (!parsed) {
    return null;
  }
  return ExecutionContextSchema.parse(parsed);
}

function readOptionalHardFilters(filePath: string): HardFilters | null {
  const parsed = readOptionalJson(filePath);
  if (!parsed) {
    return null;
  }
  return HardFiltersSchema.parse(parsed);
}

function readOptionalScoredResults(filePath: string): ScoredResult[] | null {
  const parsed = readOptionalJson(filePath);
  if (!parsed) {
    return null;
  }
  return ScoredResultsSchema.parse(parsed);
}

function summarizeItemCount(relativePath: string, parsed: unknown): number | null {
  if (relativePath.endsWith(".txt")) {
    return typeof parsed === "string" && parsed.length > 0 ? 1 : 0;
  }
  if (Array.isArray(parsed)) {
    return parsed.length;
  }
  if (parsed && typeof parsed === "object") {
    return Object.keys(parsed as Record<string, unknown>).length;
  }
  return null;
}

function buildArtifact(rootDir: string, key: PipelineArtifactKey, label: string, relativePath: string): PipelineArtifactStatus {
  const filePath = rootPath(rootDir, relativePath);
  if (!existsSync(filePath)) {
    return {
      key,
      label,
      relative_path: relativePath,
      exists: false,
      updated_at: null,
      item_count: null,
      note: "Waiting for this stage to write output."
    };
  }

  const stats = statSync(filePath);
  const rawResult = relativePath.endsWith(".txt")
    ? { parsed: readFileSync(filePath, "utf8"), error: null }
    : tryReadOptionalJson(filePath);
  const raw = rawResult.parsed;
  const itemCount = summarizeItemCount(relativePath, raw);
  let note = relativePath.endsWith(".txt")
    ? "Text artifact ready for review."
    : itemCount == null
      ? "Structured artifact ready."
      : `${itemCount} item${itemCount === 1 ? "" : "s"} available.`;

  if (rawResult.error) {
    note = `Unreadable artifact: ${rawResult.error}`;
  }

  return {
    key,
    label,
    relative_path: relativePath,
    exists: true,
    updated_at: stats.mtime.toISOString(),
    item_count: itemCount,
    note
  };
}

function listScanEntries(rootDir: string): ScanEntry[] {
  const dataDir = rootPath(rootDir, "data");
  if (!existsSync(dataDir)) {
    return [];
  }

  return readdirSync(dataDir)
    .filter((entry) => entry.endsWith(".json"))
    .sort((left, right) => right.localeCompare(left))
    .flatMap((fileName) => {
      const filePath = join(dataDir, fileName);
      try {
        const parsed = JSON.parse(readFileSync(filePath, "utf8"));
        return [{ fileName, record: ScanRecordSchema.parse(parsed) }];
      } catch {
        return [];
      }
    });
}

function tryReadExecutionContext(filePath: string): ExecutionContext | null {
  try {
    return readOptionalExecutionContext(filePath);
  } catch {
    return null;
  }
}

function tryReadHardFilters(filePath: string): HardFilters | null {
  try {
    return readOptionalHardFilters(filePath);
  } catch {
    return null;
  }
}

function tryReadScoredResults(filePath: string): ScoredResult[] | null {
  try {
    return readOptionalScoredResults(filePath);
  } catch {
    return null;
  }
}

function summarizeScan(entry: ScanEntry): DashboardScanSummary {
  const bookingReady = entry.record.results.filter((result) => !result.annotation.distortion_flag);
  return {
    file_name: entry.fileName,
    scan_date: entry.record.scan_date,
    run_mode: entry.record.run_mode,
    origin_resolved: entry.record.origin_resolved,
    query: entry.record.query,
    itinerary_delivered: entry.record.itinerary_delivered,
    result_count: entry.record.results.length,
    booking_ready_count: bookingReady.length,
    top_destination: bookingReady[0]?.flight.destination_name ?? entry.record.results[0]?.flight.destination_name ?? null
  };
}

export function readDashboardSnapshot(rootDir?: string): DashboardSnapshot {
  const resolvedRoot = resolveRootDir(rootDir);
  const scanEntries = listScanEntries(resolvedRoot);
  const latestRecord = scanEntries[0]?.record ?? null;
  const executionContext =
    tryReadExecutionContext(rootPath(resolvedRoot, "tmp", "execution_context.json")) ??
    latestRecord?.execution_context ??
    null;
  const hardFilters = tryReadHardFilters(rootPath(resolvedRoot, "config", "hard_filters.json"));
  const scoredResults =
    tryReadScoredResults(rootPath(resolvedRoot, "tmp", "scored_results.json")) ??
    latestRecord?.results ??
    [];
  const itineraryText =
    readOptionalText(rootPath(resolvedRoot, "tmp", "itinerary.txt")) ??
    latestRecord?.itinerary_text ??
    null;
  const activeQuery =
    readOptionalText(rootPath(resolvedRoot, "tmp", "inbound_query.txt")) ??
    executionContext?.request_text ??
    latestRecord?.query ??
    null;
  const bookingReady = scoredResults.filter((result) => !result.annotation.distortion_flag);
  const priced = bookingReady.filter((result) => result.flight.price_economy_eur != null);
  const averageScore = scoredResults.length
    ? scoredResults.reduce((total, result) => total + result.composite_score, 0) / scoredResults.length
    : null;

  return {
    generated_at: new Date().toISOString(),
    mode: latestRecord?.run_mode ?? null,
    active_query: activeQuery,
    execution_context: executionContext,
    hard_filters: hardFilters,
    itinerary_text: itineraryText,
    pipeline: [
      buildArtifact(resolvedRoot, "inbound_query", "Inbound query", "tmp/inbound_query.txt"),
      buildArtifact(resolvedRoot, "raw_results", "Raw search payload", "tmp/raw_results.json"),
      buildArtifact(resolvedRoot, "flight_results", "Normalized flights", "tmp/flight_results.json"),
      buildArtifact(resolvedRoot, "annotations", "LLM annotations", "tmp/annotations.json"),
      buildArtifact(resolvedRoot, "scored_results", "Scored results", "tmp/scored_results.json"),
      buildArtifact(resolvedRoot, "itinerary", "Formatted itinerary", "tmp/itinerary.txt"),
      buildArtifact(resolvedRoot, "execution_context", "Execution context", "tmp/execution_context.json")
    ],
    top_results: [...scoredResults].sort((left, right) => right.composite_score - left.composite_score).slice(0, 8),
    recent_scans: scanEntries.slice(0, 6).map(summarizeScan),
    metrics: {
      origin:
        bookingReady[0]?.flight.origin ??
        scoredResults[0]?.flight.origin ??
        latestRecord?.origin_resolved ??
        executionContext?.resolved_origin ??
        null,
      total_results: scoredResults.length,
      booking_ready_results: bookingReady.length,
      distorted_results: scoredResults.filter((result) => result.annotation.distortion_flag).length,
      opportunity_results: scoredResults.filter((result) => result.opportunity_flag).length,
      average_score: averageScore == null ? null : Number(averageScore.toFixed(2)),
      cheapest_price_eur: priced.length
        ? Math.min(...priced.map((result) => result.flight.price_economy_eur as number))
        : null
    }
  };
}
