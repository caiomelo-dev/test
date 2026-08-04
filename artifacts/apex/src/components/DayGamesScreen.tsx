import { useMemo, useState } from "react";
import { C, LEAGUES, ESPN_LEAGUE_MAP } from "../lib/constants";
import {
  consolidate, scoreMarkets, runMGAAPlus, goalProbabilities,
  buildRecommendations, buildDayMultipla, dataConfidence, marketStatus,
  type MGAAResult, type MarketPick, type DayMultiplaLeg,
} from "../lib/math";
import { espnLoadScoreboard, espnLoadTeamGames } from "../lib/espnApi";
import { logClientPrediction } from "../lib/auditApi";
import { formatMatchupRawData } from "../lib/rawDataExport";
import { saveAuditData } from "../lib/auditDataApi";
import type { DayGame, League, H2HData, RefereeData, MarketScores } from "../types";

interface DataEntry {
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string;
  rawData: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────

const emptyH2H = (): H2HData => ({
  last5_btts: "", last5_over25: "", last5_over35: "", last5_avgGoals: "",
  last10_btts: "", last10_over25: "", last10_over35: "", last10_avgGoals: "",
});
const emptyRef = (): RefereeData => ({
  avgYellows: "", avgReds: "", avgFouls: "", avgPenalties: "",
});
const emptyMotivation = () => ({
  title: false, relegation: false, continental: false, knockout: false, classic: false, mustwin: false,
});

function toISODate(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function todayInputVal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface DayResult {
  game: DayGame;
  icj: number;
  icjColor: string;
  icjLabel: string;
  recommended: MarketPick | null;
  mgaa: MGAAResult;
  mkts: MarketScores;
  homeLogo: string;
  awayLogo: string;
  gamesLoaded: boolean;
  // Ajuste 7: distingue "zero jogos encontrados" de "poucos jogos, mas deu
  // pra analisar" — e carrega o score de confiança dos dados (0-10).
  dataQualityScore: number;
  dataQualityLabel: string;
  lowSample: boolean; // teve dados, mas amostra curta (< 5 jogos de algum lado)
}

function icjBadgeColor(icj: number): string {
  if (icj >= 80) return "#00C875";
  if (icj >= 70) return "#00E5FF";
  if (icj >= 60) return "#FFB800";
  return "#FF4D4D";
}

// Clubs for which we should use national team slugs
const CLUB_LEAGUES = LEAGUES.filter(l => !l.isNationalTeam);

// ── sub-components ────────────────────────────────────────────────────────────

function ICJBadge({ icj }: { icj: number }) {
  const color = icjBadgeColor(icj);
  return (
    <span style={{
      fontSize: 11, fontWeight: 800, fontFamily: "monospace",
      color: "#080D1A", background: color, borderRadius: 6,
      padding: "2px 8px", display: "inline-block",
    }}>{icj.toFixed(1)}</span>
  );
}

function GameRankCard({ result, rank, expanded, onToggle }: {
  result: DayResult; rank: number; expanded: boolean; onToggle: () => void;
}) {
  const { game, icj, recommended, mgaa, mkts } = result;
  const { marketClassification } = mgaa;
  const icjColor = icjBadgeColor(icj);
  const { recommended: rec, multipla } = buildRecommendations(mkts);

  return (
    <div style={{
      border: `1px solid ${icjColor}55`, borderRadius: 14, overflow: "hidden",
      background: `${icjColor}07`, marginBottom: 10,
    }}>
      {/* Header */}
      <button
        onClick={onToggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12,
          padding: "14px 16px", background: "transparent", border: "none",
          cursor: "pointer", color: C.text, textAlign: "left",
        }}
      >
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: `${icjColor}22`, color: icjColor,
          fontSize: 13, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>{rank}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {result.homeLogo && <img src={result.homeLogo} alt="" width={18} height={18} style={{ objectFit: "contain" }} />}
            {game.homeTeamName}
            <span style={{ color: C.muted, fontSize: 11 }}>vs</span>
            {game.awayTeamName}
            {result.awayLogo && <img src={result.awayLogo} alt="" width={18} height={18} style={{ objectFit: "contain" }} />}
          </div>
          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
            {game.leagueCountry} {game.leagueName}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <ICJBadge icj={icj} />
          <span style={{ color: C.muted, fontSize: 12 }}>{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: "0 16px 16px", borderTop: `1px solid ${C.border}` }}>
          {/* Recommendation */}
          {rec && (
            <div style={{ marginTop: 12, marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>Pick Recomendado</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(255,255,255,.03)", borderRadius: 10, padding: "10px 12px" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{rec.label}</span>
                <span style={{ fontSize: 16, fontWeight: 800, fontFamily: "monospace", color: marketStatus(rec.score).color }}>{rec.score.toFixed(1)}</span>
              </div>
            </div>
          )}

          {/* MGAA+ market classification */}
          {(marketClassification.seguro.length > 0 || marketClassification.moderado.length > 0 || marketClassification.alto.length > 0) && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>Classificação MGAA+</div>
              {[
                { label: "🟢 Seguro", items: marketClassification.seguro, color: "#00C875" },
                { label: "🟡 Moderado", items: marketClassification.moderado, color: "#FFB800" },
                { label: "🔴 Alto", items: marketClassification.alto, color: "#FF9F40" },
              ].map(({ label, items, color }) => items.length > 0 && (
                <div key={label} style={{ marginBottom: 6 }}>
                  <div style={{ fontSize: 10, color, fontWeight: 700, marginBottom: 3 }}>{label}</div>
                  {items.map(it => (
                    <div key={it.market} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0" }}>
                      <span style={{ color: C.text }}>{it.market}</span>
                      <span style={{ color, fontFamily: "monospace", fontWeight: 700 }}>{it.prob.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {/* Múltipla sugerida */}
          {multipla.length > 0 && (
            <div>
              <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 6 }}>Múltipla Sugerida</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {multipla.map((p, i) => (
                  <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.03)", borderRadius: 8, padding: "7px 10px" }}>
                    <span style={{ fontSize: 9, color: C.cyan, fontWeight: 800, width: 14 }}>{i + 1}</span>
                    <span style={{ flex: 1, fontSize: 11, color: C.text }}>{p.label}</span>
                    <span style={{ fontSize: 12, fontWeight: 800, fontFamily: "monospace", color: marketStatus(p.score).color }}>{p.score.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {marketClassification.foraDoMetodo && (
            <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic", marginTop: 8 }}>
              ❌ Nenhum mercado atinge 60% — jogo fora do método MGAA+.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface DayGamesScreenProps {
  onBack: () => void;
  onToast: (msg: string, type?: string) => void;
}

export function DayGamesScreen({ onBack, onToast }: DayGamesScreenProps) {
  const [dateVal, setDateVal] = useState(todayInputVal());
  const [selectedLeagues, setSelectedLeagues] = useState<number[]>(
    CLUB_LEAGUES.slice(0, 4).map(l => l.id)
  );
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });
  const [results, setResults] = useState<DayResult[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [searched, setSearched] = useState(false);
  const [dataExport, setDataExport] = useState<string | null>(null);
  const [dataEntries, setDataEntries] = useState<DataEntry[]>([]);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState(false);

  function toggleLeague(id: number) {
    setSelectedLeagues(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function toggleAll() {
    if (selectedLeagues.length === CLUB_LEAGUES.length) setSelectedLeagues([]);
    else setSelectedLeagues(CLUB_LEAGUES.map(l => l.id));
  }

  // Registra a análise de um jogo do dia na auditoria — mesmo padrão usado
  // no fluxo individual (ApexPage.logToAudit), mas silencioso: nunca deve
  // travar a análise em lote por causa de uma falha de rede na auditoria.
  function logDayGameToAudit(g: DayGame, mkts: MarketScores, gp: ReturnType<typeof goalProbabilities>) {
    const pct = (p: number) => Math.round(Math.max(0, Math.min(1, p)) * 100);
    logClientPrediction({
      homeTeam: g.homeTeamName,
      awayTeam: g.awayTeamName,
      league: g.slug,
      date: g.date,
      predictions: {
        homeWin: pct(gp.homeWin), draw: pct(gp.draw), awayWin: pct(gp.awayWin),
        over05: pct(gp.over["0.5"]), over15: pct(gp.over["1.5"]),
        over25: pct(gp.over["2.5"]), over35: pct(gp.over["3.5"]),
        bttsYes: pct(gp.btts), bttsNo: pct(1 - gp.btts),
      },
    }).catch(() => {});
  }

  async function fetchAndAnalyze(mode: "analysis" | "data" = "analysis") {
    if (!selectedLeagues.length) {
      onToast("Selecione pelo menos uma liga", "error"); return;
    }
    const dateISO = dateVal.replace(/-/g, "");
    setAnalyzing(true);
    setResults([]);
    setDataExport(null);
    setSearched(true);

    // Step 1: fetch scoreboard for all selected leagues IN PARALELO,
    // registrando quais ligas falharam em vez de engolir o erro em silêncio.
    setProgress({ current: 0, total: 0, label: "Buscando jogos do dia..." });
    const failedLeagues: string[] = [];
    const scoreboardResults = await Promise.allSettled(
      selectedLeagues.map(async (lid) => {
        const league = LEAGUES.find(l => l.id === lid)!;
        const slug = ESPN_LEAGUE_MAP[lid] ?? "bra.1";
        const games = await espnLoadScoreboard(slug, dateISO);
        return games.map(g => ({ ...g, leagueName: league.name, leagueCountry: league.country }));
      })
    );
    const allGames: DayGame[] = [];
    scoreboardResults.forEach((r, idx) => {
      if (r.status === "fulfilled") allGames.push(...r.value);
      else failedLeagues.push(LEAGUES.find(l => l.id === selectedLeagues[idx])?.name ?? "?");
    });

    if (failedLeagues.length) {
      onToast(`Falha ao buscar: ${failedLeagues.join(", ")}`, "error");
    }

    if (!allGames.length) {
      setAnalyzing(false);
      onToast("Nenhum jogo encontrado nessa data/liga", "error");
      return;
    }

    // Sistema não realiza mais análise — busca o histórico dos dois times
    // de cada jogo e devolve só o material cru (sem consolidate/mkts/mgaa).
    if (mode === "data") {
      const rawExports: string[] = [];
      const entries: DataEntry[] = [];
      for (let i = 0; i < allGames.length; i++) {
        const g = allGames[i];
        setProgress({ current: i + 1, total: allGames.length, label: `${g.homeTeamName} vs ${g.awayTeamName}` });
        try {
          const [homeData, awayData] = await Promise.allSettled([
            espnLoadTeamGames(g.homeTeamId, g.slug),
            espnLoadTeamGames(g.awayTeamId, g.slug),
          ]);
          const homeGames = homeData.status === "fulfilled" ? homeData.value.games : [];
          const awayGames = awayData.status === "fulfilled" ? awayData.value.games : [];
          const homeName = homeData.status === "fulfilled" ? homeData.value.teamName : g.homeTeamName;
          const awayName = awayData.status === "fulfilled" ? awayData.value.teamName : g.awayTeamName;
          const raw = formatMatchupRawData(homeName || g.homeTeamName, awayName || g.awayTeamName, homeGames, awayGames);
          rawExports.push(raw);
          entries.push({ homeTeam: homeName || g.homeTeamName, awayTeam: awayName || g.awayTeamName, league: g.leagueName ?? "", date: g.date ?? "", rawData: raw });
        } catch (_) {
          const raw = `═══════════════════════════════════════════\nCONFRONTO: ${g.homeTeamName} vs ${g.awayTeamName}\n═══════════════════════════════════════════\n(falha ao buscar dados)`;
          rawExports.push(raw);
          entries.push({ homeTeam: g.homeTeamName, awayTeam: g.awayTeamName, league: g.leagueName ?? "", date: g.date ?? "", rawData: raw });
        }
      }
      setDataExport(rawExports.join("\n\n"));
      setDataEntries(entries);
      setAnalyzing(false);
      setCopied(false);
      onToast(`✓ Dados de ${allGames.length} jogo(s) prontos pra copiar`, "success");
      return;
    }

    // Step 2: analyze each game
    const dayResults: DayResult[] = [];
    for (let i = 0; i < allGames.length; i++) {
      const g = allGames[i];
      setProgress({ current: i + 1, total: allGames.length, label: `${g.homeTeamName} vs ${g.awayTeamName}` });

      try {
        const [homeData, awayData] = await Promise.allSettled([
          espnLoadTeamGames(g.homeTeamId, g.slug),
          espnLoadTeamGames(g.awayTeamId, g.slug),
        ]);

        const homeGames = homeData.status === "fulfilled" ? homeData.value.games : [];
        const awayGames = awayData.status === "fulfilled" ? awayData.value.games : [];
        const homeLogo = homeData.status === "fulfilled" ? homeData.value.logo : "";
        const awayLogo = awayData.status === "fulfilled" ? awayData.value.logo : "";
        // "Sem dados" de verdade = nenhum jogo de um dos dois lados.
        const gamesLoaded = homeGames.length > 0 && awayGames.length > 0;

        if (!gamesLoaded) {
          dayResults.push({
            game: g, icj: 50, icjColor: "#FF4D4D", icjLabel: "Sem dados",
            recommended: null,
            mgaa: null as unknown as MGAAResult,
            mkts: null as unknown as MarketScores,
            homeLogo, awayLogo, gamesLoaded: false,
            dataQualityScore: 0, dataQualityLabel: "Sem dados", lowSample: true,
          });
          continue;
        }

        const hTeam = {
          name: homeData.status === "fulfilled" ? homeData.value.teamName : g.homeTeamName,
          position: "", teamId: parseInt(g.homeTeamId), logo: homeLogo,
          motivation: emptyMotivation(), games: homeGames,
        };
        const aTeam = {
          name: awayData.status === "fulfilled" ? awayData.value.teamName : g.awayTeamName,
          position: "", teamId: parseInt(g.awayTeamId), logo: awayLogo,
          motivation: emptyMotivation(), games: awayGames,
        };

        const hS = consolidate(homeGames);
        const aS = consolidate(awayGames);
        const gp = goalProbabilities(hS, aS, {});
        const mkts = scoreMarkets(hS, aS, emptyH2H(), emptyRef(), hTeam, aTeam, {});
        const mgaa = runMGAAPlus(hS, aS, hTeam, aTeam, gp);
        // ICJ já incorpora a qualidade dos dados (Ajuste 6c), mas aqui
        // também guardamos o score bruto pra mostrar "Dados insuficientes"
        // distinto de "Sem dados" quando a amostra é curta.
        const dq = dataConfidence(hS, aS);
        const icj = mgaa.icj.value;
        const { recommended } = buildRecommendations(mkts);

        dayResults.push({
          game: g, icj,
          icjColor: icjBadgeColor(icj),
          icjLabel: mgaa.icj.reading.label,
          recommended, mgaa, mkts, homeLogo, awayLogo, gamesLoaded: true,
          dataQualityScore: dq.score,
          dataQualityLabel: dq.label,
          lowSample: homeGames.length < 5 || awayGames.length < 5,
        });

        // Ajuste 5: manda a análise pra auditoria automaticamente, igual à
        // análise individual — sem isso os jogos do dia nunca entravam
        // na taxa de acerto.
        logDayGameToAudit(g, mkts, gp);
      } catch (_) {
        dayResults.push({
          game: g, icj: 50, icjColor: "#FF4D4D", icjLabel: "Erro",
          recommended: null, mgaa: null as unknown as MGAAResult,
          mkts: null as unknown as MarketScores,
          homeLogo: "", awayLogo: "", gamesLoaded: false,
          dataQualityScore: 0, dataQualityLabel: "Erro", lowSample: true,
        });
      }
    }

    // Sort by ICJ descending
    dayResults.sort((a, b) => b.icj - a.icj);
    setResults(dayResults);
    setAnalyzing(false);

    const approved = dayResults.filter(r => r.icj >= 70).length;
    const logged = dayResults.filter(r => r.gamesLoaded).length;
    if (approved === 0) {
      onToast("Nenhum jogo ≥ 70 ICJ hoje — considere não apostar", "error");
    } else {
      onToast(`✓ ${dayResults.length} jogos analisados · ${approved} aprovados · ${logged} enviados à auditoria`, "success");
    }
  }

  const loadedResults = results.filter(r => r.gamesLoaded);
  const top3 = loadedResults.slice(0, 3);
  const top5 = loadedResults.slice(0, 5);
  const avgICJ = loadedResults.length
    ? loadedResults.reduce((s, r) => s + r.icj, 0) / loadedResults.length
    : 0;
  const minICJ = loadedResults.length ? Math.min(...loadedResults.map(r => r.icj)) : 0;

  // Ajuste 7: múltipla cruzando os jogos do dia (uma perna por jogo, só
  // entre os jogos mais confiáveis e com pick claro).
  const dayMultipla = useMemo(() => {
    if (!loadedResults.length) return { legs: [] as DayMultiplaLeg[], combinedProb: 0 };
    return buildDayMultipla(
      loadedResults.map(r => ({
        homeTeam: r.game.homeTeamName, awayTeam: r.game.awayTeamName, icj: r.icj, mkts: r.mkts,
      }))
    );
  }, [loadedResults]);

  const semDados = results.filter(r => !r.gamesLoaded);
  const dadosInsuficientes = loadedResults.filter(r => r.lowSample);

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      {/* Header */}
      <div style={{ background: "rgba(8,13,26,.97)", borderBottom: `1px solid rgba(0,229,255,.12)`, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 5, color: C.cyan, fontFamily: "monospace" }}>APEX</div>
          <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1.5 }}>JOGOS DO DIA</div>
        </div>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", color: C.muted, fontSize: 11, fontWeight: 700 }}>← Voltar</button>
      </div>

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "16px 12px" }}>

        {/* Tela de dados brutos — busca dos jogos do dia, sem análise */}
        {dataExport && !analyzing && (
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.cyan, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
              📋 Dados Brutos — Jogos do Dia
            </div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
              Copie e cole no prompt "Analista APEX" da sua IA de análise, ou salve cada jogo na Auditoria de Dados.
            </div>
            <textarea
              readOnly
              value={dataExport}
              style={{
                width: "100%", minHeight: 320, background: "rgba(255,255,255,.03)",
                border: `1px solid ${C.border}`, borderRadius: 10, padding: 12,
                color: C.text, fontSize: 11, fontFamily: "monospace", lineHeight: 1.5,
                resize: "vertical",
              }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button
                onClick={() => { setDataExport(null); setDataEntries([]); setSavedIds(new Set()); }}
                style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 16px", cursor: "pointer", color: C.muted, fontSize: 12, fontWeight: 700 }}
              >← Voltar</button>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(dataExport);
                    setCopied(true);
                    onToast("✓ Copiado — cole na sua IA de análise", "success");
                    setTimeout(() => setCopied(false), 2500);
                  } catch (_) {
                    onToast("Não consegui copiar automaticamente — selecione o texto manualmente", "error");
                  }
                }}
                style={{ flex: 1, background: `linear-gradient(135deg,${C.cyan},#0077FF)`, border: "none", borderRadius: 8, padding: "10px 16px", cursor: "pointer", color: "#080D1A", fontSize: 13, fontWeight: 700 }}
              >{copied ? "✓ Copiado!" : "📋 Copiar tudo"}</button>
            </div>

            {dataEntries.length > 0 && (
              <div style={{ marginTop: 14, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>
                  Salvar individualmente para Auditoria
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {dataEntries.map((entry, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, background: "rgba(255,255,255,.03)", borderRadius: 8, padding: "8px 10px" }}>
                      <span style={{ fontSize: 11, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {entry.homeTeam} vs {entry.awayTeam}
                      </span>
                      <button
                        disabled={savedIds.has(i)}
                        onClick={async () => {
                          try {
                            await saveAuditData(entry);
                            setSavedIds(s => new Set(s).add(i));
                            onToast("✓ Salvo na Auditoria de Dados", "success");
                          } catch (_) {
                            onToast("Falha ao salvar", "error");
                          }
                        }}
                        style={{
                          background: savedIds.has(i) ? "rgba(0,200,117,.15)" : "rgba(255,255,255,.06)",
                          border: "none", borderRadius: 6, padding: "5px 10px", cursor: savedIds.has(i) ? "default" : "pointer",
                          color: savedIds.has(i) ? C.green : C.muted, fontSize: 10, fontWeight: 700, whiteSpace: "nowrap",
                        }}
                      >{savedIds.has(i) ? "✓ Salvo" : "💾 Salvar"}</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!dataExport && (
        <>
        {/* Config card */}
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.cyan, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
            📅 Seleção de Data e Ligas
          </div>

          {/* Date */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600, color: C.muted, display: "block", marginBottom: 6 }}>Data</label>
            <input
              type="date"
              value={dateVal}
              onChange={e => setDateVal(e.target.value)}
              style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 12px", color: C.text, fontSize: 14, outline: "none", width: "100%" }}
            />
          </div>

          {/* Leagues */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label style={{ fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600, color: C.muted }}>Ligas</label>
              <button onClick={toggleAll} style={{ fontSize: 9, color: C.cyan, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>
                {selectedLeagues.length === CLUB_LEAGUES.length ? "Desmarcar todas" : "Todas"}
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {CLUB_LEAGUES.map(l => (
                <button
                  key={l.id}
                  onClick={() => toggleLeague(l.id)}
                  style={{
                    background: selectedLeagues.includes(l.id) ? `${C.cyan}18` : "rgba(255,255,255,.03)",
                    border: `1px solid ${selectedLeagues.includes(l.id) ? C.cyan : C.border}`,
                    borderRadius: 8, padding: "8px 10px", cursor: "pointer",
                    color: selectedLeagues.includes(l.id) ? C.cyan : C.muted,
                    fontSize: 11, fontWeight: selectedLeagues.includes(l.id) ? 700 : 400,
                    display: "flex", alignItems: "center", gap: 6, textAlign: "left",
                  }}
                >
                  <span>{l.country}</span><span>{l.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Analyze button */}
          <button
            onClick={() => fetchAndAnalyze("data")}
            disabled={analyzing || !selectedLeagues.length}
            style={{
              width: "100%", background: analyzing || !selectedLeagues.length
                ? "rgba(255,255,255,.05)"
                : `linear-gradient(135deg,${C.cyan},#0077FF)`,
              border: "none", borderRadius: 10, padding: "12px 20px",
              cursor: analyzing || !selectedLeagues.length ? "not-allowed" : "pointer",
              color: "#080D1A", fontSize: 14, fontWeight: 700, opacity: analyzing ? 0.6 : 1,
            }}
          >
            {analyzing ? `Buscando... ${progress.current}/${progress.total}` : "🔍 Buscar Dados do Dia"}
          </button>

          {/* Progress */}
          {analyzing && progress.total > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ height: 4, background: "rgba(255,255,255,.08)", borderRadius: 4, overflow: "hidden", marginBottom: 6 }}>
                <div style={{ height: "100%", width: `${(progress.current / progress.total) * 100}%`, background: C.cyan, borderRadius: 4, transition: "width .3s ease" }} />
              </div>
              <div style={{ fontSize: 10, color: C.muted, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {progress.label}
              </div>
            </div>
          )}
        </div>

        {/* Results */}
        {searched && !analyzing && results.length === 0 && (
          <div style={{ textAlign: "center", color: C.muted, padding: 40, fontSize: 13 }}>
            Nenhum jogo encontrado para essa data e ligas selecionadas.
          </div>
        )}

        {results.length > 0 && (
          <>
            {/* Summary stats */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
              {[
                { label: "Jogos", value: results.filter(r => r.gamesLoaded).length.toString() },
                { label: "ICJ Médio", value: avgICJ.toFixed(1) },
                { label: "ICJ Mín.", value: minICJ.toFixed(1) },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: C.cyan }}>{value}</div>
                </div>
              ))}
            </div>

            {/* Warning if no game >= 70 */}
            {results.filter(r => r.gamesLoaded && r.icj >= 70).length === 0 && (
              <div style={{ background: "rgba(255,77,77,.08)", border: `1px solid ${C.red}44`, borderRadius: 10, padding: "12px 14px", fontSize: 12, color: C.red, textAlign: "center", marginBottom: 12 }}>
                ⚠️ Nenhum jogo aprovado hoje (ICJ ≥ 70) — considere não apostar.
              </div>
            )}

            {/* Múltipla do dia — entre jogos diferentes */}
            {dayMultipla.legs.length >= 2 && (
              <div style={{ background: `${C.cyan}0d`, border: `1px solid ${C.cyan}55`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.cyan, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
                  🎰 Múltipla do Dia — {dayMultipla.legs.length} jogos
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                  {dayMultipla.legs.map((leg, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,.03)", borderRadius: 8, padding: "8px 10px" }}>
                      <span style={{ fontSize: 9, color: C.cyan, fontWeight: 800, width: 14 }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{leg.market.label}</div>
                        <div style={{ fontSize: 9, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{leg.gameLabel} · ICJ {leg.icj.toFixed(1)}</div>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace", color: marketStatus(leg.market.score).color }}>{leg.market.score.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                  <span style={{ fontSize: 10, color: C.muted, letterSpacing: 1, textTransform: "uppercase" }}>Confiança combinada</span>
                  <span style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: marketStatus(dayMultipla.combinedProb).color }}>{dayMultipla.combinedProb.toFixed(1)}</span>
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 8, fontStyle: "italic" }}>
                  Cada perna acima de 65 ICJ e mercado ≥ 7.0 — quanto mais pernas, menor a chance de acertar todas.
                </div>
              </div>
            )}

            {/* TOP 3 */}
            {top3.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.cyan, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
                  🏆 TOP 3 — Melhores Jogos
                </div>
                {top3.map((r, i) => (
                  <GameRankCard
                    key={r.game.id}
                    result={r}
                    rank={i + 1}
                    expanded={expandedIdx === i}
                    onToggle={() => setExpandedIdx(p => p === i ? null : i)}
                  />
                ))}
              </div>
            )}

            {/* TOP 5 compact list */}
            {top5.length > 3 && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.cyan, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
                  📋 TOP 5 — Resumo
                </div>
                {top5.map((r, i) => (
                  <div key={r.game.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < top5.length - 1 ? `1px solid ${C.border}` : "none" }}>
                    <span style={{ fontSize: 11, color: C.muted, width: 16, textAlign: "center", fontWeight: 700 }}>#{i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {r.game.homeTeamName} vs {r.game.awayTeamName}
                      </div>
                      <div style={{ fontSize: 10, color: C.muted }}>{r.game.leagueCountry} {r.game.leagueName}</div>
                    </div>
                    <ICJBadge icj={r.icj} />
                    {r.recommended && (
                      <span style={{ fontSize: 10, color: C.muted, maxWidth: 80, textAlign: "right", lineHeight: 1.3, flexShrink: 0 }}>
                        {r.recommended.label}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Sem dados (zero jogos de algum lado) */}
            {semDados.length > 0 && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>
                  ⚠ {semDados.length} jogo(s) sem dados — não foi possível carregar histórico de nenhum dos times:
                </div>
                {semDados.map(r => (
                  <div key={r.game.id} style={{ fontSize: 11, color: C.muted, padding: "3px 0" }}>
                    · {r.game.homeTeamName} vs {r.game.awayTeamName}
                  </div>
                ))}
              </div>
            )}

            {/* Dados insuficientes (amostra curta, mas analisado mesmo assim) */}
            {dadosInsuficientes.length > 0 && (
              <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14, marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 8 }}>
                  ⚠ {dadosInsuficientes.length} jogo(s) analisado(s) com amostra curta (menos de 5 jogos de algum lado) — confiança reduzida no ICJ:
                </div>
                {dadosInsuficientes.map(r => (
                  <div key={r.game.id} style={{ fontSize: 11, color: C.muted, padding: "3px 0", display: "flex", justifyContent: "space-between" }}>
                    <span>· {r.game.homeTeamName} vs {r.game.awayTeamName}</span>
                    <span>{r.dataQualityLabel}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        </>
        )}
      </div>
    </div>
  );
}
