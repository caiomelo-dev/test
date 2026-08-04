import type { League, LeagueRegion } from "../types";

export const C = {
  bg: "#080D1A",
  card: "#0D1424",
  card2: "#111928",
  cyan: "#00E5FF",
  green: "#00C875",
  yellow: "#FFB800",
  red: "#FF4D4D",
  purple: "#A78BFA",
  text: "#E0EAFF",
  muted: "#6B7FA3",
  border: "rgba(255,255,255,0.07)",
};

export const ESPN_LEAGUE_MAP: Record<number, string> = {
  39: "eng.1",
  140: "esp.1",
  135: "ita.1",
  78: "ger.1",
  61: "fra.1",
  71: "bra.1",
  72: "bra.2",
  2: "uefa.champions",
  3: "uefa.europa",
  4: "uefa.europa.conf",
  11: "conmebol.sudamericana",
  13: "conmebol.libertadores",
  253: "usa.1",
  1: "fifa.world",
  // Ajuste 9: fase de qualificação usa slugs próprios na ESPN — sem isso,
  // a busca de Champions/Europa/Conference League não acha nada em
  // jul/ago, quando só a qualificação está rolando (fase de liga/grupos
  // começa em setembro).
  5: "uefa.champions_qual",
  6: "uefa.europa_qual",
  7: "uefa.europa.conf_qual",
  // Ligas adicionadas a pedido do usuário. Os slugs seguem o padrão
  // "país.1" já usado acima; bra.copa_do_brasil é o único não confirmado
  // contra a API real da ESPN (sandbox sem acesso a site.api.espn.com) —
  // ver curl de verificação combinado com o usuário.
  200: "ned.1",
  201: "por.1",
  202: "tur.1",
  203: "arg.1",
  204: "bra.copa_do_brasil",
  205: "chi.1",
  206: "uru.1",
  207: "col.1",
};

// Ajuste 11: temporada calculada dinamicamente em vez de mapa fixo com ano
// hardcoded. Isso resolve de vez a pergunta "precisa atualizar algo quando
// a temporada virar?" — não precisa. Ligas europeias (top 5 + UEFA) seguem
// o calendário ago-mai: a temporada só "vira" em julho. Ligas de calendário
// (Brasileirão, MLS, Sul-Americana, Libertadores) usam o ano corrente.
const EUROPEAN_SEASON_SLUGS = new Set([
  "eng.1", "esp.1", "ita.1", "ger.1", "fra.1",
  "ned.1", "por.1", "tur.1",
  "uefa.champions", "uefa.europa", "uefa.europa.conf",
  "uefa.champions_qual", "uefa.europa_qual", "uefa.europa.conf_qual",
]);

export function currentSeasonYear(slug: string): number {
  const now = new Date();
  if (EUROPEAN_SEASON_SLUGS.has(slug)) {
    // Temporada europeia começa em jul/ago. Antes disso (jan-jun), ainda
    // estamos na temporada que começou no ano anterior (ex.: em maio de
    // 2027, ainda é a temporada "2026-27" => ano 2026 pra ESPN).
    return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  }
  return now.getFullYear(); // Brasileirão, MLS, Libertadores, Sul-Americana, Copa do Mundo
}

export const LEAGUES: League[] = [
  { id: 1,   name: "Copa do Mundo",       country: "🌍", isNationalTeam: true,  region: "Seleções" },
  { id: 39,  name: "Premier League",      country: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", isNationalTeam: false, region: "Europa" },
  { id: 140, name: "La Liga",             country: "🇪🇸", isNationalTeam: false, region: "Europa" },
  { id: 135, name: "Serie A",             country: "🇮🇹", isNationalTeam: false, region: "Europa" },
  { id: 78,  name: "Bundesliga",          country: "🇩🇪", isNationalTeam: false, region: "Europa" },
  { id: 61,  name: "Ligue 1",             country: "🇫🇷", isNationalTeam: false, region: "Europa" },
  { id: 200, name: "Eredivisie",          country: "🇳🇱", isNationalTeam: false, region: "Europa" },
  { id: 201, name: "Liga Portugal",       country: "🇵🇹", isNationalTeam: false, region: "Europa" },
  { id: 202, name: "Süper Lig",           country: "🇹🇷", isNationalTeam: false, region: "Europa" },
  { id: 2,   name: "Champions League",    country: "🇪🇺", isNationalTeam: false, region: "Europa" },
  { id: 3,   name: "Europa League",       country: "🇪🇺", isNationalTeam: false, region: "Europa" },
  { id: 4,   name: "Conference League",   country: "🇪🇺", isNationalTeam: false, region: "Europa" },
  // Ajuste 9: qualificatórias — relevantes agora (jul/ago). Somem sozinhas
  // dos resultados quando a fase principal começar (scoreboard retorna
  // vazio nesse slug quando não há mais jogos de qualificação).
  { id: 5,   name: "Champions League — Qualificação",  country: "🇪🇺", isNationalTeam: false, region: "Europa" },
  { id: 6,   name: "Europa League — Qualificação",     country: "🇪🇺", isNationalTeam: false, region: "Europa" },
  { id: 7,   name: "Conference League — Qualificação", country: "🇪🇺", isNationalTeam: false, region: "Europa" },
  { id: 71,  name: "Brasileirão Série A", country: "🇧🇷", isNationalTeam: false, region: "América do Sul" },
  { id: 72,  name: "Brasileirão Série B", country: "🇧🇷", isNationalTeam: false, region: "América do Sul" },
  { id: 204, name: "Copa do Brasil",      country: "🇧🇷", isNationalTeam: false, region: "América do Sul" },
  { id: 203, name: "Liga Argentina",      country: "🇦🇷", isNationalTeam: false, region: "América do Sul" },
  { id: 205, name: "Liga Chilena",        country: "🇨🇱", isNationalTeam: false, region: "América do Sul" },
  { id: 206, name: "Liga Uruguaia",       country: "🇺🇾", isNationalTeam: false, region: "América do Sul" },
  { id: 207, name: "Liga Colombiana",     country: "🇨🇴", isNationalTeam: false, region: "América do Sul" },
  { id: 11,  name: "Sul-Americana",       country: "🌎", isNationalTeam: false, region: "América do Sul" },
  { id: 13,  name: "Libertadores",        country: "🌎", isNationalTeam: false, region: "América do Sul" },
  { id: 253, name: "MLS",                 country: "🇺🇸", isNationalTeam: false, region: "América do Norte" },
];

const LEAGUE_REGION_ORDER: LeagueRegion[] = ["Seleções", "Europa", "América do Sul", "América do Norte"];

export function groupLeaguesByRegion(leagues: League[]): { region: LeagueRegion; leagues: League[] }[] {
  return LEAGUE_REGION_ORDER
    .map(region => ({ region, leagues: leagues.filter(l => l.region === region) }))
    .filter(g => g.leagues.length > 0);
}

export const MOTIVATION_FACTORS = [
  { key: "title", label: "Título", icon: "🏆" },
  { key: "relegation", label: "Rebaixamento", icon: "⬇️" },
  { key: "continental", label: "Vaga Continental", icon: "🌍" },
  { key: "knockout", label: "Mata-mata", icon: "⚔️" },
  { key: "classic", label: "Clássico", icon: "🔥" },
  { key: "mustwin", label: "Necessidade de Vitória", icon: "❗" },
] as const;
