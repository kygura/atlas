import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

export function resolveRootDir(rootDir?: string): string {
  return rootDir ?? process.cwd();
}

export function rootPath(rootDir: string, ...parts: string[]): string {
  return join(rootDir, ...parts);
}

export function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

export function writeJsonFile(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}
`, "utf8");
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function diffDays(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00Z`).getTime();
  const end = new Date(`${endIso}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((end - start) / 86400000));
}

export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function parseArg(argv: string[], name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = argv.find((arg) => arg.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }

  const index = argv.findIndex((arg) => arg === `--${name}`);
  if (index >= 0) {
    return argv[index + 1];
  }

  return undefined;
}

export function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}
