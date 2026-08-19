import type { Game } from "../types";

// Ajuste 8: exporta os dados crus dos últimos jogos de um time, no formato
// que o prompt "Analista APEX" (usado em uma IA externa) espera — jogo por
// jogo, do mais recente pro mais antigo, com todos os dados que o APEX já
// buscou (placar, escanteios, cartões, faltas, xG, quando disponíveis).
// Não faz nenhum cálculo — é só a matéria-prima, sem viés de outlier já
// que quem trata isso é o prompt/IA do outro lado.

// Janela dupla de amostra: os primeiros SHORT_TERM_WINDOW jogos vêm com
// estatísticas completas (o backend buscou o /summary de cada um); do
// SHORT_TERM_WINDOW+1 em diante ("base estrutural") só tem placar/adversário
// — precisa bater com SHORT_TERM_WINDOW em artifacts/api-server/src/routes/espn.ts.
const SHORT_TERM_WINDOW = 10;

function num(s: string | undefined): number {
  const n = parseFloat((s ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function formatOneGame(g: Game, idx: number, detailed: boolean): string {
  const golsFor = num(g.goalsFor1H) + num(g.goalsFor2H);
  const golsAgainst = num(g.goalsAgainst1H) + num(g.goalsAgainst2H);
  const venue = g.venue === "home" ? "casa" : g.venue === "away" ? "fora" : g.venue || "?";
  const parts = [
    `${idx}. ${g.date || "?"} vs ${g.opponent || "?"} (${venue})`,
    `Placar: ${golsFor}-${golsAgainst}`,
  ];
  if (g.competition) parts.push(`Competição: ${g.competition}`);
  // Base estrutural: só placar/adversário/competição — escanteios, cartões,
  // chutes e xG não foram buscados pra esses jogos (ver SHORT_TERM_WINDOW),
  // então mostrar "0" aqui seria dado falso, não dado ausente.
  if (detailed) {
    parts.push(`Escanteios: ${g.cornersFor || "0"}-${g.cornersAgainst || "0"}`);
    parts.push(`Cartões (A/V): ${g.yellows || "0"}/${g.reds || "0"}`);
    if (g.fouls) parts.push(`Faltas: ${g.fouls}`);
    if (g.shots) parts.push(`Chutes: ${g.shots}${g.shotsOnTarget ? ` (${g.shotsOnTarget} no alvo)` : ""}`);
    if (g.xg) parts.push(`xG: ${g.xg}${g.xga ? ` / xGA: ${g.xga}` : ""}`);
  }
  return "  " + parts.join(" | ");
}

export function formatTeamRawData(teamName: string, mando: "casa" | "fora", games: Game[]): string {
  const valid = games.filter(g => g.result || g.opponent);
  const header = `TIME: ${teamName}\nMANDO NESTE CONFRONTO: ${mando}`;
  if (!valid.length) return `${header}\n\n(sem jogos carregados)`;

  const shortTerm = valid.slice(0, SHORT_TERM_WINDOW);
  const structural = valid.slice(SHORT_TERM_WINDOW);

  const sections = [
    `Curto prazo — últimos ${shortTerm.length} jogos (dados completos):`,
    shortTerm.map((g, i) => formatOneGame(g, i + 1, true)).join("\n"),
  ];

  if (structural.length) {
    sections.push(
      "",
      `Base estrutural — jogos ${shortTerm.length + 1} a ${valid.length} (placar/adversário, sem estatísticas detalhadas):`,
      structural.map((g, i) => formatOneGame(g, shortTerm.length + i + 1, false)).join("\n"),
    );
  }

  return `${header}\n\n${sections.join("\n")}`;
}

// Odds buscadas automaticamente na Betano (ver oddsApi.ts/handleFetchBetanoOdds
// em ApexPage.tsx) — bloco separado, só aparece quando a busca automática
// trouxe alguma coisa (odds digitadas manualmente não entram aqui, ficam só
// no cálculo do modelo local).
export interface BetanoOddsBlockInput {
  homeWin?: string; draw?: string; awayWin?: string;
  over25?: string; under25?: string; btts?: string; bttsNo?: string;
}

function formatOddsBlock(odds: BetanoOddsBlockInput): string | null {
  const lines: string[] = [];
  if (odds.homeWin) lines.push(`Casa: ${odds.homeWin}`);
  if (odds.draw) lines.push(`Empate: ${odds.draw}`);
  if (odds.awayWin) lines.push(`Fora: ${odds.awayWin}`);
  if (odds.over25) lines.push(`Over 2.5: ${odds.over25}`);
  if (odds.under25) lines.push(`Under 2.5: ${odds.under25}`);
  if (odds.btts) lines.push(`Ambas Marcam (Sim): ${odds.btts}`);
  if (odds.bttsNo) lines.push(`Ambas Marcam (Não): ${odds.bttsNo}`);
  if (!lines.length) return null;
  return `MERCADOS E ODDS DISPONÍVEIS (Betano):\n  ${lines.join(" | ")}`;
}

export function formatMatchupRawData(
  homeName: string, awayName: string,
  homeGames: Game[], awayGames: Game[],
  matchContext?: string,
  betanoOdds?: BetanoOddsBlockInput,
): string {
  const oddsBlock = betanoOdds ? formatOddsBlock(betanoOdds) : null;
  return [
    `═══════════════════════════════════════════`,
    `CONFRONTO: ${homeName} (casa) vs ${awayName} (fora)`,
    `═══════════════════════════════════════════`,
    ...(matchContext?.trim() ? ["", `CONTEXTO: ${matchContext.trim()}`] : []),
    ...(oddsBlock ? ["", oddsBlock] : []),
    "",
    formatTeamRawData(homeName, "casa", homeGames),
    "",
    formatTeamRawData(awayName, "fora", awayGames),
  ].join("\n");
}
