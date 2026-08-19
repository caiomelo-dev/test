import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { db, matchReviewEntriesTable, type MatchReviewEntry } from "@workspace/db";
import { logger } from "../lib/logger";

const router = Router();

// Persistido no Postgres (via @workspace/db) em vez de um arquivo JSON local
// em disco — num deploy autoscale o filesystem não é garantidamente
// persistente entre reinícios/instâncias, então essa revisão manual de
// partidas podia sumir mesmo estando "salva".

// Mantém o contrato de API existente (campo "date", timestamps como string)
// mesmo com o schema do banco usando "matchDate"/Date.
function toApiEntry(row: MatchReviewEntry) {
  const { matchDate, createdAt, concludedAt, realScore, notes, ...rest } = row;
  return {
    ...rest,
    date: matchDate,
    createdAt: createdAt.toISOString(),
    ...(concludedAt ? { concludedAt: concludedAt.toISOString() } : {}),
    ...(realScore != null ? { realScore } : {}),
    ...(notes != null ? { notes } : {}),
  };
}

// Lista todas as entradas (pendentes + concluídas)
router.get("/audit-data", async (_req, res) => {
  try {
    const entries = await db
      .select()
      .from(matchReviewEntriesTable)
      .orderBy(desc(matchReviewEntriesTable.createdAt));
    res.json({ entries: entries.map(toApiEntry) });
  } catch (err) {
    logger.error({ err }, "Falha ao ler audit-data");
    res.status(500).json({ error: "Falha ao ler dados de auditoria" });
  }
});

// Salva um jogo buscado (a partir do modo "apenas os dados")
router.post("/audit-data", async (req, res) => {
  const { homeTeam, awayTeam, league, date, rawData } = req.body ?? {};
  if (!homeTeam || !awayTeam || !rawData) {
    res.status(400).json({ error: "homeTeam, awayTeam e rawData são obrigatórios" });
    return;
  }
  try {
    const [entry] = await db
      .insert(matchReviewEntriesTable)
      .values({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        homeTeam: String(homeTeam),
        awayTeam: String(awayTeam),
        league: String(league ?? ""),
        matchDate: String(date ?? ""),
        rawData: String(rawData),
        status: "pendente",
      })
      .returning();
    res.json({ entry: toApiEntry(entry!) });
  } catch (err) {
    logger.error({ err }, "Falha ao salvar audit-data");
    res.status(500).json({ error: "Falha ao salvar dados de auditoria" });
  }
});

// Marca uma entrada como concluída, com o placar/resultado real informado
// manualmente pelo usuário (decisão de produto: sem busca automática de
// resultado — o usuário confirma o que realmente aconteceu).
router.patch("/audit-data/:id", async (req, res) => {
  const { id } = req.params;
  const { realScore, notes } = req.body ?? {};
  try {
    const [entry] = await db
      .update(matchReviewEntriesTable)
      .set({
        status: "concluida",
        ...(realScore != null ? { realScore: String(realScore) } : {}),
        ...(notes != null ? { notes: String(notes) } : {}),
        concludedAt: new Date(),
      })
      .where(eq(matchReviewEntriesTable.id, id!))
      .returning();
    if (!entry) {
      res.status(404).json({ error: "Entrada não encontrada" });
      return;
    }
    res.json({ entry: toApiEntry(entry) });
  } catch (err) {
    logger.error({ err }, "Falha ao concluir audit-data");
    res.status(500).json({ error: "Falha ao concluir entrada" });
  }
});

// Reabre uma entrada concluída por engano
router.patch("/audit-data/:id/reabrir", async (req, res) => {
  const { id } = req.params;
  try {
    const [entry] = await db
      .update(matchReviewEntriesTable)
      .set({ status: "pendente" })
      .where(eq(matchReviewEntriesTable.id, id!))
      .returning();
    if (!entry) {
      res.status(404).json({ error: "Entrada não encontrada" });
      return;
    }
    res.json({ entry: toApiEntry(entry) });
  } catch (err) {
    logger.error({ err }, "Falha ao reabrir audit-data");
    res.status(500).json({ error: "Falha ao reabrir entrada" });
  }
});

router.delete("/audit-data/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const deleted = await db
      .delete(matchReviewEntriesTable)
      .where(eq(matchReviewEntriesTable.id, id!))
      .returning({ id: matchReviewEntriesTable.id });
    if (!deleted.length) {
      res.status(404).json({ error: "Entrada não encontrada" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Falha ao apagar audit-data");
    res.status(500).json({ error: "Falha ao apagar entrada" });
  }
});

export default router;
