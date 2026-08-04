import { useState, useEffect, useCallback } from "react";
import { C } from "../lib/constants";
import {
  fetchAccuracy,
  fetchPending,
  fetchSettled,
  registerAuditResult,
  updateAuditEntry,
  deleteAuditEntry,
  deleteSettledEntry,
  deleteAllSettled,
  exportSettledToCSV,
  MARKET_LABELS,
  MARKET_ORDER,
  type AccuracyReport,
  type AuditEntry,
  type ExactScoreAccuracy,
} from "../lib/auditApi";

const THRESHOLDS = [50, 60, 70, 80];

// ─── Shared helpers ────────────────────────────────────────────────────────────

function brierColor(brier: string | null): string {
  if (brier === null) return C.muted;
  const b = parseFloat(brier);
  if (b <= 0.15) return C.green;
  if (b <= 0.25) return C.yellow;
  return C.red;
}

function accuracyColor(pct: string | null): string {
  if (pct === null) return C.muted;
  const p = parseFloat(pct);
  if (p >= 70) return C.green;
  if (p >= 55) return C.yellow;
  return C.red;
}

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,.04)",
  border: `1px solid ${C.border}`,
  borderRadius: 8,
  padding: "8px 10px",
  color: C.text,
  fontSize: 13,
  fontFamily: "monospace",
  textAlign: "center",
  outline: "none",
  width: 60,
};

const smallInputStyle: React.CSSProperties = {
  ...inputStyle,
  width: 52,
  fontSize: 12,
};

// ─── AccuracyTab ──────────────────────────────────────────────────────────────

function ExactScoreRow({ data }: { data: ExactScoreAccuracy }) {
  const ac = accuracyColor(data.taxaDeAcertoPct);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        background: `rgba(0,229,255,.06)`,
        borderRadius: 9,
        padding: "11px 12px",
        border: `1px solid rgba(0,229,255,.25)`,
        marginBottom: 2,
      }}
    >
      <span style={{ flex: 1, fontSize: 12, color: "#00E5FF", fontWeight: 700 }}>🎯 Placar Exato</span>
      <span style={{ width: 70, textAlign: "right", fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: ac }}>
        {data.taxaDeAcertoPct !== null ? `${data.taxaDeAcertoPct}%` : "—"}
      </span>
      <span style={{ width: 56, textAlign: "right", fontSize: 11, fontFamily: "monospace", color: "#6B7280" }}>
        {data.acertos}/{data.totalComPlacar}
      </span>
      <span style={{ width: 64, textAlign: "right", fontSize: 11, color: "#6B7280" }}>—</span>
    </div>
  );
}

function AccuracyTab({ onToast }: { onToast: (m: string, t?: string) => void }) {
  const [threshold, setThreshold] = useState(60);
  const [report, setReport] = useState<AccuracyReport | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (t: number) => {
    setLoading(true);
    try {
      setReport(await fetchAccuracy(t));
    } catch (e: unknown) {
      onToast("Erro ao carregar taxa de acerto: " + (e instanceof Error ? e.message : ""), "error");
    }
    setLoading(false);
  }, [onToast]);

  useEffect(() => { load(threshold); }, [threshold, load]);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {THRESHOLDS.map((t) => (
          <button
            key={t}
            onClick={() => setThreshold(t)}
            style={{
              flex: 1,
              padding: "9px 0",
              borderRadius: 9,
              border: `1px solid ${threshold === t ? C.cyan : C.border}`,
              background: threshold === t ? `${C.cyan}18` : "rgba(255,255,255,.03)",
              color: threshold === t ? C.cyan : C.muted,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ≥ {t}%
          </button>
        ))}
      </div>

      <div
        style={{
          background: "rgba(0,210,255,.06)",
          border: `1px solid ${C.cyan}33`,
          borderRadius: 10,
          padding: "10px 14px",
          fontSize: 11,
          color: C.muted,
          marginBottom: 14,
          lineHeight: 1.5,
        }}
      >
        ✓ A auditoria registra as <strong style={{ color: C.text }}>predições exibidas</strong> na
        análise (mesmo modelo que você vê). Registre o placar real em <strong style={{ color: C.text }}>Pendentes</strong> para
        fechar o ciclo e acompanhar a taxa de acerto.
      </div>

      {report?.avisoMetodologico && (
        <div
          style={{
            background: "rgba(255,184,0,.08)",
            border: `1px solid ${C.yellow}44`,
            borderRadius: 10,
            padding: "11px 14px",
            fontSize: 12,
            color: C.yellow,
            marginBottom: 14,
            lineHeight: 1.5,
          }}
        >
          {report.avisoMetodologico}
        </div>
      )}

      {report && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          {[
            ["No banco", report.totalJogosNoBanco],
            ["Com resultado", report.totalJogosComResultado],
            ["Pendentes", report.totalJogosPendentes],
          ].map(([l, v]) => (
            <div key={l} style={{ flex: 1, background: "rgba(255,255,255,.03)", borderRadius: 10, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: C.cyan, fontFamily: "monospace" }}>{v}</div>
              <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
      )}

      {loading && <div style={{ textAlign: "center", color: C.muted, padding: 20, fontSize: 13 }}>Carregando...</div>}

      {report && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700, padding: "0 12px 4px" }}>
            <span style={{ flex: 1 }}>Mercado</span>
            <span style={{ width: 70, textAlign: "right" }}>Acerto</span>
            <span style={{ width: 56, textAlign: "right" }}>Amostra</span>
            <span style={{ width: 64, textAlign: "right" }}>Brier</span>
          </div>
          {report.placareExato && <ExactScoreRow data={report.placareExato} />}
          {MARKET_ORDER.map((m) => {
            const row = report.porMercado[m];
            const ac = accuracyColor(row.taxaDeAcertoPct);
            return (
              <div
                key={m}
                style={{
                  display: "flex",
                  alignItems: "center",
                  background: "rgba(255,255,255,.03)",
                  borderRadius: 9,
                  padding: "11px 12px",
                  border: `1px solid ${C.border}`,
                }}
              >
                <span style={{ flex: 1, fontSize: 12, color: C.text, fontWeight: 600 }}>{MARKET_LABELS[m]}</span>
                <span style={{ width: 70, textAlign: "right", fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: ac }}>
                  {row.taxaDeAcertoPct !== null ? `${row.taxaDeAcertoPct}%` : "—"}
                </span>
                <span style={{ width: 56, textAlign: "right", fontSize: 11, fontFamily: "monospace", color: C.muted }}>
                  {row.acertosComAltaConfianca}/{row.vezesComAltaConfianca}
                </span>
                <span style={{ width: 64, textAlign: "right", fontSize: 12, fontFamily: "monospace", color: brierColor(row.brierScore) }}>
                  {row.brierScore ?? "—"}
                </span>
              </div>
            );
          })}
          <div style={{ fontSize: 10, color: C.muted, padding: "8px 4px 0", lineHeight: 1.5 }}>
            <strong style={{ color: C.text }}>Acerto</strong> = % de acertos quando o modelo deu confiança ≥ {threshold}%.
            {" "}<strong style={{ color: C.text }}>Brier Score</strong> (0 a 1, menor é melhor) mede a calibração sobre todos os jogos com resultado.
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PendingTab ────────────────────────────────────────────────────────────────

interface PendingInput { h: string; a: string; cards: string; corners: string; }

function PendingTab({ onToast }: { onToast: (m: string, t?: string) => void }) {
  const [pending, setPending] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState<Record<string, PendingInput>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setPending(await fetchPending());
    } catch (e: unknown) {
      onToast("Erro ao carregar pendentes: " + (e instanceof Error ? e.message : ""), "error");
    }
    setLoading(false);
  }, [onToast]);

  useEffect(() => { load(); }, [load]);

  function getInp(id: string): PendingInput {
    return inputs[id] ?? { h: "", a: "", cards: "", corners: "" };
  }

  function setInp(id: string, patch: Partial<PendingInput>) {
    setInputs((p) => ({ ...p, [id]: { ...getInp(id), ...patch } }));
  }

  async function submit(id: string) {
    const inp = getInp(id);
    if (inp.h === "" || inp.a === "") { onToast("Preencha os dois placares", "error"); return; }
    const h = parseInt(inp.h);
    const a = parseInt(inp.a);
    if (isNaN(h) || isNaN(a) || h < 0 || a < 0) { onToast("Placar inválido", "error"); return; }
    const cards = inp.cards !== "" ? parseInt(inp.cards) : undefined;
    const corners = inp.corners !== "" ? parseInt(inp.corners) : undefined;
    if (cards !== undefined && (isNaN(cards) || cards < 0)) { onToast("Cartões inválido", "error"); return; }
    if (corners !== undefined && (isNaN(corners) || corners < 0)) { onToast("Escanteios inválido", "error"); return; }
    setSaving(id);
    try {
      await registerAuditResult(id, h, a, cards, corners);
      onToast("✓ Resultado registrado", "success");
      setPending((prev) => prev.filter((e) => e.id !== id));
    } catch (e: unknown) {
      onToast("Erro: " + (e instanceof Error ? e.message : ""), "error");
    }
    setSaving(null);
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await deleteAuditEntry(id);
      setPending((prev) => prev.filter((e) => e.id !== id));
      onToast("Jogo removido da auditoria", "success");
    } catch (e: unknown) {
      onToast("Erro ao remover: " + (e instanceof Error ? e.message : ""), "error");
    }
    setDeleting(null);
    setConfirmDelete(null);
  }

  if (loading) return <div style={{ textAlign: "center", color: C.muted, padding: 24, fontSize: 13 }}>Carregando...</div>;

  if (!pending.length) {
    return (
      <div style={{ textAlign: "center", color: C.muted, padding: 32, fontSize: 13 }}>
        Nenhum jogo pendente. Toda análise feita no APEX aparece aqui para você registrar o placar real depois do jogo.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {pending.map((e) => {
        const inp = getInp(e.id);
        const isConfirming = confirmDelete === e.id;
        const isDeleting = deleting === e.id;
        return (
          <div key={e.id} style={{ background: "rgba(255,255,255,.03)", borderRadius: 10, padding: "12px 14px", border: `1px solid ${isConfirming ? "#FF4D4D44" : C.border}` }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 3 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                {e.homeTeam} <span style={{ color: C.muted, fontSize: 11 }}>vs</span> {e.awayTeam}
              </div>
              {!isConfirming ? (
                <button onClick={() => setConfirmDelete(e.id)} title="Remover" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 14, padding: "0 0 0 8px" }}>🗑</button>
              ) : (
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={{ fontSize: 10, color: C.red }}>Remover?</span>
                  <button onClick={() => handleDelete(e.id)} disabled={isDeleting} style={{ background: C.red, border: "none", borderRadius: 6, padding: "3px 8px", color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>{isDeleting ? "..." : "Sim"}</button>
                  <button onClick={() => setConfirmDelete(null)} style={{ background: "rgba(255,255,255,.08)", border: "none", borderRadius: 6, padding: "3px 8px", color: C.muted, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Não</button>
                </div>
              )}
            </div>

            {/* League / date / predicted score */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 10, color: C.muted }}>{e.league} · {e.matchDate}</span>
              {e.predictedExactScore && (
                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "monospace", color: "#00E5FF", background: "rgba(0,229,255,.10)", border: "1px solid rgba(0,229,255,.25)", borderRadius: 6, padding: "2px 7px" }}>
                  🎯 {e.predictedExactScore}
                </span>
              )}
            </div>

            {/* Goals row */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <input type="number" min={0} value={inp.h} placeholder="Casa" onChange={(ev) => setInp(e.id, { h: ev.target.value })} style={inputStyle} />
              <span style={{ color: C.muted, fontWeight: 700 }}>×</span>
              <input type="number" min={0} value={inp.a} placeholder="Fora" onChange={(ev) => setInp(e.id, { a: ev.target.value })} style={inputStyle} />
              <button
                onClick={() => submit(e.id)}
                disabled={saving === e.id}
                style={{ flex: 1, background: saving === e.id ? "rgba(255,255,255,.05)" : `linear-gradient(135deg,${C.cyan},#0077FF)`, border: "none", borderRadius: 8, padding: "10px 14px", color: "#080D1A", fontSize: 13, fontWeight: 700, cursor: saving === e.id ? "default" : "pointer", opacity: saving === e.id ? 0.5 : 1 }}
              >
                {saving === e.id ? "..." : "Registrar"}
              </button>
            </div>

            {/* Cards + Corners row */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: C.muted, width: 20 }}>🟨</span>
              <input type="number" min={0} value={inp.cards} placeholder="Cartões" onChange={(ev) => setInp(e.id, { cards: ev.target.value })} style={smallInputStyle} title="Total de cartões (opcional)" />
              <span style={{ fontSize: 10, color: C.muted, flex: 1 }}>cartões</span>
              <span style={{ fontSize: 10, color: C.muted, width: 20 }}>📐</span>
              <input type="number" min={0} value={inp.corners} placeholder="Esc." onChange={(ev) => setInp(e.id, { corners: ev.target.value })} style={smallInputStyle} title="Total de escanteios (opcional)" />
              <span style={{ fontSize: 10, color: C.muted }}>escanteios</span>
            </div>
          </div>
        );
      })}
      <div style={{ fontSize: 10, color: C.muted, padding: "6px 4px 0", lineHeight: 1.5 }}>
        Cartões e escanteios são opcionais mas melhoram a análise desses mercados.
      </div>
    </div>
  );
}

// ─── HistoryTab ───────────────────────────────────────────────────────────────

interface EditInput { h: string; a: string; cards: string; corners: string; }

function HistoryTab({ onToast }: { onToast: (m: string, t?: string) => void }) {
  const [settled, setSettled] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editInputs, setEditInputs] = useState<EditInput>({ h: "", a: "", cards: "", corners: "" });
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setSettled(await fetchSettled()); } catch { setSettled([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openEdit(e: AuditEntry) {
    const r = e.actualResult;
    setEditId(e.id);
    setEditInputs({
      h: r ? String(r.homeGoals) : "",
      a: r ? String(r.awayGoals) : "",
      cards: r?.actualCards !== undefined ? String(r.actualCards) : "",
      corners: r?.actualCorners !== undefined ? String(r.actualCorners) : "",
    });
  }

  async function saveEdit() {
    if (!editId) return;
    const h = parseInt(editInputs.h);
    const a = parseInt(editInputs.a);
    if (isNaN(h) || isNaN(a) || h < 0 || a < 0) { onToast("Placar inválido", "error"); return; }
    const cards = editInputs.cards !== "" ? parseInt(editInputs.cards) : undefined;
    const corners = editInputs.corners !== "" ? parseInt(editInputs.corners) : undefined;
    setSaving(true);
    try {
      await updateAuditEntry(editId, h, a, cards, corners);
      onToast("✓ Auditoria atualizada", "success");
      setEditId(null);
      await load();
    } catch (e: unknown) {
      onToast("Erro ao editar: " + (e instanceof Error ? e.message : ""), "error");
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await deleteSettledEntry(id);
      setSettled((prev) => prev.filter((e) => e.id !== id));
      onToast("Auditoria removida", "success");
    } catch (e: unknown) {
      onToast("Erro ao remover: " + (e instanceof Error ? e.message : ""), "error");
    }
    setDeleting(null);
    setConfirmDeleteId(null);
  }

  async function handleDeleteAll() {
    setDeleting("all");
    try {
      const n = await deleteAllSettled();
      setSettled([]);
      onToast(`${n} auditoria${n !== 1 ? "s" : ""} removida${n !== 1 ? "s" : ""}`, "success");
    } catch (e: unknown) {
      onToast("Erro ao remover: " + (e instanceof Error ? e.message : ""), "error");
    }
    setDeleting(null);
    setConfirmDeleteAll(false);
  }

  function handleExport() {
    if (!settled.length) { onToast("Nenhuma auditoria para exportar", "error"); return; }
    setExporting(true);
    try {
      exportSettledToCSV(settled);
      onToast(`✓ CSV exportado (${settled.length} jogos)`, "success");
    } catch (e: unknown) {
      onToast("Erro ao exportar: " + (e instanceof Error ? e.message : ""), "error");
    }
    setExporting(false);
  }

  if (loading) return <div style={{ textAlign: "center", color: C.muted, padding: 24, fontSize: 13 }}>Carregando histórico...</div>;

  if (!settled.length) {
    return (
      <div style={{ textAlign: "center", color: C.muted, padding: 32, fontSize: 13 }}>
        Nenhum jogo encerrado ainda. Registre resultados nos <strong style={{ color: C.text }}>Pendentes</strong> para eles aparecerem aqui.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 6, marginBottom: 2 }}>
        <button
          onClick={handleExport}
          disabled={exporting}
          style={{ flex: 1, background: "rgba(0,229,255,.10)", border: `1px solid ${C.cyan}44`, borderRadius: 9, padding: "9px 0", color: C.cyan, fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: exporting ? 0.5 : 1 }}
        >
          {exporting ? "Exportando..." : "⬇ Exportar CSV"}
        </button>
        {!confirmDeleteAll ? (
          <button
            onClick={() => setConfirmDeleteAll(true)}
            style={{ background: "rgba(255,77,77,.08)", border: `1px solid rgba(255,77,77,.3)`, borderRadius: 9, padding: "9px 14px", color: C.red, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
          >
            🗑 Apagar tudo
          </button>
        ) : (
          <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: C.red }}>Apagar {settled.length} jogos?</span>
            <button onClick={handleDeleteAll} disabled={deleting === "all"} style={{ background: C.red, border: "none", borderRadius: 6, padding: "5px 10px", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{deleting === "all" ? "..." : "Sim"}</button>
            <button onClick={() => setConfirmDeleteAll(false)} style={{ background: "rgba(255,255,255,.08)", border: "none", borderRadius: 6, padding: "5px 10px", color: C.muted, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Não</button>
          </div>
        )}
      </div>

      {/* Entry cards */}
      {settled.map((e) => {
        const r = e.actualResult;
        const score = r ? `${r.homeGoals} – ${r.awayGoals}` : "—";
        const exactHit = r?.exactScoreHit ?? false;
        const markets = MARKET_ORDER.filter((m) => e.predictions[m] != null);
        const isEditing = editId === e.id;
        const isConfirmingDelete = confirmDeleteId === e.id;

        return (
          <div
            key={e.id}
            style={{
              background: "rgba(255,255,255,.03)",
              borderRadius: 10,
              padding: "12px 14px",
              border: `1px solid ${isEditing ? `${C.cyan}55` : isConfirmingDelete ? "rgba(255,77,77,.3)" : C.border}`,
            }}
          >
            {/* Header row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                {e.homeTeam} <span style={{ color: C.muted, fontSize: 11 }}>vs</span> {e.awayTeam}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {r && !isEditing && (
                  <span style={{ fontSize: 15, fontWeight: 900, fontFamily: "monospace", color: "#F0F4FF", background: "rgba(255,255,255,.07)", borderRadius: 8, padding: "3px 10px", letterSpacing: 1 }}>
                    {score}
                  </span>
                )}
                {!isEditing && !isConfirmingDelete && (
                  <>
                    <button onClick={() => openEdit(e)} title="Editar" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 13, padding: "2px 4px" }}>✏️</button>
                    <button onClick={() => setConfirmDeleteId(e.id)} title="Excluir" style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 13, padding: "2px 4px" }}>🗑</button>
                  </>
                )}
                {isConfirmingDelete && (
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <span style={{ fontSize: 10, color: C.red }}>Excluir?</span>
                    <button onClick={() => handleDelete(e.id)} disabled={deleting === e.id} style={{ background: C.red, border: "none", borderRadius: 6, padding: "3px 8px", color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>{deleting === e.id ? "..." : "Sim"}</button>
                    <button onClick={() => setConfirmDeleteId(null)} style={{ background: "rgba(255,255,255,.08)", border: "none", borderRadius: 6, padding: "3px 8px", color: C.muted, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Não</button>
                  </div>
                )}
              </div>
            </div>

            {/* Sub-header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: C.muted }}>{e.league} · {e.matchDate}</span>
              {e.predictedExactScore && !isEditing && (
                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: "monospace", color: exactHit ? "#4ADE80" : C.muted, background: exactHit ? "rgba(74,222,128,.12)" : "rgba(255,255,255,.06)", border: `1px solid ${exactHit ? "rgba(74,222,128,.35)" : C.border}`, borderRadius: 6, padding: "2px 7px" }}>
                  {exactHit ? "🎯" : "✗"} Placar exato: {e.predictedExactScore}
                </span>
              )}
            </div>

            {/* Cards / corners display (when not editing) */}
            {!isEditing && r && (r.actualCards !== undefined || r.actualCorners !== undefined) && (
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                {r.actualCards !== undefined && (
                  <span style={{ fontSize: 10, color: C.muted, background: "rgba(255,255,255,.04)", border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 8px" }}>
                    🟨 {r.actualCards} cartões
                  </span>
                )}
                {r.actualCorners !== undefined && (
                  <span style={{ fontSize: 10, color: C.muted, background: "rgba(255,255,255,.04)", border: `1px solid ${C.border}`, borderRadius: 6, padding: "2px 8px" }}>
                    📐 {r.actualCorners} escanteios
                  </span>
                )}
              </div>
            )}

            {/* Edit form */}
            {isEditing && (
              <div style={{ background: "rgba(0,229,255,.05)", border: `1px solid ${C.cyan}33`, borderRadius: 9, padding: "10px 12px", marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: C.cyan, fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>EDITAR RESULTADO</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <input type="number" min={0} value={editInputs.h} placeholder="Casa" onChange={(ev) => setEditInputs((p) => ({ ...p, h: ev.target.value }))} style={inputStyle} />
                  <span style={{ color: C.muted, fontWeight: 700 }}>×</span>
                  <input type="number" min={0} value={editInputs.a} placeholder="Fora" onChange={(ev) => setEditInputs((p) => ({ ...p, a: ev.target.value }))} style={inputStyle} />
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <span style={{ fontSize: 10, color: C.muted }}>🟨</span>
                  <input type="number" min={0} value={editInputs.cards} placeholder="Cartões" onChange={(ev) => setEditInputs((p) => ({ ...p, cards: ev.target.value }))} style={smallInputStyle} />
                  <span style={{ fontSize: 10, color: C.muted, flex: 1 }}>cartões</span>
                  <span style={{ fontSize: 10, color: C.muted }}>📐</span>
                  <input type="number" min={0} value={editInputs.corners} placeholder="Esc." onChange={(ev) => setEditInputs((p) => ({ ...p, corners: ev.target.value }))} style={smallInputStyle} />
                  <span style={{ fontSize: 10, color: C.muted }}>escanteios</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={saveEdit} disabled={saving} style={{ flex: 1, background: `linear-gradient(135deg,${C.cyan},#0077FF)`, border: "none", borderRadius: 8, padding: "9px 0", color: "#080D1A", fontSize: 12, fontWeight: 700, cursor: saving ? "default" : "pointer", opacity: saving ? 0.5 : 1 }}>
                    {saving ? "..." : "Salvar"}
                  </button>
                  <button onClick={() => setEditId(null)} style={{ background: "rgba(255,255,255,.06)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 14px", color: C.muted, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* Market outcomes */}
            {markets.length > 0 && !isEditing && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {markets.map((m) => {
                  const prob = e.predictions[m];
                  const hit = r?.outcomes[m];
                  const probStr = prob != null ? `${Math.round(prob * 100)}%` : "—";
                  return (
                    <span
                      key={m}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "3px 8px",
                        borderRadius: 6,
                        background: hit === true ? "rgba(74,222,128,.12)" : hit === false ? "rgba(255,77,77,.12)" : "rgba(255,255,255,.06)",
                        color: hit === true ? "#4ADE80" : hit === false ? "#FF4D4D" : C.muted,
                        border: `1px solid ${hit === true ? "rgba(74,222,128,.3)" : hit === false ? "rgba(255,77,77,.3)" : C.border}`,
                      }}
                    >
                      {hit === true ? "✓" : hit === false ? "✗" : "?"} {MARKET_LABELS[m]} ({probStr})
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── AuditScreen (root) ────────────────────────────────────────────────────────

export function AuditScreen({ onToast }: { onToast: (m: string, t?: string) => void }) {
  const [tab, setTab] = useState<"accuracy" | "pending" | "history">("accuracy");

  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {(
          [
            ["accuracy", "📈 Acerto"],
            ["pending", "⏳ Pendentes"],
            ["history", "📜 Histórico"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              flex: 1,
              padding: "11px 0",
              borderRadius: 10,
              border: `1px solid ${tab === k ? C.cyan : C.border}`,
              background: tab === k ? `${C.cyan}18` : "rgba(255,255,255,.03)",
              color: tab === k ? C.cyan : C.muted,
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "accuracy" ? (
        <AccuracyTab onToast={onToast} />
      ) : tab === "pending" ? (
        <PendingTab onToast={onToast} />
      ) : (
        <HistoryTab onToast={onToast} />
      )}
    </div>
  );
}
