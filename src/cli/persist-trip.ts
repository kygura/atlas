import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonFile, resolveRootDir, rootPath, writeJsonFile } from "../utils/common";

function git(rootDir: string, args: string[]): string {
  return execFileSync("git", ["-C", rootDir, ...args], { encoding: "utf8" }).trim();
}

export function runPersistTrip(rootDir?: string): { filePath: string; committed: boolean } {
  const resolvedRoot = resolveRootDir(rootDir);
  const planPath = rootPath(resolvedRoot, "tmp", "trip_plan.json");
  if (!existsSync(planPath)) {
    throw new Error(`Missing input file: ${planPath}`);
  }

  const plan = readJsonFile<Record<string, unknown>>(planPath);

  const destination = String(plan.destination ?? "unknown").replace(/[^a-zA-Z0-9]/g, "_");
  const date = String(
    (plan.flight as Record<string, unknown>)?.travel_window_start ?? plan.created_at ?? "unknown"
  ).slice(0, 10);
  const tripId = String(plan.trip_id ?? "trip");
  const fileName = `${destination}_${date}_${tripId}.json`;

  const tripsDir = join(resolvedRoot, "data", "trips");
  mkdirSync(tripsDir, { recursive: true });
  const filePath = join(tripsDir, fileName);

  writeJsonFile(filePath, plan);

  git(resolvedRoot, ["rev-parse", "--show-toplevel"]);
  git(resolvedRoot, ["add", filePath]);

  try {
    git(resolvedRoot, ["diff", "--cached", "--quiet", "--", "data/trips"]);
    return { filePath, committed: false };
  } catch {
    git(resolvedRoot, ["commit", "-m", `atlas: persist trip plan ${destination} ${date}`]);
    return { filePath, committed: true };
  }
}

const isMain = fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const result = runPersistTrip();
  console.log(`Trip plan persisted to ${result.filePath}${result.committed ? " (committed)" : " (no changes)"}.`);
}
