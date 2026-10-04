// A simple horizontal bar chart made from plain divs.
// Each bar's width is its value divided by the biggest value, as a percentage.
export default function BarChart({ title, data }) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <section className="chart">
      <h2>{title}</h2>
      {data.length === 0 && <p className="empty">No data yet.</p>}
      {data.map((d) => (
        <div className="bar-row" key={d.label}>
          <span className="bar-label">{d.label}</span>
          <div className="bar-track">
            <div className="bar" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          <span className="bar-value">{d.value}</span>
        </div>
      ))}
    </section>
  );
}
