// ═══════════════════════════════════════════════════════════════════════════
// APEX — Odds da Betano via OddsPapi (https://oddspapi.io)
// ═══════════════════════════════════════════════════════════════════════════
//
// Betano não tem API pública — a OddsPapi é um provedor comercial que agrega
// odds de várias casas (incluindo a Betano) de forma legítima, com acordo
// próprio deles. Não é scraping feito por nós. Auth por query param
// (?apiKey=), sem header.
//
// Confirmado via pesquisa na documentação pública deles (NÃO testado ao
// vivo — oddspapi.io está bloqueado nesta sandbox de desenvolvimento, mesma
// política de rede que já bloqueava site.api.espn.com):
//   - base: https://api.oddspapi.io/v4
//   - GET /fixtures?sportId=&dateFrom=&dateTo=&apiKey= → lista de jogos
//     (fixtureId, participant1Name, participant2Name, startTime, hasOdds)
//   - GET /odds?fixtureId=&bookmakers=&apiKey= → odds de um jogo específico
//   - sportId do futebol: 10
//   - bookmaker da Betano BR: "betano.bet.br"
//   - market IDs: 101 = 1X2, 104 = Ambas Marcam, 1010 = Over/Under 2.5 gols
//
// O formato exato dos outcomes DENTRO de cada market não foi confirmado ao
// vivo. extractOutcome() abaixo tenta várias formas plausíveis de rótulo
// (nome do time, "home"/"casa", "draw"/"empate" etc.) e loga o shape bruto
// quando não reconhece nada — ajustar rápido depois de um teste real
// (Replit, ou qualquer ambiente que alcance oddspapi.io).

import { logger } from "./logger.js";

const ODDSPAPI_BASE = "https://api.oddspapi.io/v4";
const SOCCER_SPORT_ID = 10;
const BETANO_BR_BOOKMAKER = "betano.bet.br";
const FETCH_TIMEOUT_MS = 8000;

const MARKET_1X2 = 101;
const MARKET_BTTS = 104;
const MARKET_OVER_UNDER_25 = 1010;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function apiKey(): string {
  const key = process.env.ODDSPAPI_API_KEY;
  if (!key) throw new Error("ODDSPAPI_API_KEY não configurada");
  return key;
}

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

interface OddsPapiFixture {
  fixtureId: string;
  participant1Name?: string;
  participant2Name?: string;
  startTime?: string;
  hasOdds?: boolean;
}

interface OddsPapiFixturesResponse {
  fixtures?: OddsPapiFixture[];
}

interface OddsPapiOutcome {
  name?: string;
  label?: string;
  price?: number;
  odds?: number;
}

interface OddsPapiMarket {
  outcomes?: OddsPapiOutcome[];
}

interface OddsPapiOddsResponse {
  bookmakerOdds?: Record<string, Record<string, OddsPapiMarket>>;
}

async function findFixture(homeTeam: string, awayTeam: string, dateISO?: string): Promise<string | null> {
  const from = dateISO ? new Date(dateISO) : new Date();
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  const dateFrom = from.toISOString().split("T")[0];
  const dateTo = to.toISOString().split("T")[0];

  const url = `${ODDSPAPI_BASE}/fixtures?sportId=${SOCCER_SPORT_ID}&dateFrom=${dateFrom}&dateTo=${dateTo}&apiKey=${apiKey()}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`OddsPapi fixtures ${res.status}`);
  const data = (await res.json()) as OddsPapiFixturesResponse | OddsPapiFixture[];
  const fixtures = Array.isArray(data) ? data : data.fixtures ?? [];

  const h = norm(homeTeam);
  const a = norm(awayTeam);
  const match = fixtures.find(f => {
    const p1 = norm(f.participant1Name ?? "");
    const p2 = norm(f.participant2Name ?? "");
    return (p1.includes(h) || h.includes(p1)) && (p2.includes(a) || a.includes(p2));
  });
  return match?.fixtureId ?? null;
}

function extractOutcome(market: OddsPapiMarket | undefined, matchers: string[]): number | undefined {
  if (!market?.outcomes) return undefined;
  for (const o of market.outcomes) {
    const label = norm(o.name ?? o.label ?? "");
    if (matchers.some(m => m && label.includes(m))) {
      const price = o.price ?? o.odds;
      if (typeof price === "number" && price > 1) return price;
    }
  }
  return undefined;
}

export interface BetanoOdds {
  homeWin?: number;
  draw?: number;
  awayWin?: number;
  bttsYes?: number;
  bttsNo?: number;
  over25?: number;
  under25?: number;
}

export async function fetchBetanoOdds(
  homeTeam: string,
  awayTeam: string,
  dateISO?: string,
): Promise<BetanoOdds | null> {
  const fixtureId = await findFixture(homeTeam, awayTeam, dateISO);
  if (!fixtureId) return null;

  const url = `${ODDSPAPI_BASE}/odds?fixtureId=${fixtureId}&bookmakers=${BETANO_BR_BOOKMAKER}&apiKey=${apiKey()}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`OddsPapi odds ${res.status}`);
  const data = (await res.json()) as OddsPapiOddsResponse;
  const markets = data.bookmakerOdds?.[BETANO_BR_BOOKMAKER];
  if (!markets) return null;

  const odds: BetanoOdds = {
    homeWin: extractOutcome(markets[MARKET_1X2], ["home", "casa", norm(homeTeam)]),
    draw: extractOutcome(markets[MARKET_1X2], ["draw", "empate", "tie"]),
    awayWin: extractOutcome(markets[MARKET_1X2], ["away", "fora", norm(awayTeam)]),
    bttsYes: extractOutcome(markets[MARKET_BTTS], ["yes", "sim"]),
    bttsNo: extractOutcome(markets[MARKET_BTTS], ["no", "nao"]),
    over25: extractOutcome(markets[MARKET_OVER_UNDER_25], ["over", "mais"]),
    under25: extractOutcome(markets[MARKET_OVER_UNDER_25], ["under", "menos"]),
  };

  const foundAny = Object.values(odds).some(v => v !== undefined);
  if (!foundAny) {
    logger.warn({ fixtureId, marketsShape: markets }, "OddsPapi: nenhum outcome reconhecido — conferir shape real da resposta");
    return null;
  }
  return odds;
}
