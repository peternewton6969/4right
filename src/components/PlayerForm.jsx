import { useState } from 'react';
import AppHeader from './AppChrome.jsx';
import NumericKeypad from './NumericKeypad.jsx';
import { savePlayer, deletePlayer, getPlayerById } from '../storage/store.js';

// Screen: Add / Edit Player. Reached from the Players roster via /players/new
// (new mode) or /players/:id/edit (edit mode). Writes through storage/store.js's
// validated savePlayer/deletePlayer. Inline styles keep it self-contained.

const C = {
  bg: '#0a1628',
  surface: '#1e3a5f',
  green: '#22c55e',
  text: '#f8fafc',
  dim: '#94a3b8',
  danger: '#ef4444',
  border: '#2d4a6b',
};

const NICKNAME_MAX = 5;

const styles = {
  main: {
    background: C.bg,
    minHeight: '100%',
    padding: `16px 16px max(24px, env(safe-area-inset-bottom))`,
  },
  fields: { display: 'grid', gap: 16 },
  label: {
    display: 'block',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: C.dim,
    marginBottom: 6,
  },
  input: {
    width: '100%',
    minHeight: 56,
    padding: 16,
    fontSize: 18,
    color: C.text,
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 12,
    outline: 'none',
  },
  helperRow: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: 6,
    minHeight: 16,
  },
  error: { fontSize: 12, color: C.danger },
  count: { fontSize: 12, color: C.dim, marginLeft: 'auto' },
  actions: { display: 'grid', gap: 12, marginTop: 24 },
  save: {
    width: '100%',
    minHeight: 56,
    border: 'none',
    borderRadius: 12,
    background: C.green,
    color: '#0a1628',
    fontSize: 18,
    fontWeight: 700,
    cursor: 'pointer',
  },
  delete: {
    width: '100%',
    minHeight: 56,
    borderRadius: 12,
    background: 'transparent',
    border: `1px solid ${C.danger}`,
    color: C.danger,
    fontSize: 18,
    fontWeight: 700,
    cursor: 'pointer',
  },
};

/** Only accept up to 2 integer digits and one optional decimal (0.0 – 54.0 range). */
function acceptHandicapInput(raw) {
  return /^\d{0,2}(\.\d?)?$/.test(raw);
}

/** Parse a handicap string to a number in [0, 54], or null if invalid. */
function parseHandicap(raw) {
  const trimmed = String(raw).trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 54) return null;
  return n;
}

/**
 * One labeled input with focus/error styling and an optional helper slot.
 *
 * When `readOnly` + `onTap` are supplied the field is driven by our custom
 * NumericKeypad instead of a native keyboard: inputMode "none" suppresses the OS
 * keypad, and `active` keeps the focus ring lit while the keypad is open (the
 * input itself may not hold DOM focus once the user taps keypad keys).
 */
function Field({
  label,
  value,
  onChange,
  error,
  inputMode,
  placeholder,
  count,
  maxLength,
  readOnly = false,
  onTap,
  active = false,
}) {
  const [focused, setFocused] = useState(false);
  const lit = active || focused;
  const borderColor = error ? C.danger : lit ? C.green : C.border;
  return (
    <div>
      <label style={styles.label}>{label}</label>
      <input
        style={{ ...styles.input, border: `1px solid ${borderColor}`, caretColor: C.green }}
        type="text"
        value={value}
        inputMode={readOnly ? 'none' : inputMode}
        placeholder={placeholder}
        maxLength={maxLength}
        readOnly={readOnly}
        autoComplete="off"
        autoCapitalize="words"
        onFocus={() => {
          setFocused(true);
          onTap?.();
        }}
        onBlur={() => setFocused(false)}
        onClick={onTap}
        onChange={(e) => onChange(e.target.value)}
      />
      <div style={styles.helperRow}>
        {error ? <span style={styles.error}>{error}</span> : <span />}
        {count != null && <span style={styles.count}>{count}</span>}
      </div>
    </div>
  );
}

export default function PlayerForm({ navigate, mode, playerId }) {
  const editing = mode === 'edit';
  const existing = editing && playerId ? getPlayerById(playerId) : null;

  // An edit route whose player no longer exists: bounce back to the roster.
  if (editing && !existing) {
    navigate('players');
    return null;
  }

  const [firstName, setFirstName] = useState(existing?.firstName ?? '');
  const [lastName, setLastName] = useState(existing?.lastName ?? '');
  const [nickname, setNickname] = useState(existing?.nickname ?? '');
  const [handicap, setHandicap] = useState(
    existing?.handicapIndex != null ? Number(existing.handicapIndex).toFixed(1) : '',
  );
  const [errors, setErrors] = useState({});
  const [keypadOpen, setKeypadOpen] = useState(false);

  const back = () => navigate('players');

  function validate() {
    const next = {};
    if (firstName.trim() === '') next.firstName = 'First name is required';
    if (lastName.trim() === '') next.lastName = 'Last name is required';
    if (nickname.length > NICKNAME_MAX) next.nickname = `Max ${NICKNAME_MAX} characters`;
    if (parseHandicap(handicap) === null) {
      next.handicap = 'Enter a handicap index from 0.0 to 54.0';
    }
    return next;
  }

  function handleSave() {
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    savePlayer({
      id: existing?.id, // undefined for new -> savePlayer generates an id
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      nickname: nickname.trim(),
      handicapIndex: Number(parseHandicap(handicap).toFixed(1)),
    });
    navigate('players');
  }

  function handleDelete() {
    if (!existing) return;
    const label = existing.firstName || existing.nickname || 'this player';
    // eslint-disable-next-line no-alert
    if (window.confirm(`Delete ${label}? This cannot be undone.`)) {
      deletePlayer(existing.id);
      navigate('players');
    }
  }

  function handleNickname(value) {
    setNickname(value.slice(0, NICKNAME_MAX));
  }

  function handleHandicap(value) {
    if (value === '' || acceptHandicapInput(value)) setHandicap(value);
  }

  // Custom-keypad key handler: 'back' deletes the last char; a digit or '.' is
  // appended only if the result still satisfies the handicap input rule.
  function handleKeypadKey(key) {
    if (key === 'back') {
      setHandicap((h) => h.slice(0, -1));
      return;
    }
    setHandicap((h) => (acceptHandicapInput(h + key) ? h + key : h));
  }

  return (
    <>
      <AppHeader
        navigate={navigate}
        title={editing ? 'Edit Player' : 'New Player'}
        left="back"
        onBack={back}
        active="players"
      />
      <main style={styles.main}>
        <div style={styles.fields}>
          <Field
            label="First Name"
            value={firstName}
            onChange={(v) => setFirstName(v)}
            error={errors.firstName}
            placeholder="First name"
          />
          <Field
            label="Last Name"
            value={lastName}
            onChange={(v) => setLastName(v)}
            error={errors.lastName}
            placeholder="Last name"
          />
          <Field
            label="Nickname"
            value={nickname}
            onChange={handleNickname}
            error={errors.nickname}
            placeholder="Optional"
            maxLength={NICKNAME_MAX}
            count={`${nickname.length}/${NICKNAME_MAX}`}
          />
          <Field
            label="Handicap Index"
            value={handicap}
            onChange={handleHandicap}
            error={errors.handicap}
            placeholder="0.0"
            inputMode="decimal"
            readOnly
            active={keypadOpen}
            onTap={() => setKeypadOpen(true)}
          />
        </div>

        <div style={styles.actions}>
          <button
            type="button"
            style={styles.save}
            onClick={() => {
              setKeypadOpen(false);
              handleSave();
            }}
          >
            Save Player
          </button>
          {editing && (
            <button type="button" style={styles.delete} onClick={handleDelete}>
              Delete Player
            </button>
          )}
        </div>
      </main>

      <NumericKeypad
        open={keypadOpen}
        onKey={handleKeypadKey}
        onDone={() => setKeypadOpen(false)}
      />
    </>
  );
}
