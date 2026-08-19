// ═══════════════════════════════════════════════════════════════════════════
// APEX — Auditoria de Apostas (Bet Tracker)
// ═══════════════════════════════════════════════════════════════════════════
//
// Persistido no Postgres (via @workspace/db) em vez de um arquivo JSON local:
// num deploy autoscale o filesystem não é garantidamente persistente entre
// reinícios/instâncias, então dados gravados em disco podiam sumir.

import { and, eq } from "drizzle-orm";
import { db, auditPredictionsTable, type AuditPrediction } from "@workspace/db";

const TRACKED_MARKETS = [
  "homeWin", "draw", "awayWin",
  "over05", "over15", "over25", "over35",
  "bttsYes", "bttsNo",
] as const;

type TrackedMarket = (typeof TRACKED_MARKETS)[number];

interface AuditEntry {
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

function rowToEntry(row: AuditPrediction): AuditEntry {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    league: row.league,
    matchDate: row.matchDate,
    predictions: row.predictions as Record<TrackedMarket, number | null>,
    ...(row.predictedExactScore != null ? { predictedExactScore: row.predictedExactScore } : {}),
    actualResult: row.actualResult as AuditEntry["actualResult"],
    status: row.status as AuditEntry["status"],
    ...(row.settledAt ? { settledAt: row.settledAt.toISOString() } : {}),
  };
}

export async function logPredictionFromMap(
  matchInfo: { homeTeam: string; awayTeam: string; league: string; date: string; exactScore?: string },
  predictionsIn: Partial<Record<TrackedMarket, number | null>>
): Promise<string> {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const predictions: Record<TrackedMarket, number | null> = {} as Record<TrackedMarket, number | null>;
  TRACKED_MARKETS.forEach((m) => {
    const v = predictionsIn[m];
    predictions[m] =
      typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null;
  });

  await db.insert(auditPredictionsTable).values({
    id,
    homeTeam: matchInfo.homeTeam,
    awayTeam: matchInfo.awayTeam,
    league: matchInfo.league ?? "",
    matchDate: matchInfo.date ?? "",
    predictions,
    predictedExactScore: matchInfo.exactScore ?? null,
    actualResult: null,
    status: "pending",
  });

  return id;
}

// ─── Build outcomes for a settled entry ────────────────────────────────────

function buildSettledResult(
  actual: { homeGoals: number; awayGoals: number; actualCards?: number; actualCorners?: number },
  predictedExactScore: string | null
): AuditEntry["actualResult"] {
  const { homeGoals, awayGoals, actualCards, actualCorners } = actual;
  const total = homeGoals + awayGoals;

  const outcomes: Record<TrackedMarket, boolean> = {
    homeWin: homeGoals > awayGoals,
    draw: homeGoals === awayGoals,
    awayWin: awayGoals > homeGoals,
    over05: total > 0.5,
    over15: total > 1.5,
    over25: total > 2.5,
    over35: total > 3.5,
    bttsYes: homeGoals > 0 && awayGoals > 0,
    bttsNo: !(homeGoals > 0 && awayGoals > 0),
  };

  const actualScoreStr = `${homeGoals}-${awayGoals}`;
  const exactScoreHit = !!predictedExactScore && predictedExactScore === actualScoreStr;

  return {
    homeGoals,
    awayGoals,
    ...(actualCards !== undefined ? { actualCards } : {}),
    ...(actualCorners !== undefined ? { actualCorners } : {}),
    outcomes,
    exactScoreHit,
  };
}

export async function registerResult(
  id: string,
  actual: { homeGoals: number; awayGoals: number; actualCards?: number; actualCorners?: number }
): Promise<AuditEntry> {
  const [row] = await db.select().from(auditPredictionsTable).where(eq(auditPredictionsTable.id, id));
  if (!row) throw new Error(`Entrada ${id} não encontrada`);
  if (row.status === "settled") {
    throw new Error(`Resultado já registrado para ${id} — use a edição para corrigir`);
  }

  const actualResult = buildSettledResult(actual, row.predictedExactScore);
  const [updated] = await db
    .update(auditPredictionsTable)
    .set({ actualResult, status: "settled", settledAt: new Date() })
    .where(eq(auditPredictionsTable.id, id))
    .returning();

  return rowToEntry(updated!);
}

export async function updateSettledEntry(
  id: string,
  actual: { homeGoals: number; awayGoals: number; actualCards?: number; actualCorners?: number }
): Promise<AuditEntry> {
  const [row] = await db.select().from(auditPredictionsTable).where(eq(auditPredictionsTable.id, id));
  if (!row) throw new Error(`Entrada ${id} não encontrada`);
  if (row.status !== "settled") {
    throw new Error(`Só entradas encerradas podem ser editadas — use /audit/result para pendentes`);
  }

  const actualResult = buildSettledResult(actual, row.predictedExactScore);
  const [updated] = await db
    .update(auditPredictionsTable)
    .set({ actualResult, settledAt: new Date() })
    .where(eq(auditPredictionsTable.id, id))
    .returning();

  return rowToEntry(updated!);
}

export async function deleteAuditEntry(id: string): Promise<boolean> {
  const deleted = await db
    .delete(auditPredictionsTable)
    .where(and(eq(auditPredictionsTable.id, id), eq(auditPredictionsTable.status, "pending")))
    .returning({ id: auditPredictionsTable.id });
  return deleted.length > 0;
}

export async function deleteSettledEntry(id: string): Promise<boolean> {
  const deleted = await db
    .delete(auditPredictionsTable)
    .where(and(eq(auditPredictionsTable.id, id), eq(auditPredictionsTable.status, "settled")))
    .returning({ id: auditPredictionsTable.id });
  return deleted.length > 0;
}

export async function deleteAllSettledEntries(): Promise<number> {
  const deleted = await db
    .delete(auditPredictionsTable)
    .where(eq(auditPredictionsTable.status, "settled"))
    .returning({ id: auditPredictionsTable.id });
  return deleted.length;
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
  porMercado: Record<
    TrackedMarket,
    {
      totalJogosAnalisados: number;
      vezesComAltaConfianca: number;
      acertosComAltaConfianca: number;
      taxaDeAcertoPct: string | null;
      brierScore: string | null;
    }
  >;
  placareExato: ExactScoreAccuracy;
  avisoMetodologico: string | null;
}

export async function calculateAccuracy(threshold = 60): Promise<AccuracyReport> {
  const rows = await db.select().from(auditPredictionsTable);
  const entries = rows.map(rowToEntry);
  const settled = entries.filter((e) => e.status === "settled");

  const porMercado = {} as AccuracyReport["porMercado"];
  TRACKED_MARKETS.forEach((market) => {
    let highConfidenceCount = 0;
    let highConfidenceHits = 0;
    const allBrier: number[] = [];

    settled.forEach((entry) => {
      const predictedProb = entry.predictions[market];
      const actualOutcome = entry.actualResult?.outcomes[market];
      if (predictedProb === null || predictedProb === undefined) return;

      const actual01 = actualOutcome ? 1 : 0;
      allBrier.push(Math.pow(predictedProb / 100 - actual01, 2));

      if (predictedProb >= threshold) {
        highConfidenceCount++;
        if (actualOutcome) highConfidenceHits++;
      }
    });

    const avgBrier = allBrier.length ? allBrier.reduce((a, b) => a + b, 0) / allBrier.length : null;

    porMercado[market] = {
      totalJogosAnalisados: settled.length,
      vezesComAltaConfianca: highConfidenceCount,
      acertosComAltaConfianca: highConfidenceHits,
      taxaDeAcertoPct:
        highConfidenceCount > 0
          ? ((highConfidenceHits / highConfidenceCount) * 100).toFixed(1)
          : null,
      brierScore: avgBrier !== null ? avgBrier.toFixed(4) : null,
    };
  });

  const comPlacar = settled.filter((e) => e.predictedExactScore != null);
  const acertosExatos = comPlacar.filter((e) => e.actualResult?.exactScoreHit).length;

  return {
    totalJogosNoBanco: entries.length,
    totalJogosComResultado: settled.length,
    totalJogosPendentes: entries.length - settled.length,
    thresholdUsado: `${threshold}%`,
    porMercado,
    placareExato: {
      totalComPlacar: comPlacar.length,
      acertos: acertosExatos,
      taxaDeAcertoPct: comPlacar.length > 0
        ? ((acertosExatos / comPlacar.length) * 100).toFixed(1)
        : null,
    },
    avisoMetodologico:
      settled.length < 30
        ? `⚠️ Apenas ${settled.length} jogos com resultado registrado. Para uma taxa estatisticamente confiável, o ideal é ter pelo menos 30-50 jogos.`
        : null,
  };
}

export async function getPendingEntries(): Promise<AuditEntry[]> {
  const rows = await db.select().from(auditPredictionsTable).where(eq(auditPredictionsTable.status, "pending"));
  return rows.map(rowToEntry);
}

export async function getAllEntries(): Promise<AuditEntry[]> {
  const rows = await db.select().from(auditPredictionsTable);
  return rows.map(rowToEntry);
}

export { TRACKED_MARKETS };
