export type LeagueRegion = "Seleções" | "Europa" | "América do Sul" | "América do Norte";

export interface League {
  id: number;
  name: string;
  country: string;
  isNationalTeam: boolean;
  region: LeagueRegion;
}

export interface MotivationFactors {
  title: boolean;
  relegation: boolean;
  continental: boolean;
  knockout: boolean;
  classic: boolean;
  mustwin: boolean;
}

export interface Game {
  result: string;
  venue: string;
  opponent: string;
  competition?: string;
  date: string;
  goalsFor1H: string;
  goalsFor2H: string;
  goalsAgainst1H: string;
  goalsAgainst2H: string;
  shots: string;
  shotsOnTarget: string;
  bigChances: string;
  cornersFor: string;
  cornersAgainst: string;
  yellows: string;
  reds: string;
  fouls: string;
  xg: string;
  xga: string;
  g015: string;
  g1630: string;
  g3145: string;
  g4660: string;
  g6175: string;
  g7690: string;
  gc015: string;
  gc1630: string;
  gc3145: string;
  gc4660: string;
  gc6175: string;
  gc7690: string;
}

export interface Team {
  name: string;
  position: string;
  teamId: number | null;
  logo: string;
  motivation: MotivationFactors;
  games: Game[];
}

export interface H2HData {
  last5_btts: string;
  last5_over25: string;
  last5_over35: string;
  last5_avgGoals: string;
  last10_btts: string;
  last10_over25: string;
  last10_over35: string;
  last10_avgGoals: string;
}

export interface RefereeData {
  avgYellows: string;
  avgReds: string;
  avgFouls: string;
  avgPenalties: string;
}

export interface TeamStats {
  wins: number;
  draws: number;
  losses: number;
  gamesPlayed: number;
  pts: number;
  aproveitamento: number;
  avgGoalsFor: number;
  avgGoalsAgainst: number;
  avgTotal: number;
  bttsRate: number;
  csRate: number;
  over05Rate: number;
  over15Rate: number;
  over25Rate: number;
  over35Rate: number;
  avgGoals1H: number;
  avgGoals2H: number;
  avgGoalsFor1H: number;
  avgGoalsFor2H: number;
  avgGoalsAgainst1H: number;
  avgGoalsAgainst2H: number;
  avgShots: number;
  avgShotsOnTarget: number;
  avgCornersFor: number;
  avgCornersAgainst: number;
  avgCorners: number;
  avgYellows: number;
  avgReds: number;
  avgFouls: number;
  avgXG: number;
  avgXGA: number;
  over75c: number;
  over85c: number;
  over95c: number;
  over105c: number;
  over115c: number;
  consistency: number;
  form5: number;
  form10: number;
  avgG015: number;
  avgG1630: number;
  avgG3145: number;
  avgG4660: number;
  avgG6175: number;
  avgG7690: number;
  avgGc015: number;
  avgGc1630: number;
  avgGc3145: number;
  avgGc4660: number;
  avgGc6175: number;
  avgGc7690: number;
  dataQuality: number;
}

export interface MarketScores {
  over05: number;
  over15: number;
  over25: number;
  over35: number;
  under05: number;
  under15: number;
  under25: number;
  under35: number;
  btts: number;
  bttsNo: number;
  bttsHome: number;
  bttsAway: number;
  c75: number;
  c85: number;
  c95: number;
  c105: number;
  c115: number;
  cards35: number;
  cards: number;
  ht05: number;
  ht15: number;
  htBtts: number;
  htCorners: number;
  htCards: number;
  st05: number;
  st15: number;
  stBtts: number;
  stCorners: number;
  stCards: number;
  homeWin: number;
  draw: number;
  awayWin: number;
  consistency: number;
  ahHome: number;
  ahAway: number;
  cornersHome: number;
  cornersAway: number;
  firstGoalHome: number;
  firstGoalAway: number;
  firstGoalNo: number;
}

export interface H2HGame {
  date: string;
  homeGoals: number;
  awayGoals: number;
  total: number;
  btts: boolean;
  homeWin: boolean;
  draw: boolean;
  awayWin: boolean;
}

export interface SavedAnalysis {
  id: string;
  date: string;
  homeName: string;
  awayName: string;
  homeLogo: string;
  awayLogo: string;
  leagueName: string;
  overall: number;
  mkts: MarketScores;
}

export interface AnalysisResult {
  hS: TeamStats;
  aS: TeamStats;
  mkts: MarketScores;
  overall: number;
  lambdaHome: number;
  lambdaAway: number;
}

// Jogo encontrado no scoreboard ESPN para análise do dia
export interface DayGame {
  id: string;
  date: string;
  slug: string;
  homeTeamId: string;
  homeTeamName: string;
  awayTeamId: string;
  awayTeamName: string;
  leagueName: string;
  leagueCountry: string;
}

export type Page = "league" | "home" | "away" | "extra" | "result" | "data";
