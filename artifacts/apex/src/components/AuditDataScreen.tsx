import { useEffect, useState } from "react";
import { C } from "../lib/constants";
import {
  listAuditData, concludeAuditData, reopenAuditData, deleteAuditData,
  type AuditDataEntry,
} from "../lib/auditDataApi";

export function AuditDataScreen({ onBack, onToast }: {
  onBack: () => void;
  onToast: (msg: string, type: "success" | "error") => void;
}) {
  const [entries, setEntries] = useState<AuditDataEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pendente" | "concluida">("pendente");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [scoreInputs, setScoreInputs] = useState<Record<string, string>>({});
  const [notesInputs, setNotesInputs] = useState<Record<string, string>>({});
  const [exportText, setExportText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setEntries(await listAuditData());
    } catch (_) {
      onToast("Não consegui carregar a auditoria", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  const pendentes = entries.filter(e => e.status === "pendente");
  const concluidas = entries.filter(e => e.status === "concluida");
  const list = tab === "pendente" ? pendentes : concluidas;

  async function handleConclude(id: string) {
    const score = (scoreInputs[id] ?? "").trim();
    if (!score) {
      onToast("Informe o placar/resultado real antes de concluir", "error");
      return;
    }
    try {
      await concludeAuditData(id, score, notesInputs[id]);
      onToast("✓ Marcado como concluído", "success");
      refresh();
    } catch (_) {
      onToast("Falha ao concluir", "error");
    }
  }

  async function handleReopen(id: string) {
    try {
      await reopenAuditData(id);
      refresh();
    } catch (_) {
      onToast("Falha ao reabrir", "error");
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteAuditData(id);
      onToast("Removido", "success");
      refresh();
    } catch (_) {
      onToast("Falha ao remover", "error");
    }
  }

  function buildExport() {
    if (!concluidas.length) {
      onToast("Nenhuma auditoria concluída ainda", "error");
      return;
    }
    const blocks = concluidas.map(e => {
      return [
        `═══════════════════════════════════════════`,
        `${e.homeTeam} vs ${e.awayTeam}${e.league ? ` — ${e.league}` : ""}${e.date ? ` (${e.date})` : ""}`,
        `Resultado real: ${e.realScore}`,
        e.notes ? `Observações: ${e.notes}` : null,
        `═══════════════════════════════════════════`,
        "",
        e.rawData,
      ].filter(Boolean).join("\n");
    });
    setExportText(blocks.join("\n\n"));
    setCopied(false);
  }

  const btnBase: React.CSSProperties = {
    border: "none", borderRadius: 8, padding: "8px 14px", cursor: "pointer",
    fontSize: 12, fontWeight: 700,
  };

  if (exportText) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter','Segoe UI',sans-serif" }}>
        <div style={{ maxWidth: 700, margin: "0 auto", padding: "16px 12px" }}>
          <button onClick={() => setExportText(null)} style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", color: C.muted, fontSize: 11, fontWeight: 700, marginBottom: 14 }}>← Voltar</button>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.cyan, letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
            📋 Exportação — {concluidas.length} auditoria(s) concluída(s)
          </div>
          <textarea
            readOnly
            value={exportText}
            style={{
              width: "100%", minHeight: 400, background: "rgba(255,255,255,.03)",
              border: `1px solid ${C.border}`, borderRadius: 10, padding: 12,
              color: C.text, fontSize: 11, fontFamily: "monospace", lineHeight: 1.5,
              resize: "vertical",
            }}
          />
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(exportText);
                setCopied(true);
                onToast("✓ Copiado", "success");
                setTimeout(() => setCopied(false), 2500);
              } catch (_) {
                onToast("Não consegui copiar — selecione o texto manualmente", "error");
              }
            }}
            style={{ ...btnBase, width: "100%", marginTop: 10, background: `linear-gradient(135deg,${C.cyan},#0077FF)`, color: "#080D1A", fontSize: 13, padding: "10px 16px" }}
          >{copied ? "✓ Copiado!" : "📋 Copiar tudo"}</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter','Segoe UI',sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: `1px solid ${C.border}` }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800 }}>📁 Auditoria de Dados</div>
          <div style={{ fontSize: 8, color: C.muted, letterSpacing: 1.5 }}>JOGOS SALVOS PRA ACOMPANHAMENTO</div>
        </div>
        <button onClick={onBack} style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", color: C.muted, fontSize: 11, fontWeight: 700 }}>← Voltar</button>
      </div>

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "16px 12px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button
            onClick={() => setTab("pendente")}
            style={{ ...btnBase, flex: 1, background: tab === "pendente" ? C.cyan : "rgba(255,255,255,.04)", color: tab === "pendente" ? "#080D1A" : C.muted }}
          >Pendentes ({pendentes.length})</button>
          <button
            onClick={() => setTab("concluida")}
            style={{ ...btnBase, flex: 1, background: tab === "concluida" ? C.cyan : "rgba(255,255,255,.04)", color: tab === "concluida" ? "#080D1A" : C.muted }}
          >Concluídas ({concluidas.length})</button>
        </div>

        {tab === "concluida" && concluidas.length > 0 && (
          <button
            onClick={buildExport}
            style={{ ...btnBase, width: "100%", marginBottom: 14, background: `linear-gradient(135deg,${C.cyan},#0077FF)`, color: "#080D1A", fontSize: 13, padding: "10px 16px" }}
          >📋 Exportar {concluidas.length} concluída(s)</button>
        )}

        {loading && <div style={{ textAlign: "center", color: C.muted, padding: 40 }}>Carregando...</div>}

        {!loading && list.length === 0 && (
          <div style={{ textAlign: "center", color: C.muted, padding: 40, fontSize: 12 }}>
            {tab === "pendente"
              ? "Nenhum jogo salvo ainda. Busque os dados de um jogo e toque em \"Salvar para Auditoria\"."
              : "Nenhuma auditoria concluída ainda."}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {list.map(e => {
            const expanded = expandedId === e.id;
            return (
              <div key={e.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, padding: 14 }}>
                <div
                  onClick={() => setExpandedId(expanded ? null : e.id)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.homeTeam} vs {e.awayTeam}
                    </div>
                    <div style={{ fontSize: 10, color: C.muted }}>
                      {[e.league, e.date].filter(Boolean).join(" · ") || new Date(e.createdAt).toLocaleDateString("pt-BR")}
                      {e.status === "concluida" && e.realScore ? ` · Real: ${e.realScore}` : ""}
                    </div>
                  </div>
                  <span style={{ color: C.muted, fontSize: 12 }}>{expanded ? "▲" : "▼"}</span>
                </div>

                {expanded && (
                  <div style={{ marginTop: 12, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
                    <textarea
                      readOnly
                      value={e.rawData}
                      style={{
                        width: "100%", minHeight: 160, background: "rgba(255,255,255,.03)",
                        border: `1px solid ${C.border}`, borderRadius: 8, padding: 10,
                        color: C.text, fontSize: 10, fontFamily: "monospace", lineHeight: 1.4,
                        resize: "vertical", marginBottom: 10,
                      }}
                    />

                    {e.status === "pendente" ? (
                      <>
                        <input
                          placeholder="Placar/resultado real (ex: 2-1)"
                          value={scoreInputs[e.id] ?? ""}
                          onChange={ev => setScoreInputs(s => ({ ...s, [e.id]: ev.target.value }))}
                          style={{
                            width: "100%", background: "rgba(255,255,255,.04)", border: `1px solid ${C.border}`,
                            borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 12, marginBottom: 8,
                          }}
                        />
                        <input
                          placeholder="Observações (opcional)"
                          value={notesInputs[e.id] ?? ""}
                          onChange={ev => setNotesInputs(s => ({ ...s, [e.id]: ev.target.value }))}
                          style={{
                            width: "100%", background: "rgba(255,255,255,.04)", border: `1px solid ${C.border}`,
                            borderRadius: 8, padding: "8px 10px", color: C.text, fontSize: 12, marginBottom: 10,
                          }}
                        />
                        <div style={{ display: "flex", gap: 8 }}>
                          <button onClick={() => handleConclude(e.id)} style={{ ...btnBase, flex: 1, background: C.green, color: "#080D1A" }}>✓ Concluir</button>
                          <button onClick={() => handleDelete(e.id)} style={{ ...btnBase, background: "rgba(255,77,77,.15)", color: C.red }}>Excluir</button>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => handleReopen(e.id)} style={{ ...btnBase, flex: 1, background: "rgba(255,255,255,.04)", color: C.muted }}>↺ Reabrir</button>
                        <button onClick={() => handleDelete(e.id)} style={{ ...btnBase, background: "rgba(255,77,77,.15)", color: C.red }}>Excluir</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
