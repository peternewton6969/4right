import { useState } from 'react';
import AppHeader from './AppChrome.jsx';
import { getPlayers, deletePlayer } from '../storage/store.js';
import { getPlayerName, getPlayerFullName } from '../utils/playerUtils.js';

// Screen: Players. Two modes drive one roster UI:
//   'roster' (default) — management: tap a card to edit, swipe to delete, + to add.
//   'select'           — New Round player selection: tap toggles selection, a
//                        fixed Continue bar hands the chosen IDs to Round Setup.
// Presentation only; persistence goes through storage/store.js. Inline styles
// keep this screen self-contained (no shared class-name collisions).

const C = {
  bg: '#0a1628',
  surface: '#1e3a5f',
  green: '#22c55e',
  amber: '#f59e0b',
  text: '#f8fafc',
  dim: '#94a3b8',
  danger: '#ef4444',
  border: '#2d4a6b',
};

const DELETE_W = 56; // revealed Delete button width, matches min tap target
const SWIPE_SNAP = DELETE_W / 2; // past halfway -> snap open
const MIN_SELECT = 2;
const MAX_SELECT = 4;

const styles = {
  main: { background: C.bg, minHeight: '100%', padding: 16 },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 },
  row: { position: 'relative', overflow: 'hidden', borderRadius: 12, minHeight: 72 },
  deleteBtn: {
    position: 'absolute',
    top: 0,
    right: 0,
    height: '100%',
    width: DELETE_W,
    border: 'none',
    background: C.danger,
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    cursor: 'pointer',
  },
  card: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 72,
    padding: 16,
    background: C.surface,
    borderRadius: 12,
    cursor: 'pointer',
    willChange: 'transform',
  },
  check: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
    background: C.green,
    color: C.bg,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 14,
    fontWeight: 800,
  },
  nickname: { fontSize: 24, fontWeight: 700, color: C.green, lineHeight: 1.1 },
  fullName: { fontSize: 14, color: C.dim, marginTop: 2 },
  hcpValue: { fontSize: 20, fontWeight: 700, color: C.amber, textAlign: 'right' },
  hcpLabel: {
    fontSize: 11,
    color: C.dim,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    textAlign: 'right',
    marginTop: 2,
  },
  empty: { textAlign: 'center', color: C.dim, fontSize: 16, padding: '64px 24px' },
  bottomBar: {
    position: 'fixed',
    left: 0,
    right: 0,
    bottom: 0,
    background: C.bg,
    borderTop: `1px solid ${C.border}`,
    padding: '8px 16px calc(8px + env(safe-area-inset-bottom))',
    zIndex: 20,
  },
  continue: {
    width: '100%',
    minHeight: 56,
    border: 'none',
    borderRadius: 12,
    background: C.green,
    color: C.bg,
    fontSize: 18,
    fontWeight: 700,
    cursor: 'pointer',
  },
};

/** Shared inner content: nickname / full name on the left, handicap on the right. */
function CardBody({ player }) {
  const name = getPlayerName(player);
  const fullName = getPlayerFullName(player).trim();
  const hcp = Number(player.handicapIndex ?? 0).toFixed(1);
  return (
    <>
      <div style={{ minWidth: 0 }}>
        <div style={styles.nickname}>{name}</div>
        {fullName !== '' && <div style={styles.fullName}>{fullName}</div>}
      </div>
      <div>
        <div style={styles.hcpValue}>{hcp}</div>
        <div style={styles.hcpLabel}>HCP</div>
      </div>
    </>
  );
}

/** Selection-mode card: tap toggles; selected shows a green border + checkmark. */
function SelectRow({ player, selected, onToggle }) {
  return (
    <li style={styles.row}>
      <div
        role="button"
        aria-pressed={selected}
        tabIndex={0}
        style={{
          ...styles.card,
          borderLeft: `4px solid ${selected ? C.green : 'transparent'}`,
        }}
        onClick={() => onToggle(player)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle(player);
          }
        }}
      >
        {selected && <span style={styles.check}>✓</span>}
        <CardBody player={player} />
      </div>
    </li>
  );
}

/** Roster-mode card: tap to edit, swipe left to reveal a Delete button. */
function RosterRow({ player, onEdit, onDelete }) {
  const [dx, setDx] = useState(0); // current horizontal translate (0..-DELETE_W)
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState(null); // { startX, moved } while touching

  const handleStart = (x) => setDrag({ startX: x, moved: false });

  const handleMove = (x) => {
    if (!drag) return;
    const base = open ? -DELETE_W : 0;
    let next = base + (x - drag.startX);
    if (next > 0) next = 0;
    if (next < -DELETE_W) next = -DELETE_W;
    if (Math.abs(x - drag.startX) > 6) setDrag((d) => d && { ...d, moved: true });
    setDx(next);
  };

  const handleEnd = () => {
    if (!drag) return;
    const shouldOpen = dx <= -SWIPE_SNAP;
    setOpen(shouldOpen);
    setDx(shouldOpen ? -DELETE_W : 0);
    setDrag(null);
  };

  const onCardClick = () => {
    if (drag?.moved) return; // a swipe shouldn't also trigger edit
    if (open) {
      setOpen(false);
      setDx(0);
      return;
    }
    onEdit(player);
  };

  return (
    <li style={styles.row}>
      <button
        type="button"
        style={styles.deleteBtn}
        aria-label={`Delete ${player.firstName || getPlayerName(player)}`}
        onClick={() => onDelete(player)}
      >
        Delete
      </button>
      <div
        role="button"
        tabIndex={0}
        style={{
          ...styles.card,
          transform: `translateX(${dx}px)`,
          transition: drag ? 'none' : 'transform 0.2s ease',
        }}
        onClick={onCardClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onEdit(player);
        }}
        onTouchStart={(e) => handleStart(e.touches[0].clientX)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX)}
        onTouchEnd={handleEnd}
      >
        <CardBody player={player} />
      </div>
    </li>
  );
}

export default function Players({ navigate, mode = 'roster' }) {
  const selectMode = mode === 'select';
  const [players, setPlayersState] = useState(() => getPlayers());
  const [selected, setSelected] = useState(() => new Set());

  const selectedCount = selected.size;
  const canContinue = selectedCount >= MIN_SELECT;

  // --- Roster-mode handlers ---
  const handleEdit = (player) => navigate(`players/${player.id}/edit`);
  const handleAdd = () => navigate('players/new');
  const handleDelete = (player) => setPlayersState(deletePlayer(player.id));

  // --- Select-mode handlers ---
  const toggle = (player) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(player.id)) next.delete(player.id);
      else if (next.size < MAX_SELECT) next.add(player.id);
      return next;
    });
  };
  const handleContinue = () => {
    if (!canContinue) return;
    // Preserve roster order for the passed IDs.
    const ids = players.filter((p) => selected.has(p.id)).map((p) => p.id);
    navigate(`round/setup?players=${ids.join(',')}`);
  };

  const addButton = (
    <button type="button" className="hdr-btn" aria-label="Add player" onClick={handleAdd}>
      +
    </button>
  );

  const mainStyle = {
    ...styles.main,
    paddingBottom: selectMode
      ? 'calc(80px + env(safe-area-inset-bottom))' // clear the fixed Continue bar
      : 'max(24px, env(safe-area-inset-bottom))',
  };

  return (
    <>
      <AppHeader
        navigate={navigate}
        title={selectMode ? 'Select Players' : 'Players'}
        subtitle={selectMode ? `${selectedCount} of ${players.length} selected` : undefined}
        active={selectMode ? 'new-round' : 'players'}
        right={selectMode ? null : addButton}
      />
      <main style={mainStyle}>
        {players.length === 0 ? (
          <p style={styles.empty}>No players yet. Add your first player.</p>
        ) : (
          <ul style={styles.list}>
            {players.map((player) =>
              selectMode ? (
                <SelectRow
                  key={player.id}
                  player={player}
                  selected={selected.has(player.id)}
                  onToggle={toggle}
                />
              ) : (
                <RosterRow
                  key={player.id}
                  player={player}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ),
            )}
          </ul>
        )}
      </main>

      {selectMode && (
        <div style={styles.bottomBar}>
          <button
            type="button"
            style={{ ...styles.continue, opacity: canContinue ? 1 : 0.4 }}
            disabled={!canContinue}
            onClick={handleContinue}
          >
            Continue
          </button>
        </div>
      )}
    </>
  );
}
