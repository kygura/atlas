// Types for the Meridian Atlas API (/api/atlas). Hand-written mirror of the
// server's zod input schemas and response shapes (Meridian ADR 0020).
// Request bodies are camelCase. Change this file together with the server.

// ── Shared ───────────────────────────────────────────────────────────

export type PlaceRef = { cityId: string } | { iata: string } | { query: string };

export interface Range {
  min: number;
  max: number;
}

export interface PartialRange {
  min?: number;
  max?: number;
}

// ── Config ───────────────────────────────────────────────────────────

export interface TripProfile {
  id: string;
  label: string;
  aliases: string[];
  criteria: string[];
  vibes: string[];
  relevantMonths: number[];
  maxResults: number;
}

export interface AtlasConfig {
  profile: {
    persona: string;
    intentTags: string[];
    luxuryExceptions?: string;
    avoid: string[];
  };
  hardFilters: {
    maxStops: number;
    maxTravelTimeHours: number;
    maxLayoverWaitHours: number;
    budgetEconomyEur: Range;
    fallbackOrigins: string[];
    lastminuteWindowDays: number;
  };
  windows: {
    a: { minDays: number; maxDays: number };
    b: { minDays: number; maxDays: number };
  };
  scoringWeights: {
    priceVsBaseline: number;
    weather: number;
    crowd: number;
    surf: number;
    isolation: number;
    opportunityThreshold: number;
  };
  discoveryWeights: {
    weather: number;
    tourismSeason: number;
    conditions: number;
    priceSignal: number;
    minCompositeScore: number;
    repeatPenalty: number;
    repeatWindowDays: number;
    maxCandidatesPerRun: number;
  };
  tripPreferences: {
    gates: {
      minCompositeScore: number;
      minWeatherScore: number;
      allowPeakCrowds: boolean;
      minIsolationScore: number;
    };
    accommodation: {
      style: string[];
      minRating: number;
      excludedChains: string[];
      sortBy: string;
    };
    activities: {
      tags: string[];
      avoidTags: string[];
      groupSizePref: string;
      includeRestaurants: boolean;
      includeNightlife: boolean;
      maxPerDay: number;
      budgetPerDayEur: number;
    };
    planning: {
      maxFullPlans: number;
      maxAlternatives: number;
      tripBudgetEur: number | null;
    };
  };
  tripProfiles: TripProfile[];
}

/** A deep-merge patch: any subset of the config. */
export type AtlasConfigPatch = DeepPartial<AtlasConfig>;

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<unknown> ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K];
};

export interface ConfigResponse {
  config: AtlasConfig;
  updatedAt: string | null;
}

// ── Wishlist ─────────────────────────────────────────────────────────

export interface Watch {
  active: boolean;
  targetBudgetEur?: PartialRange;
  chatId?: string;
}

export interface WatchInput {
  active?: boolean;
  targetBudgetEur?: PartialRange;
  chatId?: string;
}

export interface WishlistEntryInput {
  place: PlaceRef;
  source?: "wished" | "scouted";
  intentTags?: string[];
  avoidMonths?: number[];
  notes?: string;
  watch?: WatchInput;
  discoveryScore?: number;
}

export interface AtlasPlace {
  cityId: string;
  name: string;
  country: string;
  iata?: string;
  lat: number;
  lng: number;
  source: "wished" | "scouted";
  intentTags: string[];
  avoidMonths: number[];
  notes?: string;
  watch?: Watch;
  discoveryScore?: number;
  addedAt: string;
  lastScoutedAt?: string;
  updatedAt: string;
}

export interface Unresolved {
  place: PlaceRef;
  reason: string;
}

export interface WishlistResponse {
  entries: AtlasPlace[];
}

export interface WishlistUpsertResponse {
  entries: AtlasPlace[];
  unresolved: Unresolved[];
}

export interface WishlistRemoveResponse {
  removed: boolean;
}

// ── Context ──────────────────────────────────────────────────────────

export interface StaySummary {
  id: string;
  cityId: string;
  name: string;
  country?: string;
  iata?: string;
  start?: string;
  end?: string;
  status: string;
}

export interface RunSummary {
  id: string;
  kind: "scan" | "discovery";
  mode: string;
  at: string;
  origin: string | null;
  counts: Record<string, number>;
  top?: { flightId: string; destination: string; priceEur: number | null; composite: number } | null;
  passed?: string[];
}

export type OriginSource = "rotation-current" | "rotation-next" | "rotation-home" | "fallback";

export interface SeasonMonth {
  month: number;
  comfort: number | null;
  crowd: number | null;
}

export interface WishlistPlaceWithSeason extends AtlasPlace {
  season: {
    months: SeasonMonth[];
    bestMonths: number[];
    avoidNow: boolean;
  };
}

export interface ContextResponse {
  today: string;
  origin: {
    cityId: string;
    name: string;
    country: string;
    iata: string | null;
    source: OriginSource;
    stayId?: string;
  };
  fallbackOrigins: string[];
  rotation: {
    current: StaySummary | null;
    next: StaySummary | null;
    daysLeft: number | null;
    nextMoveDate: string | null;
  };
  windows: {
    a: { from: string; to: string };
    b: { from: string; to: string };
  };
  config: AtlasConfig;
  wishlist: WishlistPlaceWithSeason[];
  recentlyScouted: { cityId: string; name: string; iata?: string; at: string }[];
  lastRuns: RunSummary[];
}

// ── Seasonal ─────────────────────────────────────────────────────────

export interface SeasonalQuery {
  months: number[];
  vibe?: string[];
  profile?: string;
  limit?: number;
}

export interface SeasonalCity {
  cityId: string;
  name: string;
  country: string;
  iata: string;
  comfort: number;
  crowd: number | null;
  strength: number | null;
  role: "source" | "echo" | null;
  score: number;
}

export interface SeasonalResponse {
  months: number[];
  vibes: string[];
  cities: SeasonalCity[];
}

// ── Scans ────────────────────────────────────────────────────────────

export interface AtlasFlight {
  id: string;
  source: string;
  origin: string;
  destination: string;
  destinationName: string;
  departDate: string;
  returnDate: string;
  priceEur: number | null;
  priceBusinessEur?: number | null;
  stops: number;
  layover?: string | null;
  longestLayoverHours?: number | null;
  travelHours: number;
  bookingUrl: string | null;
  error?: string | null;
}

export type CrowdLevel = "low" | "medium" | "high" | "peak";

export interface AtlasAnnotation {
  flightId: string;
  weather: number;
  crowd: CrowdLevel;
  events?: string[];
  distortion: boolean;
  distortionReason?: string | null;
  surf?: number | null;
  isolation: number;
  personalFlag: string;
  reasoning: string;
}

export type RunMode = "scheduled" | "query" | "discovery" | "watch";

export interface ScanInput {
  mode: RunMode;
  origin: string;
  query?: string;
  overrides?: { budgetEconomyEur?: PartialRange; maxStops?: number };
  relaxGates?: boolean;
  flights: AtlasFlight[];
  annotations: AtlasAnnotation[];
}

export interface ScoredFlight {
  flight: AtlasFlight;
  annotation: AtlasAnnotation;
  baseline: { route: string; median: number | null; p25: number | null; count: number; thin: boolean };
  priceVsMedianPct: number | null;
  composite: number;
  opportunity: boolean;
  opportunityReason: string | null;
  baselineDeal: boolean;
  gates: { passed: boolean; failures: string[]; warnings: string[] };
}

export interface WatchHit {
  cityId: string;
  name: string;
  flightId: string;
  priceEur: number | null;
  reason: string;
  chatId?: string;
}

export interface ScanResponse {
  runId: string;
  scored: ScoredFlight[];
  rejected: { flight: AtlasFlight; reasons: string[] }[];
  watchHits: WatchHit[];
  selection: { top: string | null; alternative: string | null };
}

// ── Discovery ────────────────────────────────────────────────────────

export interface DiscoveryCandidateInput {
  place: PlaceRef;
  profileId: string;
  reason: string;
  intentTags?: string[];
  avoidMonths?: number[];
  notes?: string;
  weather: number;
  conditions: number;
  tourismSeason: number;
  priceSignalEur: number | null;
  priceSignalNote: string | null;
}

export interface DiscoveryInput {
  activityTypes?: string[];
  origin?: string;
  candidates: DiscoveryCandidateInput[];
}

export interface ScoredCandidate extends DiscoveryCandidateInput {
  cityId: string;
  name: string;
  iata?: string;
  composite: number;
  repeatPenalty: boolean;
  thinPriceSignal: boolean;
  comfortNow: number | null;
  passed: boolean;
}

export interface DiscoveryResponse {
  runId: string;
  scored: ScoredCandidate[];
  unresolved: Unresolved[];
}

// ── Trips ────────────────────────────────────────────────────────────

export interface StayPick {
  name: string;
  kind?: "hotel" | "apartment" | "hostel" | "friends" | "other";
  address?: string;
  rating?: number;
  pricePerNightEur?: number;
  totalEur?: number;
  summary?: string;
  link?: string;
}

export interface TripActivity {
  date: string;
  time?: string;
  title: string;
  costEur?: number;
  durationHours?: number;
  rating?: number;
  link?: string;
  note?: string;
}

export interface TripPlanInput {
  name?: string;
  origin: PlaceRef;
  destination: PlaceRef;
  departDate: string;
  returnDate: string;
  travellers?: number;
  flight: {
    priceEur: number | null;
    bookingUrl: string | null;
    carrier?: string;
    stops?: number;
    travelHours?: number;
    layover?: string | null;
    flightId?: string;
  };
  stay?: StayPick;
  stayAlternative?: StayPick;
  activities?: TripActivity[];
  totals?: {
    flightEur: number | null;
    stayEur: number | null;
    activitiesEur: number | null;
    totalEur: number | null;
  };
  notes?: string;
  scanRunId?: string;
}

export interface TripResponse {
  trip: Record<string, unknown>;
  url: string;
}

// ── Notify ───────────────────────────────────────────────────────────

export type NoticeKind = "digest" | "deal" | "trip" | "watch" | "discovery";

export const NOTICE_KINDS: readonly NoticeKind[] = ["digest", "deal", "trip", "watch", "discovery"];

export interface NotifyInput {
  kind: NoticeKind;
  title: string;
  body?: string;
  url?: string;
  dedupeKey?: string;
}

export interface NotifyResponse {
  notice: Record<string, unknown>;
  deduped: boolean;
  deliveries: { channel: string; ok: boolean; error?: string }[];
}

// ── Runs and fares ───────────────────────────────────────────────────

export interface RunsResponse {
  runs: RunSummary[];
}

export interface FaresResponse {
  route: string;
  baseline: Record<string, unknown>;
  fares: { priceEur: number; departDate: string; snapshotDate: string; source: string }[];
}

// ── Import ───────────────────────────────────────────────────────────

export interface ImportFare {
  origin: string;
  destination: string;
  priceEur: number;
  departDate: string;
  returnDate?: string;
  snapshotDate: string;
  source?: string;
}

export interface ImportInput {
  config?: AtlasConfigPatch;
  wishlist?: WishlistEntryInput[];
  fares?: ImportFare[];
}

export interface ImportResponse {
  config: boolean;
  wishlist: { added: number; unresolved: number };
  fares: { added: number; skipped: number };
}

export interface HealthResponse {
  [key: string]: unknown;
}
