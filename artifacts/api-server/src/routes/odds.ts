import { Router } from "express";
import { logger } from "../lib/logger";
import { fetchBetanoOdds } from "../lib/oddspapi";

const router = Router();

// Odds da Betano (via OddsPapi) pro confronto informado — devolve null de
// forma limpa quando não encontra o jogo ou a Betano não tem mercado aberto
// pra ele ainda (comum, principalmente em ligas menores ou muito antes do
// jogo). Nunca quebra o fluxo de export por falta de odds.
router.get("/odds/match", async (req, res) => {
  const { home, away, date } = req.query as { home?: string; away?: string; date?: string };
  if (!home || !away) {
    res.status(400).json({ error: "home e away são obrigatórios" });
    return;
  }
  try {
    const odds = await fetchBetanoOdds(home, away, date);
    res.json({ odds });
  } catch (err) {
    logger.error({ err }, "/odds/match error");
    res.status(500).json({ error: "Falha ao buscar odds" });
  }
});

export default router;
