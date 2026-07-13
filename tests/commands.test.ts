import { expect, test } from "bun:test";
import { parseTelegramCommand } from "../src/commands/parser";

test("parseTelegramCommand returns null for free text", () => {
  expect(parseTelegramCommand("find me a surf trip")).toBeNull();
});

test("parseTelegramCommand returns null for unrecognized commands", () => {
  expect(parseTelegramCommand("/unknown foo:bar")).toBeNull();
});

test("parseTelegramCommand parses /help", () => {
  const parsed = parseTelegramCommand("/help");
  expect(parsed?.name).toBe("help");
  expect(parsed?.raw_args).toBeNull();
});

test("parseTelegramCommand parses /start as help", () => {
  expect(parseTelegramCommand("/start")?.name).toBe("help");
});

test("parseTelegramCommand strips @botname suffix", () => {
  expect(parseTelegramCommand("/help@AtlasBot")?.name).toBe("help");
});

test("parseTelegramCommand parses a bare /scout with no args", () => {
  const parsed = parseTelegramCommand("/scout");
  expect(parsed?.name).toBe("scout");
  expect(parsed?.raw_args).toBeNull();
  expect(parsed?.destination_focus).toEqual([]);
  expect(parsed?.activity_types).toEqual([]);
});

test("parseTelegramCommand accepts /trip, /plan, /search as aliases", () => {
  expect(parseTelegramCommand("/trip destination:Bali")?.name).toBe("trip");
  expect(parseTelegramCommand("/plan destination:Bali")?.name).toBe("plan");
  expect(parseTelegramCommand("/search destination:Bali")?.name).toBe("search");
});

test("parseTelegramCommand parses destination, activity, days, budget, and origin", () => {
  const parsed = parseTelegramCommand(
    "/scout destination:Portugal activity:surf,relax days:7-10 budget:800-1500 origin:MAD"
  );
  expect(parsed?.destination_focus).toEqual(["Portugal"]);
  expect(parsed?.activity_types).toEqual(["surf", "relax"]);
  expect(parsed?.stay_duration_days).toEqual({ min: 7, max: 10 });
  expect(parsed?.budget_range_eur).toEqual({ min: 800, max: 1500 });
  expect(parsed?.origin).toBe("MAD");
  expect(parsed?.preferred_origins).toEqual(["MAD"]);
});

test("parseTelegramCommand supports key aliases (to, type, nights, price, from)", () => {
  const parsed = parseTelegramCommand("/scout to:Lombok type:surf nights:5 price:1000 from:agp");
  expect(parsed?.destination_focus).toEqual(["Lombok"]);
  expect(parsed?.activity_types).toEqual(["surf"]);
  expect(parsed?.stay_duration_days).toEqual({ min: null, max: 5 });
  expect(parsed?.budget_range_eur).toEqual({ min: null, max: 1000 });
  expect(parsed?.origin).toBe("AGP");
});

test("parseTelegramCommand handles budget comparison syntax", () => {
  expect(parseTelegramCommand("/scout budget:<1500")?.budget_range_eur).toEqual({ min: null, max: 1500 });
  expect(parseTelegramCommand("/scout budget:800+")?.budget_range_eur).toEqual({ min: 800, max: null });
  expect(parseTelegramCommand("/scout budget:1200")?.budget_range_eur).toEqual({ min: null, max: 1200 });
});

test("parseTelegramCommand keeps unrecognized tokens as notes", () => {
  const parsed = parseTelegramCommand("/scout destination:Bali quiet no-nightlife");
  expect(parsed?.notes).toEqual(["quiet", "no-nightlife"]);
});

test("parseTelegramCommand routes non-IATA origin values to notes", () => {
  const parsed = parseTelegramCommand("/scout origin:Lisbon");
  expect(parsed?.origin).toBeNull();
  expect(parsed?.preferred_origins).toEqual([]);
  expect(parsed?.notes).toEqual(["origin: Lisbon"]);
});

test("parseTelegramCommand handles multiple origins without setting a single resolved origin", () => {
  const parsed = parseTelegramCommand("/scout origin:MAD,AGP");
  expect(parsed?.preferred_origins).toEqual(["MAD", "AGP"]);
  expect(parsed?.origin).toBeNull();
});
