import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

// ─── Predições calibradas do modelo (mercados em %, usadas para medir a
// taxa de acerto / Brier score do método) ───────────────────────────────────
export const auditPredictionsTable = pgTable("audit_predictions", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  league: text("league").notNull().default(""),
  matchDate: text("match_date").notNull().default(""),
  predictions: jsonb("predictions").$type<Record<string, number | null>>().notNull(),
  predictedExactScore: text("predicted_exact_score"),
  actualResult: jsonb("actual_result").$type<{
    homeGoals: number;
    awayGoals: number;
    actualCards?: number;
    actualCorners?: number;
    outcomes: Record<string, boolean>;
    exactScoreHit: boolean;
  } | null>(),
  status: text("status").notNull().default("pending"), // "pending" | "settled"
  settledAt: timestamp("settled_at", { withTimezone: true }),
});

export type AuditPrediction = typeof auditPredictionsTable.$inferSelect;
export type InsertAuditPrediction = typeof auditPredictionsTable.$inferInsert;

// ─── Revisão manual de partidas (dados brutos exportados + placar real
// conferido à mão pelo usuário — sem cálculo/predição envolvida) ───────────
export const matchReviewEntriesTable = pgTable("match_review_entries", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  homeTeam: text("home_team").notNull(),
  awayTeam: text("away_team").notNull(),
  league: text("league").notNull().default(""),
  matchDate: text("match_date").notNull().default(""),
  rawData: text("raw_data").notNull(),
  status: text("status").notNull().default("pendente"), // "pendente" | "concluida"
  realScore: text("real_score"),
  notes: text("notes"),
  concludedAt: timestamp("concluded_at", { withTimezone: true }),
});

export type MatchReviewEntry = typeof matchReviewEntriesTable.$inferSelect;
export type InsertMatchReviewEntry = typeof matchReviewEntriesTable.$inferInsert;
