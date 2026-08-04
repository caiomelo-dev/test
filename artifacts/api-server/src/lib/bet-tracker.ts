// ═══════════════════════════════════════════════════════════════════════════
// APEX — Auditoria de Apostas (Bet Tracker)
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

const DB_PATH = join(process.cwd(), "data", "audit-log.json");

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

interface AuditDB {
  entries: AuditEntry[];
}

function ensureDB(): void {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  if (!existsSync(DB_PATH)) writeFileSync(DB_PATH, JSON.stringify({ entries: [] }, null, 2));
}

function readDB(): AuditDB {
  ensureDB();
  return JSON.parse(readFileSync(DB_PATH, "utf-8")) as AuditDB;
}

function writeDB(db: AuditDB): void {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export function logPredictionFromMap(
  matchInfo: { homeTeam: string; awayTeam: string; league: string; date: string; exactScore?: string },
  predictionsIn: Partial<Record<TrackedMarket, number | null>>
): string {
  const db = readDB();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const predictions: Record<TrackedMarket, number | null> = {} as Record<TrackedMarket, number | null>;
  TRACKED_MARKETS.forEach((m) => {
    const v = predictionsIn[m];
    predictions[m] =
      typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : null;
  });

  db.entries.push({
    id,
    createdAt: new Date().toISOString(),
    homeTeam: matchInfo.homeTeam,
    awayTeam: matchInfo.awayTeam,
    league: matchInfo.league ?? "",
    matchDate: matchInfo.date ?? "",
    predictions,
    predictedExactScore: matchInfo.exactScore,
    actualResult: null,
    status: "pending",
  });

  writeDB(db);
  return id;
}

// ─── Build outcomes and settle an entry ────────────────────────────────────

function buildSettledResult(
  entry: AuditEntry,
  actual: { homeGoals: number; awayGoals: number; actualCards?: number; actualCorners?: number }
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
  const exactScoreHit = !!entry.predictedExactScore && entry.predictedExactScore === actualScoreStr;

  return {
    homeGoals,
    awayGoals,
    ...(actualCards !== undefined ? { actualCards } : {}),
    ...(actualCorners !== undefined ? { actualCorners } : {}),
    outcomes,
    exactScoreHit,
  };
}

export function registerResult(
  id: string,
  actual: { homeGoals: number; awayGoals: number; actualCards?: number; actualCorners?: number }
): AuditEntry {
  const db = readDB();
  const entry = db.entries.find((e) => e.id === id);
  if (!entry) throw new Error(`Entrada ${id} não encontrada`);
  if (entry.status === "settled") {
    throw new Error(`Resultado já registrado para ${id} — use a edição para corrigir`);
  }

  entry.actualResult = buildSettledResult(entry, actual);
  entry.status = "settled";
  entry.settledAt = new Date().toISOString();

  writeDB(db);
  return entry;
}

export function updateSettledEntry(
  id: string,
  actual: { homeGoals: number; awayGoals: number; actualCards?: number; actualCorners?: number }
): AuditEntry {
  const db = readDB();
  const entry = db.entries.find((e) => e.id === id);
  if (!entry) throw new Error(`Entrada ${id} não encontrada`);
  if (entry.status !== "settled") {
    throw new Error(`Só entradas encerradas podem ser editadas — use /audit/result para pendentes`);
  }

  entry.actualResult = buildSettledResult(entry, actual);
  entry.settledAt = new Date().toISOString();

  writeDB(db);
  return entry;
}

export function deleteAuditEntry(id: string): boolean {
  const db = readDB();
  const idx = db.entries.findIndex((e) => e.id === id && e.status === "pending");
  if (idx === -1) return false;
  db.entries.splice(idx, 1);
  writeDB(db);
  return true;
}

export function deleteSettledEntry(id: string): boolean {
  const db = readDB();
  const idx = db.entries.findIndex((e) => e.id === id && e.status === "settled");
  if (idx === -1) return false;
  db.entries.splice(idx, 1);
  writeDB(db);
  return true;
}

export function deleteAllSettledEntries(): number {
  const db = readDB();
  const before = db.entries.length;
  db.entries = db.entries.filter((e) => e.status !== "settled");
  writeDB(db);
  return before - db.entries.length;
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

export function calculateAccuracy(threshold = 60): AccuracyReport {
  const db = readDB();
  const settled = db.entries.filter((e) => e.status === "settled");

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
    totalJogosNoBanco: db.entries.length,
    totalJogosComResultado: settled.length,
    totalJogosPendentes: db.entries.length - settled.length,
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

export function getPendingEntries() {
  return readDB().entries.filter((e) => e.status === "pending");
}

export function getAllEntries() {
  return readDB().entries;
}

export { TRACKED_MARKETS };
