import { existsSync, readFileSync } from "node:fs";
import { ExecutionContextSchema, type ExecutionContext, type RunMode } from "../ingestion/schemas";
import { rootPath } from "../utils/common";

const EMPTY_USER_CONTEXT: ExecutionContext["user_context"] = {
  location_label: null,
  preferred_origins: [],
  max_budget_eur: null,
  destination_focus: [],
  preference_tags: [],
  notes: [],
  activity_types: [],
  stay_duration_days: null,
  budget_range_eur: null
};

function readOptionalString(rootDir: string, relativePath: string): string | null {
  const filePath = rootPath(rootDir, relativePath);
  if (!existsSync(filePath)) {
    return null;
  }
  const text = readFileSync(filePath, "utf8").trim();
  return text || null;
}

function readDefaultedParams(rootDir: string): string[] {
  const defaultsPath = rootPath(rootDir, "tmp", "query_defaults.json");
  if (!existsSync(defaultsPath)) {
    return [];
  }

  const parsed = JSON.parse(readFileSync(defaultsPath, "utf8"));
  return Array.isArray(parsed)
    ? parsed.filter((value): value is string => typeof value === "string" && value.length > 0)
    : [];
}

export function readExecutionContext(rootDir: string): ExecutionContext | null {
  const filePath = rootPath(rootDir, "tmp", "execution_context.json");
  if (!existsSync(filePath)) {
    return null;
  }
  return ExecutionContextSchema.parse(JSON.parse(readFileSync(filePath, "utf8")));
}

export function deriveExecutionContext(
  rootDir: string,
  options: { mode?: RunMode; query?: string | null; originResolved?: string | null } = {}
): ExecutionContext {
  const stored = readExecutionContext(rootDir);
  const requestText = options.query ?? stored?.request_text ?? readOptionalString(rootDir, "tmp/inbound_query.txt");
  const defaultedParams = stored?.defaulted_params?.length ? stored.defaulted_params : readDefaultedParams(rootDir);
  const resolvedOrigin = options.originResolved ?? stored?.resolved_origin ?? null;
  const triggerSource = stored?.trigger_source ?? (options.mode === "scheduled" ? "scheduled" : "telegram");
  const originInterface = stored?.origin_interface ?? (triggerSource === "telegram" ? "telegram" : "routine_schedule");

  return ExecutionContextSchema.parse({
    trigger_source: triggerSource,
    origin_interface: originInterface,
    request_text: requestText,
    defaulted_params: defaultedParams,
    context_summary: stored?.context_summary ?? [],
    resolved_origin: resolvedOrigin,
    user_context: { ...EMPTY_USER_CONTEXT, ...stored?.user_context },
    telegram: stored?.telegram ?? null,
    command: stored?.command ?? null
  });
}

export function summarizeExecutionContext(context: ExecutionContext | null | undefined): string[] {
  if (!context) {
    return [];
  }

  const parts = [...context.context_summary];
  if (context.user_context.location_label) {
    parts.push(`location ${context.user_context.location_label}`);
  }
  if (context.user_context.preferred_origins.length) {
    parts.push(`origins ${context.user_context.preferred_origins.join("/")}`);
  }
  const budgetRange = context.user_context.budget_range_eur;
  if (budgetRange && (budgetRange.min != null || budgetRange.max != null)) {
    if (budgetRange.min != null && budgetRange.max != null) {
      parts.push(`budget €${budgetRange.min.toFixed(0)}–€${budgetRange.max.toFixed(0)}`);
    } else if (budgetRange.max != null) {
      parts.push(`budget ≤ €${budgetRange.max.toFixed(0)}`);
    } else if (budgetRange.min != null) {
      parts.push(`budget ≥ €${budgetRange.min.toFixed(0)}`);
    }
  } else if (context.user_context.max_budget_eur != null) {
    parts.push(`budget ≤ €${context.user_context.max_budget_eur.toFixed(0)}`);
  }
  if (context.user_context.destination_focus.length) {
    parts.push(`destinations ${context.user_context.destination_focus.join(", ")}`);
  }
  const activityTypes = context.user_context.activity_types ?? [];
  if (activityTypes.length) {
    parts.push(`activity ${activityTypes.join(", ")}`);
  }
  const stayDuration = context.user_context.stay_duration_days;
  if (stayDuration && (stayDuration.min != null || stayDuration.max != null)) {
    if (stayDuration.min != null && stayDuration.max != null) {
      parts.push(`${stayDuration.min}-${stayDuration.max} days`);
    } else {
      parts.push(`${stayDuration.min ?? stayDuration.max} days`);
    }
  }
  if (context.user_context.preference_tags.length) {
    parts.push(`preferences ${context.user_context.preference_tags.join(", ")}`);
  }

  return [...new Set(parts)];
}
