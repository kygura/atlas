import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WatchPatchSchema, type WishlistItem } from "../ingestion/schemas";
import { updateWishlist } from "../config/wishlist";
import { parseArg, readJsonFile, resolveRootDir, rootPath, todayIso } from "../utils/common";

export type WatchOptions = {
  rootDir?: string;
  patchPath?: string;
};

export function runWatch(options: WatchOptions = {}) {
  const rootDir = resolveRootDir(options.rootDir);
  const patchPath = options.patchPath ?? rootPath(rootDir, "tmp", "watch.update.json");

  if (!existsSync(patchPath)) {
    throw new Error(`Missing watch patch file: ${patchPath}`);
  }

  const patch = WatchPatchSchema.parse(readJsonFile(patchPath));
  const today = todayIso();

  const items: WishlistItem[] = patch.map((request) => ({
    destination: request.destination,
    iata: request.iata,
    status: "watching",
    intent_tags: request.intent_tags,
    avoid_periods: request.avoid_periods ?? [],
    notes: request.notes,
    source: "user_requested",
    requested_by: request.requested_by,
    target_budget_eur: request.target_budget_eur ?? null,
    watch_active: true,
    added_at: today
  }));

  const merged = updateWishlist(rootDir, items);
  return { patchPath, added: items.map((item) => item.iata), count: merged.length };
}

const isMain = fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const rootDir = parseArg(process.argv.slice(2), "rootDir");
  const patchPath = parseArg(process.argv.slice(2), "patch");
  const result = runWatch({ rootDir, patchPath });
  console.log(`Added ${result.added.join(", ") || "no"} destinations to the watchlist (${result.count} total wishlist entries).`);
}
