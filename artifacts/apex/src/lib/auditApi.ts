// ═══════════════════════════════════════════════════════════════════════════
// APEX — Cliente da API de Auditoria
// ═══════════════════════════════════════════════════════════════════════════

export type TrackedMarket =
  | "homeWin" | "draw" | "awayWin"
  | "over05" | "over15" | "over25" | "over35"
  | "bttsYes" | "bttsNo";

// ─── Strengths ────────────────────────────────────────────────────────────────

export interface MatchStrengths {
  homeRating: number | null;
  awayRating: number | null;
  refRatingAvg: number;
  source: string;
  foundHome: boolean;
  foundAway: boolean;
}

export async function fetchStrengths(
  home: string,
  away: string,
  national: boolean,
): Promise<MatchStrengths> {
  const res = await fetch(
    `/api/strengths?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}&national=${national}`,
  );
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

export interface LogClientPayload {
  homeTeam: string;
  awayTeam: string;
  league: string;
  date?: string;
  exactScore?: string;
  /** Os 9 mercados rastreados + quaisquer mercados informativos extra */
  predictions: Partial<Record<TrackedMarket, number | null>> & Record<string, number | null | undefined>;
}

export async function logClientPrediction(
  payload: LogClientPayload,
): Promise<{ trackingId: string }> {
  const res = await fetch("/api/audit/log-client", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `Erro ${res.status}`);
  }
  return res.json();
}
