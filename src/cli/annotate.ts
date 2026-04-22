import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deriveExecutionContext } from "../context/execution";
import { getBaselines } from "../context/history";
import {
  FlightResultsSchema,
  LLMAnnotationsSchema,
  RunModeSchema,
  ScoringWeightsSchema,
  ScanRecordSchema,
  ScoredResultsSchema,
  WishlistSchema,
  type RunMode
} from "../ingestion/schemas";
import { commitScanRecord } from "../persistence/repo";
import { scoreAll } from "../scoring/engine";
import { parseArg, readJsonFile, resolveRootDir, rootPath, todayIso, writeJsonFile } from "../utils/common";
import { renderItinerary } from "./format";

export type AnnotateOptions = {
  rootDir?: string;
  mode?: RunMode;
  query?: string | null;
  originResolved?: string;
};

function isFirstScan(rootDir: string): boolean {
  const dataDir = rootPath(rootDir, "data");
  if (!existsSync(dataDir)) {
    return true;
  }
  const dataFiles = readdirSync(dataDir).filter((entry) => entry.endsWith(".json"));
  return dataFiles.length === 0;
}

function ensureAnnotationCoverage(flightIds: string[], annotationIds: string[]): void {
  const flightSet = new Set(flightIds);
  const annotationSet = new Set(annotationIds);
  const missing = flightIds.filter((id) => !annotationSet.has(id));
  const extra = annotationIds.filter((id) => !flightSet.has(id));
  if (missing.length || extra.length || annotationIds.length !== annotationSet.size) {
    throw new Error(`Annotation mismatch. Missing: ${missing.join(", ") || "none"}; extra or duplicate: ${extra.join(", ") || "none"}`);
  }
}

export function runAnnotate(options: AnnotateOptions = {}) {
  const rootDir = resolveRootDir(options.rootDir);
  const flights = FlightResultsSchema.parse(readJsonFile(rootPath(rootDir, "tmp", "flight_results.json")));
  const annotations = LLMAnnotationsSchema.parse(readJsonFile(rootPath(rootDir, "tmp", "annotations.json")));
  ensureAnnotationCoverage(
    flights.map((flight) => flight.flight_id),
    annotations.map((annotation) => annotation.flight_id)
  );

  const weights = ScoringWeightsSchema.parse(readJsonFile(rootPath(rootDir, "config", "scoring_weights.json")));
  const wishlist = WishlistSchema.parse(readJsonFile(rootPath(rootDir, "config", "wishlist.json")));
  const baselines = getBaselines(rootPath(rootDir, "data"));
  const scored = ScoredResultsSchema.parse(scoreAll(flights, annotations, baselines, weights, wishlist))
    .sort((left, right) => right.composite_score - left.composite_score);

  const resolvedOrigin = options.originResolved ?? flights[0]?.origin ?? null;
  const executionContext = deriveExecutionContext(rootDir, {
    mode: options.mode,
    query: options.query,
    originResolved: resolvedOrigin
  });
  const inferredQuery = executionContext.request_text;
  const inferredMode = options.mode ?? (inferredQuery ? "query" : "scheduled");
  const mode = RunModeSchema.parse(inferredMode);
  const itineraryText = renderItinerary(scored, {
    firstScan: isFirstScan(rootDir),
    queryText: inferredQuery,
    defaultedParams: executionContext.defaulted_params,
    executionContext
  });
  const record = ScanRecordSchema.parse({
    scan_date: todayIso(),
    run_mode: mode,
    origin_resolved: resolvedOrigin ?? "UNK",
    query: mode === "query" ? inferredQuery : null,
    results: scored,
    itinerary_delivered: false,
    itinerary_text: itineraryText,
    execution_context: executionContext
  });

  const commit = commitScanRecord(rootDir, record);
  writeJsonFile(rootPath(rootDir, "tmp", "scored_results.json"), scored);
  if (!existsSync(rootPath(rootDir, "tmp", "itinerary.txt"))) {
    writeFileSync(rootPath(rootDir, "tmp", "itinerary.txt"), itineraryText, "utf8");
  }

  return {
    record,
    scored,
    commit
  };
}

const isMain = fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const modeArg = parseArg(process.argv.slice(2), "mode") as RunMode | undefined;
  const queryArg = parseArg(process.argv.slice(2), "query") ?? null;
  const originArg = parseArg(process.argv.slice(2), "origin");
  const result = runAnnotate({ mode: modeArg, query: queryArg, originResolved: originArg });
  console.log(`Scored ${result.scored.length} results. ${result.commit.committed ? "Committed to data/." : "No new data commit created."}`);
}
