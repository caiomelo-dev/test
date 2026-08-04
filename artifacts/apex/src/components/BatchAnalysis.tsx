import { useState, useCallback } from "react";
import { C, LEAGUES, ESPN_LEAGUE_MAP, currentSeasonYear } from "../lib/constants";
import { espnSearchTeams, espnLoadTeamGames, getEspnSlug } from "../lib/espnApi";
import {
  consolidate,
  goalProbabilities,
  exactScoreProbabilities,
  scoreMarkets,
  buildRecommendations,
  marketStatus,
  type MarketPick,
} from "../lib/math";
import { fetchStrengths, logClientPrediction } from "../lib/auditApi";
import { ScoreGauge } from "./ScoreGauge";
import { MarketRow } from "./MarketRow";
import type { EspnTeam } from "../lib/espnApi";
import type { Game, H2HData, RefereeData, Team, MotivationFactors, MarketScores } from "../types";

// ─── Day-parlay builders ─────────────────────────────────────────────────────

interface ParlayLeg {
  game: string;
  market: string;
  score: number;
  category: string;
  categoryIcon: string;
}

const ALT_CATEGORIES: {
  name: string;
  icon: string;
  keys: { key: keyof MarketScores; label: string }[];
}[] = [
  {
    name: "1X2 / Dupla Chance",
    icon: "⚽",
    keys: [
      { key: "homeWin", label: "Casa Vence" },
      { key: "draw", label: "Empate" },
      { key: "awayWin", label: "Fora Vence" },
      { key: "ahHome", label: "Dupla Chance 1X" },
      { key: "ahAway", label: "Dupla Chance X2" },
    ],
  },
  {
    name: "Gols",
    icon: "🥅",
    keys: [
      { key: "over15", label: "Over 1.5 Gols" },
      { key: "over25", label: "Over 2.5 Gols" },
      { key: "under25", label: "Under 2.5 Gols" },
      { key: "btts", label: "Ambos Marcam (BTTS)" },
      { key: "bttsNo", label: "BTTS Não" },
    ],
  },
  {
    name: "Escanteios",
    icon: "📐",
    keys: [
      { key: "c75", label: "Over 7.5 Escanteios" },
      { key: "c85", label: "Over 8.5 Escanteios" },
      { key: "c95", label: "Over 9.5 Escanteios" },
      { key: "cornersHome", label: "Mais Escanteios Casa" },
      { key: "cornersAway", label: "Mais Escanteios Fora" },
    ],
  },
  {
    name: "Cartões",
    icon: "🟨",
    keys: [
      { key: "cards35", label: "Over 3.5 Cartões" },
      { key: "cards", label: "Cartões — Alta" },
      { key: "htCards", label: "Cartões 1º Tempo" },
      { key: "stCards", label: "Cartões 2º Tempo" },
    ],
  },
];

function buildDayParlays(results: SlotResult[]): {
  otima: ParlayLeg[];
  alternativa: ParlayLeg[];
  otimaScore: number;
  altScore: number;
} {
  const valid = results.filter((r) => !r.error && r.mkts && r.recommended);

  const otima: ParlayLeg[] = valid.flatMap((r) =>
    r.recommended
      ? [{ game: `${r.homeTeam} vs ${r.awayTeam}`, market: r.recommended.label, score: r.recommended.score, category: "Melhor Geral", categoryIcon: "🎯" }]
      : []
  );

  // 4 legs per game — one best pick from each category for each game
  const alternativa: ParlayLeg[] = [];
  for (const r of valid) {
    if (!r.mkts) continue;
    const gameName = `${r.homeTeam} vs ${r.awayTeam}`;
    for (const cat of ALT_CATEGORIES) {
      let bestScore = -Infinity;
      let bestLabel = "";
      for (const { key, label } of cat.keys) {
        const score = r.mkts[key] ?? 0;
        if (score > bestScore) { bestScore = score; bestLabel = label; }
      }
      if (bestLabel) {
        alternativa.push({ game: gameName, market: bestLabel, score: bestScore, category: cat.name, categoryIcon: cat.icon });
      }
    }
  }

  const calcScore = (legs: ParlayLeg[]) =>
    legs.length ? legs.reduce((acc, l) => acc * (l.score / 10), 1) * 10 : 0;

  return { otima, alternativa, otimaScore: calcScore(otima), altScore: calcScore(alternativa) };
}

// ─── Defaults for batch (no H2H / referee / motivation input) ────────────────

const DEFAULT_MOTIVATION: MotivationFactors = {
  title: false, relegation: false, continental: false,
  knockout: false, classic: false, mustwin: false,
};
const DEFAULT_H2H: H2HData = {
  last5_btts: "0", last5_over25: "0", last5_over35: "0", last5_avgGoals: "0",
  last10_btts: "0", last10_over25: "0", last10_over35: "0", last10_avgGoals: "0",
};
const DEFAULT_REF: RefereeData = {
  avgYellows: "0", avgReds: "0", avgFouls: "0", avgPenalties: "0",
};
function makeTeamObj(name: string, logo: string, games: Game[]): Team {
  return { name, position: "", teamId: null, logo, motivation: DEFAULT_MOTIVATION, games };
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SlotState {
  leagueId: number;
  homeQuery: string;
  awayQuery: string;
  homeTeam: EspnTeam | null;
  awayTeam: EspnTeam | null;
  homeGames: Game[];
  awayGames: Game[];
  homeSearchRes: EspnTeam[];
  awaySearchRes: EspnTeam[];
  homeSearching: boolean;
  awaySearching: boolean;
  homeLoading: boolean;
  awayLoading: boolean;
}

interface SlotResult {
  homeTeam: string;
  awayTeam: string;
  homeLogo: string;
  awayLogo: string;
  leagueName: string;
  homeWin: number;
  draw: number;
  awayWin: number;
  btts: number;
  over25: number;
  topScore: string;
  overall: number;
  mkts: MarketScores | null;
  recommended: MarketPick | null;
  multipla: MarketPick[];
  combined: number;
  loggedToAudit: boolean;
  error: string | null;
}

const DEFAULT_LEAGUE = 71;

function makeSlot(): SlotState {
  return {
    leagueId: DEFAULT_LEAGUE,
    homeQuery: "", awayQuery: "",
    homeTeam: null, awayTeam: null,
    homeGames: [], awayGames: [],
    homeSearchRes: [], awaySearchRes: [],
    homeSearching: false, awaySearching: false,
    homeLoading: false, awayLoading: false,
  };
}

// ─── Small helper components ──────────────────────────────────────────────────

function pill(active: boolean, onClick: () => void, children: React.ReactNode) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 18px", borderRadius: 8, border: `1px solid ${active ? C.cyan : C.border}`,
        background: active ? `${C.cyan}18` : "rgba(255,255,255,.03)",
        color: active ? C.cyan : C.muted, fontSize: 13, fontWeight: 700, cursor: "pointer",
      }}
    >{children}</button>
  );
}

function TeamSearch({
  label, query, onQueryChange, searchRes, searching, loading, selected,
  onSearch, onSelect, onClear,
}: {
  label: string;
  query: string;
  onQueryChange: (v: string) => void;
  searchRes: EspnTeam[];
  searching: boolean;
  loading: boolean;
  selected: EspnTeam | null;
  onSearch: () => void;
  onSelect: (t: EspnTeam) => void;
  onClear: () => void;
}) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700, marginBottom: 5 }}>{label}</div>
      {selected ? (
        <div style={{ display: "flex", alignItems: "center", gap: 7, background: `${C.cyan}10`, border: `1px solid ${C.cyan}33`, borderRadius: 8, padding: "8px 10px" }}>
          {selected.logo && <img src={selected.logo} alt="" style={{ width: 20, height: 20, objectFit: "contain" }} />}
          <span style={{ fontSize: 12, fontWeight: 700, color: C.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.name}</span>
          <button onClick={onClear} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}>✕</button>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          <div style={{ display: "flex", gap: 5 }}>
            <input
              type="text"
              value={query}
              placeholder="Nome do time..."
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") onSearch(); }}
              style={{ flex: 1, background: "rgba(255,255,255,.04)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 12, outline: "none" }}
            />
            <button
              onClick={onSearch}
              disabled={searching || loading || !query.trim()}
              style={{ background: `${C.cyan}22`, border: `1px solid ${C.cyan}44`, borderRadius: 8, padding: "8px 10px", color: C.cyan, fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", opacity: (searching || loading || !query.trim()) ? 0.5 : 1 }}
            >
              {searching ? "…" : "Buscar"}
            </button>
          </div>
          {searchRes.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 50, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, marginTop: 3, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,.5)" }}>
              {searchRes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => onSelect(t)}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "9px 12px", background: "none", border: "none", cursor: "pointer", color: C.text, fontSize: 12, textAlign: "left" }}
                >
                  {t.logo && <img src={t.logo} alt="" style={{ width: 18, height: 18, objectFit: "contain" }} />}
                  {t.name}
                </button>
              ))}
            </div>
          )}
          {loading && <div style={{ fontSize: 10, color: C.cyan, marginTop: 4 }}>Carregando jogos…</div>}
        </div>
      )}
    </div>
  );
}

// ─── Result card ──────────────────────────────────────────────────────────────

function ResultCard({ r }: { r: SlotResult }) {
  if (r.error) {
    return (
      <div style={{ background: C.card, border: "1px solid #FF4D4D44", borderRadius: 12, padding: "14px 16px" }}>
        <TeamHeader r={r} />
        <div style={{ fontSize: 11, color: C.red, marginTop: 8 }}>{r.error}</div>
      </div>
    );
  }

  const rst = r.recommended ? marketStatus(r.recommended.score) : null;
  const cst = marketStatus(r.combined);

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "14px 16px 12px" }}>
        <TeamHeader r={r} />

        {/* ScoreGauge + 1X2 side by side */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 14 }}>
          <div style={{ transform: "scale(0.72)", transformOrigin: "top left", flexShrink: 0, width: 94, height: 94 }}>
            <ScoreGauge score={r.overall} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>1X2</div>
            <div style={{ display: "flex", gap: 5 }}>
              {[
                ["Casa", r.homeWin, C.green],
                ["Empate", r.draw, "#FFB800"],
                ["Fora", r.awayWin, C.red],
              ].map(([l, v, col]) => (
                <div key={l as string} style={{ flex: 1, background: `${col as string}12`, border: `1px solid ${col as string}33`, borderRadius: 8, padding: "7px 4px", textAlign: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "monospace", color: col as string }}>{v}%</div>
                  <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>{l as string}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Market rows */}
      {r.mkts && (
        <div style={{ padding: "0 16px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 9, color: C.cyan, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, padding: "10px 0 2px" }}>Mercados</div>
          <MarketRow label="Over 2.5 Gols" score={r.mkts.over25} />
          <MarketRow label="Under 2.5 Gols" score={r.mkts.under25} />
          <MarketRow label="BTTS — Ambos Marcam" score={r.mkts.btts} />
          <MarketRow label="BTTS Não" score={r.mkts.bttsNo} />
          <MarketRow label="Casa Vence" score={r.mkts.homeWin} />
          <MarketRow label="Empate" score={r.mkts.draw} />
          <MarketRow label="Fora Vence" score={r.mkts.awayWin} />
        </div>
      )}

      {/* Exact score */}
      {r.topScore !== "—" && (
        <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color: C.muted }}>🎯 Placar mais provável</span>
          <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace", color: C.cyan }}>{r.topScore}</span>
        </div>
      )}

      {/* Single pick recommendation */}
      {r.recommended && rst && (
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}`, background: `${rst.color}0a` }}>
          <div style={{ fontSize: 9, color: rst.color, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, marginBottom: 6 }}>🎯 Mercado Recomendado</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>{r.recommended.label}</div>
              <div style={{ fontSize: 10, color: rst.color, fontWeight: 700, marginTop: 2 }}>{rst.label}</div>
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, fontFamily: "monospace", color: rst.color, lineHeight: 1 }}>
              {r.recommended.score.toFixed(1)}<span style={{ fontSize: 10, color: C.muted }}>/10</span>
            </div>
          </div>
        </div>
      )}

      {/* Múltipla */}
      {r.multipla.length > 0 && (
        <div style={{ padding: "12px 16px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 9, color: C.cyan, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>🎰 Múltipla — 3 seleções</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {r.multipla.map((p, i) => {
              const pst = marketStatus(p.score);
              return (
                <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,.03)", borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", background: `${C.cyan}22`, color: C.cyan, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.text }}>{p.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace", color: pst.color }}>{p.score.toFixed(1)}</div>
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
            <span style={{ fontSize: 10, color: C.muted }}>Índice combinado</span>
            <span style={{ fontSize: 16, fontWeight: 800, fontFamily: "monospace", color: cst.color }}>{r.combined.toFixed(1)}<span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>/10</span></span>
          </div>
        </div>
      )}

      {/* Audit status */}
      {r.loggedToAudit && (
        <div style={{ padding: "8px 16px", borderTop: `1px solid ${C.border}`, fontSize: 10, color: C.green }}>
          ✓ Registrado na auditoria
        </div>
      )}
    </div>
  );
}

function ParlayCard({
  title, subtitle, icon, legs, combinedScore, accentColor, warning,
}: {
  title: string;
  subtitle: string;
  icon: string;
  legs: ParlayLeg[];
  combinedScore: number;
  accentColor: string;
  warning?: string;
}) {
  const cst = marketStatus(combinedScore);
  return (
    <div style={{ background: C.card, border: `1px solid ${accentColor}44`, borderRadius: 12, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "13px 16px 10px", borderBottom: `1px solid ${C.border}`, background: `${accentColor}0a` }}>
        <div style={{ fontSize: 10, color: accentColor, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 2 }}>
          {icon} {title}
        </div>
        <div style={{ fontSize: 11, color: C.muted }}>{subtitle}</div>
      </div>

      {/* Legs */}
      <div style={{ padding: "10px 16px" }}>
        {legs.length === 0 ? (
          <div style={{ fontSize: 11, color: C.muted, textAlign: "center", padding: "8px 0" }}>
            Nenhum jogo válido para montar a múltipla.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {legs.map((leg, i) => {
              const lst = marketStatus(leg.score);
              return (
                <div
                  key={i}
                  style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,.03)", borderRadius: 8, padding: "9px 12px" }}
                >
                  {/* Step number */}
                  <div style={{ width: 22, height: 22, borderRadius: "50%", background: `${accentColor}22`, color: accentColor, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {i + 1}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Category badge */}
                    <div style={{ fontSize: 9, color: C.muted, marginBottom: 2 }}>
                      <span style={{ background: "rgba(255,255,255,.07)", borderRadius: 4, padding: "1px 5px", fontWeight: 700 }}>
                        {leg.categoryIcon} {leg.category}
                      </span>
                    </div>
                    {/* Market */}
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {leg.market}
                    </div>
                    {/* Game */}
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {leg.game}
                    </div>
                  </div>

                  {/* Score */}
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: lst.color, lineHeight: 1 }}>
                      {leg.score.toFixed(1)}
                    </div>
                    <div style={{ fontSize: 8, color: lst.color, fontWeight: 700 }}>/10</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Combined score */}
      {legs.length > 0 && (
        <div style={{ padding: "10px 16px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 10, color: C.muted }}>Índice combinado ({legs.length} pernas)</div>
            {warning && <div style={{ fontSize: 9, color: C.muted, marginTop: 2, lineHeight: 1.4 }}>{warning}</div>}
          </div>
          <span style={{ fontSize: 20, fontWeight: 900, fontFamily: "monospace", color: cst.color }}>
            {combinedScore.toFixed(1)}<span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>/10</span>
          </span>
        </div>
      )}
    </div>
  );
}

function TeamHeader({ r }: { r: SlotResult }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        {r.homeLogo && <img src={r.homeLogo} alt="" style={{ width: 22, height: 22, objectFit: "contain" }} />}
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{r.homeTeam}</span>
        <span style={{ color: C.muted, fontSize: 11 }}>vs</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{r.awayTeam}</span>
        {r.awayLogo && <img src={r.awayLogo} alt="" style={{ width: 22, height: 22, objectFit: "contain" }} />}
      </div>
      <div style={{ fontSize: 10, color: C.muted }}>{r.leagueName}</div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BatchAnalysis({ onBack, onToast }: { onBack: () => void; onToast: (m: string, t?: string) => void }) {
  const [count, setCount] = useState<1 | 2 | 3 | 4>(2);
  const [slots, setSlots] = useState<SlotState[]>(() => Array.from({ length: 4 }, makeSlot));
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeMsg, setAnalyzeMsg] = useState("");
  const [results, setResults] = useState<SlotResult[] | null>(null);

  const updateSlot = useCallback((idx: number, patch: Partial<SlotState>) => {
    setSlots((prev) => prev.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }, []);

  async function searchTeam(idx: number, side: "home" | "away") {
    const slot = slots[idx];
    const q = side === "home" ? slot.homeQuery : slot.awayQuery;
    if (!q.trim()) return;
    updateSlot(idx, side === "home" ? { homeSearching: true, homeSearchRes: [] } : { awaySearching: true, awaySearchRes: [] });
    try {
      const teams = await espnSearchTeams(q, slot.leagueId);
      updateSlot(idx, side === "home" ? { homeSearchRes: teams, homeSearching: false } : { awaySearchRes: teams, awaySearching: false });
      if (!teams.length) onToast("Nenhum time encontrado", "error");
    } catch (e: unknown) {
      updateSlot(idx, side === "home" ? { homeSearching: false } : { awaySearching: false });
      onToast("Erro na busca: " + (e instanceof Error ? e.message : ""), "error");
    }
  }

  async function selectTeam(idx: number, side: "home" | "away", team: EspnTeam) {
    const slot = slots[idx];
    const slug = team.slug || getEspnSlug(slot.leagueId);
    const season = currentSeasonYear(slug);
    updateSlot(idx, side === "home"
      ? { homeTeam: team, homeSearchRes: [], homeQuery: "", homeLoading: true }
      : { awayTeam: team, awaySearchRes: [], awayQuery: "", awayLoading: true }
    );
    try {
      const { games, teamName, logo } = await espnLoadTeamGames(team.id, slug, season);
      const resolvedTeam: EspnTeam = { ...team, name: teamName || team.name, logo: logo || team.logo };
      updateSlot(idx, side === "home"
        ? { homeTeam: resolvedTeam, homeGames: games.slice(-10), homeLoading: false }
        : { awayTeam: resolvedTeam, awayGames: games.slice(-10), awayLoading: false }
      );
    } catch (e: unknown) {
      updateSlot(idx, side === "home"
        ? { homeTeam: null, homeLoading: false }
        : { awayTeam: null, awayLoading: false }
      );
      onToast("Erro ao carregar jogos: " + (e instanceof Error ? e.message : ""), "error");
    }
  }

  function clearTeam(idx: number, side: "home" | "away") {
    updateSlot(idx, side === "home"
      ? { homeTeam: null, homeGames: [], homeQuery: "", homeSearchRes: [] }
      : { awayTeam: null, awayGames: [], awayQuery: "", awaySearchRes: [] }
    );
  }

  async function analyzeAll() {
    setAnalyzing(true);
    setResults(null);
    const out: SlotResult[] = [];
    const leagueNameMap = Object.fromEntries(LEAGUES.map((l) => [l.id, l.name]));

    for (let i = 0; i < count; i++) {
      const slot = slots[i];
      const leagueName = leagueNameMap[slot.leagueId] ?? "—";

      if (!slot.homeTeam || !slot.awayTeam || !slot.homeGames.length || !slot.awayGames.length) {
        out.push({
          homeTeam: slot.homeTeam?.name ?? "?", awayTeam: slot.awayTeam?.name ?? "?",
          homeLogo: slot.homeTeam?.logo ?? "", awayLogo: slot.awayTeam?.logo ?? "",
          leagueName, homeWin: 0, draw: 0, awayWin: 0, btts: 0, over25: 0,
          topScore: "—", overall: 0, mkts: null, recommended: null, multipla: [], combined: 0,
          loggedToAudit: false,
          error: "Times ou jogos não carregados — selecione ambos os times antes de analisar.",
        });
        continue;
      }

      setAnalyzeMsg(`Analisando ${i + 1}/${count}: ${slot.homeTeam.name} vs ${slot.awayTeam.name}…`);
      try {
        const hS = consolidate(slot.homeGames);
        const aS = consolidate(slot.awayGames);

        let homeRating: number | null = null;
        let awayRating: number | null = null;
        try {
          const s = await Promise.race([
            fetchStrengths(slot.homeTeam.name, slot.awayTeam.name, false),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000)),
          ]);
          homeRating = s.homeRating;
          awayRating = s.awayRating;
        } catch (_) {}

        const opts = { homeRating, awayRating, refRating: null as number | null, isNeutral: false };
        const gp = goalProbabilities(hS, aS, opts);
        const pct = (p: number) => Math.round(Math.max(0, Math.min(1, p)) * 100);
        const topRaw = exactScoreProbabilities(gp.lambdaHome, gp.lambdaAway, 1)[0];
        const exactScore = topRaw ? `${topRaw.home}-${topRaw.away}` : undefined;
        const leagueSlug = ESPN_LEAGUE_MAP[slot.leagueId] ?? "bra.1";

        const hT = makeTeamObj(slot.homeTeam.name, slot.homeTeam.logo, slot.homeGames);
        const aT = makeTeamObj(slot.awayTeam.name, slot.awayTeam.logo, slot.awayGames);
        const mkts = scoreMarkets(hS, aS, DEFAULT_H2H, DEFAULT_REF, hT, aT, opts);
        const overall = (mkts.over25 + mkts.btts + mkts.consistency + mkts.homeWin + mkts.c85) / 5;
        const { recommended, multipla, combined } = buildRecommendations(mkts);

        let loggedToAudit = false;
        try {
          await logClientPrediction({
            homeTeam: slot.homeTeam.name,
            awayTeam: slot.awayTeam.name,
            league: leagueSlug,
            exactScore,
            predictions: {
              homeWin: pct(gp.homeWin),
              draw: pct(gp.draw),
              awayWin: pct(gp.awayWin),
              over05: pct(gp.over["0.5"]),
              over15: pct(gp.over["1.5"]),
              over25: pct(gp.over["2.5"]),
              over35: pct(gp.over["3.5"]),
              bttsYes: pct(gp.btts),
              bttsNo: pct(1 - gp.btts),
            },
          });
          loggedToAudit = true;
        } catch (_) {}

        out.push({
          homeTeam: slot.homeTeam.name, awayTeam: slot.awayTeam.name,
          homeLogo: slot.homeTeam.logo, awayLogo: slot.awayTeam.logo,
          leagueName,
          homeWin: pct(gp.homeWin), draw: pct(gp.draw), awayWin: pct(gp.awayWin),
          btts: pct(gp.btts), over25: pct(gp.over["2.5"]),
          topScore: exactScore ?? "—",
          overall, mkts, recommended, multipla, combined,
          loggedToAudit,
          error: null,
        });
      } catch (e: unknown) {
        out.push({
          homeTeam: slot.homeTeam.name, awayTeam: slot.awayTeam.name,
          homeLogo: slot.homeTeam.logo, awayLogo: slot.awayTeam.logo,
          leagueName, homeWin: 0, draw: 0, awayWin: 0, btts: 0, over25: 0,
          topScore: "—", overall: 0, mkts: null, recommended: null, multipla: [], combined: 0,
          loggedToAudit: false,
          error: "Erro ao analisar: " + (e instanceof Error ? e.message : ""),
        });
      }
    }

    setResults(out);
    setAnalyzing(false);
    setAnalyzeMsg("");
    const ok = out.filter((r) => !r.error).length;
    if (ok > 0) onToast(`✓ ${ok} jogo(s) analisado(s) e registrado(s) na auditoria`, "success");
  }

  const activeSlots = slots.slice(0, count);
  const allReady = activeSlots.every((s) => s.homeTeam && s.awayTeam && s.homeGames.length && s.awayGames.length);

  return (
    <div style={{ background: C.bg, minHeight: "100vh", paddingBottom: 40 }}>
      {analyzing && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(8,13,26,.92)", zIndex: 100, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <div style={{ width: 44, height: 44, border: `3px solid ${C.border}`, borderTop: `3px solid ${C.cyan}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          <div style={{ fontSize: 13, color: C.cyan, fontWeight: 600, textAlign: "center", padding: "0 24px" }}>{analyzeMsg || "Analisando…"}</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      <div style={{ background: "rgba(8,13,26,.97)", borderBottom: `1px solid rgba(0,229,255,.12)`, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, zIndex: 10 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 18, padding: 0, lineHeight: 1 }}>←</button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: 3, color: C.cyan, fontFamily: "monospace" }}>APEX · LOTE</div>
          <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1.5 }}>ANÁLISE DE MÚLTIPLOS JOGOS</div>
        </div>
      </div>

      <div style={{ padding: "16px 14px", maxWidth: 480, margin: "0 auto" }}>
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: C.cyan, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>Quantos jogos?</div>
          <div style={{ display: "flex", gap: 8 }}>
            {([1, 2, 3, 4] as const).map((n) => pill(count === n, () => setCount(n), n))}
          </div>
        </div>

        {activeSlots.map((slot, idx) => (
          <div key={idx} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 10, color: C.cyan, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>Jogo {idx + 1}</div>
              <select
                value={slot.leagueId}
                onChange={(e) => updateSlot(idx, { leagueId: parseInt(e.target.value), homeTeam: null, awayTeam: null, homeGames: [], awayGames: [], homeSearchRes: [], awaySearchRes: [] })}
                style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${C.border}`, borderRadius: 7, padding: "5px 8px", color: C.text, fontSize: 11, outline: "none" }}
              >
                {LEAGUES.map((l) => (
                  <option key={l.id} value={l.id}>{l.country} {l.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <TeamSearch
                label="Casa"
                query={slot.homeQuery}
                onQueryChange={(v) => updateSlot(idx, { homeQuery: v })}
                searchRes={slot.homeSearchRes}
                searching={slot.homeSearching}
                loading={slot.homeLoading}
                selected={slot.homeTeam}
                onSearch={() => searchTeam(idx, "home")}
                onSelect={(t) => selectTeam(idx, "home", t)}
                onClear={() => clearTeam(idx, "home")}
              />
              <div style={{ display: "flex", alignItems: "center", color: C.muted, fontSize: 12, fontWeight: 700, paddingTop: 18 }}>vs</div>
              <TeamSearch
                label="Fora"
                query={slot.awayQuery}
                onQueryChange={(v) => updateSlot(idx, { awayQuery: v })}
                searchRes={slot.awaySearchRes}
                searching={slot.awaySearching}
                loading={slot.awayLoading}
                selected={slot.awayTeam}
                onSearch={() => searchTeam(idx, "away")}
                onSelect={(t) => selectTeam(idx, "away", t)}
                onClear={() => clearTeam(idx, "away")}
              />
            </div>
          </div>
        ))}

        <button
          onClick={analyzeAll}
          disabled={analyzing || !allReady}
          style={{
            width: "100%", padding: "14px", borderRadius: 12, border: "none",
            background: !allReady ? "rgba(255,255,255,.05)" : `linear-gradient(135deg,${C.cyan},#0077FF)`,
            color: !allReady ? C.muted : "#080D1A", fontSize: 15, fontWeight: 800,
            cursor: !allReady ? "not-allowed" : "pointer", marginBottom: 16,
            opacity: analyzing ? 0.5 : 1,
          }}
        >
          {analyzing ? "Analisando…" : `⚡ Analisar ${count} Jogo${count > 1 ? "s" : ""}`}
        </button>
        {!allReady && (
          <div style={{ fontSize: 11, color: C.muted, textAlign: "center", marginTop: -10, marginBottom: 16 }}>
            Selecione os times de todos os jogos para analisar
          </div>
        )}

        {results && (() => {
          const { otima, alternativa, otimaScore, altScore } = buildDayParlays(results);
          return (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ fontSize: 10, color: C.cyan, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", padding: "4px 0 2px" }}>
                Resultados — {results.filter(r => !r.error).length}/{count} analisados
              </div>

              {results.map((r, i) => (
                <ResultCard key={i} r={r} />
              ))}

              {/* ── Day parlays ── */}
              {results.some(r => !r.error && r.mkts) && (
                <>
                  <div style={{ fontSize: 10, color: C.cyan, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase", padding: "8px 0 2px", borderTop: `1px solid ${C.border}`, marginTop: 4 }}>
                    ⚡ Múltiplas do Dia
                  </div>

                  <ParlayCard
                    title="Múltipla Ótima"
                    subtitle={`${otima.length} perna${otima.length !== 1 ? "s" : ""} — melhor pick geral por jogo`}
                    icon="🎯"
                    legs={otima}
                    combinedScore={otimaScore}
                    accentColor={C.cyan}
                    warning="⚠ Múltiplas multiplicam o risco. Todas as pernas precisam acertar."
                  />

                  <ParlayCard
                    title="Múltipla Alternativa — 4 Mercados"
                    subtitle="1 perna por categoria: 1X2/Dupla Chance · Gols · Escanteios · Cartões"
                    icon="🎰"
                    legs={alternativa}
                    combinedScore={altScore}
                    accentColor="#A78BFA"
                    warning="⚠ Cada perna vem do jogo com melhor score naquela categoria específica."
                  />
                </>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
