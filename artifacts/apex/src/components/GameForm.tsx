import { useState } from "react";
import { C } from "../lib/constants";
import type { Game } from "../types";

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "number",
  small,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  small?: boolean;
}) {
  const [foc, setFoc] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <label
        style={{
          fontSize: 9,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          fontWeight: 600,
          color: foc ? C.cyan : C.muted,
        }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder || "—"}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFoc(true)}
        onBlur={() => setFoc(false)}
        style={{
          background: foc ? "rgba(0,229,255,.06)" : "rgba(255,255,255,.03)",
          border: `1px solid ${foc ? C.cyan : C.border}`,
          borderRadius: 8,
          padding: small ? "7px 10px" : "9px 12px",
          color: C.text,
          fontSize: small ? 13 : 14,
          fontFamily: type === "number" ? "monospace" : "inherit",
          outline: "none",
          width: "100%",
          WebkitAppearance: "none",
        }}
      />
    </div>
  );
}

function divider(label: string, color?: string) {
  return (
    <div
      style={{
        fontSize: 9,
        color: color || C.muted,
        letterSpacing: 1.5,
        fontWeight: 700,
        textTransform: "uppercase",
        borderBottom: `1px solid ${C.border}`,
        paddingBottom: 5,
        marginTop: 4,
      }}
    >
      {label}
    </div>
  );
}

export function GameForm({
  game,
  onChange,
}: {
  game: Game;
  onChange: (g: Game) => void;
}) {
  const upd = (f: keyof Game, v: string) => onChange({ ...game, [f]: v });

  const selBtn = (
    f: keyof Game,
    opts: { v: string; label: string; color: string }[]
  ) => (
    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
      {opts.map((o) => (
        <button
          key={o.v}
          onClick={() => upd(f, o.v)}
          style={{
            flex: 1,
            padding: "9px 0",
            borderRadius: 8,
            border: `1px solid ${game[f] === o.v ? o.color : C.border}`,
            background:
              game[f] === o.v ? `${o.color}22` : "rgba(255,255,255,.03)",
            color: game[f] === o.v ? o.color : C.muted,
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {game.date && (
        <div style={{ fontSize: 11, color: C.muted, textAlign: "center" }}>
          📅 {game.date} {game.opponent && `— vs ${game.opponent}`}
        </div>
      )}
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
      >
        <div>
          <label
            style={{
              fontSize: 9,
              color: C.muted,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Resultado
          </label>
          {selBtn("result", [
            { v: "V", label: "Vitória", color: C.green },
            { v: "E", label: "Empate", color: C.yellow },
            { v: "D", label: "Derrota", color: C.red },
          ])}
        </div>
        <div>
          <label
            style={{
              fontSize: 9,
              color: C.muted,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              fontWeight: 600,
            }}
          >
            Mando
          </label>
          {selBtn("venue", [
            { v: "home", label: "🏠 Casa", color: C.cyan },
            { v: "away", label: "✈️ Fora", color: C.purple },
          ])}
        </div>
      </div>
      {divider("⚽ Gols Marcados", C.cyan)}
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
      >
        <Field small label="1º Tempo" value={game.goalsFor1H} onChange={(v) => upd("goalsFor1H", v)} placeholder="0" />
        <Field small label="2º Tempo" value={game.goalsFor2H} onChange={(v) => upd("goalsFor2H", v)} placeholder="0" />
      </div>
      {divider("🛡️ Gols Sofridos")}
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
      >
        <Field small label="1º Tempo" value={game.goalsAgainst1H} onChange={(v) => upd("goalsAgainst1H", v)} placeholder="0" />
        <Field small label="2º Tempo" value={game.goalsAgainst2H} onChange={(v) => upd("goalsAgainst2H", v)} placeholder="0" />
      </div>
      {divider("🎯 Ataque")}
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}
      >
        <Field small label="Finalizações" value={game.shots} onChange={(v) => upd("shots", v)} placeholder="12" />
        <Field small label="No Alvo" value={game.shotsOnTarget} onChange={(v) => upd("shotsOnTarget", v)} placeholder="5" />
        <Field small label="Grandes Ch." value={game.bigChances} onChange={(v) => upd("bigChances", v)} placeholder="3" />
      </div>
      {divider("🚩 Escanteios")}
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
      >
        <Field small label="A Favor" value={game.cornersFor} onChange={(v) => upd("cornersFor", v)} placeholder="6" />
        <Field small label="Contra" value={game.cornersAgainst} onChange={(v) => upd("cornersAgainst", v)} placeholder="4" />
      </div>
      {divider("🟨 Disciplina")}
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}
      >
        <Field small label="Amarelos" value={game.yellows} onChange={(v) => upd("yellows", v)} placeholder="2" />
        <Field small label="Vermelhos" value={game.reds} onChange={(v) => upd("reds", v)} placeholder="0" />
        <Field small label="Faltas" value={game.fouls} onChange={(v) => upd("fouls", v)} placeholder="12" />
      </div>
      {divider("📐 xG / xGA")}
      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
      >
        <Field small label="xG (marcar)" value={game.xg} onChange={(v) => upd("xg", v)} placeholder="1.8" />
        <Field small label="xGA (sofrer)" value={game.xga} onChange={(v) => upd("xga", v)} placeholder="0.9" />
      </div>
      {divider("⏱️ Gols Marcados por Faixa")}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
        {(
          [
            ["g015", "0–15"],
            ["g1630", "16–30"],
            ["g3145", "31–45"],
            ["g4660", "46–60"],
            ["g6175", "61–75"],
            ["g7690", "76–90"],
          ] as [keyof Game, string][]
        ).map(([f, l]) => (
          <Field key={f} small label={l} value={game[f] as string} onChange={(v) => upd(f, v)} placeholder="0" />
        ))}
      </div>
      {divider("⏱️ Gols Sofridos por Faixa")}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
        {(
          [
            ["gc015", "0–15"],
            ["gc1630", "16–30"],
            ["gc3145", "31–45"],
            ["gc4660", "46–60"],
            ["gc6175", "61–75"],
            ["gc7690", "76–90"],
          ] as [keyof Game, string][]
        ).map(([f, l]) => (
          <Field key={f} small label={l} value={game[f] as string} onChange={(v) => upd(f, v)} placeholder="0" />
        ))}
      </div>
    </div>
  );
}
