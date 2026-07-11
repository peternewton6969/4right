import { useState } from 'react';

// Shared app chrome: the global 56px top header (spec "Global Layout") plus the
// slide-in navigation drawer. Presentation only — every screen renders one
// <AppHeader> and passes the shared `navigate` handler through so the drawer and
// any back/close actions can move between screens.

const NAV_LINKS = [
  { key: 'home', label: 'Home', route: 'home' },
  { key: 'players', label: 'Players', route: 'players' },
  { key: 'new-round', label: 'New Round', route: 'players' },
  { key: 'history', label: 'Round History', route: 'history' },
];

/** The left-slide navigation drawer opened by the hamburger. */
function NavDrawer({ navigate, active, onClose }) {
  const go = (route) => {
    onClose();
    navigate(route);
  };
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <nav className="drawer" aria-label="Main navigation">
        <div className="drawer-head">
          4 Right<span className="bang">!</span>
        </div>
        <div className="drawer-links">
          {NAV_LINKS.map((link) => (
            <button
              key={link.key}
              type="button"
              className={`drawer-link${active === link.key ? ' is-active' : ''}`}
              onClick={() => go(link.route)}
            >
              {link.label}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}

/**
 * Global top header.
 *
 * @param {object} props
 * @param {(route:string)=>void} props.navigate - shared navigation handler
 * @param {string} props.title - centered title
 * @param {string} [props.subtitle] - small uppercase line under the title
 * @param {'menu'|'back'|'none'} [props.left] - left control (default 'menu')
 * @param {()=>void} [props.onBack] - handler when left is 'back'
 * @param {React.ReactNode} [props.right] - optional right-slot control
 * @param {'default'|'green'|'transparent'} [props.tone] - 'green' for active-round
 *   screens, 'transparent' to let a full-bleed background show through (Home)
 * @param {string} [props.active] - drawer link to highlight (nav key)
 */
export default function AppHeader({
  navigate,
  title,
  subtitle,
  left = 'menu',
  onBack,
  right = null,
  tone = 'default',
  active,
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const toneClass =
    tone === 'green'
      ? ' app-header--green'
      : tone === 'transparent'
        ? ' app-header--transparent'
        : '';

  return (
    <>
      <header className={`app-header${toneClass}`}>
        <div className="app-header-inner">
          {left === 'menu' ? (
            <button
              type="button"
              className="hdr-btn"
              aria-label="Open menu"
              onClick={() => setDrawerOpen(true)}
            >
              ≡
            </button>
          ) : left === 'back' ? (
            <button
              type="button"
              className="hdr-btn"
              aria-label="Back"
              onClick={onBack}
            >
              ‹
            </button>
          ) : (
            <span />
          )}

          <div className="hdr-titlewrap">
            <h1 className="hdr-title">{title}</h1>
            {subtitle && <span className="hdr-sub">{subtitle}</span>}
          </div>

          {right ?? <span />}
        </div>
      </header>

      {drawerOpen && (
        <NavDrawer navigate={navigate} active={active} onClose={() => setDrawerOpen(false)} />
      )}
    </>
  );
}
