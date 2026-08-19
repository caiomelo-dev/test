import { useState, useEffect, useCallback } from "react";
import { C, LEAGUES, MOTIVATION_FACTORS, ESPN_LEAGUE_MAP, currentSeasonYear, groupLeaguesByRegion } from "../lib/constants";
import { consolidate, scoreMarkets, marketStatus, dataConfidence, buildRecommendations, goalProbabilities, exactScoreProbabilities, runMGAAPlus, type ScoreOpts, type MatchOddsInput, type MGAAResult } from "../lib/math";
import { espnSearchTeams, espnLoadTeamGames, espnLoadH2H, espnLoadReferees, espnLoadScoreboard, getEspnSlug, type EspnReferee } from "../lib/espnApi";
import { formatMatchupRawData } from "../lib/rawDataExport";
import { saveAuditData } from "../lib/auditDataApi";
import type { EspnTeam } from "../lib/espnApi";
import { GameList } from "../components/GameList";
import { ScoreGauge } from "../components/ScoreGauge";
import { MarketRow } from "../components/MarketRow";
import { AuditDataScreen } from "../components/AuditDataScreen";
import { DayGamesScreen } from "../components/DayGamesScreen";
import { BankrollCard } from "../components/BankrollCard";
import { fetchStrengths, logClientPrediction } from "../lib/auditApi";
import { fetchBetanoOdds } from "../lib/oddsApi";
import type {
  League, Team, H2HData, RefereeData, AnalysisResult, Page, Game, MotivationFactors, SavedAnalysis, MarketScores, DayGame,
} from "../types";

interface OddsForm {
  homeWin: string; draw: string; awayWin: string;
  over25: string; under25: string; btts: string; bttsNo: string;
}
const emptyOdds = (): OddsForm => ({
  homeWin: "", draw: "", awayWin: "", over25: "", under25: "", btts: "", bttsNo: "",
});

const STORAGE_KEY = "apex_v5";
const HISTORY_KEY = "apex_history_v1";

const emptyGame = (): Game => ({
  result: "", venue: "", opponent: "", date: "",
  goalsFor1H: "", goalsFor2H: "", goalsAgainst1H: "", goalsAgainst2H: "",
  shots: "", shotsOnTarget: "", bigChances: "",
  cornersFor: "", cornersAgainst: "",
  yellows: "", reds: "", fouls: "",
  xg: "", xga: "",
  g015: "", g1630: "", g3145: "", g4660: "", g6175: "", g7690: "",
  gc015: "", gc1630: "", gc3145: "", gc4660: "", gc6175: "", gc7690: "",
});

const emptyTeam = (): Team => ({
  name: "", position: "", teamId: null, logo: "",
  motivation: { title: false, relegation: false, continental: false, knockout: false, classic: false, mustwin: false },
  games: Array.from({ length: 10 }, emptyGame),
});

const emptyH2H = (): H2HData => ({
  last5_btts: "", last5_over25: "", last5_over35: "", last5_avgGoals: "",
  last10_btts: "", last10_over25: "", last10_over35: "", last10_avgGoals: "",
});

const emptyRef = (): RefereeData => ({
  avgYellows: "", avgReds: "", avgFouls: "", avgPenalties: "",
});

function Toast({ msg, type }: { msg: string; type: string }) {
  const color = type === "success" ? C.green : type === "error" ? C.red : C.cyan;
  return (
    <div style={{ position: "fixed", top: 70, right: 12, left: 12, zIndex: 200, background: C.card, border: `1px solid ${color}66`, borderRadius: 10, padding: "12px 16px", fontSize: 13, color, fontWeight: 700, boxShadow: "0 4px 24px rgba(0,0,0,.6)", textAlign: "center" }}>
      {msg}
    </div>
  );
}

function Spinner({ msg }: { msg: string }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(8,13,26,.92)", zIndex: 100, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div style={{ width: 48, height: 48, border: `3px solid ${C.border}`, borderTop: `3px solid ${C.cyan}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ fontSize: 13, color: C.cyan, fontWeight: 600, textAlign: "center", padding: "0 24px", maxWidth: 280 }}>{msg}</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function Header({ onReset, onHistory, onAudit, onDay, extra, apiOk }: {
  onReset?: () => void; onHistory?: () => void; onAudit?: () => void; onDay?: () => void; extra?: React.ReactNode; apiOk: boolean | null
}) {
  return (
    <div style={{ background: "rgba(8,13,26,.97)", borderBottom: `1px solid rgba(0,229,255,.12)`, padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10, backdropFilter: "blur(12px)" }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 5, color: C.cyan, fontFamily: "monospace", textShadow: "0 0 24px rgba(0,229,255,.35)" }}>APEX</div>
        <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1.5, marginTop: 1, display: "flex", alignItems: "center", gap: 6 }}>
          BUSCA DE DADOS
          {apiOk !== null && <span style={{ color: apiOk ? C.green : C.red, fontSize: 8 }}>● ESPN {apiOk ? "ON" : "OFF"}</span>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {extra}
        {onDay && (
          <button onClick={onDay} title="Jogos do Dia" style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", color: C.muted, fontSize: 11, fontWeight: 700 }}>📅</button>
        )}
        {onAudit && (
          <button onClick={onAudit} title="Auditoria de Dados" style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", color: C.muted, fontSize: 11, fontWeight: 700 }}>📁</button>
        )}
        {onHistory && (
          <button onClick={onHistory} title="Histórico" style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", color: C.muted, fontSize: 11, fontWeight: 700 }}>📋</button>
        )}
        {onReset && (
          <button onClick={onReset} title="Nova busca" style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", color: C.muted, fontSize: 11, fontWeight: 700 }}>↺</button>
        )}
      </div>
    </div>
  );
}

function StepBar({ step }: { step: number }) {
  const steps = ["Liga", "Casa", "Fora", "H2H", "Resultado"];
  return (
    <div style={{ display: "flex", alignItems: "center", marginBottom: 16, overflowX: "auto", paddingBottom: 2 }}>
      {steps.map((s, i) => (
        <div key={s} style={{ display: "flex", alignItems: "center", flex: i < steps.length - 1 ? 1 : ("unset" as never), gap: 4, minWidth: 0 }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 800, flexShrink: 0, background: step > i + 1 ? C.green : step === i + 1 ? C.cyan : "rgba(255,255,255,.06)", color: step >= i + 1 ? "#080D1A" : C.muted }}>
            {step > i + 1 ? "✓" : i + 1}
          </div>
          <span style={{ fontSize: 9, fontWeight: 600, whiteSpace: "nowrap", color: step === i + 1 ? C.cyan : step > i + 1 ? C.green : C.muted }}>{s}</span>
          {i < steps.length - 1 && <div style={{ flex: 1, height: 2, borderRadius: 2, background: step > i + 1 ? C.green : C.border, minWidth: 6 }} />}
        </div>
      ))}
    </div>
  );
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, ...style }}>{children}</div>;
}

function SLabel({ children, icon, color }: { children: React.ReactNode; icon?: string; color?: string }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: color || C.cyan, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
      {icon && <span>{icon}</span>}{children}
    </div>
  );
}

function Btn({ children, onClick, variant = "primary", size = "md", disabled, full }: {
  children: React.ReactNode; onClick?: () => void; variant?: "primary" | "ghost" | "outline"; size?: "sm" | "md" | "lg"; disabled?: boolean; full?: boolean;
}) {
  const pad = size === "sm" ? "8px 14px" : size === "lg" ? "14px 24px" : "10px 20px";
  const bg = variant === "primary" ? `linear-gradient(135deg,${C.cyan},#0077FF)` : variant === "ghost" ? "rgba(255,255,255,.04)" : "rgba(0,229,255,.08)";
  return (
    <button onClick={onClick} disabled={disabled} style={{ background: disabled ? "rgba(255,255,255,.05)" : bg, border: "none", borderRadius: 10, padding: pad, cursor: disabled ? "not-allowed" : "pointer", color: variant === "primary" ? "#080D1A" : variant === "ghost" ? C.muted : C.cyan, fontSize: size === "sm" ? 12 : 14, fontWeight: 700, opacity: disabled ? 0.4 : 1, width: full ? "100%" : "auto", transition: "all .2s" }}>
      {children}
    </button>
  );
}

function Field({ label, value, onChange, placeholder, type = "number" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string;
}) {
  const [foc, setFoc] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <label style={{ fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600, color: foc ? C.cyan : C.muted }}>{label}</label>
      <input type={type} value={value} placeholder={placeholder || "—"} onChange={(e) => onChange(e.target.value)} onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
        style={{ background: foc ? "rgba(0,229,255,.06)" : "rgba(255,255,255,.03)", border: `1px solid ${foc ? C.cyan : C.border}`, borderRadius: 8, padding: "9px 12px", color: C.text, fontSize: 14, fontFamily: type === "number" ? "monospace" : "inherit", outline: "none", width: "100%" }} />
    </div>
  );
}

function MarketSection({ title, icon, rows }: { title: string; icon: string; rows: [string, number][] }) {
  return (
    <Card style={{ marginBottom: 10 }}>
      <SLabel icon={icon}>{title}</SLabel>
      {rows.map(([l, s]) => <MarketRow key={l} label={l} score={s} />)}
    </Card>
  );
}

function ConfidenceBadge({ score, label, color, warnings }: { score: number; label: string; color: string; warnings: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginBottom: 12 }}>
      <button onClick={() => setOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 8, background: `${color}12`, border: `1px solid ${color}44`, borderRadius: 8, padding: "8px 12px", cursor: "pointer", width: "100%" }}>
        <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10, color, fontWeight: 700, letterSpacing: 1 }}>📊 CONFIANÇA DOS DADOS</span>
          <span style={{ fontSize: 13, color, fontWeight: 800, fontFamily: "monospace" }}>{score.toFixed(1)}/10</span>
          <span style={{ fontSize: 10, color, fontWeight: 700 }}>{label}</span>
        </div>
        <div style={{ height: 4, width: 60, background: "rgba(255,255,255,.08)", borderRadius: 4, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${score * 10}%`, background: color, borderRadius: 4 }} />
        </div>
        <span style={{ color, fontSize: 10 }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && warnings.length > 0 && (
        <div style={{ background: "rgba(255,184,0,.06)", border: `1px solid ${C.yellow}22`, borderRadius: 8, padding: "10px 12px", marginTop: 6 }}>
          {warnings.map((w, i) => <div key={i} style={{ fontSize: 11, color: C.yellow, marginBottom: 3 }}>⚠ {w}</div>)}
        </div>
      )}
      {open && warnings.length === 0 && (
        <div style={{ fontSize: 11, color: C.green, padding: "8px 12px" }}>✓ Dados completos — análise de alta qualidade</div>
      )}
    </div>
  );
}

// Ajuste 9: Gráfico de barras de distribuição de gols por faixa de tempo (CSS puro)
function TimeBandChart({ hS, aS, homeName, awayName }: {
  hS: { avgG015: number; avgG1630: number; avgG3145: number; avgG4660: number; avgG6175: number; avgG7690: number; avgGc015: number; avgGc1630: number; avgGc3145: number; avgGc4660: number; avgGc6175: number; avgGc7690: number };
  aS: { avgG015: number; avgG1630: number; avgG3145: number; avgG4660: number; avgG6175: number; avgG7690: number; avgGc015: number; avgGc1630: number; avgGc3145: number; avgGc4660: number; avgGc6175: number; avgGc7690: number };
  homeName: string;
  awayName: string;
}) {
  const bands = ["0–15", "16–30", "31–45", "46–60", "61–75", "76–90"];
  const hFor = [hS.avgG015, hS.avgG1630, hS.avgG3145, hS.avgG4660, hS.avgG6175, hS.avgG7690];
  const hAgainst = [hS.avgGc015, hS.avgGc1630, hS.avgGc3145, hS.avgGc4660, hS.avgGc6175, hS.avgGc7690];
  const aFor = [aS.avgG015, aS.avgG1630, aS.avgG3145, aS.avgG4660, aS.avgG6175, aS.avgG7690];
  const aAgainst = [aS.avgGc015, aS.avgGc1630, aS.avgGc3145, aS.avgGc4660, aS.avgGc6175, aS.avgGc7690];

  const hasData = hFor.some(v => v > 0) || aFor.some(v => v > 0);
  if (!hasData) return null;

  const maxVal = Math.max(...hFor, ...hAgainst, ...aFor, ...aAgainst, 0.01);

  function Bar({ val, color, title }: { val: number; color: string; title: string }) {
    const pct = Math.min(100, (val / maxVal) * 100);
    return (
      <div title={title} style={{ position: "relative", height: 6, background: "rgba(255,255,255,.06)", borderRadius: 4, overflow: "hidden", flex: 1 }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width .4s ease" }} />
      </div>
    );
  }

  return (
    <Card style={{ marginBottom: 10 }}>
      <SLabel icon="🕐">Gols por Faixa de Tempo</SLabel>
      <div style={{ fontSize: 9, color: C.muted, marginBottom: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span><span style={{ color: C.cyan }}>▮</span> Marcados · <span style={{ color: "#FF9F40" }}>▮</span> Sofridos</span>
      </div>
      {bands.map((band, i) => (
        <div key={band} style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 9, color: C.muted, marginBottom: 4, letterSpacing: .5 }}>{band} min</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {/* Casa: marcados / sofridos */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 8, color: C.cyan, width: 56, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={homeName}>{homeName.split(" ")[0]}</span>
              <Bar val={hFor[i]} color={C.cyan} title={`${homeName} marcou ${hFor[i].toFixed(2)} no ${band}`} />
              <Bar val={hAgainst[i]} color="#FF9F40" title={`${homeName} sofreu ${hAgainst[i].toFixed(2)} no ${band}`} />
              <span style={{ fontSize: 8, fontFamily: "monospace", color: C.muted, width: 28, textAlign: "right" }}>{hFor[i].toFixed(1)}</span>
            </div>
            {/* Fora: marcados / sofridos */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 8, color: C.purple, width: 56, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={awayName}>{awayName.split(" ")[0]}</span>
              <Bar val={aFor[i]} color={C.purple} title={`${awayName} marcou ${aFor[i].toFixed(2)} no ${band}`} />
              <Bar val={aAgainst[i]} color="#FF9F40" title={`${awayName} sofreu ${aAgainst[i].toFixed(2)} no ${band}`} />
              <span style={{ fontSize: 8, fontFamily: "monospace", color: C.muted, width: 28, textAlign: "right" }}>{aFor[i].toFixed(1)}</span>
            </div>
          </div>
        </div>
      ))}
    </Card>
  );
}

export function ApexPage() {
  const [page, setPage] = useState<Page>("league");
  const [showHistory, setShowHistory] = useState(false);
  const [dayOpen, setDayOpen] = useState(false);
  const [league, setLeague] = useState<League | null>(null);
  const [homeTeam, setHomeTeam] = useState<Team>(emptyTeam());
  const [awayTeam, setAwayTeam] = useState<Team>(emptyTeam());
  const [h2h, setH2h] = useState<H2HData>(emptyH2H());
  const [referee, setReferee] = useState<RefereeData>(emptyRef());
  const [referees, setReferees] = useState<EspnReferee[]>([]);
  const [odds, setOdds] = useState<OddsForm>(emptyOdds());
  const [matchContext, setMatchContext] = useState("");
  const [matchDate, setMatchDate] = useState(() => new Date().toISOString().split("T")[0]!);
  const [fetchingOdds, setFetchingOdds] = useState(false);
  const [oddsSource, setOddsSource] = useState<"betano" | null>(null);
  const [activeGame, setActiveGame] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [mgaaResult, setMgaaResult] = useState<MGAAResult | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadMsg, setLoadMsg] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchRes, setSearchRes] = useState<EspnTeam[]>([]);
  const [dayGames, setDayGames] = useState<DayGame[]>([]);
  const [searching, setSearching] = useState(false);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [history, setHistory] = useState<SavedAnalysis[]>([]);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  // Ajuste 8: pergunta "análise ou só os dados?" antes de rodar o método
  const [dataExport, setDataExport] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/espn/search?q=Arsenal&leagueId=39")
      .then(r => r.ok ? setApiOk(true) : setApiOk(false))
      .catch(() => setApiOk(false));

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      if (s.homeTeam) {
        setHomeTeam(s.homeTeam);
        setAwayTeam(s.awayTeam);
        setH2h(s.h2h || emptyH2H());
        setReferee(s.referee || emptyRef());
        setLeague(s.league);
        if (s.result) setResult(s.result);
        // Ajuste 7: restaurar mgaaResult da sessão anterior
        if (s.mgaaResult) setMgaaResult(s.mgaaResult);
        if (s.page && s.page !== "league") {
          // dayGames não é persistido (como odds/matchContext) — restaurar
          // direto em "dayPick" mostraria a lista vazia por engano.
          setPage(s.page === "result" && !s.result ? "home" : s.page === "dayPick" ? "league" : s.page);
        }
        if (s.activeGame != null) setActiveGame(s.activeGame);
        showToast("✓ Sessão restaurada");
      }
    } catch (_) {}

    try {
      const hist = localStorage.getItem(HISTORY_KEY);
      if (hist) setHistory(JSON.parse(hist));
    } catch (_) {}
  }, []);

  // Ajuste 7: incluir mgaaResult no save e nas dependências do useCallback
  const save = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ league, homeTeam, awayTeam, h2h, referee, page, activeGame, result, mgaaResult }));
    } catch (_) {}
  }, [league, homeTeam, awayTeam, h2h, referee, page, activeGame, result, mgaaResult]);

  useEffect(() => { save(); }, [save]);

  const showToast = (msg: string, type = "info") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  function saveToHistory(r: AnalysisResult) {
    if (!league) return;
    const entry: SavedAnalysis = {
      id: Date.now().toString(),
      date: new Date().toLocaleDateString("pt-BR"),
      homeName: homeTeam.name,
      awayName: awayTeam.name,
      homeLogo: homeTeam.logo,
      awayLogo: awayTeam.logo,
      leagueName: league.name,
      overall: r.overall,
      mkts: r.mkts,
    };
    setHistory(prev => {
      const next = [entry, ...prev].slice(0, 20);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch (_) {}
      return next;
    });
  }

  function resetAll() {
    setPage("league"); setLeague(null);
    setHomeTeam(emptyTeam()); setAwayTeam(emptyTeam());
    setH2h(emptyH2H()); setReferee(emptyRef());
    setOdds(emptyOdds()); setMatchContext(""); setResult(null); setMgaaResult(null);
    setMatchDate(new Date().toISOString().split("T")[0]!); setOddsSource(null);
    setActiveGame(0); setSearchQ(""); setSearchRes([]); setDayGames([]);
    setReferees([]); setEditIdx(null);
    setDataExport(null); setCopied(false);
  }

  async function handleSearch() {
    if (!searchQ.trim() || !league) return;
    setSearching(true);
    try {
      const res = await espnSearchTeams(searchQ, league.id);
      setSearchRes(res);
      if (!res.length) showToast("Nenhum time encontrado", "error");
    } catch (_) { showToast("Erro na busca — tente novamente", "error"); }
    setSearching(false);
  }

  async function loadTeam(team: EspnTeam, isHome: boolean) {
    if (!league) return;
    setLoading(true); setLoadMsg(`Carregando jogos de ${team.name}...`);
    setSearchRes([]);
    try {
      const data = await espnLoadTeamGames(team.id, team.slug);
      const t: Team = {
        name: data.teamName || team.name, position: "", teamId: parseInt(team.id), logo: data.logo || team.logo,
        motivation: { title: false, relegation: false, continental: false, knockout: false, classic: false, mustwin: false },
        games: data.games.length > 0 ? data.games : Array.from({ length: 10 }, emptyGame),
      };
      if (isHome) setHomeTeam(t); else setAwayTeam(t);
      showToast(`✓ ${data.games.length} jogos carregados — ${team.name}`, "success");
    } catch (_) { showToast(`Falha ao carregar ${team.name}`, "error"); }
    setLoading(false); setLoadMsg("");
    setSearchQ("");
  }

  // Ligas de clube (não Seleções/Amistoso): em vez de digitar o nome dos
  // times, lista os jogos de hoje da liga escolhida pra tocar num confronto
  // e carregar os dois times de uma vez.
  async function loadDayGames() {
    if (!league) return;
    const slug = ESPN_LEAGUE_MAP[league.id] ?? "bra.1";
    setLoading(true); setLoadMsg("Buscando jogos de hoje...");
    try {
      const todayISO = new Date().toISOString().split("T")[0]!.replace(/-/g, "");
      const games = await espnLoadScoreboard(slug, todayISO);
      setDayGames(games);
      setPage("dayPick");
    } catch (_) {
      showToast("Falha ao buscar jogos do dia — busca manual disponível", "error");
      setPage("home");
    }
    setLoading(false); setLoadMsg("");
  }

  async function pickDayGame(game: DayGame) {
    setLoading(true); setLoadMsg(`Carregando ${game.homeTeamName} vs ${game.awayTeamName}...`);
    try {
      const [homeData, awayData] = await Promise.allSettled([
        espnLoadTeamGames(game.homeTeamId, game.slug),
        espnLoadTeamGames(game.awayTeamId, game.slug),
      ]);
      const hOk = homeData.status === "fulfilled";
      const aOk = awayData.status === "fulfilled";

      setHomeTeam({
        ...emptyTeam(),
        name: (hOk && homeData.value.teamName) || game.homeTeamName,
        teamId: parseInt(game.homeTeamId),
        logo: hOk ? homeData.value.logo : "",
        games: hOk && homeData.value.games.length > 0 ? homeData.value.games : emptyTeam().games,
      });
      setAwayTeam({
        ...emptyTeam(),
        name: (aOk && awayData.value.teamName) || game.awayTeamName,
        teamId: parseInt(game.awayTeamId),
        logo: aOk ? awayData.value.logo : "",
        games: aOk && awayData.value.games.length > 0 ? awayData.value.games : emptyTeam().games,
      });

      if (game.date) setMatchDate(game.date.split("T")[0]!);

      const failed = [!hOk && game.homeTeamName, !aOk && game.awayTeamName].filter(Boolean) as string[];
      if (failed.length) showToast(`Falha ao carregar ${failed.join(" e ")} — pode revisar/buscar manualmente`, "error");
      else showToast("✓ Times carregados", "success");

      setPage("home"); setActiveGame(0);
    } catch (_) {
      showToast("Falha ao carregar o jogo — tente a busca manual", "error");
    }
    setLoading(false); setLoadMsg("");
  }

  async function loadH2HData() {
    if (!homeTeam.teamId || !awayTeam.teamId || !league) {
      showToast("Carregue os dois times primeiro", "error"); return;
    }
    setLoading(true); setLoadMsg("Buscando H2H automático...");
    try {
      const h2hData = await espnLoadH2H(
        homeTeam.games, awayTeam.games, homeTeam.name, awayTeam.name
      );
      if (h2hData.found === 0) {
        showToast("Nenhum confronto direto encontrado — preencha manualmente", "error");
      } else {
        setH2h(h2hData.stats);
        showToast(`✓ ${h2hData.found} confronto(s) direto(s) encontrado(s)`, "success");
      }
    } catch (_) {
      showToast("Falha ao calcular H2H — preencha manualmente", "error");
    }
    setLoading(false); setLoadMsg("");
  }

  async function loadReferees() {
    if (!homeTeam.teamId || !awayTeam.teamId || !league) {
      showToast("Carregue os dois times primeiro", "error"); return;
    }
    const slug = getEspnSlug(league.id);
    setLoading(true); setLoadMsg("Buscando árbitros e estatísticas...");
    try {
      const list = await espnLoadReferees(slug, String(homeTeam.teamId), String(awayTeam.teamId));
      if (!list.length) {
        showToast("Nenhum árbitro encontrado nos dados — preencha manualmente", "error");
        setLoading(false); setLoadMsg(""); return;
      }
      setReferees(list);
      showToast(`✓ ${list.length} árbitro(s) encontrado(s) — escolha um`, "success");
    } catch (_) {
      showToast("Falha ao buscar árbitros — preencha manualmente", "error");
    }
    setLoading(false); setLoadMsg("");
  }

  function pickReferee(r: EspnReferee) {
    setReferee({
      avgYellows: String(r.avgYellows), avgReds: String(r.avgReds),
      avgFouls: String(r.avgFouls), avgPenalties: String(r.avgPenalties),
    });
    showToast(`✓ Árbitro: ${r.name}`, "success");
  }

  async function handleFetchBetanoOdds() {
    if (!homeTeam.name || !awayTeam.name) {
      showToast("Carregue os dois times primeiro", "error"); return;
    }
    setFetchingOdds(true);
    try {
      const betanoOdds = await fetchBetanoOdds(homeTeam.name, awayTeam.name, matchDate);
      if (!betanoOdds) {
        showToast("Betano ainda não tem mercado aberto pra esse jogo — preencha manualmente", "error");
        setFetchingOdds(false);
        return;
      }
      setOdds({
        homeWin: betanoOdds.homeWin != null ? String(betanoOdds.homeWin) : "",
        draw: betanoOdds.draw != null ? String(betanoOdds.draw) : "",
        awayWin: betanoOdds.awayWin != null ? String(betanoOdds.awayWin) : "",
        over25: betanoOdds.over25 != null ? String(betanoOdds.over25) : "",
        under25: betanoOdds.under25 != null ? String(betanoOdds.under25) : "",
        btts: betanoOdds.bttsYes != null ? String(betanoOdds.bttsYes) : "",
        bttsNo: betanoOdds.bttsNo != null ? String(betanoOdds.bttsNo) : "",
      });
      setOddsSource("betano");
      showToast("✓ Odds da Betano carregadas", "success");
    } catch (_) {
      showToast("Falha ao buscar odds — preencha manualmente", "error");
    }
    setFetchingOdds(false);
  }

  function updGame(team: "home" | "away", idx: number, game: Game) {
    (team === "home" ? setHomeTeam : setAwayTeam)(prev => ({
      ...prev, games: prev.games.map((g, i) => (i === idx ? game : g)),
    }));
  }

  // Sistema não realiza mais análise — só busca e devolve os dados brutos
  // dos últimos jogos dos dois times.
  function exportRawData() {
    const betanoOdds = oddsSource === "betano" ? odds : undefined;
    const text = formatMatchupRawData(homeTeam.name, awayTeam.name, homeTeam.games, awayTeam.games, matchContext, betanoOdds);
    setDataExport(text);
    setCopied(false);
    setPage("data");
  }

  async function analyze() {
    const hS = consolidate(homeTeam.games);
    const aS = consolidate(awayTeam.games);
    // Ajuste 6: usar league.isNationalTeam para detectar seleções automaticamente
    const isNeutral = league?.isNationalTeam ?? false;

    const num = (s: string) => {
      const n = parseFloat(s.replace(",", "."));
      return Number.isFinite(n) && n > 1 ? n : undefined;
    };
    const oddsInput: MatchOddsInput = {
      homeWin: num(odds.homeWin), draw: num(odds.draw), awayWin: num(odds.awayWin),
      over25: num(odds.over25), under25: num(odds.under25),
      btts: num(odds.btts), bttsNo: num(odds.bttsNo),
    };
    const hasOdds = Object.values(oddsInput).some((v) => v !== undefined);

    let homeRating: number | null = null;
    let awayRating: number | null = null;
    let refRating: number | null = null;
    if (homeTeam.name && awayTeam.name) {
      setLoading(true); setLoadMsg("Calculando força dos times (Elo/FIFA)...");
      try {
        const strengthsTimeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 5000)
        );
        const s = await Promise.race([
          fetchStrengths(homeTeam.name, awayTeam.name, !!isNeutral),
          strengthsTimeout,
        ]);
        homeRating = s.homeRating;
        awayRating = s.awayRating;
        refRating = s.refRatingAvg;
      } catch (_) {}
      setLoading(false); setLoadMsg("");
    }

    const opts: ScoreOpts = {
      homeRating, awayRating, refRating,
      isNeutral: !!isNeutral,
      odds: hasOdds ? oddsInput : undefined,
    };
    const mkts = scoreMarkets(hS, aS, h2h, referee, homeTeam, awayTeam, opts);
    const overall = (mkts.over25 + mkts.btts + mkts.consistency + mkts.homeWin + mkts.c85) / 5;
    const gp = goalProbabilities(hS, aS, opts);
    const r = { hS, aS, mkts, overall, lambdaHome: gp.lambdaHome, lambdaAway: gp.lambdaAway };
    setResult(r);
    saveToHistory(r);
    setPage("result");
    // Ajuste 5: logToAudit agora recebe mkts para registrar todos os mercados
    logToAudit(gp, mkts);
    setMgaaResult(runMGAAPlus(hS, aS, homeTeam, awayTeam, gp));
  }

  // Ajuste 5: logToAudit expandido para incluir todos os mercados calculados.
  // Mercados 1X2/gols: probabilidades calibradas Dixon-Coles (somam 100%).
  // Mercados de escanteios/cartões/tempo: scores 0-10 convertidos para % (informativos).
  function logToAudit(gp: ReturnType<typeof goalProbabilities>, mkts: MarketScores) {
    if (!league || !homeTeam.name || !awayTeam.name) return;
    const leagueSlug = league.isFreeSearch ? "amistoso" : (ESPN_LEAGUE_MAP[league.id] ?? "bra.1");
    const pct = (p: number) => Math.round(Math.max(0, Math.min(1, p)) * 100);
    // Score 0-10 → % (informativo, não-calibrado)
    const s2p = (s: number) => Math.round(Math.max(0, Math.min(10, s)) * 10);
    const topScore = exactScoreProbabilities(gp.lambdaHome, gp.lambdaAway, 1)[0];
    const exactScore = topScore ? `${topScore.home}-${topScore.away}` : undefined;
    logClientPrediction({
      homeTeam: homeTeam.name,
      awayTeam: awayTeam.name,
      league: leagueSlug,
      exactScore,
      predictions: {
        // Probabilidades calibradas (Dixon-Coles)
        homeWin: pct(gp.homeWin),
        draw: pct(gp.draw),
        awayWin: pct(gp.awayWin),
        over05: pct(gp.over["0.5"]),
        over15: pct(gp.over["1.5"]),
        over25: pct(gp.over["2.5"]),
        over35: pct(gp.over["3.5"]),
        bttsYes: pct(gp.btts),
        bttsNo: pct(1 - gp.btts),
        // Scores de mercados (0-10 → %, informativos)
        ahHome: s2p(mkts.ahHome),
        ahAway: s2p(mkts.ahAway),
        firstGoalHome: s2p(mkts.firstGoalHome),
        firstGoalAway: s2p(mkts.firstGoalAway),
        firstGoalNo: s2p(mkts.firstGoalNo),
        cornersHome: s2p(mkts.cornersHome),
        cornersAway: s2p(mkts.cornersAway),
        c75: s2p(mkts.c75), c85: s2p(mkts.c85), c95: s2p(mkts.c95),
        c105: s2p(mkts.c105), c115: s2p(mkts.c115),
        ht05: s2p(mkts.ht05), ht15: s2p(mkts.ht15),
        htBtts: s2p(mkts.htBtts), htCorners: s2p(mkts.htCorners), htCards: s2p(mkts.htCards),
        st05: s2p(mkts.st05), st15: s2p(mkts.st15),
        stBtts: s2p(mkts.stBtts), stCorners: s2p(mkts.stCorners), stCards: s2p(mkts.stCards),
        under05: s2p(mkts.under05), under15: s2p(mkts.under15),
        under25: s2p(mkts.under25), under35: s2p(mkts.under35),
        bttsHome: s2p(mkts.bttsHome), bttsAway: s2p(mkts.bttsAway),
        cards: s2p(mkts.cards), cards35: s2p(mkts.cards35),
      },
    })
      .then(() => showToast("✓ Análise registrada na auditoria", "success"))
      .catch(() => showToast("Auditoria: não foi possível registrar esta análise", "error"));
  }

  const ps: Record<Page, number> = { league: 1, dayPick: 1, home: 2, away: 3, extra: 4, result: 5, data: 4 };

  const wrap = (children: React.ReactNode) => (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <Header
        onReset={page !== "league" ? resetAll : undefined}
        onHistory={history.length > 0 ? () => setShowHistory(s => !s) : undefined}
        onAudit={() => setAuditOpen(true)}
        onDay={() => setDayOpen(true)}
        apiOk={apiOk}
        extra={page === "result" ? (
          <button onClick={() => setPage("extra")} style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", color: C.muted, fontSize: 11, fontWeight: 700 }}>← Editar</button>
        ) : undefined}
      />
      {toast && <Toast msg={toast.msg} type={toast.type} />}
      {loading && <Spinner msg={loadMsg} />}
      <div style={{ maxWidth: 700, margin: "0 auto", padding: "16px 12px" }}>
        <StepBar step={ps[page]} />
        {children}
      </div>
    </div>
  );

  // ── JOGOS DO DIA ──
  if (dayOpen) {
    return <DayGamesScreen onBack={() => setDayOpen(false)} onToast={showToast} />;
  }

  // ── AUDITORIA DE DADOS (Ajuste 12) ──
  // Duas trilhas de auditoria coexistem, com propósitos diferentes:
  // 1) esta tela (AuditDataScreen / /api/audit-data): revisão manual de
  //    dados brutos exportados via "exportRawData" — sem cálculo envolvido.
  // 2) logToAudit() abaixo, chamada ao final de analyze(): registra as
  //    probabilidades calibradas do modelo (/api/audit/log-client) para medir
  //    a taxa de acerto/Brier score do método — a análise completa (Poisson,
  //    MGAA+) continua ativa e é o que alimenta essa segunda trilha.
  if (auditOpen) {
    return <AuditDataScreen onBack={() => setAuditOpen(false)} onToast={showToast} />;
  }

  // ── HISTORY OVERLAY ──
  if (showHistory) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter','Segoe UI',sans-serif" }}>
        <Header apiOk={apiOk} onReset={undefined}
          extra={<button onClick={() => setShowHistory(false)} style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", color: C.muted, fontSize: 11, fontWeight: 700 }}>← Voltar</button>}
        />
        <div style={{ maxWidth: 700, margin: "0 auto", padding: "16px 12px" }}>
          <Card>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <SLabel icon="📋" color={C.cyan}>Histórico de Análises</SLabel>
              <button onClick={() => { setHistory([]); try { localStorage.removeItem(HISTORY_KEY); } catch (_) {} }} style={{ fontSize: 10, color: C.red, background: "none", border: "none", cursor: "pointer" }}>Limpar</button>
            </div>
            {history.length === 0 && <div style={{ textAlign: "center", color: C.muted, padding: 24, fontSize: 13 }}>Nenhuma análise salva ainda</div>}
            {history.map(h => {
              const st = marketStatus(h.overall);
              return (
                <div key={h.id} style={{ background: "rgba(255,255,255,.03)", borderRadius: 10, padding: "12px 14px", marginBottom: 8, border: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.text, display: "flex", alignItems: "center", gap: 8 }}>
                        {h.homeLogo && <img src={h.homeLogo} alt="" width={18} height={18} style={{ objectFit: "contain" }} />}
                        {h.homeName}
                        <span style={{ color: C.muted, fontSize: 11 }}>vs</span>
                        {h.awayName}
                        {h.awayLogo && <img src={h.awayLogo} alt="" width={18} height={18} style={{ objectFit: "contain" }} />}
                      </div>
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>{h.leagueName} · {h.date}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: st.color, fontFamily: "monospace" }}>{h.overall.toFixed(1)}</div>
                      <div style={{ fontSize: 9, color: st.color }}>{st.label}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {([["Over 2.5", h.mkts.over25], ["BTTS", h.mkts.btts], ["Casa", h.mkts.homeWin], ["Fora", h.mkts.awayWin], ["Corners 8.5", h.mkts.c85]] as [string, number][]).map(([l, s]) => {
                      const ms = marketStatus(s);
                      return <span key={l} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, background: `${ms.color}18`, color: ms.color, fontWeight: 700 }}>{l}: {s.toFixed(1)}</span>;
                    })}
                  </div>
                </div>
              );
            })}
          </Card>
        </div>
      </div>
    );
  }

  // ── LEAGUE ──
  if (page === "league") return wrap(
    <Card>
      <SLabel icon="🏆">Liga</SLabel>
      <div style={{ background: "rgba(0,229,255,.06)", border: `1px solid ${C.cyan}22`, borderRadius: 10, padding: "10px 14px", fontSize: 11, color: C.cyan, marginBottom: 16, lineHeight: 1.5 }}>
        ✓ Dados automáticos via ESPN · H2H automático · Modelo Poisson avançado
      </div>
      {groupLeaguesByRegion(LEAGUES).map(({ region, leagues }) => (
        <div key={region} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1.5, fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>{region}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {leagues.map(l => (
              <button key={l.id} onClick={() => setLeague(l)} style={{ background: league?.id === l.id ? `${C.cyan}18` : "rgba(255,255,255,.03)", border: `1px solid ${league?.id === l.id ? C.cyan : C.border}`, borderRadius: 10, padding: "11px 12px", cursor: "pointer", color: league?.id === l.id ? C.cyan : "#B0C4DE", fontSize: 12, fontWeight: league?.id === l.id ? 700 : 400, display: "flex", alignItems: "center", gap: 8, textAlign: "left" }}>
                <span>{l.country}</span><span>{l.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {league && (
        <div style={{ marginTop: 16 }}>
          {league.isFreeSearch ? (
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, textAlign: "center" }}>
              Busca o time em todas as ligas cadastradas — sem liga fixa.
            </div>
          ) : (
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, textAlign: "center" }}>
              Temporada: <span style={{ color: C.cyan, fontWeight: 700 }}>{currentSeasonYear(ESPN_LEAGUE_MAP[league.id] ?? "bra.1")}</span>
            </div>
          )}
          <Btn full onClick={() => {
            if (league.isNationalTeam || league.isFreeSearch) { setPage("home"); setActiveGame(0); }
            else { loadDayGames(); }
          }}>Continuar →</Btn>
        </div>
      )}
    </Card>
  );

  // ── JOGOS DE HOJE (escolher o confronto em vez de buscar por nome) ──
  if (page === "dayPick") return wrap(
    <Card>
      <SLabel icon="📅">Jogos de Hoje{league ? ` — ${league.name}` : ""}</SLabel>
      {dayGames.length === 0 && (
        <div style={{ textAlign: "center", color: C.muted, padding: 24, fontSize: 13 }}>
          Nenhum jogo hoje nessa liga.
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
        {dayGames.map(g => (
          <button key={g.id} onClick={() => pickDayGame(g)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, background: "rgba(255,255,255,.03)", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", cursor: "pointer", color: C.text, textAlign: "left" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{g.homeTeamName} <span style={{ color: C.muted, fontSize: 11 }}>vs</span> {g.awayTeamName}</span>
            <span style={{ color: C.cyan, fontSize: 11 }}>Carregar →</span>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <Btn variant="ghost" onClick={() => setPage("league")}>← Voltar</Btn>
        <Btn variant="outline" onClick={() => { setPage("home"); setActiveGame(0); }}>Buscar manualmente</Btn>
      </div>
    </Card>
  );

  // ── TEAM ──
  if (page === "home" || page === "away") {
    const isHome = page === "home";
    const team = isHome ? homeTeam : awayTeam;
    const setTeam = isHome ? setHomeTeam : setAwayTeam;
    const color = isHome ? C.cyan : C.purple;
    const filledGames = team.games.filter(g => g.result).length;
    return wrap(
      <>
        <Card style={{ marginBottom: 12 }}>
          <SLabel icon={isHome ? "🏠" : "✈️"} color={color}>{isHome ? "Time da Casa" : "Time Visitante"}</SLabel>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder={`Buscar... ex: ${isHome ? "Flamengo" : "Palmeiras"}`}
              style={{ flex: 1, background: "rgba(255,255,255,.04)", border: `1px solid ${C.border}`, borderRadius: 9, padding: "11px 14px", color: C.text, fontSize: 14, outline: "none" }} />
            <Btn onClick={handleSearch} disabled={searching || !searchQ.trim()}>{searching ? "..." : "🔍"}</Btn>
          </div>
          {searchRes.length > 0 && (
            <div style={{ background: C.card2, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden", marginBottom: 10 }}>
              {searchRes.map(r => (
                <button key={r.id} onClick={() => loadTeam(r, isHome)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "transparent", border: "none", borderBottom: `1px solid ${C.border}`, cursor: "pointer", color: C.text, fontSize: 13, textAlign: "left" }}>
                  {r.logo && <img src={r.logo} alt="" width={28} height={28} style={{ objectFit: "contain" }} />}
                  <span style={{ flex: 1 }}>{r.name}</span>
                  <span style={{ color: C.cyan, fontSize: 11 }}>Carregar →</span>
                </button>
              ))}
            </div>
          )}
          {team.teamId && (
            <div style={{ background: `${color}0A`, border: `1px solid ${color}33`, borderRadius: 8, padding: "9px 12px", fontSize: 12, color, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              {team.logo && <img src={team.logo} alt="" width={20} height={20} style={{ objectFit: "contain" }} />}
              ✓ {team.name} — {filledGames} jogos carregados
              {filledGames < 5 && <span style={{ color: C.yellow, fontSize: 10, marginLeft: 4 }}>⚠ poucos dados</span>}
            </div>
          )}
          <div style={{ marginTop: 4 }}>
            <div style={{ fontSize: 10, color, letterSpacing: 2, fontWeight: 700, textTransform: "uppercase", marginBottom: 10 }}>🎯 Motivação</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 7 }}>
              {MOTIVATION_FACTORS.map(f => (
                <button key={f.key} onClick={() => setTeam(p => ({ ...p, motivation: { ...p.motivation, [f.key]: !p.motivation[f.key as keyof MotivationFactors] } }))}
                  style={{ padding: "9px 6px", borderRadius: 9, border: `1px solid ${team.motivation[f.key as keyof MotivationFactors] ? color : C.border}`, background: team.motivation[f.key as keyof MotivationFactors] ? `${color}18` : "rgba(255,255,255,.03)", color: team.motivation[f.key as keyof MotivationFactors] ? color : C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <span>{f.icon}</span><span style={{ fontSize: 9 }}>{f.label}</span>
                </button>
              ))}
            </div>
          </div>
        </Card>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <SLabel icon="📋" color={color}>Jogos carregados</SLabel>
            {filledGames > 0 && (
              <span style={{ fontSize: 10, color: C.muted }}>
                Toque em ✏️ para revisar/corrigir um jogo
              </span>
            )}
          </div>
          <GameList
            games={team.games}
            color={color}
            editIdx={editIdx}
            onToggleEdit={i => setEditIdx(p => (p === i ? null : i))}
            onChange={(i, g) => updGame(page, i, g)}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, gap: 8 }}>
            <Btn variant="ghost" onClick={() => { setEditIdx(null); setPage(isHome ? (dayGames.length ? "dayPick" : "league") : "home"); }}>← Voltar</Btn>
            <Btn disabled={!filledGames} onClick={() => { setEditIdx(null); setPage(isHome ? "away" : "extra"); }}>
              {isHome ? "Time Fora →" : "H2H →"}
            </Btn>
          </div>
        </Card>
      </>
    );
  }

  // ── H2H + REFEREE ──
  if (page === "extra") return wrap(
    <>
      <Card style={{ marginBottom: 12 }}>
        <SLabel icon="⚔️">H2H — Confronto Direto</SLabel>
        {homeTeam.teamId && awayTeam.teamId ? (
          <div style={{ marginBottom: 14 }}>
            <Btn full onClick={loadH2HData} disabled={loading}>⚡ Buscar H2H automático (ESPN)</Btn>
            <div style={{ fontSize: 10, color: C.muted, textAlign: "center", marginTop: 6 }}>Ou preencha manualmente abaixo</div>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: C.yellow, background: "rgba(255,184,0,.06)", borderRadius: 8, padding: "9px 12px", marginBottom: 14 }}>
            ⚠ Carregue os dois times para buscar H2H automático
          </div>
        )}
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1.5, fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Últimos 5 Confrontos</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <Field label="BTTS %" value={h2h.last5_btts} onChange={v => setH2h(p => ({ ...p, last5_btts: v }))} placeholder="60" />
          <Field label="Over 2.5 %" value={h2h.last5_over25} onChange={v => setH2h(p => ({ ...p, last5_over25: v }))} placeholder="60" />
          <Field label="Over 3.5 %" value={h2h.last5_over35} onChange={v => setH2h(p => ({ ...p, last5_over35: v }))} placeholder="20" />
          <Field label="Média Gols" value={h2h.last5_avgGoals} onChange={v => setH2h(p => ({ ...p, last5_avgGoals: v }))} placeholder="2.8" />
        </div>
        <div style={{ height: 1, background: C.border, margin: "8px 0 12px" }} />
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1.5, fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Últimos 10 Confrontos</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="BTTS %" value={h2h.last10_btts} onChange={v => setH2h(p => ({ ...p, last10_btts: v }))} placeholder="55" />
          <Field label="Over 2.5 %" value={h2h.last10_over25} onChange={v => setH2h(p => ({ ...p, last10_over25: v }))} placeholder="60" />
          <Field label="Over 3.5 %" value={h2h.last10_over35} onChange={v => setH2h(p => ({ ...p, last10_over35: v }))} placeholder="30" />
          <Field label="Média Gols" value={h2h.last10_avgGoals} onChange={v => setH2h(p => ({ ...p, last10_avgGoals: v }))} placeholder="2.6" />
        </div>
      </Card>
      <Card style={{ marginBottom: 12 }}>
        <SLabel icon="🟨">Árbitro</SLabel>
        {homeTeam.teamId && awayTeam.teamId ? (
          <div style={{ marginBottom: 14 }}>
            <Btn full onClick={loadReferees} disabled={loading}>⚡ Buscar árbitros automático (ESPN)</Btn>
            <div style={{ fontSize: 10, color: C.muted, textAlign: "center", marginTop: 6 }}>Médias reais dos jogos recentes · ou preencha manualmente</div>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: C.yellow, background: "rgba(255,184,0,.06)", borderRadius: 8, padding: "9px 12px", marginBottom: 14 }}>
            ⚠ Carregue os dois times para buscar árbitros automático
          </div>
        )}
        {referees.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1.5, fontWeight: 700, textTransform: "uppercase", marginBottom: 2 }}>Escolha o árbitro da partida</div>
            {referees.map(r => (
              <button key={r.name} onClick={() => pickReferee(r)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: referee.avgYellows === String(r.avgYellows) && referee.avgFouls === String(r.avgFouls) ? "rgba(0,210,255,.10)" : "rgba(255,255,255,.03)", border: `1px solid ${referee.avgYellows === String(r.avgYellows) && referee.avgFouls === String(r.avgFouls) ? C.cyan : C.border}`, borderRadius: 10, padding: "9px 12px", cursor: "pointer", textAlign: "left", color: C.text }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{r.games} jogo(s) na amostra</div>
                </div>
                <div style={{ display: "flex", gap: 10, fontSize: 10, fontFamily: "monospace", color: C.muted, flexShrink: 0 }}>
                  <span>🟨 {r.avgYellows}</span>
                  <span>🟥 {r.avgReds}</span>
                  <span>Faltas {r.avgFouls}</span>
                </div>
              </button>
            ))}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Amarelos/Jogo" value={referee.avgYellows} onChange={v => setReferee(p => ({ ...p, avgYellows: v }))} placeholder="3.8" />
          <Field label="Vermelhos/Jogo" value={referee.avgReds} onChange={v => setReferee(p => ({ ...p, avgReds: v }))} placeholder="0.3" />
          <Field label="Faltas/Jogo" value={referee.avgFouls} onChange={v => setReferee(p => ({ ...p, avgFouls: v }))} placeholder="22" />
          <Field label="Pênaltis/Jogo" value={referee.avgPenalties} onChange={v => setReferee(p => ({ ...p, avgPenalties: v }))} placeholder="0.4" />
        </div>
      </Card>
      <Card style={{ marginBottom: 12 }}>
        <SLabel icon="💱">Odds do Mercado (opcional)</SLabel>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
          Cole as odds decimais da casa (ex.: 1.85), ou busque automático na
          Betano abaixo. Quando preenchidas, o modelo é calibrado pela
          probabilidade implícita (sem a margem da casa) — o sinal público
          mais confiável. Deixe em branco para usar só o modelo.
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <Field label="Data do jogo" type="date" value={matchDate} onChange={setMatchDate} />
          </div>
          <Btn onClick={handleFetchBetanoOdds} disabled={fetchingOdds || !homeTeam.name || !awayTeam.name}>
            {fetchingOdds ? "..." : "🎰 Buscar Odds (Betano)"}
          </Btn>
        </div>
        {oddsSource === "betano" && (
          <div style={{ fontSize: 10, color: C.green, marginBottom: 12 }}>✓ Preenchido automaticamente com odds da Betano</div>
        )}
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1.5, fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Resultado (1X2)</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
          <Field label="Casa" value={odds.homeWin} onChange={v => setOdds(p => ({ ...p, homeWin: v }))} placeholder="2.10" />
          <Field label="Empate" value={odds.draw} onChange={v => setOdds(p => ({ ...p, draw: v }))} placeholder="3.20" />
          <Field label="Fora" value={odds.awayWin} onChange={v => setOdds(p => ({ ...p, awayWin: v }))} placeholder="3.40" />
        </div>
        <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1.5, fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Gols 2.5 e Ambas Marcam</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Over 2.5" value={odds.over25} onChange={v => setOdds(p => ({ ...p, over25: v }))} placeholder="1.90" />
          <Field label="Under 2.5" value={odds.under25} onChange={v => setOdds(p => ({ ...p, under25: v }))} placeholder="1.90" />
          <Field label="BTTS Sim" value={odds.btts} onChange={v => setOdds(p => ({ ...p, btts: v }))} placeholder="1.80" />
          <Field label="BTTS Não" value={odds.bttsNo} onChange={v => setOdds(p => ({ ...p, bttsNo: v }))} placeholder="2.00" />
        </div>
      </Card>
      <Card style={{ marginBottom: 12 }}>
        <SLabel icon="🏆">Contexto do Confronto (opcional)</SLabel>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
          Mata-mata (ida/volta, placar agregado, regra de gol fora), decisão,
          rebaixamento, ou qualquer outro contexto que não apareça nos dados
          brutos — vai junto no texto exportado, pra IA de análise levar em conta.
        </div>
        <textarea
          value={matchContext}
          onChange={e => setMatchContext(e.target.value)}
          placeholder="Ex.: Mata-mata, volta. Jogo de ida: Time A 2-1 Time B. Sem gol fora em dobro — precisa vencer por 2+ de diferença."
          rows={3}
          style={{
            width: "100%", background: "rgba(255,255,255,.03)", border: `1px solid ${C.border}`,
            borderRadius: 8, padding: "9px 12px", color: C.text, fontSize: 13, outline: "none",
            resize: "vertical", fontFamily: "inherit",
          }}
        />
      </Card>
      <div style={{ display: "flex", gap: 10 }}>
        <Btn variant="ghost" onClick={() => { setPage("away"); setActiveGame(9); }}>← Voltar</Btn>
        <Btn full size="lg" onClick={exportRawData} disabled={loading}>🔍 Buscar Dados</Btn>
      </div>
    </>
  );

  // ── DADOS BRUTOS (Ajuste 8) ──
  if (page === "data" && dataExport) {
    return wrap(
      <>
        <Card style={{ marginBottom: 12 }}>
          <SLabel icon="📋">Dados Brutos — {homeTeam.name} vs {awayTeam.name}</SLabel>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>
            Copie e cole no prompt "Analista APEX" da sua IA de análise.
          </div>
          <textarea
            readOnly
            value={dataExport}
            style={{
              width: "100%", minHeight: 360, background: "rgba(255,255,255,.03)",
              border: `1px solid ${C.border}`, borderRadius: 10, padding: 12,
              color: C.text, fontSize: 11, fontFamily: "monospace", lineHeight: 1.5,
              resize: "vertical",
            }}
          />
        </Card>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <Btn variant="ghost" onClick={() => setPage("extra")}>← Voltar</Btn>
          <Btn
            full size="lg"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(dataExport);
                setCopied(true);
                showToast("✓ Copiado — cole na sua IA de análise", "success");
                setTimeout(() => setCopied(false), 2500);
              } catch (_) {
                showToast("Não consegui copiar automaticamente — selecione o texto manualmente", "error");
              }
            }}
          >
            {copied ? "✓ Copiado!" : "📋 Copiar dados"}
          </Btn>
        </div>
        <Btn
          full
          onClick={async () => {
            try {
              await saveAuditData({
                homeTeam: homeTeam.name,
                awayTeam: awayTeam.name,
                league: league?.name ?? "",
                date: "",
                rawData: dataExport,
              });
              showToast("✓ Salvo na Auditoria de Dados", "success");
            } catch (_) {
              showToast("Falha ao salvar na auditoria", "error");
            }
          }}
        >
          💾 Salvar para Auditoria
        </Btn>
      </>
    );
  }

  // ── RESULT ──
  if (page === "result" && result) {
    const { hS, aS, mkts, overall, lambdaHome, lambdaAway } = result;
    const st = marketStatus(overall);
    const conf = dataConfidence(hS, aS);

    // Ajuste 2b: helper para badge de alta confiança histórica
    const highBadge = (key: string) =>
      mgaaResult?.highConfidenceBadges?.includes(key) ? " ⭐" : "";

    return wrap(
      <>
        <ConfidenceBadge {...conf} />

        <Card style={{ textAlign: "center", padding: "24px 16px", marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>{league?.country} {league?.name}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.text, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
            {homeTeam.logo && <img src={homeTeam.logo} alt="" width={28} height={28} style={{ objectFit: "contain" }} />}
            {homeTeam.name || "Casa"}
            <span style={{ color: C.muted, fontSize: 12 }}>vs</span>
            {awayTeam.name || "Fora"}
            {awayTeam.logo && <img src={awayTeam.logo} alt="" width={28} height={28} style={{ objectFit: "contain" }} />}
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 32, marginBottom: 16, flexWrap: "wrap" }}>
            <ScoreGauge score={overall} />
            <div style={{ display: "flex", flexDirection: "column", gap: 7, justifyContent: "center" }}>
              {([["Consistência", mkts.consistency], ["Over 2.5", mkts.over25], ["BTTS", mkts.btts], ["Corners 8.5", mkts.c85], ["1ºT O0.5", mkts.ht05]] as [string, number][]).map(([l, s]) => {
                const mst = marketStatus(s);
                return (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", gap: 14, fontSize: 12 }}>
                    <span style={{ color: C.muted }}>{l}</span>
                    <span style={{ color: mst.color, fontWeight: 700, fontFamily: "monospace" }}>{s.toFixed(1)}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ borderRadius: 10, padding: "10px 14px", fontSize: 13, fontWeight: 600, background: `${st.color}18`, border: `1px solid ${st.color}44`, color: st.color }}>
            {overall >= 8.5 ? "⭐ PREMIUM — Alta confiança" : overall >= 7 ? "✅ APROVADO — Recomendado" : overall >= 5 ? "⚠️ INCERTO — Cautela" : "❌ BAIXO — Não recomendado"}
          </div>
        </Card>

        {mgaaResult && (() => {
          const { ict, ictAdjusted, irt, ivr, icj, ifg, marketClassification } = mgaaResult;
          return (
            <Card style={{ marginBottom: 10, border: `1px solid ${icj.reading.color}55`, background: `${icj.reading.color}0d` }}>
              <SLabel icon="🧩" color={icj.reading.color}>MGAA+ — Índice do Jogo (ICJ)</SLabel>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "monospace", color: icj.reading.color, lineHeight: 1 }}>{icj.value}</div>
                  <div style={{ fontSize: 11, color: icj.reading.color, fontWeight: 700, marginTop: 2 }}>{icj.reading.label}</div>
                </div>
                <div style={{ fontSize: 10, color: C.muted, textAlign: "right", lineHeight: 1.5 }}>
                  Escala 50–90 do método<br/>≥80 confiável · 70–79 bom<br/>60–69 instável · &lt;60 evitável
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                {[
                  { name: homeTeam.name || "Casa", ictR: ict.home, adj: ictAdjusted.home, irtR: irt.home },
                  { name: awayTeam.name || "Fora", ictR: ict.away, adj: ictAdjusted.away, irtR: irt.away },
                ].map(({ name, ictR, adj, irtR }) => (
                  <div key={name} style={{ background: "rgba(255,255,255,.03)", borderRadius: 10, padding: 10 }}>
                    <div style={{ fontSize: 11, color: C.cyan, fontWeight: 700, marginBottom: 6 }}>{name}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: C.muted }}>ICT (estrutural)</span>
                      <span style={{ color: ictR.tier.color, fontFamily: "monospace", fontWeight: 700 }}>{ictR.value} · {ictR.tier.label}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: C.muted }}>ICTᴬ (ajustado p/ mando)</span>
                      <span style={{ color: C.text, fontFamily: "monospace", fontWeight: 700 }}>{adj}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                      <span style={{ color: C.muted }}>IRT (ritmo)</span>
                      <span style={{ color: C.text, fontFamily: "monospace", fontWeight: 700 }}>{irtR.label} {irtR.trend}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <div style={{ flex: 1, background: "rgba(255,255,255,.03)", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1 }}>IFG (gols)</div>
                  {/* Ajuste 10: xG por time no card IFG */}
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{ifg.label}</div>
                  {(ifg.avgXGHome > 0 || ifg.avgXGAway > 0) && (
                    <div style={{ fontSize: 9, color: C.muted, marginTop: 4, lineHeight: 1.5 }}>
                      xG {homeTeam.name?.split(" ")[0] || "Casa"}: <span style={{ color: C.cyan, fontFamily: "monospace" }}>{ifg.avgXGHome.toFixed(2)}</span>
                      {" · "}
                      xG {awayTeam.name?.split(" ")[0] || "Fora"}: <span style={{ color: C.purple, fontFamily: "monospace" }}>{ifg.avgXGAway.toFixed(2)}</span>
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, background: "rgba(255,255,255,.03)", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1 }}>IVR (risco)</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: ivr.label === "Baixo" ? "#00C875" : ivr.label === "Médio" ? "#FFB800" : "#FF4D4D" }}>{ivr.label}</div>
                  {mgaaResult.ict.home.breakdown && homeTeam.motivation.knockout && awayTeam.motivation.knockout && (
                    <div style={{ fontSize: 9, color: "#FFB800", marginTop: 2 }}>⚔️ +10 mata-mata</div>
                  )}
                </div>
              </div>

              <div style={{ fontSize: 10, color: C.cyan, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, marginBottom: 8 }}>
                Classificação de Mercados (sem EV)
              </div>
              {([
                ["🟢 Seguro (75–95%)", marketClassification.seguro, "#00C875"],
                ["🟡 Moderado (70–75%)", marketClassification.moderado, "#FFB800"],
                ["🔴 Alto (60–70%)", marketClassification.alto, "#FF9F40"],
              ] as [string, MGAAResult["marketClassification"]["seguro"], string][]).map(([label, items, color]) => (
                items.length > 0 && (
                  <div key={label} style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 10, color, fontWeight: 700, marginBottom: 4 }}>{label}</div>
                    {items.map((it) => (
                      <div key={it.market} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, padding: "4px 0" }}>
                        <span style={{ color: C.text }}>{it.market}</span>
                        <span style={{ color, fontFamily: "monospace", fontWeight: 700 }}>{it.prob.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                )
              ))}
              {marketClassification.foraDoMetodo && (
                <div style={{ fontSize: 11, color: C.muted, fontStyle: "italic" }}>❌ Nenhum mercado atinge 60% — jogo fora do método MGAA+.</div>
              )}
            </Card>
          );
        })()}

        {(() => {
          const { recommended, multipla, combined } = buildRecommendations(mkts);
          if (!recommended) return null;
          const rst = marketStatus(recommended.score);
          const cst = marketStatus(combined);
          return (
            <>
              <Card style={{ marginBottom: 10, border: `1px solid ${rst.color}55`, background: `${rst.color}0d` }}>
                <SLabel icon="🎯" color={rst.color}>Mercado Recomendado</SLabel>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 4 }}>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{recommended.label}</div>
                    <div style={{ fontSize: 11, color: rst.color, fontWeight: 700, marginTop: 2 }}>{rst.label}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 28, fontWeight: 800, fontFamily: "monospace", color: rst.color, lineHeight: 1 }}>{recommended.score.toFixed(1)}</div>
                    <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1 }}>CONFIANÇA /10</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 10 }}>
                  Aposta simples de maior chance de acerto nesta partida.
                </div>
              </Card>

              <Card style={{ marginBottom: 10 }}>
                <SLabel icon="🎰" color={C.cyan}>Múltipla Sugerida — 3 seleções</SLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 4 }}>
                  {multipla.map((p, i) => {
                    const pst = marketStatus(p.score);
                    return (
                      <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(255,255,255,.03)", borderRadius: 10, padding: "9px 12px" }}>
                        <div style={{ width: 22, height: 22, borderRadius: "50%", background: `${C.cyan}22`, color: C.cyan, fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
                        <div style={{ flex: 1, fontSize: 13, fontWeight: 600, color: C.text }}>{p.label}</div>
                        <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: pst.color }}>{p.score.toFixed(1)}</div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
                  <span style={{ fontSize: 11, color: C.muted }}>Índice combinado (heurístico)</span>
                  <span style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: cst.color }}>{combined.toFixed(1)}<span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>/10</span></span>
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 8, lineHeight: 1.4 }}>
                  ⚠ Múltiplas multiplicam o risco: todas as 3 seleções precisam acertar. A confiança combinada é sempre menor que a de cada seleção isolada.
                </div>
              </Card>
            </>
          );
        })()}

        {/* Ajuste 8: Gestão de Banca */}
        {mgaaResult && (
          <BankrollCard icj={mgaaResult.icj.value} />
        )}

        {(() => {
          const scores = exactScoreProbabilities(lambdaHome, lambdaAway, 12);
          const maxProb = scores[0]?.prob ?? 1;
          return (
            <Card style={{ marginBottom: 10 }}>
              <SLabel icon="🎯">Placares Exatos Mais Prováveis</SLabel>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 12, lineHeight: 1.5 }}>
                Top 12 placares por probabilidade — modelo Dixon-Coles com correção de baixa pontuação.
                λ Casa: <span style={{ color: C.cyan, fontFamily: "monospace", fontWeight: 700 }}>{lambdaHome.toFixed(2)}</span> ·
                λ Fora: <span style={{ color: C.cyan, fontFamily: "monospace", fontWeight: 700 }}>{lambdaAway.toFixed(2)}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                {scores.map(({ home, away, prob }, i) => {
                  const isHomeWin = home > away;
                  const isDraw = home === away;
                  const pct = (prob * 100).toFixed(1);
                  const barW = (prob / maxProb) * 100;
                  const accent = isHomeWin ? "#00C875" : isDraw ? "#FFB800" : "#00E5FF";
                  return (
                    <div key={`${home}-${away}`} style={{ background: i === 0 ? `${accent}18` : "rgba(255,255,255,.03)", border: `1px solid ${i === 0 ? accent + "55" : C.border}`, borderRadius: 10, padding: "10px 10px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 4 }}>
                        <span style={{ fontSize: 20, fontWeight: 900, fontFamily: "monospace", color: accent, lineHeight: 1 }}>{home}</span>
                        <span style={{ fontSize: 13, color: C.muted, fontWeight: 700 }}>–</span>
                        <span style={{ fontSize: 20, fontWeight: 900, fontFamily: "monospace", color: accent, lineHeight: 1 }}>{away}</span>
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: accent, textAlign: "center", fontFamily: "monospace" }}>{pct}%</div>
                      <div style={{ height: 3, background: C.border, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${barW}%`, background: accent, borderRadius: 3 }} />
                      </div>
                      <div style={{ fontSize: 9, color: C.muted, textAlign: "center", fontWeight: 600 }}>
                        {isHomeWin ? homeTeam.name || "Casa" : isDraw ? "Empate" : awayTeam.name || "Fora"}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })()}

        {/* Ajuste 9: TimeBandChart */}
        <TimeBandChart
          hS={hS} aS={aS}
          homeName={homeTeam.name || "Casa"}
          awayName={awayTeam.name || "Fora"}
        />

        <Card style={{ marginBottom: 10 }}>
          <SLabel icon="📊">Estatísticas dos Times</SLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[{ name: homeTeam.name || "Casa", s: hS }, { name: awayTeam.name || "Fora", s: aS }].map(({ name, s }) => (
              <div key={name} style={{ background: "rgba(255,255,255,.03)", borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 10, color: C.cyan, fontWeight: 700, marginBottom: 8 }}>{name}</div>
                {([
                  ["Aprov.", `${s.aproveitamento.toFixed(0)}%`],
                  ["Forma 5J", `${s.form5.toFixed(1)}/10`],
                  ["Gols/J", s.avgTotal.toFixed(2)],
                  ["Marc.", s.avgGoalsFor.toFixed(2)],
                  ["Sofr.", s.avgGoalsAgainst.toFixed(2)],
                  // Ajuste 10: xG/xGA médio nas estatísticas
                  ...(s.avgXG > 0 ? [["xG/J", s.avgXG.toFixed(2)]] as [string, string][] : []),
                  ...(s.avgXGA > 0 ? [["xGA/J", s.avgXGA.toFixed(2)]] as [string, string][] : []),
                  ["BTTS", `${s.bttsRate.toFixed(0)}%`],
                  ["CS", `${s.csRate.toFixed(0)}%`],
                  ["O2.5", `${s.over25Rate.toFixed(0)}%`],
                  ["Esk./J", s.avgCorners.toFixed(1)],
                  ["Cons.", `${s.consistency.toFixed(1)}/10`],
                  ["Jogos", s.gamesPlayed.toString()],
                ] as [string, string][]).map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                    <span style={{ color: l.startsWith("xG") ? "#A78BFA" : C.muted }}>{l}</span>
                    <span style={{ color: l.startsWith("xG") ? "#A78BFA" : C.text, fontFamily: "monospace", fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {/* Ajuste 10: linha de diferença xG vs xGA */}
          {(hS.avgXG > 0 || aS.avgXG > 0) && (
            <div style={{ marginTop: 10, borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
              <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>Diferencial xG</div>
              {[{ name: homeTeam.name || "Casa", s: hS }, { name: awayTeam.name || "Fora", s: aS }].map(({ name, s }) => {
                const diff = s.avgXG - s.avgXGA;
                const color = diff > 0 ? "#00C875" : diff < 0 ? "#FF4D4D" : C.muted;
                return (
                  <div key={name} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                    <span style={{ color: C.muted }}>{name}</span>
                    <span style={{ fontFamily: "monospace", color, fontWeight: 700 }}>
                      xG {s.avgXG.toFixed(2)} · xGA {s.avgXGA.toFixed(2)} · diff {diff >= 0 ? "+" : ""}{diff.toFixed(2)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <MarketSection title="Resultado" icon="🏆" rows={[["Vitória Casa", mkts.homeWin], ["Empate", mkts.draw], ["Vitória Fora", mkts.awayWin]]} />
        <MarketSection title="Handicap Asiático" icon="🎲" rows={[["AH Casa (-0.5)", mkts.ahHome], ["AH Fora (+0.5)", mkts.ahAway]]} />
        <MarketSection title="Primeiro Gol" icon="⚡" rows={[["Casa marca primeiro", mkts.firstGoalHome], ["Fora marca primeiro", mkts.firstGoalAway], ["Sem gols / intervalo", mkts.firstGoalNo]]} />
        {/* Ajuste 2b: Over/Under com badge ⭐ quando alta confiança histórica */}
        <MarketSection title="Over / Under" icon="⚽" rows={[
          [`Over 0.5 Gols${highBadge("over05")}`, mkts.over05],
          [`Over 1.5 Gols${highBadge("over15")}`, mkts.over15],
          ["Over 2.5 Gols", mkts.over25],
          ["Over 3.5 Gols", mkts.over35],
          ["Under 0.5 Gols", mkts.under05],
          ["Under 1.5 Gols", mkts.under15],
          ["Under 2.5 Gols", mkts.under25],
          ["Under 3.5 Gols", mkts.under35],
        ]} />
        <MarketSection title="BTTS" icon="🎯" rows={[["BTTS Sim", mkts.btts], ["BTTS Não", mkts.bttsNo], ["BTTS Casa", mkts.bttsHome], ["BTTS Fora", mkts.bttsAway]]} />
        <MarketSection title="Escanteios (Total)" icon="🚩" rows={[["Over 7.5", mkts.c75], ["Over 8.5", mkts.c85], ["Over 9.5", mkts.c95], ["Over 10.5", mkts.c105], ["Over 11.5", mkts.c115]]} />
        <MarketSection title="Escanteios por Time" icon="📐" rows={[["Casa — Mais escanteios", mkts.cornersHome], ["Fora — Mais escanteios", mkts.cornersAway]]} />
        <MarketSection title="Cartões" icon="🟨" rows={[["Total Cartões", mkts.cards], ["Over 3.5", mkts.cards35]]} />
        <MarketSection title="Primeiro Tempo" icon="🕐" rows={[["Over 0.5 HT", mkts.ht05], ["Over 1.5 HT", mkts.ht15], ["BTTS HT", mkts.htBtts], ["Escanteios HT", mkts.htCorners], ["Cartões HT", mkts.htCards]]} />
        <MarketSection title="Segundo Tempo" icon="🕑" rows={[["Over 0.5 ST", mkts.st05], ["Over 1.5 ST", mkts.st15], ["BTTS ST", mkts.stBtts], ["Escanteios ST", mkts.stCorners], ["Cartões ST", mkts.stCards]]} />

        <div style={{ padding: "20px 0 8px", textAlign: "center", fontSize: 10, color: C.muted }}>
          APEX — Análise Preditiva · Dados: ESPN · Modelo Poisson + Forma Recente
        </div>
      </>
    );
  }

  return wrap(<div style={{ textAlign: "center", color: C.muted, padding: 40 }}>Carregando...</div>);
}
