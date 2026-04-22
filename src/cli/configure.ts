import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { HardFiltersPatchSchema, updateHardFilters } from "../config/hard_filters";
import { parseArg, readJsonFile, resolveRootDir, rootPath } from "../utils/common";

export type ConfigureOptions = {
  rootDir?: string;
  patchPath?: string;
};

export function runConfigure(options: ConfigureOptions = {}) {
  const rootDir = resolveRootDir(options.rootDir);
  const patchPath = options.patchPath ?? rootPath(rootDir, "tmp", "hard_filters.update.json");

  if (!existsSync(patchPath)) {
    throw new Error(`Missing hard filter patch file: ${patchPath}`);
  }

  const patch = HardFiltersPatchSchema.parse(readJsonFile(patchPath));
  const filters = updateHardFilters(rootDir, patch);
  return { patchPath, filters };
}

const isMain = fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const rootDir = parseArg(process.argv.slice(2), "rootDir");
  const patchPath = parseArg(process.argv.slice(2), "patch");
  const result = runConfigure({ rootDir, patchPath });
  console.log(`Updated config/hard_filters.json from ${result.patchPath}`);
}
