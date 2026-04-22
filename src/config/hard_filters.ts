import { z } from "zod";
import { HardFiltersSchema, type HardFilters } from "../ingestion/schemas";
import { readJsonFile, rootPath, writeJsonFile } from "../utils/common";

export const HardFiltersPatchSchema = z.object({
  max_stops: z.number().int().nonnegative().optional(),
  max_travel_time_hours: z.number().positive().optional(),
  max_layover_wait_hours: z.number().positive().optional(),
  budget_economy_eur: z.object({
    min: z.number().nonnegative().optional(),
    max: z.number().nonnegative().optional()
  }).optional(),
  fallback_origins: z.array(z.string().length(3)).optional(),
  lastminute_window_days: z.number().int().nonnegative().optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: "at least one hard filter change is required"
});

export type HardFiltersPatch = z.infer<typeof HardFiltersPatchSchema>;

export function hardFiltersPath(rootDir: string): string {
  return rootPath(rootDir, "config", "hard_filters.json");
}

export function readHardFilters(rootDir: string): HardFilters {
  return HardFiltersSchema.parse(readJsonFile(hardFiltersPath(rootDir)));
}

export function updateHardFilters(rootDir: string, patch: HardFiltersPatch): HardFilters {
  const current = readHardFilters(rootDir);
  const merged = HardFiltersSchema.parse({
    ...current,
    ...patch,
    budget_economy_eur: patch.budget_economy_eur
      ? {
          ...current.budget_economy_eur,
          ...patch.budget_economy_eur
        }
      : current.budget_economy_eur
  });

  writeJsonFile(hardFiltersPath(rootDir), merged);
  return merged;
}
