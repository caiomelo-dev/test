// ═══════════════════════════════════════════════════════════════════════════
// APEX — Cliente da API de Auditoria
// ═══════════════════════════════════════════════════════════════════════════

export type TrackedMarket =
  | "homeWin" | "draw" | "awayWin"
  | "over05" | "over15" | "over25" | "over35"
  | "bttsYes" | "bttsNo";

export interface MarketAccuracy {
  totalJogosAnalisados: number;
  vezesComAltaConfianca: number;
  acertosComAltaConfianca: number;
  taxaDeAcertoPct: string | null;
  brierScore: string | null;
}

export interface ExactScoreAccuracy {
  totalComPlacar: number;
  acertos: number;
  taxaDeAcertoPct: string | null;
}

export interface AccuracyReport {
  totalJogosNoBanco: number;
  totalJogosComResultado: number;
  totalJogosPendentes: number;
  thresholdUsado: string;
  porMercado: Record<TrackedMarket, MarketAccuracy>;
  placareExato: ExactScoreAccuracy;
  avisoMetodologico: string | null;
}

export interface AuditEntry {
  id: string;
  createdAt: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  matchDate: string;
  predictions: Record<TrackedMarket, number | null>;
  predictedExactScore?: string;
  actualResult: {
    homeGoals: number;
    awayGoals: number;
    actualCards?: number;
    actualCorners?: number;
    outcomes: Record<TrackedMarket, boolean>;
    exactScoreHit: boolean;
  } | null;
  status: "pending" | "settled";
  settledAt?: string;
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function fetchAccuracy(threshold: number): Promise<AccuracyReport> {
  const res = await fetch(`/api/audit/accuracy?threshold=${threshold}`);
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

export async function fetchPending(): Promise<AuditEntry[]> {
  const res = await fetch("/api/audit/pending");
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

export async function fetchSettled(): Promise<AuditEntry[]> {
  const res = await fetch("/api/audit/all");
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  const all: AuditEntry[] = await res.json();
  return all.filter((e) => e.status === "settled").sort((a, b) =>
    (b.settledAt ?? b.createdAt) > (a.settledAt ?? a.createdAt) ? 1 : -1
  );
}

// ─── Register / Edit ──────────────────────────────────────────────────────────

export async function registerAuditResult(
  trackingId: string,
  homeGoals: number,
  awayGoals: number,
  actualCards?: number,
  actualCorners?: number,
): Promise<void> {
  const body: Record<string, number> = { homeGoals, awayGoals };
  if (actualCards !== undefined) body["actualCards"] = actualCards;
  if (actualCorners !== undefined) body["actualCorners"] = actualCorners;
  const res = await fetch(`/api/audit/result/${trackingId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `Erro ${res.status}`);
  }
}

export async function updateAuditEntry(
  id: string,
  homeGoals: number,
  awayGoals: number,
  actualCards?: number,
  actualCorners?: number,
): Promise<void> {
  const body: Record<string, number> = { homeGoals, awayGoals };
  if (actualCards !== undefined) body["actualCards"] = actualCards;
  if (actualCorners !== undefined) body["actualCorners"] = actualCorners;
  const res = await fetch(`/api/audit/entries/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `Erro ${res.status}`);
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteAuditEntry(id: string): Promise<void> {
  const res = await fetch(`/api/audit/entries/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `Erro ${res.status}`);
  }
}

export async function deleteSettledEntry(id: string): Promise<void> {
  const res = await fetch(`/api/audit/settled/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `Erro ${res.status}`);
  }
}

export async function deleteAllSettled(): Promise<number> {
  const res = await fetch("/api/audit/settled", { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `Erro ${res.status}`);
  }
  const data = await res.json() as { deleted: number };
  return data.deleted;
}

// ─── Export CSV (client-side) ─────────────────────────────────────────────────

export function exportSettledToCSV(entries: AuditEntry[]): void {
  const MARKETS: TrackedMarket[] = ["homeWin", "draw", "awayWin", "over05", "over15", "over25", "over35", "bttsYes", "bttsNo"];
  const header = [
    "ID", "Criado em", "Encerrado em",
    "Casa", "Fora", "Liga", "Data do Jogo",
    "Placar Previsto", "Placar Real", "Acertou Placar Exato",
    "Gols Casa Real", "Gols Fora Real",
    "Cartões Reais", "Escanteios Reais",
    ...MARKETS.flatMap((m) => [`${MARKET_LABELS[m]} Prev%`, `${MARKET_LABELS[m]} Acertou`]),
  ];

  const rows = entries.map((e) => {
    const r = e.actualResult;
    const actualScore = r ? `${r.homeGoals}-${r.awayGoals}` : "";
    return [
      e.id,
      e.createdAt,
      e.settledAt ?? "",
      e.homeTeam,
      e.awayTeam,
      e.league,
      e.matchDate,
      e.predictedExactScore ?? "",
      actualScore,
      r?.exactScoreHit ? "Sim" : "Não",
      r ? String(r.homeGoals) : "",
      r ? String(r.awayGoals) : "",
      r?.actualCards !== undefined ? String(r.actualCards) : "",
      r?.actualCorners !== undefined ? String(r.actualCorners) : "",
      ...MARKETS.flatMap((m) => [
        e.predictions[m] !== null && e.predictions[m] !== undefined ? String(e.predictions[m]) : "",
        r ? (r.outcomes[m] ? "Sim" : "Não") : "",
      ]),
    ];
  });

  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((row) => row.map(escape).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `apex-auditoria-${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

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

// ─── Labels ───────────────────────────────────────────────────────────────────

export const MARKET_LABELS: Record<TrackedMarket, string> = {
  homeWin: "Vitória Casa",
  draw: "Empate",
  awayWin: "Vitória Fora",
  over05: "Over 0.5",
  over15: "Over 1.5",
  over25: "Over 2.5",
  over35: "Over 3.5",
  bttsYes: "BTTS Sim",
  bttsNo: "BTTS Não",
};

export const MARKET_ORDER: TrackedMarket[] = [
  "homeWin", "draw", "awayWin",
  "over05", "over15", "over25", "over35",
  "bttsYes", "bttsNo",
];
