import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { migratePlayers } from './storage/store.js';
import './styles.css';

// One-time migration of any legacy player profiles (single "name" field) to the
// new { firstName, lastName, nickname, ... } model before the app renders.
migratePlayers();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
