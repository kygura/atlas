import { readDashboardSnapshot } from "../src/dashboard/snapshot";

type Req = Record<string, never>;

type Res = {
  status: (code: number) => Res;
  json: (body: unknown) => unknown;
};

export default function handler(_req: Req, res: Res) {
  try {
    return res.status(200).json(readDashboardSnapshot());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown dashboard error";
    return res.status(500).json({ ok: false, error: message });
  }
}
