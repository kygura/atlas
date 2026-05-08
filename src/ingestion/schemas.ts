import { z } from "zod";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const FlightSourceSchema = z.enum(["kiwi", "lastminute"]);
export const CrowdLevelSchema = z.enum(["low", "medium", "high", "peak"]);
export const RunModeSchema = z.enum(["scheduled", "query"]);
export const TriggerSourceSchema = z.enum(["scheduled", "telegram"]);
export const OriginInterfaceSchema = z.enum(["routine_schedule", "telegram"]);
export const TelegramParseModeSchema = z.enum(["MarkdownV2", "HTML"]);

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

export const TelegramLocationSchema = z.object({
  latitude: z.number(),
  longitude: z.number()
});

export const TelegramContextSchema = z.object({
  chat_id: z.string().min(1),
  message_id: z.number().int().nonnegative().nullable(),
  user_id: z.number().int().nonnegative().nullable(),
  username: z.string().nullable(),
  language_code: z.string().nullable(),
  photo_file_id: z.string().nullable(),
  location: TelegramLocationSchema.nullable()
});

export const UserContextSchema = z.object({
  location_label: z.string().nullable(),
  preferred_origins: z.array(z.string().length(3)),
  max_budget_eur: z.number().nonnegative().nullable(),
  destination_focus: z.array(z.string()),
  preference_tags: z.array(z.string()),
  notes: z.array(z.string())
});

export const ExecutionContextSchema = z.object({
  trigger_source: TriggerSourceSchema,
  origin_interface: OriginInterfaceSchema,
  request_text: z.string().nullable(),
  defaulted_params: z.array(z.string()),
  context_summary: z.array(z.string()),
  resolved_origin: z.string().length(3).nullable(),
  user_context: UserContextSchema,
  telegram: TelegramContextSchema.nullable()
});

export const TelegramOutboundMessageSchema = z.object({
  text: z.string().min(1),
  parse_mode: TelegramParseModeSchema.optional(),
  disable_web_page_preview: z.boolean().optional()
});

export const ScanRecordSchema = z.object({
  scan_date: isoDateSchema,
  run_mode: RunModeSchema,
  origin_resolved: z.string().length(3),
  query: z.string().nullable(),
  results: z.array(ScoredResultSchema),
  itinerary_delivered: z.boolean(),
  itinerary_text: z.string(),
  execution_context: ExecutionContextSchema.optional(),
  telegram_message: TelegramOutboundMessageSchema.optional()
});

export const WishlistItemSchema = z.object({
  destination: z.string().min(1),
  iata: z.string().length(3),
  status: z.string().min(1),
  intent_tags: z.array(z.string()),
  avoid_periods: z.array(z.string()).optional(),
  notes: z.string().optional()
});

export const WishlistPatchSchema = z.array(WishlistItemSchema);

export const TravellerProfileSchema = z.object({
  persona: z.string().min(1),
  intent_tags: z.array(z.string()),
  luxury_exceptions: z.string().optional(),
  avoid: z.array(z.string()).optional()
});

export const TripProfileSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  criteria: z.array(z.string()),
  sample_origins: z.array(z.string().length(3)).optional(),
  max_results: z.number().int().positive().optional(),
  relevant_months: z.array(z.number().int().min(1).max(12)).optional()
});

export const DestinationCandidateSchema = z.object({
  destination: z.string().min(1),
  iata: z.string().length(3),
  profile_id: z.string().min(1),
  reason: z.string().min(1),
  intent_tags: z.array(z.string()),
  avoid_periods: z.array(z.string()).optional(),
  notes: z.string().optional()
});

export const ScoutPatchSchema = z.object({
  profile_id: z.string().min(1),
  candidates: z.array(DestinationCandidateSchema)
});

export const HardFiltersSchema = z.object({
  max_stops: z.number().int().nonnegative(),
  max_travel_time_hours: z.number().positive(),
  max_layover_wait_hours: z.number().positive(),
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
export type WishlistPatch = z.infer<typeof WishlistPatchSchema>;
export type TravellerProfile = z.infer<typeof TravellerProfileSchema>;
export type TripProfile = z.infer<typeof TripProfileSchema>;
export type DestinationCandidate = z.infer<typeof DestinationCandidateSchema>;
export type ScoutPatch = z.infer<typeof ScoutPatchSchema>;
export type HardFilters = z.infer<typeof HardFiltersSchema>;
export type ScoringWeights = z.infer<typeof ScoringWeightsSchema>;
export type RunMode = z.infer<typeof RunModeSchema>;
export type ExecutionContext = z.infer<typeof ExecutionContextSchema>;
export type TelegramOutboundMessage = z.infer<typeof TelegramOutboundMessageSchema>;
