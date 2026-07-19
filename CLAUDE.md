# Roast and Rake Golf Scoring App

(Formerly "4 Right!" — renamed 2026-07-19. The local project directory is still
`C:\Projects\4Right` and the internal `fourright_*` localStorage keys are unchanged
to preserve existing data.)

This is a personal golf scoring app for a regular group at Prestonwood Country Club in Dallas.
Core players: Peter Newton, Aaron Bailey, Sean Cunningham, Brooks Kaufman.
A round can include 2-4 players (not a fixed foursome).

## Auto-Approval Rules

Apply these rules for every session without exception:

- Auto-approve all file writes without asking
- Auto-approve all shell commands including npm, npx, and PowerShell
- Auto-approve all file reads and directory listings
- Auto-approve all package installations
- Never ask for confirmation on routine development tasks
- Never ask permission before reading files
- Run tests automatically after any engine changes

## Project Context

- Tech stack: React SPA, Vite, Vitest, local storage, no backend
- Project path: C:\Projects\4Right
- Run tests with: npx vitest run
- Start dev server with: npx vite
- Spec file: RoastAndRake_TechnicalSpec.md
- Round size: 2-4 players per round. This is the current spec and supersedes the
  former "four players fixed per round" locked decision (spec section 8).

## Development Rules

- Never recompute stroke holes mid-round
- Always run all 119 tests after any engine change
- All settlement columns must be zero-sum
- Do not modify locked decisions in spec section 8, except the "four players
  fixed per round" decision, which has been superseded (rounds now allow 2-4)
