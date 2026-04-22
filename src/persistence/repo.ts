import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ScanRecordSchema, type ScanRecord } from "../ingestion/schemas";
import { writeJsonFile } from "../utils/common";

export type CommitResult = {
  filePath: string;
  committed: boolean;
};

function git(rootDir: string, args: string[]): string {
  return execFileSync("git", ["-C", rootDir, ...args], { encoding: "utf8" }).trim();
}

function resolveRecordPath(rootDir: string, record: ScanRecord): string {
  const dataDir = join(rootDir, "data");
  mkdirSync(dataDir, { recursive: true });
  const baseName = `${record.scan_date}-${record.run_mode}.json`;
  const basePath = join(dataDir, baseName);
  if (!existsSync(basePath)) {
    return basePath;
  }

  const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, "");
  return join(dataDir, `${record.scan_date}-${record.run_mode}-${stamp}.json`);
}

export function writeScanRecord(rootDir: string, record: ScanRecord): string {
  const filePath = resolveRecordPath(rootDir, record);
  writeJsonFile(filePath, record);
  return filePath;
}

export function commitScanRecord(rootDir: string, record: ScanRecord): CommitResult {
  git(rootDir, ["rev-parse", "--show-toplevel"]);
  const filePath = writeScanRecord(rootDir, record);
  git(rootDir, ["add", filePath]);

  try {
    git(rootDir, ["diff", "--cached", "--quiet", "--", "data"]);
    return { filePath, committed: false };
  } catch {
    git(rootDir, ["commit", "-m", `atlas: record ${record.scan_date} ${record.run_mode} scan`]);
    return { filePath, committed: true };
  }
}

export function markItineraryDelivered(rootDir: string, filePath: string): CommitResult {
  const raw = JSON.parse(readFileSync(filePath, "utf8"));
  const record = ScanRecordSchema.parse(raw);
  const updated: ScanRecord = { ...record, itinerary_delivered: true };
  writeFileSync(filePath, `${JSON.stringify(updated, null, 2)}\n`, "utf8");

  git(rootDir, ["add", filePath]);
  try {
    git(rootDir, ["diff", "--cached", "--quiet", "--", "data"]);
    return { filePath, committed: false };
  } catch {
    git(rootDir, ["commit", "-m", `atlas: mark itinerary delivered ${updated.scan_date}`]);
    return { filePath, committed: true };
  }
}
