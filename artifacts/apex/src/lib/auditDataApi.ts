export interface AuditDataEntry {
  id: string;
  createdAt: string;
  homeTeam: string;
  awayTeam: string;
  league: string;
  date: string;
  rawData: string;
  status: "pendente" | "concluida";
  realScore?: string;
  notes?: string;
  concludedAt?: string;
}

export async function listAuditData(): Promise<AuditDataEntry[]> {
  const res = await fetch("/api/audit-data");
  if (!res.ok) throw new Error("Falha ao carregar auditoria");
  const data = await res.json();
  return data.entries as AuditDataEntry[];
}

export async function saveAuditData(entry: {
  homeTeam: string;
  awayTeam: string;
  league?: string;
  date?: string;
  rawData: string;
}): Promise<AuditDataEntry> {
  const res = await fetch("/api/audit-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error("Falha ao salvar na auditoria");
  const data = await res.json();
  return data.entry as AuditDataEntry;
}

export async function concludeAuditData(id: string, realScore: string, notes?: string): Promise<AuditDataEntry> {
  const res = await fetch(`/api/audit-data/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ realScore, notes }),
  });
  if (!res.ok) throw new Error("Falha ao concluir entrada");
  const data = await res.json();
  return data.entry as AuditDataEntry;
}

export async function reopenAuditData(id: string): Promise<AuditDataEntry> {
  const res = await fetch(`/api/audit-data/${id}/reabrir`, { method: "PATCH" });
  if (!res.ok) throw new Error("Falha ao reabrir entrada");
  const data = await res.json();
  return data.entry as AuditDataEntry;
}

export async function deleteAuditData(id: string): Promise<void> {
  const res = await fetch(`/api/audit-data/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Falha ao excluir entrada");
}
