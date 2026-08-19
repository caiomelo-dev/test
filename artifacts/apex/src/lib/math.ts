import type { Game, TeamStats, MarketScores, H2HData, RefereeData, Team, MotivationFactors } from "../types";

const nv = (v: string | number) => parseFloat(String(v)) || 0;
const mean = (arr: number[]) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const stdDev = (arr: number[]) => {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / arr.length);
};

function anomalyWeight(g: Game): number {
  const tg = nv(g.goalsFor1H) + nv(g.goalsFor2H) + nv(g.goalsAgainst1H) + nv(g.goalsAgainst2H);
  const tc = nv(g.cornersFor) + nv(g.cornersAgainst);
  const tk = nv(g.yellows) + nv(g.reds);
  let w = 1.0;
  if (tg >= 6) w *= 0.5;
  if (tc >= 15) w *= 0.6;
  if (tk >= 10) w *= 0.6;
  return w;
}

// Recency weight: most recent game (index 0) = highest weight
// Uses exponential decay: w_i = decay^i  (i=0 is newest)
function recencyWeights(n: number, decay = 0.88): number[] {
  return Array.from({ length: n }, (_, i) => Math.pow(decay, i));
}

function weightedMean(vals: number[], wts: number[]): number {
  const tw = wts.reduce((a, b) => a + b, 0);
  return tw ? vals.reduce((s, v, i) => s + v * wts[i], 0) / tw : 0;
}

export function consolidate(games: Game[]): TeamStats {
  // Sort newest-first for recency weighting (games array may be oldest-first from ESPN)
  const sorted = [...games].sort((a, b) => {
    if (a.date && b.date) return new Date(b.date).getTime() - new Date(a.date).getTime();
    return 0;
  });

  const anomaly = sorted.map(anomalyWeight);
  const recency = recencyWeights(sorted.length);
  // Combined weight: recency * anomaly
  const W = sorted.map((_, i) => recency[i] * anomaly[i]);

  const wm = (fn: (g: Game) => number) => weightedMean(sorted.map(fn), W);
  const gf = sorted.map((g) => nv(g.goalsFor1H) + nv(g.goalsFor2H));
  const ga = sorted.map((g) => nv(g.goalsAgainst1H) + nv(g.goalsAgainst2H));
  const tot = sorted.map((_, i) => gf[i] + ga[i]);
  const bt = sorted.map((_, i) => (gf[i] > 0 && ga[i] > 0 ? 1 : 0));
  const cs = sorted.map((_, i) => (ga[i] === 0 ? 1 : 0));
  const ct = sorted.map((g) => nv(g.cornersFor) + nv(g.cornersAgainst));
  const wins = sorted.filter((g) => g.result === "V").length;
  const draws = sorted.filter((g) => g.result === "E").length;
  const losses = sorted.filter((g) => g.result === "D").length;
  const pts = wins * 3 + draws;
  const fs = (sl: Game[]) =>
    sl.length
      ? ((sl.filter((g) => g.result === "V").length * 3 + sl.filter((g) => g.result === "E").length) / (sl.length * 3)) * 10
      : 0;

  const validGames = sorted.filter(g => g.result !== "");
  const dataQuality = Math.min(1, validGames.length / 6);

  return {
    wins,
    draws,
    losses,
    gamesPlayed: validGames.length,
    pts,
    aproveitamento: validGames.length ? (pts / (validGames.length * 3)) * 100 : 0,
    avgGoalsFor: wm((g) => nv(g.goalsFor1H) + nv(g.goalsFor2H)),
    avgGoalsAgainst: wm((g) => nv(g.goalsAgainst1H) + nv(g.goalsAgainst2H)),
    avgTotal: weightedMean(tot, W),
    bttsRate: weightedMean(bt, W) * 100,
    csRate: weightedMean(cs, W) * 100,
    over05Rate: weightedMean(tot.map((t) => (t > 0.5 ? 1 : 0)), W) * 100,
    over15Rate: weightedMean(tot.map((t) => (t > 1.5 ? 1 : 0)), W) * 100,
    over25Rate: weightedMean(tot.map((t) => (t > 2.5 ? 1 : 0)), W) * 100,
    over35Rate: weightedMean(tot.map((t) => (t > 3.5 ? 1 : 0)), W) * 100,
    avgGoals1H: wm((g) => nv(g.goalsFor1H) + nv(g.goalsAgainst1H)),
    avgGoals2H: wm((g) => nv(g.goalsFor2H) + nv(g.goalsAgainst2H)),
    avgGoalsFor1H: wm((g) => nv(g.goalsFor1H)),
    avgGoalsFor2H: wm((g) => nv(g.goalsFor2H)),
    avgGoalsAgainst1H: wm((g) => nv(g.goalsAgainst1H)),
    avgGoalsAgainst2H: wm((g) => nv(g.goalsAgainst2H)),
    avgShots: wm((g) => nv(g.shots)),
    avgShotsOnTarget: wm((g) => nv(g.shotsOnTarget)),
    avgCornersFor: wm((g) => nv(g.cornersFor)),
    avgCornersAgainst: wm((g) => nv(g.cornersAgainst)),
    avgCorners: wm((g) => nv(g.cornersFor) + nv(g.cornersAgainst)),
    avgYellows: wm((g) => nv(g.yellows)),
    avgReds: wm((g) => nv(g.reds)),
    avgFouls: wm((g) => nv(g.fouls)),
    avgXG: wm((g) => nv(g.xg)),
    avgXGA: wm((g) => nv(g.xga)),
    over75c: weightedMean(ct.map((c) => (c > 7.5 ? 1 : 0)), W) * 100,
    over85c: weightedMean(ct.map((c) => (c > 8.5 ? 1 : 0)), W) * 100,
    over95c: weightedMean(ct.map((c) => (c > 9.5 ? 1 : 0)), W) * 100,
    over105c: weightedMean(ct.map((c) => (c > 10.5 ? 1 : 0)), W) * 100,
    over115c: weightedMean(ct.map((c) => (c > 11.5 ? 1 : 0)), W) * 100,
    consistency: Math.max(0, 10 - stdDev(tot) * 2),
    form5: fs(sorted.slice(0, 5)),
    form10: fs(sorted.slice(0, 10)),
    avgG015: wm((g) => nv(g.g015)),
    avgG1630: wm((g) => nv(g.g1630)),
    avgG3145: wm((g) => nv(g.g3145)),
    avgG4660: wm((g) => nv(g.g4660)),
    avgG6175: wm((g) => nv(g.g6175)),
    avgG7690: wm((g) => nv(g.g7690)),
    avgGc015: wm((g) => nv(g.gc015)),
    avgGc1630: wm((g) => nv(g.gc1630)),
    avgGc3145: wm((g) => nv(g.gc3145)),
    avgGc4660: wm((g) => nv(g.gc4660)),
    avgGc6175: wm((g) => nv(g.gc6175)),
    avgGc7690: wm((g) => nv(g.gc7690)),
    dataQuality,
  };
}

export function motivationScore(mot: MotivationFactors): number {
  const w: Record<string, number> = {
    title: 10,
    relegation: 9,
    continental: 8,
    knockout: 9,
    classic: 7,
    mustwin: 8,
  };
  const active = (Object.keys(mot) as (keyof MotivationFactors)[]).filter((k) => mot[k]);
  return active.length ? Math.min(10, active.reduce((s, k) => s + w[k], 0) / active.length) : 3;
}

// Optional decimal (European) odds for market-calibration. All optional.
export interface MatchOddsInput {
  homeWin?: number;
  draw?: number;
  awayWin?: number;
  over25?: number;
  under25?: number;
  btts?: number;
  bttsNo?: number;
}

export interface ScoreOpts {
  homeRating?: number | null; // Elo (clubs) / FIFA points (nationals) of home team
  awayRating?: number | null;
  refRating?: number | null; // league/ranking average, used as fallback for a missing side
  isNeutral?: boolean; // neutral venue → no home-field boost (e.g. World Cup)
  odds?: MatchOddsInput;
}

// Home-field advantage multipliers applied to expected goals (λ).
const HOME_ADV = 1.12;
const AWAY_ADV = 0.9;

function poissonPMF(lambda: number, k: number): number {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  let f = 1;
  for (let i = 2; i <= k; i++) f *= i;
  return (Math.pow(lambda, k) * Math.exp(-lambda)) / f;
}

// Dixon-Coles low-score dependence correction (tau).
function dcTau(h: number, a: number, lh: number, la: number, rho: number): number {
  if (h === 0 && a === 0) return 1 - lh * la * rho;
  if (h === 0 && a === 1) return 1 + lh * rho;
  if (h === 1 && a === 0) return 1 + la * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1;
}

export interface GoalProbs {
  lambdaHome: number;
  lambdaAway: number;
  homeWin: number;
  draw: number;
  awayWin: number;
  over: Record<"0.5" | "1.5" | "2.5" | "3.5", number>; // P(over line), 0-1
  btts: number; // 0-1
}

export function goalProbabilities(hS: TeamStats, aS: TeamStats, opts: ScoreOpts = {}): GoalProbs {
  const homeMul = opts.isNeutral ? 1 : HOME_ADV;
  const awayMul = opts.isNeutral ? 1 : AWAY_ADV;

  let lambdaHome = ((hS.avgGoalsFor + aS.avgGoalsAgainst) / 2) * homeMul;
  let lambdaAway = ((aS.avgGoalsFor + hS.avgGoalsAgainst) / 2) * awayMul;

  let hr = opts.homeRating ?? null;
  let ar = opts.awayRating ?? null;
  const refR = opts.refRating ?? null;
  if (hr == null && ar != null && refR != null) hr = refR;
  if (ar == null && hr != null && refR != null) ar = refR;
  if (hr != null && ar != null) {
    const adjust = Math.max(-0.25, Math.min(0.25, (hr - ar) / 1250));
    lambdaHome *= 1 + adjust;
    lambdaAway *= 1 - adjust;
  }

  lambdaHome = Math.max(0.15, Math.min(5, lambdaHome));
  lambdaAway = Math.max(0.15, Math.min(5, lambdaAway));

  const rho = -0.08;
  const MAX = 8;
  let homeWin = 0, draw = 0, awayWin = 0, btts = 0;
  let o05 = 0, o15 = 0, o25 = 0, o35 = 0, norm = 0;
  for (let h = 0; h <= MAX; h++) {
    for (let a = 0; a <= MAX; a++) {
      const p = poissonPMF(lambdaHome, h) * poissonPMF(lambdaAway, a) * dcTau(h, a, lambdaHome, lambdaAway, rho);
      norm += p;
      const tot = h + a;
      if (h > a) homeWin += p;
      else if (h === a) draw += p;
      else awayWin += p;
      if (h > 0 && a > 0) btts += p;
      if (tot > 0) o05 += p;
      if (tot > 1) o15 += p;
      if (tot > 2) o25 += p;
      if (tot > 3) o35 += p;
    }
  }
  const n = norm || 1;
  return {
    lambdaHome,
    lambdaAway,
    homeWin: homeWin / n,
    draw: draw / n,
    awayWin: awayWin / n,
    over: { "0.5": o05 / n, "1.5": o15 / n, "2.5": o25 / n, "3.5": o35 / n },
    btts: btts / n,
  };
}

export interface ExactScoreEntry {
  home: number;
  away: number;
  prob: number; // 0-1, normalized
}

export function exactScoreProbabilities(lambdaHome: number, lambdaAway: number, top = 12): ExactScoreEntry[] {
  const MAX = 8;
  const rho = -0.08;
  const entries: { home: number; away: number; prob: number }[] = [];
  let norm = 0;
  for (let h = 0; h <= MAX; h++) {
    for (let a = 0; a <= MAX; a++) {
      const p = poissonPMF(lambdaHome, h) * poissonPMF(lambdaAway, a) * dcTau(h, a, lambdaHome, lambdaAway, rho);
      entries.push({ home: h, away: a, prob: p });
      norm += p;
    }
  }
  const n = norm || 1;
  return entries
    .map(e => ({ ...e, prob: e.prob / n }))
    .sort((a, b) => b.prob - a.prob)
    .slice(0, top);
}

function devig(...odds: (number | undefined)[]): number[] | null {
  const inv: (number | null)[] = odds.map((o) => (o && o > 1 ? 1 / o : null));
  if (inv.some((v) => v === null)) return null;
  const vals = inv as number[];
  const sum = vals.reduce((a, b) => a + b, 0);
  if (sum <= 0) return null;
  return vals.map((v) => v / sum);
}

export function scoreMarkets(
  hS: TeamStats,
  aS: TeamStats,
  h2h: H2HData,
  ref: RefereeData,
  hT: Team,
  aT: Team,
  opts: ScoreOpts = {}
): MarketScores {
  const hmot = motivationScore(hT.motivation);
  const amot = motivationScore(aT.motivation);
  const motAvg = (hmot + amot) / 2;
  const cl = (v: number) => Math.min(10, Math.max(0, v));
  const r2s = (r: number) => (r / 100) * 10;
  const xgAvg = (hS.avgXG + aS.avgXGA + aS.avgXG + hS.avgXGA) / 4;
  const xgB = Math.min(1.5, xgAvg * 0.3);
  const mB = motAvg * 0.1;

  const band1H = (s: TeamStats) =>
    s.avgG015 + s.avgGc015 + s.avgG1630 + s.avgGc1630 + s.avgG3145 + s.avgGc3145;
  const band2H = (s: TeamStats) =>
    s.avgG4660 + s.avgGc4660 + s.avgG6175 + s.avgGc6175 + s.avgG7690 + s.avgGc7690;
  const h1H = band1H(hS) || hS.avgGoals1H;
  const a1H = band1H(aS) || aS.avgGoals1H;
  const h2H = band2H(hS) || hS.avgGoals2H;
  const a2H = band2H(aS) || aS.avgGoals2H;
  const exp1H = (h1H + a1H) / 2;
  const exp2H = (h2H + a2H) / 2;

  const gp = goalProbabilities(hS, aS, opts);
  const λH = gp.lambdaHome;
  const λA = gp.lambdaAway;
  const λTotal = λH + λA;

  const pois05 = (λ: number) => cl((1 - Math.exp(-λ)) * 10);
  const pois15 = (λ: number) => cl((1 - (1 + λ) * Math.exp(-λ)) * 10);

  const pH1H = hS.avgGoalsFor1H > 0 ? 1 - Math.exp(-hS.avgGoalsFor1H) : 0.25;
  const pA1H = aS.avgGoalsFor1H > 0 ? 1 - Math.exp(-aS.avgGoalsFor1H) : 0.25;
  const pH2H = hS.avgGoalsFor2H > 0 ? 1 - Math.exp(-hS.avgGoalsFor2H) : 0.35;
  const pA2H = aS.avgGoalsFor2H > 0 ? 1 - Math.exp(-aS.avgGoalsFor2H) : 0.35;

  const pH = 1 - Math.exp(-λH);
  const pA = 1 - Math.exp(-λA);

  const poissonCDF = (λ: number, k: number): number => {
    let sum = 0;
    let term = Math.exp(-λ);
    for (let i = 0; i < k; i++) {
      sum += term;
      term *= λ / (i + 1);
    }
    return sum;
  };
  const poissonGe = (λ: number, k: number) => 1 - poissonCDF(λ, k);

  const rateBlend = (rate: number, poissonP: number) => rate * 0.5 + poissonP * 100 * 0.5;

  const mk: MarketScores = {
    over05: cl(r2s(rateBlend((hS.over05Rate + aS.over05Rate) / 2, gp.over["0.5"])) * 0.9 + mB),
    over15: cl(r2s(rateBlend((hS.over15Rate + aS.over15Rate) / 2, gp.over["1.5"])) * 0.85 + xgB * 0.5 + mB),
    over25: cl(r2s(rateBlend((hS.over25Rate + aS.over25Rate) / 2, gp.over["2.5"])) * 0.8 + xgB + mB),
    over35: cl(r2s(rateBlend((hS.over35Rate + aS.over35Rate) / 2, gp.over["3.5"])) * 0.8 + xgB * 0.7 + mB),
    under05: cl(10 - r2s(rateBlend((hS.over05Rate + aS.over05Rate) / 2, gp.over["0.5"])) * 0.9),
    under15: cl(10 - r2s(rateBlend((hS.over15Rate + aS.over15Rate) / 2, gp.over["1.5"])) * 0.85),
    under25: cl(10 - r2s(rateBlend((hS.over25Rate + aS.over25Rate) / 2, gp.over["2.5"])) * 0.8),
    under35: cl(10 - r2s(rateBlend((hS.over35Rate + aS.over35Rate) / 2, gp.over["3.5"])) * 0.75),
    btts: cl(r2s((hS.bttsRate + aS.bttsRate) / 2) * 0.5 + gp.btts * 10 * 0.5 + xgB * 0.3 + mB),
    bttsNo: cl(r2s((hS.csRate + aS.csRate) / 2) * 0.8),
    bttsHome: cl(r2s(hS.bttsRate) * 0.6 + pH * 10 * 0.4),
    bttsAway: cl(r2s(aS.bttsRate) * 0.6 + pA * 10 * 0.4),
    c75: cl(r2s((hS.over75c + aS.over75c) / 2) * 0.85),
    c85: cl(r2s((hS.over85c + aS.over85c) / 2) * 0.85),
    c95: cl(r2s((hS.over95c + aS.over95c) / 2) * 0.85),
    c105: cl(r2s((hS.over105c + aS.over105c) / 2) * 0.85),
    c115: cl(r2s((hS.over115c + aS.over115c) / 2) * 0.85),
    cards35: cl(
      ((hS.avgYellows + aS.avgYellows) / 2 > 1.8 ? 7 : 4) +
        ((hS.avgReds + aS.avgReds) / 2 > 0.2 ? 1 : 0)
    ),
    cards: cl(Math.min(10, ((hS.avgYellows + aS.avgYellows + hS.avgReds + aS.avgReds) / 2) * 1.5)),
    ht05: cl(pois05(exp1H) * 0.9 + mB),
    ht15: cl(pois15(exp1H) * 0.85 + mB * 0.5),
    htBtts: cl(pH1H * pA1H * 10),
    htCorners: cl(
      ((hS.avgCornersFor + aS.avgCornersAgainst + hS.avgCornersAgainst + aS.avgCornersFor) / 4) * 1.2
    ),
    htCards: cl(((hS.avgYellows + aS.avgYellows) / 2) * 0.8),
    st05: cl(pois05(exp2H) * 0.9 + mB),
    st15: cl(pois15(exp2H) * 0.85 + mB * 0.5),
    stBtts: cl(pH2H * pA2H * 10),
    stCorners: cl(((hS.avgCornersFor + aS.avgCornersFor) / 2) * 1.1),
    stCards: cl(((hS.avgYellows + aS.avgYellows) / 2) * 1.0),
    homeWin: cl(
      ((hS.aproveitamento / 100) * 4 +
        (hS.form5 / 10) * 2.5 +
        (hmot / 10) * 1 +
        (poissonGe(λH, 1) - poissonGe(λA, 1)) * 3 + 3) * 0.65 + gp.homeWin * 10 * 0.35
    ),
    draw: cl(
      (5 - Math.abs(hS.aproveitamento - aS.aproveitamento) / 20 - Math.abs(λH - λA) * 0.5) * 0.65 +
        gp.draw * 10 * 0.35
    ),
    awayWin: cl(
      ((aS.aproveitamento / 100) * 4 +
        (aS.form5 / 10) * 2.5 +
        (amot / 10) * 1 +
        (poissonGe(λA, 1) - poissonGe(λH, 1)) * 3 + 3) * 0.65 + gp.awayWin * 10 * 0.35
    ),
    consistency: cl((hS.consistency + aS.consistency) / 2),
    ahHome: cl(5 + (λH - λA) * 2),
    ahAway: cl(5 + (λA - λH) * 2),
    cornersHome: cl(((hS.avgCornersFor + aS.avgCornersAgainst) / 2) * 1.1),
    cornersAway: cl(((aS.avgCornersFor + hS.avgCornersAgainst) / 2) * 1.1),
    firstGoalHome: cl(5 + (λH - λA) * 1.5),
    firstGoalAway: cl(5 + (λA - λH) * 1.5),
    firstGoalNo: cl((1 - poissonGe(λTotal, 1)) * 10),
  };

  if (nv(h2h.last10_over25) > 60) {
    mk.over25 = cl(mk.over25 + 0.5);
    mk.btts = cl(mk.btts + 0.3);
  }
  if (nv(h2h.last10_btts) > 60) mk.btts = cl(mk.btts + 0.5);
  if (nv(ref.avgYellows) > 4) {
    mk.cards = cl(mk.cards + 0.5);
    mk.cards35 = cl(mk.cards35 + 0.5);
  }
  if (nv(ref.avgFouls) > 24) mk.cards = cl(mk.cards + 0.3);

  if (opts.odds) {
    const p1x2 = devig(opts.odds.homeWin, opts.odds.draw, opts.odds.awayWin);
    if (p1x2) {
      mk.homeWin = cl(mk.homeWin * 0.5 + p1x2[0]! * 10 * 0.5);
      mk.draw = cl(mk.draw * 0.5 + p1x2[1]! * 10 * 0.5);
      mk.awayWin = cl(mk.awayWin * 0.5 + p1x2[2]! * 10 * 0.5);
    }
    const pOU = devig(opts.odds.over25, opts.odds.under25);
    if (pOU) {
      mk.over25 = cl(mk.over25 * 0.5 + pOU[0]! * 10 * 0.5);
      mk.under25 = cl(mk.under25 * 0.5 + pOU[1]! * 10 * 0.5);
    }
    const pBtts = devig(opts.odds.btts, opts.odds.bttsNo);
    if (pBtts) {
      mk.btts = cl(mk.btts * 0.5 + pBtts[0]! * 10 * 0.5);
      mk.bttsNo = cl(mk.bttsNo * 0.5 + pBtts[1]! * 10 * 0.5);
    }
  }

  return mk;
}

export interface MarketPick {
  key: keyof MarketScores;
  label: string;
  score: number;
  group: string;
}

interface MarketDef {
  key: keyof MarketScores;
  label: string;
  group: string;
  minGoals?: number;
  maxGoals?: number;
  btts?: "yes" | "no";
}

const REC_CATALOG: MarketDef[] = [
  { key: "homeWin", label: "Vitória Casa", group: "resultado" },
  { key: "awayWin", label: "Vitória Fora", group: "resultado" },
  { key: "draw", label: "Empate", group: "resultado" },
  { key: "ahHome", label: "Handicap Casa -0.5", group: "resultado" },
  { key: "ahAway", label: "Handicap Fora +0.5", group: "resultado" },
  { key: "firstGoalHome", label: "Casa marca 1º gol", group: "primeirogol", minGoals: 1 },
  { key: "firstGoalAway", label: "Fora marca 1º gol", group: "primeirogol", minGoals: 1 },
  { key: "over05", label: "Over 0.5 Gols", group: "gols", minGoals: 1 },
  { key: "over15", label: "Over 1.5 Gols", group: "gols", minGoals: 2 },
  { key: "over25", label: "Over 2.5 Gols", group: "gols", minGoals: 3 },
  { key: "over35", label: "Over 3.5 Gols", group: "gols", minGoals: 4 },
  { key: "under05", label: "Under 0.5 Gols", group: "gols", maxGoals: 0 },
  { key: "under15", label: "Under 1.5 Gols", group: "gols", maxGoals: 1 },
  { key: "under25", label: "Under 2.5 Gols", group: "gols", maxGoals: 2 },
  { key: "under35", label: "Under 3.5 Gols", group: "gols", maxGoals: 3 },
  { key: "btts", label: "Ambas Marcam (Sim)", group: "btts", minGoals: 2, btts: "yes" },
  { key: "bttsNo", label: "Ambas Marcam (Não)", group: "btts", btts: "no" },
  { key: "c75", label: "Over 7.5 Escanteios", group: "escanteios" },
  { key: "c85", label: "Over 8.5 Escanteios", group: "escanteios" },
  { key: "c95", label: "Over 9.5 Escanteios", group: "escanteios" },
  { key: "c105", label: "Over 10.5 Escanteios", group: "escanteios" },
  { key: "c115", label: "Over 11.5 Escanteios", group: "escanteios" },
  { key: "cards35", label: "Over 3.5 Cartões", group: "cartoes" },
  { key: "ht05", label: "Over 0.5 Gols 1ºT", group: "1tempo", minGoals: 1 },
  { key: "ht15", label: "Over 1.5 Gols 1ºT", group: "1tempo", minGoals: 2 },
  { key: "htBtts", label: "Ambas Marcam 1ºT", group: "1tempo", minGoals: 2, btts: "yes" },
  { key: "st05", label: "Over 0.5 Gols 2ºT", group: "2tempo", minGoals: 1 },
  { key: "st15", label: "Over 1.5 Gols 2ºT", group: "2tempo", minGoals: 2 },
  { key: "stBtts", label: "Ambas Marcam 2ºT", group: "2tempo", minGoals: 2, btts: "yes" },
];

function marketsConflict(a: MarketDef, b: MarketDef): boolean {
  const minG = Math.max(a.minGoals ?? 0, b.minGoals ?? 0);
  const maxG = Math.min(a.maxGoals ?? Infinity, b.maxGoals ?? Infinity);
  if (minG > maxG) return true;
  if (a.btts && b.btts && a.btts !== b.btts) return true;
  return false;
}

// Ajuste 6a: mercados de RESULTADO (1X2) são historicamente mal calibrados
// (Brier ≈ 0.25 ≈ chute aleatório — mesma constatação já usada em
// classifyMGAAMarkets). Aplicamos o mesmo desconto de 15% aqui, mas só para
// RANQUEAR/ESCOLHER — o score exibido ao usuário continua o original.
const GROUP_CALIBRATION: Record<string, number> = {
  resultado: 0.85,
};

// Ajuste 6b: um analista profissional não força um palpite quando nada é
// bom o bastante. Abaixo desse score (já calibrado), não recomendamos.
const MIN_RECOMMEND_SCORE = 6.0;

export function buildRecommendations(mk: MarketScores): {
  recommended: MarketPick | null;
  multipla: MarketPick[];
  combined: number;
} {
  const calibrate = (d: MarketDef, score: number) => score * (GROUP_CALIBRATION[d.group] ?? 1);

  const ranked = [...REC_CATALOG]
    .map((d) => ({ def: d, score: mk[d.key], calScore: calibrate(d, mk[d.key]) }))
    .sort((a, b) => b.calScore - a.calScore);

  const toPick = (r: { def: MarketDef; score: number }): MarketPick => ({
    key: r.def.key,
    label: r.def.label,
    score: r.score, // score exibido = original, sem desconto de calibração
    group: r.def.group,
  });

  const best = ranked[0];
  const recommended = best && best.calScore >= MIN_RECOMMEND_SCORE ? toPick(best) : null;

  const seen = new Set<string>();
  const chosen: { def: MarketDef; score: number; calScore: number }[] = [];
  for (const r of ranked) {
    if (r.calScore < MIN_RECOMMEND_SCORE) continue;
    if (seen.has(r.def.group)) continue;
    if (chosen.some((c) => marketsConflict(c.def, r.def))) continue;
    seen.add(r.def.group);
    chosen.push(r);
    if (chosen.length === 3) break;
  }

  const multipla = chosen.map(toPick);
  const combined = multipla.length
    ? multipla.reduce((acc, p) => acc * (p.score / 10), 1) * 10
    : 0;

  return { recommended, multipla, combined };
}

// ═══════════════════════════════════════════════════════════════════════════
// Múltipla ENTRE jogos do dia — pega o melhor mercado calibrado de cada um
// dos jogos mais confiáveis do dia (por ICJ) e monta uma múltipla cruzando
// partidas diferentes. Diferente de buildRecommendations (que monta a
// múltipla dentro de UM jogo), aqui cada perna vem de um jogo distinto.
// ═══════════════════════════════════════════════════════════════════════════
export interface DayMultiplaLeg {
  gameLabel: string;
  market: MarketPick;
  icj: number;
}

export interface DayMultiplaCandidate {
  homeTeam: string;
  awayTeam: string;
  icj: number;
  mkts: MarketScores;
}

export function buildDayMultipla(
  candidates: DayMultiplaCandidate[],
  legs = 3,
  minIcj = 65,
  minMarketScore = 7.0,
): { legs: DayMultiplaLeg[]; combinedProb: number } {
  const pool = candidates
    .filter((c) => c.icj >= minIcj)
    .sort((a, b) => b.icj - a.icj);

  const picked: DayMultiplaLeg[] = [];
  for (const c of pool) {
    const { recommended } = buildRecommendations(c.mkts);
    if (!recommended || recommended.score < minMarketScore) continue;
    picked.push({ gameLabel: `${c.homeTeam} vs ${c.awayTeam}`, market: recommended, icj: c.icj });
    if (picked.length === legs) break;
  }

  const combinedProb = picked.length
    ? picked.reduce((acc, p) => acc * (p.market.score / 10), 1) * 10
    : 0;

  return { legs: picked, combinedProb };
}

export function dataConfidence(hS: TeamStats, aS: TeamStats): { score: number; label: string; color: string; warnings: string[] } {
  const warnings: string[] = [];
  let score = 10;

  if (hS.gamesPlayed < 5) { warnings.push(`Casa: apenas ${hS.gamesPlayed} jogos`); score -= (5 - hS.gamesPlayed) * 1.2; }
  if (aS.gamesPlayed < 5) { warnings.push(`Fora: apenas ${aS.gamesPlayed} jogos`); score -= (5 - aS.gamesPlayed) * 1.2; }
  if (hS.avgShots === 0) { warnings.push("Casa: sem dados de finalizações"); score -= 0.5; }
  if (aS.avgShots === 0) { warnings.push("Fora: sem dados de finalizações"); score -= 0.5; }
  if (hS.avgCorners === 0) { warnings.push("Casa: sem dados de escanteios"); score -= 0.5; }
  if (aS.avgCorners === 0) { warnings.push("Fora: sem dados de escanteios"); score -= 0.5; }
  if (hS.avgG015 + hS.avgG1630 + hS.avgG3145 === 0) { warnings.push("Casa: sem dados por faixa de tempo"); score -= 1; }
  if (aS.avgG015 + aS.avgG1630 + aS.avgG3145 === 0) { warnings.push("Fora: sem dados por faixa de tempo"); score -= 1; }

  score = Math.max(0, Math.min(10, score));
  const label = score >= 8 ? "Alta" : score >= 6 ? "Média" : score >= 4 ? "Baixa" : "Insuficiente";
  const color = score >= 8 ? "#00C875" : score >= 6 ? "#00E5FF" : score >= 4 ? "#FFB800" : "#FF4D4D";
  return { score, label, color, warnings };
}

export function marketStatus(s: number): { label: string; color: string } {
  if (s >= 8.5) return { label: "PREMIUM ⭐", color: "#A78BFA" };
  if (s >= 7.0) return { label: "APROVADO ✅", color: "#00C875" };
  if (s >= 5.0) return { label: "INCERTO ⚠️", color: "#FFB800" };
  return { label: "BAIXO ❌", color: "#FF4D4D" };
}

// ═══════════════════════════════════════════════════════════════════════════
// MGAA+ — Método Global Avançado de Análise de Apostas
// ═══════════════════════════════════════════════════════════════════════════

const clamp100 = (v: number) => Math.max(0, Math.min(100, v));
const norm0to100 = (v: number, min: number, max: number) => clamp100(((v - min) / (max - min)) * 100);

export interface ICTResult {
  value: number;
  tier: { tier: number; label: string; color: string };
  breakdown: { aproveitamento: number; forma: number; ofensiva: number; defensiva: number; consistencia: number };
}

export function calculateICT(s: TeamStats): ICTResult {
  const aproveitamento = clamp100(s.aproveitamento);
  const forma = clamp100(s.form5 * 10);
  const ofensiva = norm0to100(s.avgGoalsFor, 0.4, 2.6);
  const defensiva = norm0to100(2.2 - s.avgGoalsAgainst, 0.2, 2.0);
  const consistencia = clamp100(s.consistency * 10);

  const value = aproveitamento * 0.30 + forma * 0.25 + ofensiva * 0.15 + defensiva * 0.15 + consistencia * 0.15;

  const tier =
    value >= 85 ? { tier: 1, label: "Elite", color: "#A78BFA" } :
    value >= 75 ? { tier: 2, label: "Forte", color: "#00C875" } :
    value >= 65 ? { tier: 3, label: "Médio", color: "#FFB800" } :
    value >= 50 ? { tier: 4, label: "Fraco", color: "#FF9F40" } :
    { tier: 5, label: "Crítico", color: "#FF4D4D" };

  return {
    value: Math.round(value * 10) / 10,
    tier,
    breakdown: { aproveitamento, forma, ofensiva, defensiva, consistencia },
  };
}

export interface IRTResult {
  label: "Alto" | "Médio" | "Baixo";
  score: number;
  trend: "↑" | "→" | "↓";
  decisiveRate: number;
}

export function calculateIRT(games: Game[]): IRTResult {
  const played = games
    .filter((g) => g.result)
    .sort((a, b) => (a.date && b.date ? new Date(b.date).getTime() - new Date(a.date).getTime() : 0));
  if (played.length < 4) return { label: "Médio", score: 50, trend: "→", decisiveRate: 50 };

  const ptsOf = (g: Game) => (g.result === "V" ? 3 : g.result === "E" ? 1 : 0);
  const half = Math.floor(played.length / 2);
  const newer = played.slice(0, half);
  const older = played.slice(half);
  const avgPts = (arr: Game[]) => (arr.length ? arr.reduce((s, g) => s + ptsOf(g), 0) / arr.length : 0);
  const trendVal = avgPts(newer) - avgPts(older);

  const drawRate = played.filter((g) => g.result === "E").length / played.length;
  const decisiveRate = (1 - drawRate) * 100;

  let label: IRTResult["label"], score: number;
  if (decisiveRate >= 75 && trendVal >= -0.3) { label = "Alto"; score = 85 + Math.min(15, trendVal * 20); }
  else if (decisiveRate >= 50) { label = "Médio"; score = 60 + trendVal * 15; }
  else { label = "Baixo"; score = 40 + trendVal * 10; }

  return {
    label,
    score: clamp100(score),
    trend: trendVal > 0.3 ? "↑" : trendVal < -0.3 ? "↓" : "→",
    decisiveRate: Math.round(decisiveRate),
  };
}

export interface IMCResult {
  multiplier: number;
  winRate: number | null;
  diffVsOtherVenue: number | null;
}

export function calculateIMC(games: Game[], venue: "home" | "away"): IMCResult {
  const played = games.filter((g) => g.result);
  const venueGames = played.filter((g) => g.venue === venue);
  const otherGames = played.filter((g) => g.venue !== venue);
  if (!venueGames.length) return { multiplier: 1.0, winRate: null, diffVsOtherVenue: null };

  const winRate = (venueGames.filter((g) => g.result === "V").length / venueGames.length) * 100;
  const otherWinRate = otherGames.length
    ? (otherGames.filter((g) => g.result === "V").length / otherGames.length) * 100
    : 50;
  const diff = winRate - otherWinRate;

  let multiplier = 1.0;
  if (venue === "home" && diff > 15) multiplier = 1.10;
  else if (venue === "home" && diff < -15) multiplier = 0.95;
  else if (venue === "away" && diff < -15) multiplier = 0.85;
  else if (venue === "away" && diff > 10) multiplier = 1.08;

  return { multiplier, winRate: Math.round(winRate), diffVsOtherVenue: Math.round(diff) };
}

export interface IFGResult {
  label: "Alto" | "Médio" | "Baixo";
  score: number;
  marketSuggestion: string;
  avgXGHome: number;
  avgXGAway: number;
}

export function calculateIFG(gp: GoalProbs, hS?: TeamStats, aS?: TeamStats): IFGResult {
  const over15 = gp.over["1.5"] * 100;
  const over25 = gp.over["2.5"] * 100;
  const bttsYes = gp.btts * 100;
  const score = over15 * 0.3 + over25 * 0.4 + bttsYes * 0.3;
  const avgXGHome = hS?.avgXG ?? 0;
  const avgXGAway = aS?.avgXG ?? 0;

  if (score >= 65) return { label: "Alto", score: Math.round(score), marketSuggestion: bttsYes >= over25 ? "Over / BTTS" : "Over 2.5", avgXGHome, avgXGAway };
  if (score >= 45) return { label: "Médio", score: Math.round(score), marketSuggestion: "Over 1.5 / linhas seguras", avgXGHome, avgXGAway };
  return { label: "Baixo", score: Math.round(score), marketSuggestion: "Under / evitar BTTS", avgXGHome, avgXGAway };
}

export interface IVRResult {
  label: "Baixo" | "Médio" | "Alto";
  riskScore: number;
  penalty: number;
}

// Ajuste 2c: se AMBOS os times têm motivação de mata-mata, adicionar +10 ao riskScore
// Jogos de eliminatória têm maior imprevisibilidade (zebras, pênaltis, etc.)
export function calculateIVR(
  homeGames: Game[],
  awayGames: Game[],
  homeICT: number,
  awayICT: number,
  homeMotivation?: MotivationFactors,
  awayMotivation?: MotivationFactors,
): IVRResult {
  const all = [...homeGames, ...awayGames].filter((g) => g.result);
  if (!all.length) return { label: "Médio", riskScore: 35, penalty: 8 };

  const nv2 = (v: string) => parseFloat(v) || 0;
  const anomalyRate =
    all.filter((g) => nv2(g.goalsFor1H) + nv2(g.goalsFor2H) + nv2(g.goalsAgainst1H) + nv2(g.goalsAgainst2H) >= 5).length /
    all.length;

  const drawRateOf = (arr: Game[]) => (arr.length ? arr.filter((g) => g.result === "E").length / arr.length : 0);
  const hPlayed = homeGames.filter((g) => g.result);
  const aPlayed = awayGames.filter((g) => g.result);
  const avgDrawRate = (drawRateOf(hPlayed) + drawRateOf(aPlayed)) / 2;

  const weakerGames = homeICT < awayICT ? hPlayed : aPlayed;
  const weakerWinRate = weakerGames.length ? weakerGames.filter((g) => g.result === "V").length / weakerGames.length : 0;

  let riskScore = anomalyRate * 40 + avgDrawRate * 30 + weakerWinRate * 30;

  // Ajuste 2c: mata-mata bilateral aumenta volatilidade em +10
  if (homeMotivation?.knockout && awayMotivation?.knockout) {
    riskScore += 10;
  }

  if (riskScore <= 25) return { label: "Baixo", riskScore: Math.round(riskScore), penalty: 0 };
  if (riskScore <= 45) return { label: "Médio", riskScore: Math.round(riskScore), penalty: 8 };
  return { label: "Alto", riskScore: Math.round(riskScore), penalty: 20 };
}

export interface ICJResult {
  value: number;
  reading: { label: string; color: string };
}

export function calculateICJ(opts: {
  homeICTAdjusted: number;
  awayICTAdjusted: number;
  homeIRT: IRTResult;
  awayIRT: IRTResult;
  imcHome: IMCResult;
  imcAway: IMCResult;
  ifg: IFGResult;
  ivr: IVRResult;
  // Ajuste 6c: qualidade dos dados (0-10, de dataConfidence()). Um analista
  // profissional não dá a mesma confiança pra um jogo com histórico completo
  // e pra um com amostra curta — isso agora pesa direto no ICJ, não só como
  // aviso cosmético na tela.
  dataQuality?: number;
}): ICJResult {
  const { homeICTAdjusted, awayICTAdjusted, homeIRT, awayIRT, imcHome, imcAway, ifg, ivr, dataQuality } = opts;

  const ictDiff = Math.abs(homeICTAdjusted - awayICTAdjusted);
  const ictDiffScore = clamp100(100 - ictDiff);
  const avgICT = (homeICTAdjusted + awayICTAdjusted) / 2;
  const ictComponent = ictDiffScore * 0.4 + avgICT * 0.6;

  const irtComponent = (homeIRT.score + awayIRT.score) / 2;
  const imcComponent = ((imcHome.multiplier + imcAway.multiplier) / 2) * 100 - 100 + 50;
  const ifgComponent = ifg.score;

  let icj = ictComponent * 0.40 + irtComponent * 0.15 + imcComponent * 0.15 + ifgComponent * 0.15;
  icj -= ivr.penalty;

  // Dados fracos (dataQuality < 7/10) tiram até 15 pontos do ICJ,
  // proporcional ao quanto falta pra amostra ficar confiável.
  const dataPenalty = dataQuality != null && dataQuality < 7 ? (7 - dataQuality) * 5 : 0;
  icj -= dataPenalty;

  const normalized = Math.max(50, Math.min(90, 50 + (icj / 100) * 40));

  const reading =
    normalized >= 80 ? { label: "Jogo confiável", color: "#00C875" } :
    normalized >= 70 ? { label: "Jogo bom", color: "#00E5FF" } :
    normalized >= 60 ? { label: "Instável", color: "#FFB800" } :
    { label: "Evitável", color: "#FF4D4D" };

  return { value: Math.round(normalized * 10) / 10, reading };
}

export interface MGAAMarketCandidate { market: string; prob: number }
export interface MGAAMarketClassification {
  seguro: MGAAMarketCandidate[];
  moderado: MGAAMarketCandidate[];
  alto: MGAAMarketCandidate[];
  foraDoMetodo: boolean;
}

// Ajuste 2a: Mercados de resultado (homeWin, draw, awayWin e Dupla Chance derivadas)
// recebem penalização de 15% antes de comparação com os thresholds do MGAA+.
// Brier Score de "Vitória Casa" = 0.2499 ≈ chute aleatório → probabilidades de resultado
// não estão bem calibradas. O ajuste evita classificação prematura como "Seguro".
// NOTA: os valores EXIBIDOS ao usuário continuam sem o ajuste (displayProb).
export function classifyMGAAMarkets(gp: GoalProbs, hT: Team, aT: Team): MGAAMarketClassification {
  const homeWin = gp.homeWin * 100, draw = gp.draw * 100, awayWin = gp.awayWin * 100;

  // Penalização 15% apenas para comparação de threshold (não para exibição)
  const homeWinAdj = homeWin * 0.85;
  const drawAdj = draw * 0.85;
  const awayWinAdj = awayWin * 0.85;

  const over15 = gp.over["1.5"] * 100, over25 = gp.over["2.5"] * 100, under35 = (1 - gp.over["3.5"]) * 100;
  const bttsYes = gp.btts * 100, bttsNo = (1 - gp.btts) * 100;

  // prob = valor ajustado para threshold; displayProb = valor original para exibição
  const candidates: { market: string; prob: number; displayProb: number }[] = [
    { market: "Over 1.5", prob: over15, displayProb: over15 },
    { market: "Dupla Chance 1X", prob: homeWinAdj + drawAdj, displayProb: homeWin + draw },
    { market: "Dupla Chance X2", prob: drawAdj + awayWinAdj, displayProb: draw + awayWin },
    { market: "Dupla Chance 12", prob: homeWinAdj + awayWinAdj, displayProb: homeWin + awayWin },
    { market: "Under 3.5", prob: under35, displayProb: under35 },
    { market: `Vitória ${hT.name || "Casa"}`, prob: homeWinAdj, displayProb: homeWin },
    { market: `Vitória ${aT.name || "Fora"}`, prob: awayWinAdj, displayProb: awayWin },
    { market: "Over 2.5", prob: over25, displayProb: over25 },
    { market: "BTTS Sim", prob: bttsYes, displayProb: bttsYes },
    { market: "BTTS Não", prob: bttsNo, displayProb: bttsNo },
  ];

  const inRange = (c: { prob: number }, min: number, max: number) => c.prob >= min && c.prob < max;
  const toMGAA = (c: { market: string; displayProb: number }): MGAAMarketCandidate => ({ market: c.market, prob: c.displayProb });

  const seguro = candidates.filter((c) => inRange(c, 75, 95.01)).sort((a, b) => b.prob - a.prob).slice(0, 3).map(toMGAA);
  const moderado = candidates.filter((c) => inRange(c, 70, 75)).sort((a, b) => b.prob - a.prob).slice(0, 3).map(toMGAA);
  const alto = candidates.filter((c) => inRange(c, 60, 70)).sort((a, b) => b.prob - a.prob).slice(0, 3).map(toMGAA);

  return { seguro, moderado, alto, foraDoMetodo: !seguro.length && !moderado.length && !alto.length };
}

export interface MGAAResult {
  ict: { home: ICTResult; away: ICTResult };
  ictAdjusted: { home: number; away: number };
  irt: { home: IRTResult; away: IRTResult };
  imc: { home: IMCResult; away: IMCResult };
  ifg: IFGResult;
  ivr: IVRResult;
  icj: ICJResult;
  marketClassification: MGAAMarketClassification;
  // Ajuste 2b: mercados com alta confiança histórica empírica
  // over05: acerto histórico 96.2% (Brier 0.04) — badge quando prob >= 90%
  // over15: acerto histórico 84.6% (Brier 0.14) — badge quando prob >= 80%
  highConfidenceBadges: string[];
}

export function runMGAAPlus(
  hS: TeamStats,
  aS: TeamStats,
  hT: Team,
  aT: Team,
  gp: GoalProbs
): MGAAResult {
  const homeICT = calculateICT(hS);
  const awayICT = calculateICT(aS);

  const homeIRT = calculateIRT(hT.games);
  const awayIRT = calculateIRT(aT.games);

  const imcHome = calculateIMC(hT.games, "home");
  const imcAway = calculateIMC(aT.games, "away");

  const homeICTAdjusted = Math.max(0, Math.min(100, homeICT.value * imcHome.multiplier));
  const awayICTAdjusted = Math.max(0, Math.min(100, awayICT.value * imcAway.multiplier));

  const ifg = calculateIFG(gp, hS, aS);
  // Ajuste 2c: passa motivações para detectar mata-mata bilateral
  const ivr = calculateIVR(hT.games, aT.games, homeICT.value, awayICT.value, hT.motivation, aT.motivation);

  // Ajuste 6c: qualidade dos dados agora entra no ICJ (ver calculateICJ)
  const dq = dataConfidence(hS, aS);

  const icj = calculateICJ({ homeICTAdjusted, awayICTAdjusted, homeIRT, awayIRT, imcHome, imcAway, ifg, ivr, dataQuality: dq.score });

  const marketClassification = classifyMGAAMarkets(gp, hT, aT);

  // Ajuste 2b: badges de alta confiança histórica (baseados em dados reais de auditoria)
  const highConfidenceBadges: string[] = [];
  if (gp.over["0.5"] * 100 >= 90) highConfidenceBadges.push("over05");
  if (gp.over["1.5"] * 100 >= 80) highConfidenceBadges.push("over15");

  return {
    ict: { home: homeICT, away: awayICT },
    ictAdjusted: { home: Math.round(homeICTAdjusted * 10) / 10, away: Math.round(awayICTAdjusted * 10) / 10 },
    irt: { home: homeIRT, away: awayIRT },
    imc: { home: imcHome, away: imcAway },
    ifg,
    ivr,
    icj,
    marketClassification,
    highConfidenceBadges,
  };
}
