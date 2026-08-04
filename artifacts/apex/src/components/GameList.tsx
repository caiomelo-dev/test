import { C } from "../lib/constants";
import type { Game } from "../types";
import { GameForm } from "./GameForm";

const num = (s: string) => parseInt(s) || 0;

export function GameList({
  games,
  color,
  editIdx,
  onToggleEdit,
  onChange,
}: {
  games: Game[];
  color: string;
  editIdx: number | null;
  onToggleEdit: (idx: number) => void;
  onChange: (idx: number, g: Game) => void;
}) {
  const filled = games.map((g, i) => ({ g, i })).filter((x) => x.g.result);

  if (!filled.length) {
    return (
      <div style={{ textAlign: "center", color: C.muted, padding: 24, fontSize: 13 }}>
        Busque e carregue um time para ver os 10 jogos
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {filled.map(({ g, i }) => {
        const gf = num(g.goalsFor1H) + num(g.goalsFor2H);
        const ga = num(g.goalsAgainst1H) + num(g.goalsAgainst2H);
        const rc = g.result === "V" ? C.green : g.result === "E" ? C.yellow : C.red;
        const isOpen = editIdx === i;
        const xgVal = parseFloat(g.xg) || 0;
        return (
          <div
            key={i}
            style={{
              border: `1px solid ${isOpen ? color : C.border}`,
              borderRadius: 10,
              overflow: "hidden",
              background: "rgba(255,255,255,.02)",
            }}
          >
            <button
              onClick={() => onToggleEdit(i)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 9,
                padding: "10px 12px",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: C.text,
                textAlign: "left",
              }}
            >
              <span
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  background: `${rc}22`,
                  color: rc,
                  fontSize: 11,
                  fontWeight: 800,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {g.result}
              </span>
              <span
                style={{
                  fontFamily: "monospace",
                  fontWeight: 700,
                  color: rc,
                  fontSize: 13,
                  width: 34,
                  flexShrink: 0,
                }}
              >
                {gf}-{ga}
              </span>
              <span style={{ fontSize: 13, flexShrink: 0 }}>
                {g.venue === "home" ? "🏠" : "✈️"}
              </span>
              <span
                style={{
                  flex: 1,
                  fontSize: 12,
                  color: C.text,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  minWidth: 0,
                }}
              >
                {g.opponent || "—"}
              </span>
              <span style={{ fontSize: 9, color: C.muted, flexShrink: 0, textAlign: "right", lineHeight: 1.4 }}>
                {g.competition && (
                  <span style={{ display: "block", color }}>{g.competition}</span>
                )}
                {/* Ajuste 10: xG exibido na linha do jogo quando disponível */}
                {xgVal > 0 && (
                  <span style={{ display: "block", color: "#A78BFA", fontSize: 8, fontFamily: "monospace" }}>
                    xG {xgVal.toFixed(2)}
                  </span>
                )}
                {g.date}
              </span>
              <span style={{ color: isOpen ? color : C.muted, fontSize: 12, flexShrink: 0, width: 14, textAlign: "center" }}>
                {isOpen ? "▲" : "✏️"}
              </span>
            </button>
            {isOpen && (
              <div style={{ padding: "6px 12px 14px", borderTop: `1px solid ${C.border}` }}>
                <GameForm game={g} onChange={(ng) => onChange(i, ng)} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
