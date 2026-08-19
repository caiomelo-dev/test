// ═══════════════════════════════════════════════════════════════════════════
// APEX — Força do Adversário, Status das Fontes e Auditoria
// ═══════════════════════════════════════════════════════════════════════════

import { Router } from "express";
import { logger } from "../lib/logger.js";
import { getMatchStrengths } from "../lib/team-strength.js";
import {
  logPredictionFromMap,
  registerResult,
  updateSettledEntry,
  calculateAccuracy,
  getPendingEntries,
  getAllEntries,
  deleteAuditEntry,
  deleteSettledEntry,
  deleteAllSettledEntries,
} from "../lib/bet-tracker.js";

const router = Router();

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

async function espnFetch<T>(url: string, timeoutMs = 8000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`ESPN ${res.status}: ${url}`);
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

// ─── GET /strengths ────────────────────────────────────────────────────────────

router.get("/strengths", async (req, res) => {
  const home = String(req.query["home"] ?? "");
  const away = String(req.query["away"] ?? "");
  const isNat = String(req.query["national"] ?? "") === "true";
  if (!home || !away) {
    res.status(400).json({ error: "home e away são obrigatórios" });
    return;
  }
  try {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("strengths timeout")), 10000)
    );
    const strengths = await Promise.race([getMatchStrengths(home, away, isNat), timeout]);
    res.json(strengths);
  } catch (err) {
    logger.error({ err }, "/strengths error");
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── sources-status ───────────────────────────────────────────────────────────

router.get("/sources-status", async (_req, res) => {
  const status: Record<string, string> = {};

  const check = async (name: string, fn: () => Promise<unknown>) => {
    try { await fn(); status[name] = "ok"; } catch { status[name] = "erro"; }
  };

  await Promise.allSettled([
    check("espn", () => espnFetch(`${ESPN_BASE}/eng.1/teams`)),
  ]);

  res.json(status);
});

// ─── audit routes ─────────────────────────────────────────────────────────────

router.get("/audit/pending", async (_req, res) => {
  try {
    res.json(await getPendingEntries());
  } catch (err) {
    logger.error({ err }, "/audit/pending error");
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/audit/all", async (_req, res) => {
  try {
    res.json(await getAllEntries());
  } catch (err) {
    logger.error({ err }, "/audit/all error");
    res.status(500).json({ error: (err as Error).message });
  }
});

router.get("/audit/accuracy", async (req, res) => {
  const threshold = parseFloat(String(req.query["threshold"])) || 60;
  try {
    res.json(await calculateAccuracy(threshold));
  } catch (err) {
    logger.error({ err }, "/audit/accuracy error");
    res.status(500).json({ error: (err as Error).message });
  }
});

// Register result for a PENDING entry (first time)
router.post("/audit/result/:trackingId", async (req, res) => {
  const { homeGoals, awayGoals, actualCards, actualCorners } = req.body as {
    homeGoals: number;
    awayGoals: number;
    actualCards?: number;
    actualCorners?: number;
  };
  if (homeGoals === undefined || awayGoals === undefined) {
    res.status(400).json({ error: "homeGoals e awayGoals são obrigatórios" });
    return;
  }
  try {
    const entry = await registerResult(req.params["trackingId"]!, {
      homeGoals, awayGoals,
      ...(actualCards !== undefined ? { actualCards } : {}),
      ...(actualCorners !== undefined ? { actualCorners } : {}),
    });
    res.json({ ok: true, entry });
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

// Edit a SETTLED entry (re-register with corrected data)
router.put("/audit/entries/:id", async (req, res) => {
  const { homeGoals, awayGoals, actualCards, actualCorners } = req.body as {
    homeGoals: number;
    awayGoals: number;
    actualCards?: number;
    actualCorners?: number;
  };
  if (homeGoals === undefined || awayGoals === undefined) {
    res.status(400).json({ error: "homeGoals e awayGoals são obrigatórios" });
    return;
  }
  try {
    const entry = await updateSettledEntry(req.params["id"]!, {
      homeGoals, awayGoals,
      ...(actualCards !== undefined ? { actualCards } : {}),
      ...(actualCorners !== undefined ? { actualCorners } : {}),
    });
    res.json({ ok: true, entry });
  } catch (err) {
    res.status(404).json({ error: (err as Error).message });
  }
});

// Log predictions from the frontend model
interface LogClientBody {
  homeTeam: string;
  awayTeam: string;
  league?: string;
  date?: string;
  exactScore?: string;
  predictions: Record<string, number | null>;
}

router.post("/audit/log-client", async (req, res) => {
  const { homeTeam, awayTeam, league, date, exactScore, predictions } = req.body as LogClientBody;
  if (!homeTeam || !awayTeam || !predictions || typeof predictions !== "object") {
    res.status(400).json({ error: "homeTeam, awayTeam e predictions são obrigatórios" });
    return;
  }
  try {
    const trackingId = await logPredictionFromMap(
      {
        homeTeam,
        awayTeam,
        league: league ?? "",
        date: date ?? new Date().toISOString().split("T")[0]!,
        exactScore,
      },
      predictions
    );
    res.json({ trackingId });
  } catch (err) {
    logger.error({ err }, "/audit/log-client error");
    res.status(500).json({ error: (err as Error).message });
  }
});

// Delete a PENDING entry
router.delete("/audit/entries/:id", async (req, res) => {
  const { id } = req.params;
  const deleted = await deleteAuditEntry(id!);
  if (!deleted) {
    res.status(404).json({ error: "Entrada não encontrada ou já encerrada — só pendentes podem ser removidas aqui" });
    return;
  }
  res.json({ ok: true });
});

// Delete a single SETTLED entry
router.delete("/audit/settled/:id", async (req, res) => {
  const { id } = req.params;
  const deleted = await deleteSettledEntry(id!);
  if (!deleted) {
    res.status(404).json({ error: "Entrada encerrada não encontrada" });
    return;
  }
  res.json({ ok: true });
});

// Delete ALL settled entries
router.delete("/audit/settled", async (_req, res) => {
  const count = await deleteAllSettledEntries();
  res.json({ ok: true, deleted: count });
});

export default router;
