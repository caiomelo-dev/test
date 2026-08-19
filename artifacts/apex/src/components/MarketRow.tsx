import { marketStatus } from "../lib/math";
import { C } from "../lib/constants";

export function MarketRow({ label, score }: { label: string; score: number }) {
  const st = marketStatus(score);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 0",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div style={{ fontSize: 13, color: C.text, flex: 1 }}>{label}</div>
      <div
        style={{
          width: 60,
          height: 3,
          background: C.border,
          borderRadius: 3,
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${score * 10}%`,
            background: st.color,
            borderRadius: 3,
          }}
        />
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: st.color,
          fontFamily: "monospace",
          width: 28,
          textAlign: "right",
          flexShrink: 0,
        }}
      >
        {score.toFixed(1)}
      </div>
      <div
        style={{
          fontSize: 9,
          fontWeight: 700,
          color: st.color,
          width: 76,
          textAlign: "right",
          flexShrink: 0,
        }}
      >
        {st.label}
      </div>
    </div>
  );
}
