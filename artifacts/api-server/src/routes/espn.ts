import { Router } from "express";
import { logger } from "../lib/logger";
import { matchesQuery } from "../lib/translations";

const router = Router();

const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

const ESPN_LEAGUES: Record<number, string> = {
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
  // Ajuste 9: fase de qualificação da Champions/Europa/Conference usa slugs
  // PRÓPRIOS na ESPN, diferentes da fase de grupos/liga (que só começa em
  // setembro). É por isso que a busca de "jogos do dia" dessas 3 competições
  // não encontra nada em julho/agosto — a qualificação já está rolando, só
  // que sob esses slugs "_qual".
  5: "uefa.champions_qual",
  6: "uefa.europa_qual",
  7: "uefa.europa.conf_qual",
};

interface EspnTeamRaw {
  id: string;
  displayName: string;
  logos?: { href: string }[];
}

interface EspnTeamsResponse {
  sports?: { leagues?: { teams?: { team: EspnTeamRaw }[] }[] }[];
}

interface EspnCompetitor {
  homeAway: string;
  team: { id: string; displayName: string };
  score: { value?: number; displayValue?: string } | string;
  winner?: boolean;
}

interface EspnEvent {
  id: string;
  date: string;
  competitions: {
    competitors: EspnCompetitor[];
    status?: { type?: { completed?: boolean } };
  }[];
}

interface EspnScheduleResponse {
  events?: EspnEvent[];
  team?: { displayName?: string; logos?: { href: string }[] };
}

interface EspnKeyEvent {
  scoringPlay?: boolean;
  type?: { type?: string };
  period?: { number?: number };
  clock?: { value?: number };
  team?: { id?: string };
}

interface EspnBoxStat {
  name: string;
  value?: number;
  displayValue?: string;
}

interface EspnBoxTeam {
  team?: { id?: string };
  statistics?: EspnBoxStat[];
}

interface EspnOfficial {
  fullName?: string;
  displayName?: string;
  position?: { name?: string; id?: string };
}

interface EspnSummaryResponse {
  keyEvents?: EspnKeyEvent[];
  boxscore?: { teams?: EspnBoxTeam[] };
  gameInfo?: { officials?: EspnOfficial[] };
}

// Ajuste 2: timeout + 1 retry com backoff curto. Sem isso, uma ESPN lenta ou
// rate-limitada trava a análise do dia inteiro (a tela de jogos do dia faz
// dezenas dessas chamadas em sequência/paralelo).
async function espnFetchOnce<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`ESPN ${res.status}`);
    return res.json() as Promise<T>;
  } finally {
    clearTimeout(timer);
  }
}

async function espnFetch<T>(url: string, timeoutMs = 8000): Promise<T> {
  try {
    return await espnFetchOnce<T>(url, timeoutMs);
  } catch (err) {
    // 1 retry — cobre timeouts pontuais e rate-limit temporário da ESPN.
    await new Promise((r) => setTimeout(r, 400));
    return espnFetchOnce<T>(url, timeoutMs);
  }
}

function extractTeams(data: EspnTeamsResponse, slug: string, q: string) {
  return (data.sports?.[0]?.leagues?.[0]?.teams ?? [])
    .map(t => ({ id: t.team.id, name: t.team.displayName, logo: t.team.logos?.[0]?.href ?? "", slug }))
    .filter(t => matchesQuery(t.name, q));
}

router.get("/espn/search", async (req, res) => {
  const { q, leagueId } = req.query as { q: string; leagueId: string };
  if (!q) { res.status(400).json({ error: "q required" }); return; }

  const slug = ESPN_LEAGUES[parseInt(leagueId)] ?? "bra.1";

  try {
    const data = await espnFetch<EspnTeamsResponse>(`${ESPN_BASE}/${slug}/teams`);
    const teams = extractTeams(data, slug, q);

    if (teams.length === 0) {
      const slugsToTry = [...new Set(Object.values(ESPN_LEAGUES))].filter(s => s !== slug);
      for (const s of slugsToTry.slice(0, 6)) {
        try {
          const d2 = await espnFetch<EspnTeamsResponse>(`${ESPN_BASE}/${s}/teams`);
          const found = extractTeams(d2, s, q);
          if (found.length) { teams.push(...found); break; }
        } catch (_) {}
      }
    }

    res.json({ teams: teams.slice(0, 10) });
  } catch (err) {
    logger.error({ err }, "ESPN search error");
    res.status(500).json({ error: "ESPN search failed" });
  }
});

// Slugs to try for national teams
const NATIONAL_TEAM_SLUGS = ["fifa.world", "fifa.friendly", "uefa.nations"];

// Ajuste 11 (espelhado aqui do lado do cliente): temporadas calculadas
// dinamicamente em vez de anos hardcoded. O array fixo antigo (ex.: só até
// 2025 pra amistoso/Liga das Nações) ficava defasado assim que o ano virava
// — os jogos mais recentes de seleções simplesmente paravam de aparecer.
function recentSeasons(count = 3): number[] {
  const now = new Date().getFullYear();
  return Array.from({ length: count }, (_, i) => now - i);
}

const COMP_NAMES: Record<string, string> = {
  "fifa.world": "Copa do Mundo",
  "fifa.friendly": "Amistoso",
  "uefa.nations": "Liga das Nações",
  "eng.1": "Premier League",
  "esp.1": "La Liga",
  "ita.1": "Serie A",
  "ger.1": "Bundesliga",
  "fra.1": "Ligue 1",
  "bra.1": "Brasileirão A",
  "bra.2": "Brasileirão B",
  "usa.1": "MLS",
  "uefa.champions": "Champions League",
  "uefa.europa": "Europa League",
  "uefa.europa.conf": "Conference League",
  "uefa.champions_qual": "Champions League (Qualificação)",
  "uefa.europa_qual": "Europa League (Qualificação)",
  "uefa.europa.conf_qual": "Conference League (Qualificação)",
  "conmebol.libertadores": "Libertadores",
  "conmebol.sudamericana": "Sul-Americana",
  // Ajuste 10: "all" busca todas as competições numa chamada só (ver
  // collectClubGames) — não dá pra saber o nome exato da competição de
  // cada jogo individual sem uma chamada extra, então deixamos em branco
  // em vez de mostrar "all" (o campo é só cosmético, não afeta o cálculo).
  "all": "",
};
const compName = (slug: string): string => COMP_NAMES[slug] ?? slug;

interface TaggedEvent { event: EspnEvent; sourceSlug: string; }

async function collectNationalGames(teamId: string): Promise<{ tagged: TaggedEvent[]; team: EspnScheduleResponse["team"] }> {
  const seen = new Set<string>();
  const tagged: TaggedEvent[] = [];
  let teamMeta: EspnScheduleResponse["team"] = undefined;

  const seasons = recentSeasons();

  await Promise.allSettled(
    NATIONAL_TEAM_SLUGS.flatMap((s) =>
      seasons.map(async (season) => {
        const data = await espnFetch<EspnScheduleResponse>(
          `${ESPN_BASE}/${s}/teams/${teamId}/schedule?season=${season}`
        );
        if (!teamMeta && data.team?.displayName) teamMeta = data.team;
        (data.events ?? [])
          .filter(e => e.competitions?.[0]?.status?.type?.completed)
          .forEach(e => { if (!seen.has(e.id)) { seen.add(e.id); tagged.push({ event: e, sourceSlug: s }); } });
      })
    )
  );

  return { tagged, team: teamMeta };
}

// ── Slugs de competições UEFA (mantido só pra decidir o fallback abaixo) ────
const UEFA_SLUGS = new Set([
  "uefa.champions",
  "uefa.europa",
  "uefa.europa.conf",
  "uefa.champions_qual",
  "uefa.europa_qual",
  "uefa.europa.conf_qual",
]);

// ── Cascade schedule fetch for club teams ──────────────────────────────────────
// Ajuste 10: usa o endpoint "all" da ESPN (soccer/all/teams/{id}/schedule),
// que devolve o calendário do time em TODAS as competições (liga, copas
// domésticas, Champions/Europa/Conference, etc.) numa chamada só — em vez de
// cascatear por ligas domésticas tentando adivinhar em qual o time joga.
//
// Isso corrige um problema real: os "últimos 10 jogos" precisam refletir a
// forma recente de verdade, independente de qual competição está sendo
// analisada agora — um time pode estar em baixa na Champions mas bem na liga
// doméstica (ou vice-versa), e olhar só uma competição distorce a análise.
// (ESPN resolve o jogo pelo event id no /summary, não pela liga na URL, então
// usar sourceSlug="all" também funciona pra buscar os detalhes de cada jogo.)
async function collectClubGames(teamId: string, slug: string): Promise<{ tagged: TaggedEvent[]; team: EspnScheduleResponse["team"] }> {
  const seen = new Set<string>();
  let events: EspnEvent[] = [];
  let teamMeta: EspnScheduleResponse["team"] = undefined;
  const currentYear = new Date().getFullYear();

  const addEvents = (data: EspnScheduleResponse) => {
    if (!teamMeta && data.team?.displayName) teamMeta = data.team;
    (data.events ?? [])
      .filter(e => e.competitions?.[0]?.status?.type?.completed)
      .forEach(e => { if (!seen.has(e.id)) { seen.add(e.id); events.push(e); } });
  };

  // Tentativa 1: "all" sem season (ESPN devolve a temporada corrente por padrão)
  try {
    addEvents(await espnFetch<EspnScheduleResponse>(`${ESPN_BASE}/all/teams/${teamId}/schedule`));
  } catch (_) {}

  // Tentativa 2: cascateia por ano, ainda em "all", até ter pelo menos 10 jogos
  if (events.length < 10) {
    for (const yr of [currentYear, currentYear - 1, currentYear - 2]) {
      if (events.length >= 10) break;
      try {
        addEvents(await espnFetch<EspnScheduleResponse>(`${ESPN_BASE}/all/teams/${teamId}/schedule?season=${yr}`));
      } catch (_) {}
    }
  }

  // Fallback: se "all" não trouxe nada pra esse time (raro), cai pro caminho
  // antigo por liga específica — melhor um dado incompleto do que nenhum.
  // Não faz sentido tentar isso para slugs UEFA (ESPN não guarda schedule
  // de clube nesses slugs — só na liga doméstica, que aqui já não sabemos).
  if (!events.length && !UEFA_SLUGS.has(slug)) {
    try {
      addEvents(await espnFetch<EspnScheduleResponse>(`${ESPN_BASE}/${slug}/teams/${teamId}/schedule`));
    } catch (_) {}
    if (events.length < 5) {
      for (const yr of [currentYear, currentYear - 1, currentYear - 2]) {
        if (events.length >= 10) break;
        try {
          addEvents(await espnFetch<EspnScheduleResponse>(`${ESPN_BASE}/${slug}/teams/${teamId}/schedule?season=${yr}`));
        } catch (_) {}
      }
    }
  }

  const tagged = events
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10)
    .map(e => ({ event: e, sourceSlug: "all" }));

  return { tagged, team: teamMeta };
}

router.get("/espn/team-games", async (req, res) => {
  const { teamId, slug } = req.query as { teamId: string; slug: string; season: string };
  if (!teamId || !slug) { res.status(400).json({ error: "teamId and slug required" }); return; }

  const isNational = slug === "fifa.world";

  try {
    let toProcess: TaggedEvent[];
    let teamInfo: EspnScheduleResponse["team"];

    if (isNational) {
      const { tagged, team } = await collectNationalGames(teamId);
      toProcess = tagged
        .sort((a, b) => new Date(b.event.date).getTime() - new Date(a.event.date).getTime())
        .slice(0, 10);
      teamInfo = team ?? {};
    } else {
      const { tagged, team } = await collectClubGames(teamId, slug);
      toProcess = tagged;
      teamInfo = team ?? {};
    }

    if (!toProcess.length) {
      res.json({ games: [], teamName: "", logo: "" });
      return;
    }

    const getStat = (box: EspnBoxTeam | undefined, name: string) => {
      const stat = box?.statistics?.find(s => s.name === name);
      return stat?.value ?? (parseFloat(stat?.displayValue ?? "0") || 0);
    };

    const games = await Promise.all(
      toProcess.map(async ({ event, sourceSlug }) => {
        const comp = event.competitions[0];
        const homeComp = comp.competitors.find(c => c.homeAway === "home");
        const awayComp = comp.competitors.find(c => c.homeAway === "away");
        const isHome = homeComp?.team?.id === teamId;
        const myComp = isHome ? homeComp : awayComp;
        const oppComp = isHome ? awayComp : homeComp;

        const myScore = typeof myComp?.score === "object"
          ? (myComp.score as { value?: number }).value ?? 0
          : parseFloat(String(myComp?.score)) || 0;
        const oppScore = typeof oppComp?.score === "object"
          ? (oppComp.score as { value?: number }).value ?? 0
          : parseFloat(String(oppComp?.score)) || 0;

        const won = myComp?.winner === true;
        const drew = !won && !oppComp?.winner;

        let gf1H = 0, ga1H = 0;
        let shots = 0, shotsOnTarget = 0, cornersFor = 0, cornersAgainst = 0;
        let yellows = 0, reds = 0, fouls = 0;
        let g015 = 0, g1630 = 0, g3145 = 0, g4660 = 0, g6175 = 0, g7690 = 0;
        let gc015 = 0, gc1630 = 0, gc3145 = 0, gc4660 = 0, gc6175 = 0, gc7690 = 0;

        try {
          const summary = await espnFetch<EspnSummaryResponse>(
            `${ESPN_BASE}/${sourceSlug}/summary?event=${event.id}`
          );

          (summary.keyEvents ?? []).forEach(e => {
            const isGoal = e.scoringPlay || e.type?.type === "goal" || e.type?.type === "own-goal";
            if (!isGoal) return;
            const forUs = e.team?.id === teamId;
            const half = e.period?.number ?? 1;
            const sec = e.clock?.value ?? 0;
            const min = Math.floor(sec / 60);
            if (half === 1) { if (forUs) gf1H++; else ga1H++; }
            if (forUs) {
              if (min <= 15) g015++;
              else if (min <= 30) g1630++;
              else if (min <= 45) g3145++;
              else if (min <= 60) g4660++;
              else if (min <= 75) g6175++;
              else g7690++;
            } else {
              if (min <= 15) gc015++;
              else if (min <= 30) gc1630++;
              else if (min <= 45) gc3145++;
              else if (min <= 60) gc4660++;
              else if (min <= 75) gc6175++;
              else gc7690++;
            }
          });

          const boxTeams = summary.boxscore?.teams ?? [];
          const myBox = boxTeams.find(t => t.team?.id === teamId);
          const oppBox = boxTeams.find(t => t.team?.id !== teamId);

          shots = getStat(myBox, "totalShots");
          shotsOnTarget = getStat(myBox, "shotsOnTarget");
          cornersFor = getStat(myBox, "wonCorners");
          cornersAgainst = getStat(oppBox, "wonCorners");
          yellows = getStat(myBox, "yellowCards");
          reds = getStat(myBox, "redCards");
          fouls = getStat(myBox, "foulsCommitted");
        } catch (_) {}

        const gf2H = Math.max(0, myScore - gf1H);
        const ga2H = Math.max(0, oppScore - ga1H);

        return {
          result: won ? "V" : drew ? "E" : "D",
          venue: isHome ? "home" : "away",
          opponent: oppComp?.team?.displayName ?? "",
          competition: compName(sourceSlug),
          date: event.date?.split("T")[0] ?? "",
          goalsFor1H: String(gf1H),
          goalsFor2H: String(gf2H),
          goalsAgainst1H: String(ga1H),
          goalsAgainst2H: String(ga2H),
          shots: String(shots),
          shotsOnTarget: String(shotsOnTarget),
          bigChances: "",
          cornersFor: String(cornersFor),
          cornersAgainst: String(cornersAgainst),
          yellows: String(yellows),
          reds: String(reds),
          fouls: String(fouls),
          xg: "",
          xga: "",
          g015: String(g015),
          g1630: String(g1630),
          g3145: String(g3145),
          g4660: String(g4660),
          g6175: String(g6175),
          g7690: String(g7690),
          gc015: String(gc015),
          gc1630: String(gc1630),
          gc3145: String(gc3145),
          gc4660: String(gc4660),
          gc6175: String(gc6175),
          gc7690: String(gc7690),
        };
      })
    );

    res.json({
      games,
      teamName: teamInfo.displayName ?? "",
      logo: teamInfo.logos?.[0]?.href ?? "",
    });
  } catch (err) {
    logger.error({ err }, "ESPN team-games error");
    res.status(500).json({ error: "ESPN fetch failed" });
  }
});

// ── Referees: aggregate referee stats from both teams' recent games ──
router.get("/espn/referees", async (req, res) => {
  const { slug, homeTeamId, awayTeamId } = req.query as {
    slug: string;
    homeTeamId?: string;
    awayTeamId?: string;
  };
  if (!slug || !homeTeamId) {
    res.status(400).json({ error: "slug and homeTeamId required" });
    return;
  }

  try {
    const isNational = slug === "fifa.world";
    const ids = [homeTeamId, awayTeamId].filter(Boolean) as string[];
    // event id -> slug to fetch its summary from
    const eventSlug = new Map<string, string>();

    await Promise.all(
      ids.map(async (tid) => {
        if (isNational) {
          const { tagged } = await collectNationalGames(tid);
          tagged
            .sort((a, b) => new Date(b.event.date).getTime() - new Date(a.event.date).getTime())
            .slice(0, 10)
            .forEach((t) => eventSlug.set(t.event.id, t.sourceSlug));
        } else {
          // Cascade fetch for clubs (same as team-games)
          const { tagged } = await collectClubGames(tid, slug);
          tagged.forEach((t) => eventSlug.set(t.event.id, t.sourceSlug));
        }
      })
    );

    const getStat = (box: EspnBoxTeam | undefined, name: string) => {
      const stat = box?.statistics?.find((s) => s.name === name);
      return stat?.value ?? (parseFloat(stat?.displayValue ?? "0") || 0);
    };

    const agg = new Map<
      string,
      { games: number; yellows: number; reds: number; fouls: number; pens: number }
    >();

    await Promise.all(
      [...eventSlug.entries()].map(async ([eid, srcSlug]) => {
        try {
          const summary = await espnFetch<EspnSummaryResponse>(
            `${ESPN_BASE}/${srcSlug}/summary?event=${eid}`
          );
          const ref = (summary.gameInfo?.officials ?? []).find(
            (o) => o.position?.name === "Referee" || o.position?.id === "1"
          );
          const name = (ref?.displayName || ref?.fullName || "").trim();
          if (!name) return;

          const boxTeams = summary.boxscore?.teams ?? [];
          let yellows = 0,
            reds = 0,
            fouls = 0,
            pens = 0;
          boxTeams.forEach((bt) => {
            yellows += getStat(bt, "yellowCards");
            reds += getStat(bt, "redCards");
            fouls += getStat(bt, "foulsCommitted");
            pens += getStat(bt, "penaltyKickShots");
          });

          const cur =
            agg.get(name) ?? { games: 0, yellows: 0, reds: 0, fouls: 0, pens: 0 };
          cur.games++;
          cur.yellows += yellows;
          cur.reds += reds;
          cur.fouls += fouls;
          cur.pens += pens;
          agg.set(name, cur);
        } catch (_) {}
      })
    );

    const referees = [...agg.entries()]
      .map(([name, s]) => ({
        name,
        games: s.games,
        avgYellows: +(s.yellows / s.games).toFixed(1),
        avgReds: +(s.reds / s.games).toFixed(2),
        avgFouls: +(s.fouls / s.games).toFixed(1),
        avgPenalties: +(s.pens / s.games).toFixed(2),
      }))
      .sort((a, b) => b.games - a.games);

    res.json({ referees });
  } catch (err) {
    logger.error({ err }, "ESPN referees error");
    res.status(500).json({ error: "ESPN fetch failed" });
  }
});

// ── Scoreboard: lista de jogos de uma liga em uma data específica ──
// date: string no formato YYYYMMDD
router.get("/espn/scoreboard", async (req, res) => {
  const { slug, date } = req.query as { slug: string; date: string };
  if (!slug || !date) {
    res.status(400).json({ error: "slug and date required" });
    return;
  }

  try {
    const data = await espnFetch<{ events?: EspnEvent[] }>(
      `${ESPN_BASE}/${slug}/scoreboard?dates=${date}`
    );

    const games = (data.events ?? []).map(ev => {
      const comp = ev.competitions?.[0];
      const home = comp?.competitors?.find(c => c.homeAway === "home");
      const away = comp?.competitors?.find(c => c.homeAway === "away");
      return {
        id: ev.id,
        date: ev.date,
        slug,
        homeTeamId: home?.team?.id ?? "",
        homeTeamName: home?.team?.displayName ?? "",
        awayTeamId: away?.team?.id ?? "",
        awayTeamName: away?.team?.displayName ?? "",
      };
    }).filter(g => g.homeTeamId && g.awayTeamId);

    res.json({ games });
  } catch (err) {
    logger.error({ err }, "ESPN scoreboard error");
    res.status(500).json({ error: "ESPN scoreboard failed" });
  }
});

// ── H2H: cross-reference games already loaded for both teams ──
// Body: { homeGames: Game[], awayGames: Game[], homeName: string, awayName: string }
interface H2HGameBody {
  opponent: string;
  result: string;
  venue: string;
  date: string;
  goalsFor1H: string;
  goalsFor2H: string;
  goalsAgainst1H: string;
  goalsAgainst2H: string;
}

router.post("/espn/h2h", async (req, res) => {
  const { homeGames, awayGames, homeName, awayName } = req.body as {
    homeGames: H2HGameBody[];
    awayGames: H2HGameBody[];
    homeName: string;
    awayName: string;
  };

  if (!homeGames || !awayGames) {
    res.status(400).json({ error: "homeGames and awayGames required" });
    return;
  }

  // Normalize team names for fuzzy matching
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const homeN = norm(homeName ?? "");
  const awayN = norm(awayName ?? "");

  // From home team's perspective: find games where opponent ~ awayName
  const fromHome = homeGames.filter(g => {
    const opp = norm(g.opponent ?? "");
    return opp && awayN && (opp.includes(awayN.slice(0, 5)) || awayN.includes(opp.slice(0, 5)));
  });

  // From away team's perspective: find games where opponent ~ homeName
  const fromAway = awayGames.filter(g => {
    const opp = norm(g.opponent ?? "");
    return opp && homeN && (opp.includes(homeN.slice(0, 5)) || homeN.includes(opp.slice(0, 5)));
  });

  // Build unified H2H list — each entry from home team perspective
  const h2hGames = [
    ...fromHome.map(g => {
      const gf = (parseFloat(g.goalsFor1H) || 0) + (parseFloat(g.goalsFor2H) || 0);
      const ga = (parseFloat(g.goalsAgainst1H) || 0) + (parseFloat(g.goalsAgainst2H) || 0);
      return { date: g.date, homeGoals: gf, awayGoals: ga, total: gf + ga, btts: gf > 0 && ga > 0, homeWin: gf > ga, draw: gf === ga, awayWin: ga > gf };
    }),
    ...fromAway.map(g => {
      // From away team's games: gf = their goals (= away goals in H2H), ga = opponent goals (= home goals in H2H)
      const awayG = (parseFloat(g.goalsFor1H) || 0) + (parseFloat(g.goalsFor2H) || 0);
      const homeG = (parseFloat(g.goalsAgainst1H) || 0) + (parseFloat(g.goalsAgainst2H) || 0);
      return { date: g.date, homeGoals: homeG, awayGoals: awayG, total: homeG + awayG, btts: homeG > 0 && awayG > 0, homeWin: homeG > awayG, draw: homeG === awayG, awayWin: awayG > homeG };
    }),
  ]
    .filter((g, idx, arr) => arr.findIndex(x => x.date === g.date) === idx) // dedup by date
    .sort((a, b) => (b.date > a.date ? 1 : -1))
    .slice(0, 10);

  const pct = (arr: boolean[]) => arr.length ? Math.round((arr.filter(Boolean).length / arr.length) * 100) : 0;
  const avg = (arr: number[]) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : "0.0";
  const last5 = h2hGames.slice(0, 5);
  const last10 = h2hGames.slice(0, 10);

  res.json({
    games: h2hGames,
    found: h2hGames.length,
    stats: {
      last5_btts: pct(last5.map(g => g.btts)).toString(),
      last5_over25: pct(last5.map(g => g.total > 2.5)).toString(),
      last5_over35: pct(last5.map(g => g.total > 3.5)).toString(),
      last5_avgGoals: avg(last5.map(g => g.total)),
      last10_btts: pct(last10.map(g => g.btts)).toString(),
      last10_over25: pct(last10.map(g => g.total > 2.5)).toString(),
      last10_over35: pct(last10.map(g => g.total > 3.5)).toString(),
      last10_avgGoals: avg(last10.map(g => g.total)),
      homeWins: last10.filter(g => g.homeWin).length,
      draws: last10.filter(g => g.draw).length,
      awayWins: last10.filter(g => g.awayWin).length,
    },
  });
});

export default router;
