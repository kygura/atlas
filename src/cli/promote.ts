import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveRootDir, parseArg } from "../utils/common";

function git(rootDir: string, args: string[]): string {
  return execFileSync("git", ["-C", rootDir, ...args], { encoding: "utf8" }).trim();
}

function gh(rootDir: string, args: string[]): string {
  return execFileSync("gh", args, { encoding: "utf8", cwd: rootDir }).trim();
}

export type PromoteOptions = {
  rootDir?: string;
  targetBranch?: string;
};

export function runPromote(options: PromoteOptions = {}) {
  const rootDir = resolveRootDir(options.rootDir);
  const targetBranch = options.targetBranch ?? "master";

  git(rootDir, ["rev-parse", "--git-dir"]);
  const currentBranch = git(rootDir, ["rev-parse", "--abbrev-ref", "HEAD"]);

  if (currentBranch === targetBranch) {
    git(rootDir, ["push", "origin", targetBranch]);
    return { pushed: true, merged: false, branch: currentBranch, reason: "Already on target branch; pushed." };
  }

  git(rootDir, ["push", "origin", currentBranch]);
  git(rootDir, ["fetch", "origin", targetBranch]);

  try {
    git(rootDir, ["checkout", "-B", targetBranch, `origin/${targetBranch}`]);
    git(rootDir, ["merge", "--no-ff", currentBranch, "-m", `atlas: merge ${currentBranch} into ${targetBranch}`]);
    git(rootDir, ["push", "origin", targetBranch]);
    return { pushed: true, merged: true, branch: currentBranch, reason: `Merged ${currentBranch} into ${targetBranch} and pushed.` };
  } catch {
    try {
      const prUrl = gh(rootDir, [
        "pr", "create",
        "--base", targetBranch,
        "--head", currentBranch,
        "--title", `atlas: promote ${currentBranch}`,
        "--body", `Auto-generated scan results from ${currentBranch}.`
      ]);
      gh(rootDir, ["pr", "merge", prUrl, "--squash", "--auto"]);
      return { pushed: true, merged: true, branch: currentBranch, reason: `Created and auto-merged PR for ${currentBranch} into ${targetBranch}.` };
    } catch (prErr) {
      throw new Error(
        `Failed to merge ${currentBranch} into ${targetBranch}. PR fallback also failed: ${prErr instanceof Error ? prErr.message : String(prErr)}`
      );
    }
  }
}

const isMain = fileURLToPath(import.meta.url) === process.argv[1];

if (isMain) {
  const rootDir = parseArg(process.argv.slice(2), "rootDir");
  const targetBranch = parseArg(process.argv.slice(2), "targetBranch");
  const result = runPromote({ rootDir, targetBranch });
  console.log(result.reason);
}
