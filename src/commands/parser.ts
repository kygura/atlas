export type ParsedRange = {
  min: number | null;
  max: number | null;
};

export type ParsedCommand = {
  name: string;
  raw_args: string | null;
  destination_focus: string[];
  activity_types: string[];
  stay_duration_days: ParsedRange | null;
  budget_range_eur: ParsedRange | null;
  origin: string | null;
  preferred_origins: string[];
  notes: string[];
};

const SEARCH_COMMANDS = new Set(["scout", "trip", "plan", "search"]);
const HELP_COMMANDS = new Set(["help", "start"]);

type ArgKey = "destination" | "activity" | "days" | "budget" | "origin";

const ARG_KEY_ALIASES: Record<string, ArgKey> = {
  destination: "destination",
  to: "destination",
  dest: "destination",
  activity: "activity",
  activities: "activity",
  type: "activity",
  trip: "activity",
  vibe: "activity",
  days: "days",
  nights: "days",
  duration: "days",
  length: "days",
  budget: "budget",
  price: "budget",
  maxbudget: "budget",
  origin: "origin",
  from: "origin",
  depart: "origin"
};

export const COMMAND_HELP_TEXT = `Atlas commands

/scout — steer the next search with flexible arguments. Aliases: /trip, /plan, /search
/help — show this message

Arguments (any combination, any order):
destination:<place> — e.g. destination:Portugal or to:Bali
activity:<type> — e.g. activity:surf or activity:relax,cultural-travel
days:<n> or days:<min>-<max> — stay length, e.g. days:7-10
budget:<n>, budget:<min>-<max>, budget:<1500 or budget:800+ — price range in EUR
origin:<IATA> — departure airport, e.g. origin:MAD

Example
/scout destination:Portugal activity:surf days:7-10 budget:800-1500 origin:MAD

Plain messages without a leading "/" are also understood — describe what you want in your own words.`;

function parseRange(raw: string): ParsedRange | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const lte = trimmed.match(/^<=?\s*(\d+(?:\.\d+)?)$/);
  if (lte) {
    return { min: null, max: Number(lte[1]) };
  }

  const gte = trimmed.match(/^>=?\s*(\d+(?:\.\d+)?)$/);
  if (gte) {
    return { min: Number(gte[1]), max: null };
  }

  const plus = trimmed.match(/^(\d+(?:\.\d+)?)\+$/);
  if (plus) {
    return { min: Number(plus[1]), max: null };
  }

  const between = trimmed.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
  if (between) {
    const min = Number(between[1]);
    const max = Number(between[2]);
    return min <= max ? { min, max } : { min: max, max: min };
  }

  const single = trimmed.match(/^(\d+(?:\.\d+)?)$/);
  if (single) {
    return { min: null, max: Number(single[1]) };
  }

  return null;
}

function tokenize(argsText: string): string[] {
  if (!argsText.trim()) {
    return [];
  }
  return argsText.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
}

function stripQuotes(value: string): string {
  return value.replace(/^"(.*)"$/, "$1").trim();
}

function emptyParsed(name: string, rawArgs: string | null): ParsedCommand {
  return {
    name,
    raw_args: rawArgs,
    destination_focus: [],
    activity_types: [],
    stay_duration_days: null,
    budget_range_eur: null,
    origin: null,
    preferred_origins: [],
    notes: []
  };
}

/**
 * Parses a Telegram bot command (leading "/") into structured search steering
 * arguments. Returns null when the text is not a recognized command, so
 * callers can fall back to legacy free-text handling.
 */
export function parseTelegramCommand(text: string): ParsedCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  const firstSpace = trimmed.search(/\s/);
  const commandToken = firstSpace === -1 ? trimmed.slice(1) : trimmed.slice(1, firstSpace);
  const name = commandToken.split("@")[0].toLowerCase();
  const argsText = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1).trim();

  if (HELP_COMMANDS.has(name)) {
    return emptyParsed("help", argsText || null);
  }

  if (!SEARCH_COMMANDS.has(name)) {
    return null;
  }

  const result = emptyParsed(name, argsText || null);

  for (const token of tokenize(argsText)) {
    const match = token.match(/^([a-zA-Z_]+)[:=](.+)$/);
    if (!match) {
      const note = stripQuotes(token);
      if (note) {
        result.notes.push(note);
      }
      continue;
    }

    const [, rawKey, rawValue] = match;
    const key = ARG_KEY_ALIASES[rawKey.toLowerCase()];
    const value = stripQuotes(rawValue);
    if (!key || !value) {
      result.notes.push(stripQuotes(token));
      continue;
    }

    switch (key) {
      case "destination":
        result.destination_focus.push(
          ...value.split(",").map((part) => part.trim()).filter(Boolean)
        );
        break;
      case "activity":
        result.activity_types.push(
          ...value.split(",").map((part) => part.trim().toLowerCase()).filter(Boolean)
        );
        break;
      case "days":
        result.stay_duration_days = parseRange(value);
        break;
      case "budget":
        result.budget_range_eur = parseRange(value);
        break;
      case "origin": {
        const codes = value.split(",").map((part) => part.trim()).filter(Boolean);
        for (const code of codes) {
          if (/^[a-zA-Z]{3}$/.test(code)) {
            result.preferred_origins.push(code.toUpperCase());
          } else {
            result.notes.push(`origin: ${code}`);
          }
        }
        if (result.preferred_origins.length === 1 && codes.length === 1) {
          result.origin = result.preferred_origins[0];
        }
        break;
      }
    }
  }

  return result;
}
