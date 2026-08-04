// ═══════════════════════════════════════════════════════════════════════════
// APEX — Tradução PT-BR → Inglês para busca de times
// O usuário digita em português; a ESPN indexa em inglês. Expandimos a query
// com os possíveis nomes em inglês antes de filtrar.
// ═══════════════════════════════════════════════════════════════════════════

// Remove acentos e normaliza para comparação
export function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

// PT-BR → inglês (seleções/países e clubes com nomes divergentes)
const PT_TO_EN: Record<string, string> = {
  // ─── Seleções (países) ───
  alemanha: "Germany",
  espanha: "Spain",
  franca: "France",
  inglaterra: "England",
  italia: "Italy",
  holanda: "Netherlands",
  "paises baixos": "Netherlands",
  belgica: "Belgium",
  croacia: "Croatia",
  suica: "Switzerland",
  polonia: "Poland",
  suecia: "Sweden",
  dinamarca: "Denmark",
  "pais de gales": "Wales",
  "estados unidos": "United States",
  "coreia do sul": "South Korea",
  "coreia do norte": "North Korea",
  japao: "Japan",
  catar: "Qatar",
  "arabia saudita": "Saudi Arabia",
  marrocos: "Morocco",
  egito: "Egypt",
  "africa do sul": "South Africa",
  "costa do marfim": "Ivory Coast",
  camaroes: "Cameroon",
  argelia: "Algeria",
  tunisia: "Tunisia",
  nigeria: "Nigeria",
  gana: "Ghana",
  senegal: "Senegal",
  equador: "Ecuador",
  colombia: "Colombia",
  peru: "Peru",
  chile: "Chile",
  uruguai: "Uruguay",
  paraguai: "Paraguay",
  bolivia: "Bolivia",
  venezuela: "Venezuela",
  mexico: "Mexico",
  canada: "Canada",
  "costa rica": "Costa Rica",
  panama: "Panama",
  honduras: "Honduras",
  jamaica: "Jamaica",
  australia: "Australia",
  "nova zelandia": "New Zealand",
  turquia: "Turkey",
  grecia: "Greece",
  austria: "Austria",
  "republica tcheca": "Czech Republic",
  tchequia: "Czechia",
  hungria: "Hungary",
  romenia: "Romania",
  servia: "Serbia",
  eslovaquia: "Slovakia",
  eslovenia: "Slovenia",
  ucrania: "Ukraine",
  russia: "Russia",
  noruega: "Norway",
  finlandia: "Finland",
  islandia: "Iceland",
  irlanda: "Ireland",
  "irlanda do norte": "Northern Ireland",
  escocia: "Scotland",
  brasil: "Brazil",
  china: "China",
  india: "India",
  ira: "Iran",
  iraque: "Iraq",
  israel: "Israel",
  "emirados arabes": "United Arab Emirates",
  "arabia": "Saudi Arabia",

  // ─── Clubes com nomes divergentes em PT-BR ───
  "bayern de munique": "Bayern Munich",
  munique: "Munich",
  colonia: "Cologne",
  "borussia monchengladbach": "Borussia Monchengladbach",
  "inter de milao": "Internazionale",
  "internazionale de milao": "Internazionale",
  "milan": "AC Milan",
  "milao": "Milan",
  roma: "Roma",
  "sevilha": "Sevilla",
  "marselha": "Marseille",
  "lyon": "Lyon",
  "munchen": "Munich",
  "juventus de turim": "Juventus",
  "atletico de madri": "Atletico Madrid",
  "real madri": "Real Madrid",
  "barcelona": "Barcelona",
  "manchester city": "Manchester City",
  "manchester united": "Manchester United",
  "bayer leverkusen": "Bayer Leverkusen",
  "porto": "Porto",
  "benfica": "Benfica",
  "sporting": "Sporting",
};

// Expande a query do usuário em termos de busca normalizados (PT + EN)
export function expandSearchTerms(q: string): string[] {
  const nq = norm(q);
  if (!nq) return [];
  const terms = new Set<string>([nq]);

  for (const [pt, en] of Object.entries(PT_TO_EN)) {
    // Se a query bate (parcial ou total) com a chave PT, adiciona o termo em inglês
    if (pt.includes(nq) || nq.includes(pt)) {
      terms.add(norm(en));
    }
  }

  return Array.from(terms);
}

// Verifica se um nome de time corresponde a algum termo expandido da query
export function matchesQuery(teamName: string, q: string): boolean {
  const name = norm(teamName);
  return expandSearchTerms(q).some((term) => term.length > 0 && name.includes(term));
}
