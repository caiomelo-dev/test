import { useState } from "react";
import { C } from "../lib/constants";

const BANKROLL_KEY = "apex_bankroll";

interface BankrollCardProps {
  icj: number;
}

export function BankrollCard({ icj }: BankrollCardProps) {
  const [bankroll, setBankroll] = useState<number>(() => {
    try { return parseFloat(localStorage.getItem(BANKROLL_KEY) ?? "0") || 0; } catch { return 0; }
  });
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");

  function saveBankroll(val: number) {
    setBankroll(val);
    try { localStorage.setItem(BANKROLL_KEY, String(val)); } catch (_) {}
    setEditing(false);
  }

  // Stake sugerida com base no ICJ (MGAA+)
  const stakePercent = icj >= 80 ? 2 : icj >= 70 ? 1.5 : icj >= 60 ? 1 : 0;
  const stakeValue = bankroll > 0 && stakePercent > 0
    ? Math.max(0.5, (bankroll * stakePercent) / 100)
    : null;

  const icjColor = icj >= 80 ? C.green : icj >= 70 ? C.cyan : icj >= 60 ? C.yellow : C.red;

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.cyan, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
        💰 Gestão de Banca (MGAA+)
      </div>

      {/* Bankroll config */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: C.muted, flex: 1 }}>Banca atual:</div>
        {editing ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="number"
              autoFocus
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="0.00"
              style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${C.cyan}`, borderRadius: 8, padding: "7px 10px", color: C.text, fontSize: 13, fontFamily: "monospace", outline: "none", width: 100 }}
            />
            <button
              onClick={() => { const v = parseFloat(input); if (v >= 0) saveBankroll(v); }}
              style={{ background: `linear-gradient(135deg,${C.cyan},#0077FF)`, border: "none", borderRadius: 8, padding: "7px 14px", cursor: "pointer", color: "#080D1A", fontSize: 12, fontWeight: 700 }}
            >Salvar</button>
            <button
              onClick={() => setEditing(false)}
              style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${C.border}`, borderRadius: 8, padding: "7px 12px", cursor: "pointer", color: C.muted, fontSize: 12 }}
            >✕</button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 800, fontFamily: "monospace", color: C.text }}>
              {bankroll > 0 ? `R$ ${bankroll.toFixed(2)}` : "—"}
            </span>
            <button
              onClick={() => { setInput(bankroll > 0 ? String(bankroll) : ""); setEditing(true); }}
              style={{ background: "rgba(255,255,255,.04)", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer", color: C.muted, fontSize: 10 }}
            >✏️ Editar</button>
          </div>
        )}
      </div>

      {/* Stake recommendation */}
      <div style={{ background: stakePercent > 0 ? `${icjColor}0e` : "rgba(255,255,255,.03)", border: `1px solid ${stakePercent > 0 ? icjColor + "44" : C.border}`, borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: C.muted }}>ICJ do jogo</div>
          <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "monospace", color: icjColor }}>{icj.toFixed(1)}</div>
        </div>

        {stakePercent > 0 ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <div style={{ fontSize: 11, color: C.muted }}>Stake sugerida</div>
              <div style={{ fontSize: 11, color: icjColor, fontWeight: 700 }}>{stakePercent}% da banca</div>
            </div>
            {stakeValue !== null && bankroll > 0 ? (
              <div style={{ textAlign: "center", marginTop: 10, background: `${icjColor}18`, border: `1px solid ${icjColor}44`, borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ fontSize: 10, color: icjColor, letterSpacing: 1.5, fontWeight: 700, marginBottom: 4 }}>APOSTAR NESTE JOGO</div>
                <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "monospace", color: icjColor }}>R$ {stakeValue.toFixed(2)}</div>
                <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>Mínimo: R$ 0,50 · Máximo diário: 5% (R$ {(bankroll * 0.05).toFixed(2)})</div>
              </div>
            ) : (
              <div style={{ fontSize: 11, color: C.muted, textAlign: "center", marginTop: 8 }}>
                Configure sua banca para ver o valor sugerido
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "8px 0" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.red }}>❌ Não recomendado</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>ICJ abaixo de 60 — jogo fora do método MGAA+</div>
          </div>
        )}
      </div>

      <div style={{ fontSize: 10, color: C.muted, marginTop: 10, lineHeight: 1.5 }}>
        Regras: ICJ ≥ 80 → 2% · ICJ 70–79 → 1,5% · ICJ 60–69 → 1% · ICJ &lt; 60 → não recomendado.<br />
        Limite diário recomendado: 5% da banca total.
      </div>
    </div>
  );
}
