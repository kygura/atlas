import { TripProfileSchema, type TripProfile } from "../ingestion/schemas";
import { readJsonFile, rootPath } from "../utils/common";

export function tripProfilesPath(rootDir: string): string {
  return rootPath(rootDir, "config", "trip_profiles.json");
}

export function readTripProfiles(rootDir: string): TripProfile[] {
  const parsed = readJsonFile<unknown>(tripProfilesPath(rootDir));
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.map((item) => TripProfileSchema.parse(item));
}
