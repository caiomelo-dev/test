// ═══════════════════════════════════════════════════════════════════════════
// APEX — Força do Adversário (unifica FIFA Ranking + Club Elo)
// ═══════════════════════════════════════════════════════════════════════════

import { getTeamRating, getFifaAveragePoints } from "./fifa-ranking.js";
import { findClubElo, getEloAverage } from "./club-elo.js";

export interface MatchStrengths {
  homeRating: number | null;
  awayRating: number | null;
  refRatingAvg: number;
  source: string;
  foundHome: boolean;
  foundAway: boolean;
}

async function getTeamStrength(
  teamName: string,
  isNationalTeam: boolean
): Promise<{ rating: number | null; refAvg: number; source: string }> {
  if (isNationalTeam) {
    const [rating, refAvg] = await Promise.all([
      getTeamRating(teamName),
      getFifaAveragePoints(),
    ]);
    return { rating, refAvg, source: "FIFA Ranking" };
  } else {
    const [rating, refAvg] = await Promise.all([
      findClubElo(teamName),
      getEloAverage(true),
    ]);
    return { rating, refAvg, source: "Club Elo" };
  }
}

export async function getMatchStrengths(
  homeTeamName: string,
  awayTeamName: string,
  isNationalTeam: boolean
): Promise<MatchStrengths> {
  const [home, away] = await Promise.all([
    getTeamStrength(homeTeamName, isNationalTeam),
    getTeamStrength(awayTeamName, isNationalTeam),
  ]);

  const refRatingAvg = home.refAvg || away.refAvg || (isNationalTeam ? 1350 : 1500);

  return {
    homeRating: home.rating,
    awayRating: away.rating,
    refRatingAvg,
    source: home.source,
    foundHome: home.rating !== null,
    foundAway: away.rating !== null,
  };
}
