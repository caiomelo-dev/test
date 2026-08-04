import { marketStatus } from "../lib/math";

export function ScoreGauge({ score }: { score: number }) {
  const size = 130;
  const r = size / 2 - 10;
  const circ = 2 * Math.PI * r;
  const { color } = marketStatus(score);
  const label =
    score >= 8.5 ? "PREMIUM" : score >= 7 ? "APROVADO" : score >= 5 ? "INCERTO" : "BAIXO";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#0D1424" strokeWidth={10} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={10}
            strokeDasharray={circ}
            strokeDashoffset={circ - (score / 10) * circ}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(.4,0,.2,1)" }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ fontSize: 26, fontWeight: 900, color, fontFamily: "monospace", lineHeight: 1 }}>
            {score.toFixed(1)}
          </div>
          <div style={{ fontSize: 9, color: "#6B7FA3", marginTop: 2 }}>/10.0</div>
        </div>
      </div>
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color,
          letterSpacing: 2,
          background: `${color}18`,
          border: `1px solid ${color}44`,
          padding: "4px 12px",
          borderRadius: 20,
        }}
      >
        {label}
      </div>
    </div>
  );
}
