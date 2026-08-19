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
  home: string,
  away: string,
  date?: string,
): Promise<BetanoOdds | null> {
  const params = new URLSearchParams({ home, away });
  if (date) params.set("date", date);
  const res = await fetch(`/api/odds/match?${params}`);
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  const data = await res.json();
  return data.odds ?? null;
}
