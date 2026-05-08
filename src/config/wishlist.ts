import { WishlistPatchSchema, type WishlistItem } from "../ingestion/schemas";
import { readJsonFile, rootPath, writeJsonFile } from "../utils/common";

export function wishlistPath(rootDir: string): string {
  return rootPath(rootDir, "config", "wishlist.json");
}

export function readWishlist(rootDir: string): WishlistItem[] {
  return WishlistPatchSchema.parse(readJsonFile(wishlistPath(rootDir)));
}

export function updateWishlist(rootDir: string, patch: WishlistItem[]): WishlistItem[] {
  const current = readWishlist(rootDir);
  const map = new Map(current.map((item) => [item.iata, item]));
  for (const item of patch) {
    map.set(item.iata, item);
  }
  const merged = WishlistPatchSchema.parse([...map.values()]);
  writeJsonFile(wishlistPath(rootDir), merged);
  return merged;
}
