// ═══════════════════════════════════════════════════════════════════════════
// APEX — Ranking FIFA (Força do Adversário para Seleções)
// ═══════════════════════════════════════════════════════════════════════════

interface FifaRankingEntry {
  rank: number;
  points: number;
  previousRank: number;
  confederation: string;
}

interface FifaApiItem {
  name?: string;
  rank?: number;
  totalPoints?: string | number;
  previousRank?: number;
}

interface FifaApiResponse {
  rankings?: { rankingItem?: FifaApiItem; tag?: { text?: string } }[];
}

const FIFA_RANKING_URL = "https://www.fifa.com/api/ranking-overview?locale=en";
const CACHE_TTL = 1000 * 60 * 60 * 12; // 12h
const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

let cache: { data: Map<string, FifaRankingEntry> | null; timestamp: number } = {
  data: null,
  timestamp: 0,
};

async function fetchFifaRanking(): Promise<Map<string, FifaRankingEntry>> {
  const now = Date.now();
  if (cache.data && now - cache.timestamp < CACHE_TTL) return cache.data;

  try {
    const res = await fetchWithTimeout(FIFA_RANKING_URL, {
      headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) throw new Error(`FIFA API error: ${res.status}`);
    const json = (await res.json()) as FifaApiResponse;

    const map = new Map<string, FifaRankingEntry>();
    (json.rankings ?? []).forEach((entry) => {
      const item = entry.rankingItem;
      if (!item?.name) return;
      map.set(item.name.toLowerCase().trim(), {
        rank: item.rank ?? 0,
        points: parseFloat(String(item.totalPoints)) || 0,
        previousRank: item.previousRank ?? 0,
        confederation: entry.tag?.text ?? "",
      });
    });

    cache = { data: map, timestamp: now };
    return map;
  } catch {
    if (cache.data) return cache.data;
    return new Map();
  }
}

export async function getFifaAveragePoints(): Promise<number> {
  const ranking = await fetchFifaRanking();
  if (!ranking.size) return 1100;
  const points = Array.from(ranking.values())
    .map((t) => t.points)
    .filter((p) => !isNaN(p));
  return points.reduce((a, b) => a + b, 0) / points.length;
}

export async function getTeamRating(teamName: string): Promise<number | null> {
  const ranking = await fetchFifaRanking();
  const key = teamName.toLowerCase().trim();
  if (ranking.has(key)) return ranking.get(key)!.points;
  for (const [name, data] of ranking.entries()) {
    if (name.includes(key) || key.includes(name)) return data.points;
  }
  return null;
}
