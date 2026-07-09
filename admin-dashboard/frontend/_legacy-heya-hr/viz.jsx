// Reusable visualization primitives

function Sparkline({ data, color = "ink", height = 36 }) {
  const w = 200;
  const h = height;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const step = w / (data.length - 1);
  const points = data.map((v, i) => [i * step, h - ((v - min) / range) * (h - 4) - 2]);
  const linePath = points.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const areaPath = linePath + ` L${w},${h} L0,${h} Z`;
  return (
    <svg className={"spark " + color} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path className="area" d={areaPath}></path>
      <path className="line" d={linePath}></path>
    </svg>
  );
}

function Donut({ segments, size = 110, thickness = 14 }) {
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--chip)" strokeWidth={thickness} fill="none" />
      {segments.map((s, i) => {
        const len = (s.value / total) * c;
        const el = (
          <circle key={i}
            cx={size / 2} cy={size / 2} r={r}
            stroke={s.color} strokeWidth={thickness} fill="none"
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            strokeLinecap="butt"
          />
        );
        offset += len;
        return el;
      })}
    </svg>
  );
}

function ProgressBar({ value, max = 100, tone = "" }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={"progress " + tone}>
      <i style={{ width: pct + "%" }}></i>
    </div>
  );
}

function StatCard({ label, value, unit, delta, tone, spark, sparkColor }) {
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}{unit && <span className="unit">{unit}</span>}</div>
      {delta && <span className={"stat-delta " + (tone || "flat")}>{delta}</span>}
      {spark && <div className="stat-spark"><Sparkline data={spark} color={sparkColor || "ink"} /></div>}
    </div>
  );
}

window.Sparkline = Sparkline;
window.Donut = Donut;
window.ProgressBar = ProgressBar;
window.StatCard = StatCard;
