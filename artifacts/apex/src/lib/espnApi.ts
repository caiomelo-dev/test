import type { Game, H2HGame, DayGame } from "../types";
import { ESPN_LEAGUE_MAP } from "./constants";

export interface EspnTeam {
  id: string;
  name: string;
  logo: string;
  slug: string;
}

export interface EspnTeamGamesResult {
  games: Game[];
  teamName: string;
  logo: string;
}

export interface EspnH2HStats {
  last5_btts: string;
  last5_over25: string;
  last5_over35: string;
  last5_avgGoals: string;
  last10_btts: string;
  last10_over25: string;
  last10_over35: string;
  last10_avgGoals: string;
  homeWins: number;
  draws: number;
  awayWins: number;
}

export interface EspnH2HResult {
  games: H2HGame[];
  stats: EspnH2HStats;
  found: number;
}

export function getEspnSlug(leagueId: number): string {
  return ESPN_LEAGUE_MAP[leagueId] ?? "bra.1";
}

export async function espnSearchTeams(q: string, leagueId: number): Promise<EspnTeam[]> {
  const res = await fetch(`/api/espn/search?q=${encodeURIComponent(q)}&leagueId=${leagueId}`);
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  const data = await res.json();
  return data.teams ?? [];
}

export async function espnLoadTeamGames(
  teamId: string,
  slug: string
): Promise<EspnTeamGamesResult> {
  const res = await fetch(
    `/api/espn/team-games?teamId=${teamId}&slug=${encodeURIComponent(slug)}`
  );
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

export interface EspnReferee {
  name: string;
  games: number;
  avgYellows: number;
  avgReds: number;
  avgFouls: number;
  avgPenalties: number;
}

export async function espnLoadReferees(
  slug: string,
  homeTeamId: string,
  awayTeamId: string,
): Promise<EspnReferee[]> {
  const res = await fetch(
    `/api/espn/referees?slug=${encodeURIComponent(slug)}&homeTeamId=${homeTeamId}&awayTeamId=${awayTeamId}`,
  );
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  const data = await res.json();
  return data.referees ?? [];
}

export async function espnLoadH2H(
  homeGames: Game[],
  awayGames: Game[],
  homeName: string,
  awayName: string,
): Promise<EspnH2HResult> {
  const res = await fetch("/api/espn/h2h", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ homeGames, awayGames, homeName, awayName }),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json();
}

// Busca jogos do scoreboard ESPN para uma liga e data específicos
// date: string no formato YYYYMMDD
export async function espnLoadScoreboard(slug: string, date: string): Promise<DayGame[]> {
  const res = await fetch(`/api/espn/scoreboard?slug=${encodeURIComponent(slug)}&date=${date}`);
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  const data = await res.json();
  return data.games ?? [];
}
