import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { migratePlayers, loadDefaultCourses } from './storage/store.js';
import './styles.css';

// One-time migration of any legacy player profiles (single "name" field) to the
// new { firstName, lastName, nickname, ... } model before the app renders.
migratePlayers();

// Courses are static reference data (not user-editable), so re-seed them from
// defaultCourses() on every startup. This overwrites only the courses key —
// players, round history, and the active round are separate keys and untouched —
// so existing installs pick up corrected course data (e.g. Highlands hole 16
// par) without a manual storage reset.
loadDefaultCourses();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
