import type { Game } from "../types";

// Ajuste 8: exporta os dados crus dos últimos jogos de um time, no formato
// que o prompt "Analista APEX" (usado em uma IA externa) espera — jogo por
// jogo, do mais recente pro mais antigo, com todos os dados que o APEX já
// buscou (placar, escanteios, cartões, faltas, xG, quando disponíveis).
// Não faz nenhum cálculo — é só a matéria-prima, sem viés de outlier já
// que quem trata isso é o prompt/IA do outro lado.

function num(s: string | undefined): number {
  const n = parseFloat((s ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function formatOneGame(g: Game, idx: number): string {
  const golsFor = num(g.goalsFor1H) + num(g.goalsFor2H);
  const golsAgainst = num(g.goalsAgainst1H) + num(g.goalsAgainst2H);
  const venue = g.venue === "home" ? "casa" : g.venue === "away" ? "fora" : g.venue || "?";
  const parts = [
    `${idx}. ${g.date || "?"} vs ${g.opponent || "?"} (${venue})`,
    `Placar: ${golsFor}-${golsAgainst}`,
    `Escanteios: ${g.cornersFor || "0"}-${g.cornersAgainst || "0"}`,
    `Cartões (A/V): ${g.yellows || "0"}/${g.reds || "0"}`,
  ];
  if (g.fouls) parts.push(`Faltas: ${g.fouls}`);
  if (g.shots) parts.push(`Chutes: ${g.shots}${g.shotsOnTarget ? ` (${g.shotsOnTarget} no alvo)` : ""}`);
  if (g.xg) parts.push(`xG: ${g.xg}${g.xga ? ` / xGA: ${g.xga}` : ""}`);
  if (g.competition) parts.push(`Competição: ${g.competition}`);
  return "  " + parts.join(" | ");
}

export function formatTeamRawData(teamName: string, mando: "casa" | "fora", games: Game[]): string {
  const valid = games.filter(g => g.result || g.opponent);
  const header = `TIME: ${teamName}\nMANDO NESTE CONFRONTO: ${mando}\n\nÚltimos jogos (do mais recente pro mais antigo):`;
  if (!valid.length) return `${header}\n  (sem jogos carregados)`;
  const lines = valid.map((g, i) => formatOneGame(g, i + 1));
  return `${header}\n${lines.join("\n")}`;
}

export function formatMatchupRawData(
  homeName: string, awayName: string,
  homeGames: Game[], awayGames: Game[],
): string {
  return [
    `═══════════════════════════════════════════`,
    `CONFRONTO: ${homeName} (casa) vs ${awayName} (fora)`,
    `═══════════════════════════════════════════`,
    "",
    formatTeamRawData(homeName, "casa", homeGames),
    "",
    formatTeamRawData(awayName, "fora", awayGames),
  ].join("\n");
}
