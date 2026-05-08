import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { WishlistPatchSchema } from "../ingestion/schemas";
import { updateWishlist } from "../config/wishlist";
import { parseArg, readJsonFile, resolveRootDir, rootPath } from "../utils/common";

export type WishlistOptions = {
  rootDir?: string;
  patchPath?: string;
};

export function runWishlist(options: WishlistOptions = {}) {
  const rootDir = resolveRootDir(options.rootDir);
  const patchPath = options.patchPath ?? rootPath(rootDir, "tmp", "wishlist.update.json");

  if (!existsSync(patchPath)) {
    throw new Error(`Missing wishlist patch file: ${patchPath}`);
  }

  const patch = WishlistPatchSchema.parse(readJsonFile(patchPath));
  const merged = updateWishlist(rootDir, patch);
  return { patchPath, count: merged.length };
}

const isMain = fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const rootDir = parseArg(process.argv.slice(2), "rootDir");
  const patchPath = parseArg(process.argv.slice(2), "patch");
  const result = runWishlist({ rootDir, patchPath });
  console.log(`Updated config/wishlist.json from ${result.patchPath} (${result.count} items).`);
}
