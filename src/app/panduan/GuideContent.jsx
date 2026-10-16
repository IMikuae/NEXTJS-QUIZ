export default function GuideContent({ guide }) {
  if (!guide) return null;
  return (
    <article className="guide-doc">
      <p className="guide-meta">
        <span className="badge-soft">{guide.minutes} menit baca</span>
        <span className="badge-soft">{guide.updated}</span>
      </p>
      {guide.sections.map((s, i) => (
        <section key={i} className="guide-section">
          {s.heading ? <h2 className="guide-h2">{s.heading}</h2> : null}
          {s.body ? <p className="guide-p">{s.body}</p> : null}
          {s.list ? (
            <ul className="guide-list">
              {s.list.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          ) : null}
          {s.code ? (
            <pre className="guide-code">
              <code>{s.code}</code>
            </pre>
          ) : null}
        </section>
      ))}
    </article>
  );
}
