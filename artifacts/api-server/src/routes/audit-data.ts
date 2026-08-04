import { Router } from "express";
import fs from "fs";
import path from "path";
import { logger } from "../lib/logger";

const router = Router();

// Ajuste 12: armazenamento em arquivo JSON — sobrevive a restart do
// servidor, diferente do bet-tracker antigo (em memória). Sem precisar
// configurar banco (o Drizzle/Postgres do projeto está configurado mas
// nunca foi usado — isso resolve a persistência sem essa complexidade).
const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "audit-entries.json");

interface AuditEntry {
  id: string;
  createdAt: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string;
  rawData: string;
  status: "pendente" | "concluida";
  realScore?: string;
  notes?: string;
  concludedAt?: string;
}

function loadEntries(): AuditEntry[] {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const raw = fs.readFileSync(DATA_FILE, "utf-8");
    return JSON.parse(raw) as AuditEntry[];
  } catch (err) {
    logger.error({ err }, "Falha ao ler audit-entries.json");
    return [];
  }
}

function saveEntries(entries: AuditEntry[]): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

// Lista todas as entradas (pendentes + concluídas)
router.get("/audit-data", (_req, res) => {
  res.json({ entries: loadEntries() });
});

// Salva um jogo buscado (a partir do modo "apenas os dados")
router.post("/audit-data", (req, res) => {
  const { homeTeam, awayTeam, league, date, rawData } = req.body ?? {};
  if (!homeTeam || !awayTeam || !rawData) {
    res.status(400).json({ error: "homeTeam, awayTeam e rawData são obrigatórios" });
    return;
  }
  const entries = loadEntries();
  const entry: AuditEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    homeTeam: String(homeTeam),
    awayTeam: String(awayTeam),
    league: String(league ?? ""),
    date: String(date ?? ""),
    rawData: String(rawData),
    status: "pendente",
  };
  entries.unshift(entry);
  saveEntries(entries);
  res.json({ entry });
});

// Marca uma entrada como concluída, com o placar/resultado real informado
// manualmente pelo usuário (decisão de produto: sem busca automática de
// resultado — o usuário confirma o que realmente aconteceu).
router.patch("/audit-data/:id", (req, res) => {
  const { id } = req.params;
  const { realScore, notes } = req.body ?? {};
  const entries = loadEntries();
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) {
    res.status(404).json({ error: "Entrada não encontrada" });
    return;
  }
  entries[idx] = {
    ...entries[idx],
    status: "concluida",
    realScore: realScore != null ? String(realScore) : entries[idx].realScore,
    notes: notes != null ? String(notes) : entries[idx].notes,
    concludedAt: new Date().toISOString(),
  };
  saveEntries(entries);
  res.json({ entry: entries[idx] });
});

// Reabre uma entrada concluída por engano
router.patch("/audit-data/:id/reabrir", (req, res) => {
  const { id } = req.params;
  const entries = loadEntries();
  const idx = entries.findIndex(e => e.id === id);
  if (idx === -1) {
    res.status(404).json({ error: "Entrada não encontrada" });
    return;
  }
  entries[idx].status = "pendente";
  saveEntries(entries);
  res.json({ entry: entries[idx] });
});

router.delete("/audit-data/:id", (req, res) => {
  const { id } = req.params;
  const before = loadEntries();
  const entries = before.filter(e => e.id !== id);
  if (entries.length === before.length) {
    res.status(404).json({ error: "Entrada não encontrada" });
    return;
  }
  saveEntries(entries);
  res.json({ ok: true });
});

export default router;
