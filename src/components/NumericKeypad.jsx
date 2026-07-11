import { useEffect } from 'react';

// Custom in-app numeric keypad. We render (and therefore fully control) the keys,
// so the decimal point has the same surface color and visual weight as the digits
// — unlike the native OS keypad, whose keys a web app cannot restyle.
//
// Phone-style layout (1-2-3 on the top row):
//   1 2 3
//   4 5 6
//   7 8 9
//   . 0 ⌫
//
// Presentation only. The parent owns the value and interprets each key via onKey,
// which receives '0'–'9', '.', or 'back'. onDone dismisses the keypad.

const C = {
  bg: '#0a1628',
  key: '#24406b', // one surface color for every key -> equal visual weight
  text: '#f8fafc',
  green: '#22c55e',
  border: '#2d4a6b',
};

// Row-major, top row first. 'back' renders as ⌫; everything else renders literally.
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'];

const styles = {
  // Transparent full-screen catcher: tapping outside the sheet dismisses.
  backdrop: { position: 'fixed', inset: 0, background: 'transparent', zIndex: 30 },
  sheet: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    background: C.bg,
    borderTop: `1px solid ${C.border}`,
    padding: '6px 8px calc(8px + env(safe-area-inset-bottom))',
    zIndex: 31,
  },
  doneRow: { display: 'flex', justifyContent: 'flex-end' },
  done: {
    background: 'transparent',
    border: 'none',
    color: C.green,
    fontSize: 16,
    fontWeight: 700,
    minHeight: 40,
    padding: '0 12px',
    cursor: 'pointer',
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  key: {
    minHeight: 56,
    border: 'none',
    borderRadius: 12,
    background: C.key,
    color: C.text,
    fontSize: 24,
    fontWeight: 600,
    cursor: 'pointer',
    WebkitTapHighlightColor: 'transparent',
    userSelect: 'none',
  },
};

/**
 * @param {object} props
 * @param {boolean} props.open - whether the keypad is shown
 * @param {(key:string)=>void} props.onKey - called with '0'–'9', '.', or 'back'
 * @param {()=>void} props.onDone - dismiss the keypad
 */
export default function NumericKeypad({ open, onKey, onDone }) {
  // Let a hardware keyboard (desktop / testing) drive it too: digits, '.', and
  // Backspace map to keys; Escape/Enter dismiss.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e) => {
      if (e.key >= '0' && e.key <= '9') onKey(e.key);
      else if (e.key === '.') onKey('.');
      else if (e.key === 'Backspace') onKey('back');
      else if (e.key === 'Escape' || e.key === 'Enter') onDone?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onKey, onDone]);

  if (!open) return null;

  return (
    <>
      <div style={styles.backdrop} onClick={onDone} aria-hidden="true" />
      <div style={styles.sheet} role="group" aria-label="Numeric keypad">
        <div style={styles.doneRow}>
          <button type="button" style={styles.done} onClick={onDone}>
            Done
          </button>
        </div>
        <div style={styles.grid}>
          {KEYS.map((k) => (
            <button
              key={k}
              type="button"
              style={styles.key}
              aria-label={k === 'back' ? 'Delete' : k === '.' ? 'Decimal point' : k}
              // Keep focus on nothing (avoid blurring/scroll jumps on tap).
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onKey(k)}
            >
              {k === 'back' ? '⌫' : k}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
