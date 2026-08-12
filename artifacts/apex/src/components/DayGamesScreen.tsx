import { useState } from "react";
import { C, LEAGUES, ESPN_LEAGUE_MAP, groupLeaguesByRegion } from "../lib/constants";
import { espnLoadScoreboard, espnLoadTeamGames } from "../lib/espnApi";
import { formatMatchupRawData } from "../lib/rawDataExport";
import { saveAuditData } from "../lib/auditDataApi";
import type { DayGame } from "../types";

interface DataEntry {
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string;
  rawData: string;
}

function todayInputVal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "Jogos do Dia" varre calendário de clubes — seleções (Copa do Mundo) ficam
// de fora dessa tela porque o calendário delas é esparso demais pra fazer
// sentido junto de uma varredura diária por liga. "Amistoso / Jogo Único"
// também fica de fora — não tem slug ESPN fixo pra consultar um scoreboard
// por data (ver FREE_SEARCH_LEAGUE_ID em constants.ts).
const CLUB_LEAGUES = LEAGUES.filter(l => !l.isNationalTeam && !l.isFreeSearch);

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
  const [fetching, setFetching] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, label: "" });
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

  // Busca os jogos do dia nas ligas selecionadas e devolve só o material cru
  // (histórico dos dois times de cada confronto) pra copiar e mandar pra IA
  // de análise — este componente não roda nenhum modelo/score localmente.
  async function fetchDayData() {
    if (!selectedLeagues.length) {
      onToast("Selecione pelo menos uma liga", "error"); return;
    }
    const dateISO = dateVal.replace(/-/g, "");
    setFetching(true);
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
      setFetching(false);
      onToast("Nenhum jogo encontrado nessa data/liga", "error");
      return;
    }

    // Step 2: busca o histórico dos dois times de cada jogo e monta o texto cru.
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
    setFetching(false);
    setCopied(false);
    onToast(`✓ Dados de ${allGames.length} jogo(s) prontos pra copiar`, "success");
  }

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
        {dataExport && !fetching && (
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
            {groupLeaguesByRegion(CLUB_LEAGUES).map(({ region, leagues }) => (
              <div key={region} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 }}>{region}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {leagues.map(l => (
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
            ))}
          </div>

          {/* Fetch button */}
          <button
            onClick={fetchDayData}
            disabled={fetching || !selectedLeagues.length}
            style={{
              width: "100%", background: fetching || !selectedLeagues.length
                ? "rgba(255,255,255,.05)"
                : `linear-gradient(135deg,${C.cyan},#0077FF)`,
              border: "none", borderRadius: 10, padding: "12px 20px",
              cursor: fetching || !selectedLeagues.length ? "not-allowed" : "pointer",
              color: "#080D1A", fontSize: 14, fontWeight: 700, opacity: fetching ? 0.6 : 1,
            }}
          >
            {fetching ? `Buscando... ${progress.current}/${progress.total}` : "🔍 Buscar Dados do Dia"}
          </button>

          {/* Progress */}
          {fetching && progress.total > 0 && (
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

        {/* No results */}
        {searched && !fetching && !dataExport && (
          <div style={{ textAlign: "center", color: C.muted, padding: 40, fontSize: 13 }}>
            Nenhum jogo encontrado para essa data e ligas selecionadas.
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}
