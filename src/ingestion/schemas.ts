import { z } from "zod";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const FlightSourceSchema = z.enum(["kiwi", "lastminute"]);
export const CrowdLevelSchema = z.enum(["low", "medium", "high", "peak"]);
export const RunModeSchema = z.enum(["scheduled", "query"]);

export const FlightResultSchema = z.object({
  flight_id: z.string().min(1),
  source: FlightSourceSchema,
  origin: z.string().length(3),
  destination: z.string().length(3),
  destination_name: z.string().min(1),
  travel_window_start: isoDateSchema,
  travel_window_end: isoDateSchema,
  days_out: z.number().int().nonnegative(),
  price_economy_eur: z.number().nonnegative().nullable(),
  price_business_eur: z.number().nonnegative().nullable(),
  stops: z.number().int().nonnegative(),
  best_layover: z.string().length(3).nullable(),
  travel_time_hours: z.number().nonnegative(),
  booking_url: z.string().url().nullable(),
  snapshot_date: isoDateSchema,
  search_error: z.string().nullable()
});

export const LLMAnnotationSchema = z.object({
  flight_id: z.string().min(1),
  weather_score: z.number().int().min(1).max(5),
  crowd_level: CrowdLevelSchema,
  notable_events: z.array(z.string()),
  distortion_flag: z.boolean(),
  distortion_reason: z.string().nullable(),
  surf_quality: z.number().int().min(1).max(5).nullable(),
  isolation_score: z.number().int().min(1).max(5),
  personal_flag: z.string().min(1),
  raw_reasoning: z.string().min(1)
}).superRefine((value, ctx) => {
  if (value.distortion_flag && !value.distortion_reason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "distortion_reason is required when distortion_flag is true",
      path: ["distortion_reason"]
    });
  }
});

export const ScoredResultSchema = z.object({
  flight: FlightResultSchema,
  annotation: LLMAnnotationSchema,
  price_vs_baseline_pct: z.number().nullable(),
  composite_score: z.number().min(0).max(10),
  opportunity_flag: z.boolean(),
  opportunity_reason: z.string().nullable()
});

export const ScanRecordSchema = z.object({
  scan_date: isoDateSchema,
  run_mode: RunModeSchema,
  origin_resolved: z.string().length(3),
  query: z.string().nullable(),
  results: z.array(ScoredResultSchema),
  itinerary_delivered: z.boolean(),
  itinerary_text: z.string()
});

export const WishlistItemSchema = z.object({
  destination: z.string().min(1),
  iata: z.string().length(3),
  status: z.string().min(1),
  intent_tags: z.array(z.string()),
  avoid_periods: z.array(z.string()).optional(),
  notes: z.string().optional()
});

export const HardFiltersSchema = z.object({
  max_stops: z.number().int().nonnegative(),
  max_travel_time_hours: z.number().positive(),
  budget_economy_eur: z.object({
    min: z.number().nonnegative(),
    max: z.number().nonnegative()
  }),
  fallback_origins: z.array(z.string().length(3)),
  lastminute_window_days: z.number().int().nonnegative()
});

export const ScoringWeightsSchema = z.object({
  price_vs_baseline: z.number().nonnegative(),
  weather_score: z.number().nonnegative(),
  crowd_level: z.number().nonnegative(),
  surf_quality: z.number().nonnegative(),
  isolation_score: z.number().nonnegative(),
  opportunity_threshold: z.number().nonnegative()
});

export const FlightResultsSchema = z.array(FlightResultSchema);
export const LLMAnnotationsSchema = z.array(LLMAnnotationSchema);
export const ScoredResultsSchema = z.array(ScoredResultSchema);
export const WishlistSchema = z.array(WishlistItemSchema);

export type FlightResult = z.infer<typeof FlightResultSchema>;
export type LLMAnnotation = z.infer<typeof LLMAnnotationSchema>;
export type ScoredResult = z.infer<typeof ScoredResultSchema>;
export type ScanRecord = z.infer<typeof ScanRecordSchema>;
export type WishlistItem = z.infer<typeof WishlistItemSchema>;
export type HardFilters = z.infer<typeof HardFiltersSchema>;
export type ScoringWeights = z.infer<typeof ScoringWeightsSchema>;
export type RunMode = z.infer<typeof RunModeSchema>;
