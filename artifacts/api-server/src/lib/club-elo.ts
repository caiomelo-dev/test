// ═══════════════════════════════════════════════════════════════════════════
// APEX — Club Elo (Força do Adversário para Clubes)
// API pública: http://api.clubelo.com
// ═══════════════════════════════════════════════════════════════════════════

const CLUBELO_BASE = "http://api.clubelo.com";
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24h
const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

interface EloEntry { club: string; country: string; level: number; elo: number }
const teamCache = new Map<string, { elo: number; timestamp: number }>();
let rankingCache: { data: EloEntry[] | null; timestamp: number } = { data: null, timestamp: 0 };

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h.trim()] = cols[i]?.trim() ?? ""; });
    return obj;
  });
}

async function getClubElo(teamName: string): Promise<number | null> {
  const key = teamName.trim();
  const now = Date.now();
  const cached = teamCache.get(key);
  if (cached && now - cached.timestamp < CACHE_TTL) return cached.elo;

  try {
    const slug = encodeURIComponent(key.replace(/\s+/g, ""));
    const res = await fetchWithTimeout(`${CLUBELO_BASE}/${slug}`);
    if (!res.ok) throw new Error(`ClubElo error: ${res.status}`);
    const text = await res.text();
    const rows = parseCSV(text);
    if (!rows.length) return null;
    const latest = rows[rows.length - 1];
    const elo = parseFloat(latest["Elo"] ?? "");
    if (isNaN(elo)) return null;
    teamCache.set(key, { elo, timestamp: now });
    return elo;
  } catch {
    return null;
  }
}

async function getFullRanking(): Promise<EloEntry[]> {
  const now = Date.now();
  if (rankingCache.data && now - rankingCache.timestamp < CACHE_TTL) return rankingCache.data;

  try {
    let rows: EloEntry[] = [];
    const date = new Date();
    for (let attempt = 0; attempt < 7 && rows.length === 0; attempt++) {
      const dateStr = date.toISOString().split("T")[0];
      const res = await fetchWithTimeout(`${CLUBELO_BASE}/${dateStr}`);
      if (res.ok) {
        const text = await res.text();
        rows = parseCSV(text)
          .map((r) => ({
            club: r["Club"] ?? "",
            country: r["Country"] ?? "",
            level: parseInt(r["Level"] ?? "0"),
            elo: parseFloat(r["Elo"] ?? "0"),
          }))
          .filter((r) => r.club && !isNaN(r.elo));
      }
      date.setDate(date.getDate() - 1);
    }
    rankingCache = { data: rows, timestamp: now };
    return rows;
  } catch {
    return rankingCache.data ?? [];
  }
}

export async function getEloAverage(onlyTopLevel = true): Promise<number> {
  const ranking = await getFullRanking();
  if (!ranking.length) return 1500;
  const filtered = onlyTopLevel ? ranking.filter((r) => r.level === 1) : ranking;
  if (!filtered.length) return 1500;
  return filtered.reduce((s, r) => s + r.elo, 0) / filtered.length;
}

export async function findClubElo(teamName: string): Promise<number | null> {
  const variations = [
    teamName,
    teamName.replace(/\s+/g, ""),
    teamName.replace(/^(FC|CF|AC|SC)\s+/i, "").replace(/\s+(FC|CF)$/i, ""),
  ];
  for (const variant of variations) {
    const elo = await getClubElo(variant);
    if (elo !== null) return elo;
  }
  const ranking = await getFullRanking();
  const key = teamName.toLowerCase();
  const match = ranking.find(
    (r) => r.club.toLowerCase().includes(key) || key.includes(r.club.toLowerCase())
  );
  return match?.elo ?? null;
}
