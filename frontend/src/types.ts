export type PipelineArtifactStatus = {
  key: string;
  label: string;
  relative_path: string;
  exists: boolean;
  updated_at: string | null;
  item_count: number | null;
  note: string;
};

export type ExecutionContext = {
  trigger_source: "scheduled" | "telegram";
  origin_interface: "routine_schedule" | "telegram";
  request_text: string | null;
  defaulted_params: string[];
  context_summary: string[];
  resolved_origin: string | null;
  user_context: {
    location_label: string | null;
    preferred_origins: string[];
    max_budget_eur: number | null;
    destination_focus: string[];
    preference_tags: string[];
    notes: string[];
  };
  telegram: {
    chat_id: string;
    message_id: number | null;
    user_id: number | null;
    username: string | null;
    language_code: string | null;
    photo_file_id: string | null;
    location: {
      latitude: number;
      longitude: number;
    } | null;
  } | null;
} | null;

export type HardFilters = {
  max_stops: number;
  max_travel_time_hours: number;
  max_layover_wait_hours: number;
  budget_economy_eur: {
    min: number;
    max: number;
  };
  fallback_origins: string[];
  lastminute_window_days: number;
} | null;

export type ScoredResult = {
  flight: {
    flight_id: string;
    source: "kiwi" | "lastminute";
    origin: string;
    destination: string;
    destination_name: string;
    travel_window_start: string;
    travel_window_end: string;
    days_out: number;
    price_economy_eur: number | null;
    price_business_eur: number | null;
    stops: number;
    best_layover: string | null;
    travel_time_hours: number;
    booking_url: string | null;
    snapshot_date: string;
    search_error: string | null;
  };
  annotation: {
    flight_id: string;
    weather_score: number;
    crowd_level: "low" | "medium" | "high" | "peak";
    notable_events: string[];
    distortion_flag: boolean;
    distortion_reason: string | null;
    surf_quality: number | null;
    isolation_score: number;
    personal_flag: string;
    raw_reasoning: string;
  };
  price_vs_baseline_pct: number | null;
  composite_score: number;
  opportunity_flag: boolean;
  opportunity_reason: string | null;
};

export type DashboardSnapshot = {
  generated_at: string;
  mode: "scheduled" | "query" | null;
  active_query: string | null;
  execution_context: ExecutionContext;
  hard_filters: HardFilters;
  itinerary_text: string | null;
  pipeline: PipelineArtifactStatus[];
  top_results: ScoredResult[];
  recent_scans: Array<{
    file_name: string;
    scan_date: string;
    run_mode: "scheduled" | "query";
    origin_resolved: string;
    query: string | null;
    itinerary_delivered: boolean;
    result_count: number;
    booking_ready_count: number;
    top_destination: string | null;
  }>;
  metrics: {
    origin: string | null;
    total_results: number;
    booking_ready_results: number;
    distorted_results: number;
    opportunity_results: number;
    average_score: number | null;
    cheapest_price_eur: number | null;
  };
};
