// The signature Captain's Log visual treatment: a dark panel with a green left
// accent border and a larger serif face — used for every generated summary, on the
// commentary screens and in Round History. Splits on blank lines into paragraphs.

const style = {
  panel: {
    background: '#162d4a',
    border: '1px solid #2d4a6b',
    borderLeft: '4px solid #22c55e',
    borderRadius: 12,
    padding: '16px 18px',
    maxHeight: 340,
    overflowY: 'auto',
  },
  para: {
    margin: '0 0 12px',
    color: '#f1f5f9',
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: 17,
    lineHeight: 1.6,
  },
};

export default function CaptainsLogText({ text }) {
  const paragraphs = String(text ?? '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div style={style.panel} className="captains-log-text">
      {paragraphs.map((p, i) => (
        <p key={i} style={{ ...style.para, marginBottom: i === paragraphs.length - 1 ? 0 : 12 }}>
          {p}
        </p>
      ))}
    </div>
  );
}
