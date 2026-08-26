import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { deriveExecutionContext } from "../context/execution";
import {
  DestinationCandidatesSchema,
  DiscoveryRunRecordSchema,
  DiscoveryWeightsSchema,
  WishlistSchema,
  type WishlistItem
} from "../ingestion/schemas";
import { updateWishlist } from "../config/wishlist";
import { commitDiscoveryRecord } from "../persistence/repo";
import { scoreAllCandidates } from "../scoring/discovery";
import { diffDays, parseArg, readJsonFile, resolveRootDir, rootPath, todayIso, writeJsonFile } from "../utils/common";

export type DiscoverOptions = {
  rootDir?: string;
  candidatesPath?: string;
  originResolved?: string | null;
};

function recentlyScoutedIatas(wishlist: WishlistItem[], today: string, windowDays: number): Set<string> {
  const recent = new Set<string>();
  for (const item of wishlist) {
    if (item.source !== "scouted" || !item.last_scouted_at) {
      continue;
    }
    if (diffDays(item.last_scouted_at, today) <= windowDays) {
      recent.add(item.iata);
    }
  }
  return recent;
}

export function runDiscover(options: DiscoverOptions = {}) {
  const rootDir = resolveRootDir(options.rootDir);
  const candidatesPath = options.candidatesPath ?? rootPath(rootDir, "tmp", "discovery_candidates.json");

  if (!existsSync(candidatesPath)) {
    throw new Error(`Missing discovery candidates file: ${candidatesPath}`);
  }

  const candidates = DestinationCandidatesSchema.parse(readJsonFile(candidatesPath));
  const weights = DiscoveryWeightsSchema.parse(readJsonFile(rootPath(rootDir, "config", "discovery_weights.json")));
  const wishlist = WishlistSchema.parse(readJsonFile(rootPath(rootDir, "config", "wishlist.json")));

  const today = todayIso();
  const recentIatas = recentlyScoutedIatas(wishlist, today, weights.repeat_window_days);
  const scored = scoreAllCandidates(candidates, weights, recentIatas);
  const passed = scored
    .filter((candidate) => candidate.composite_score >= weights.min_composite_score)
    .slice(0, weights.max_candidates_per_run);

  const wishlistUpdates: WishlistItem[] = passed.map((candidate) => ({
    destination: candidate.destination,
    iata: candidate.iata,
    status: "scouted",
    intent_tags: candidate.intent_tags,
    avoid_periods: candidate.avoid_periods ?? [],
    notes: candidate.notes,
    source: "scouted",
    discovery_score: candidate.composite_score,
    last_scouted_at: today
  }));

  if (wishlistUpdates.length) {
    updateWishlist(rootDir, wishlistUpdates);
  }

  const executionContext = deriveExecutionContext(rootDir, { mode: "discovery" });
  const activityTypes = executionContext.user_context.activity_types ?? [];
  const resolvedOrigin = options.originResolved ?? executionContext.resolved_origin ?? null;

  const record = DiscoveryRunRecordSchema.parse({
    run_date: today,
    activity_types: activityTypes,
    origin_resolved: resolvedOrigin,
    candidates: scored,
    passed_iatas: passed.map((candidate) => candidate.iata),
    execution_context: executionContext
  });

  const commit = commitDiscoveryRecord(rootDir, record);
  writeJsonFile(rootPath(rootDir, "tmp", "discovery_results.json"), { candidates: scored, passed });

  return { record, scored, passed, commit };
}

const isMain = fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const rootDir = parseArg(process.argv.slice(2), "rootDir");
  const candidatesPath = parseArg(process.argv.slice(2), "candidates");
  const origin = parseArg(process.argv.slice(2), "origin");
  const result = runDiscover({ rootDir, candidatesPath, originResolved: origin });
  console.log(
    `Scored ${result.scored.length} candidates, ${result.passed.length} passed the gate. ` +
    `${result.commit.committed ? "Committed to data/discovery/." : "No new discovery commit created."}`
  );
}
