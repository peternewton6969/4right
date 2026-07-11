# 4 Right! -- Technical Specification v1.1
**App Name:** 4 Right!
**Version:** 1.1 (single-user, local storage, no backend)
**Platform:** React SPA, mobile-first, deployed to GitHub Pages
**Last Updated:** July 10, 2026
**Tagline:** Play Fair. Pay Up. Repeat.

---

## 0. Revisions Since v1.0

This spec has been updated to reflect decisions made during build. Material changes:

1. **Player model** now has `firstName`, `lastName`, `nickname` (max 5 chars), and `handicapIndex` — there is no single `name` field (§1.1).
2. **Roster** holds any number of players (N, no fixed limit). A **round** uses 2-4 of them (§1.1, §1.4).
3. **Game structure** replaced the flat `games` map with `teamGame` (`bestBall` | `scramble` | `null`), `individualGames` (`skins` | `wolf`), and `junkGames` (`greenie` | `snake` | `sandy` | `netBirdie` | `netEagle`) (§1.4).
4. **Payout structure** regrouped to match the new games: `teamGamePayout`, `individualGamePayouts`, `junkGamePayouts` (§1.4, §2.9).
5. **Wolf** engine added — full per-hole rules and point-to-point settlement (§2.7).
6. **Scramble** engine added — 2v2 gross team match with closeout and settlement (§2.8).
7. **Settlement** consumes the new round shape, handles every game combination, and keeps every column zero-sum (§2.9).
8. **Default payouts:** team game $20, skins $10, wolf $2/point, greenie $2, snake $10, sandy $2, net birdie $2, net eagle $4.
9. **New screens:** Players (roster management), PlayerForm (add/edit). Round Setup rebuilt. Player selection reuses the Players screen in `mode=select` (§4.2).
10. **Design:** color system (navy `#0a1628`, green `#22c55e`, amber `#f59e0b`, red `#ef4444`), tagline "Play Fair. Pay Up. Repeat.", settlement snark "Hate paying out? Play better.", home background image `/golf-bg.jpg`.
11. **Test suite:** 123 tests across 10 files, all passing.

---

## 1. Data Model

All state lives in browser local storage. No backend. No auth. Four top-level keys:

- `fourright_players` -- player roster
- `fourright_courses` -- course data
- `fourright_rounds` -- round history
- `fourright_active_round` -- current round in progress (mirrors the active entry in rounds)

---

### 1.1 Player

```json
{
  "id": "uuid-string",
  "firstName": "Peter",
  "lastName": "Newton",
  "nickname": "Pete",
  "handicapIndex": 9.6,
  "createdAt": "2026-07-04T00:00:00Z",
  "updatedAt": "2026-07-04T00:00:00Z"
}
```

**Rules:**
- The roster holds any number of players (N). There is no fixed roster size. A round selects 2-4 of them.
- `firstName` and `lastName` are required. There is **no** single `name` field.
- `nickname` is optional, max 5 characters (trimmed on save). Display name uses the nickname when present and non-empty, otherwise the first name. Full name is `firstName + " " + lastName`.
- `handicapIndex` is a float in the range 0.0-54.0, one decimal place.
- Player profiles persist across rounds. The index lives on the profile and is snapshotted into each round's `playerRounds` at setup.
- **Legacy migration:** any pre-v1.1 profile carrying a single `name` field is migrated on app load — `name` splits on the first space into `firstName`/`lastName`, and `nickname` is derived from the first 5 lowercased characters of `firstName`. Idempotent.
- Persistence helpers live in `store.js`: `savePlayer` (validated upsert), `deletePlayer`, `getPlayerById`, `migratePlayers`. Display helpers `getPlayerName` / `getPlayerFullName` live in `utils/playerUtils.js`.

---

### 1.2 Course

```json
{
  "id": "uuid-string",
  "name": "Prestonwood Meadows",
  "rating": 72.3,
  "slope": 133,
  "par": 72,
  "holes": [
    {
      "number": 1,
      "par": 4,
      "hcpRank": 7,
      "isParThree": false
    },
    {
      "number": 2,
      "par": 3,
      "hcpRank": 15,
      "isParThree": true
    }
  ]
}
```

**Rules:**
- Three courses pre-loaded at build time: Prestonwood Meadows, Highlands, Fairways.
- Each course has 18 holes.
- hcpRank is 1-18, unique per course, no duplicates.
- isParThree is derived from par === 3 but stored explicitly for query convenience.
- Course data is read-only in v1. No UI to edit course data.
- Rating and slope are used for course handicap calculation.

---

### 1.3 Pre-Loaded Course Data

#### Prestonwood Meadows -- Blue Tees
Rating: 72.3 | Slope: 133 | Par: 72

| Hole | Par | HCP | Par 3? |
|---|---|---|---|
| 1 | 4 | 7 | No |
| 2 | 3 | 15 | Yes |
| 3 | 5 | 3 | No |
| 4 | 4 | 1 | No |
| 5 | 5 | 13 | No |
| 6 | 4 | 11 | No |
| 7 | 3 | 17 | Yes |
| 8 | 4 | 5 | No |
| 9 | 4 | 9 | No |
| 10 | 3 | 18 | Yes |
| 11 | 4 | 2 | No |
| 12 | 5 | 14 | No |
| 13 | 4 | 6 | No |
| 14 | 3 | 16 | Yes |
| 15 | 4 | 10 | No |
| 16 | 4 | 8 | No |
| 17 | 5 | 12 | No |
| 18 | 4 | 4 | No |

Par 3 holes: 2, 7, 10, 14

#### Prestonwood Highlands -- Blue Tees
Rating: 72.0 | Slope: 129 | Par: 72

| Hole | Par | HCP | Par 3? |
|---|---|---|---|
| 1 | 4 | 1 | No |
| 2 | 4 | 9 | No |
| 3 | 3 | 13 | Yes |
| 4 | 5 | 11 | No |
| 5 | 4 | 5 | No |
| 6 | 3 | 17 | Yes |
| 7 | 4 | 3 | No |
| 8 | 4 | 15 | No |
| 9 | 5 | 7 | No |
| 10 | 4 | 14 | No |
| 11 | 4 | 12 | No |
| 12 | 3 | 18 | Yes |
| 13 | 5 | 10 | No |
| 14 | 4 | 2 | No |
| 15 | 4 | 4 | No |
| 16 | 4 | 8 | No |
| 17 | 3 | 16 | Yes |
| 18 | 4 | 6 | No |

Par 3 holes: 3, 6, 12, 17

#### Prestonwood Fairways -- Blue Tees
Rating: 68.4 | Slope: 127 | Par: 70

| Hole | Par | HCP | Par 3? |
|---|---|---|---|
| 1 | 4 | 12 | No |
| 2 | 3 | 16 | Yes |
| 3 | 5 | 8 | No |
| 4 | 4 | 2 | No |
| 5 | 3 | 10 | Yes |
| 6 | 4 | 4 | No |
| 7 | 3 | 18 | Yes |
| 8 | 4 | 14 | No |
| 9 | 4 | 6 | No |
| 10 | 5 | 7 | No |
| 11 | 4 | 5 | No |
| 12 | 3 | 17 | Yes |
| 13 | 5 | 9 | No |
| 14 | 4 | 11 | No |
| 15 | 3 | 15 | Yes |
| 16 | 4 | 13 | No |
| 17 | 4 | 3 | No |
| 18 | 4 | 1 | No |

Par 3 holes: 2, 5, 7, 12, 15

---

### 1.4 Round

```json
{
  "id": "uuid-string",
  "courseId": "uuid-string",
  "date": "2026-07-04",
  "status": "active | complete",
  "playerIds": ["playerId1", "playerId2", "playerId3", "playerId4"],
  "teamGame": "bestBall",
  "teamGamePayout": 20,
  "teamAssignments": {
    "playerId1": "A",
    "playerId2": "A",
    "playerId3": "B",
    "playerId4": "B"
  },
  "individualGames": ["skins", "wolf"],
  "individualGamePayouts": {
    "skins": 10,
    "wolfPointValue": 2
  },
  "junkGames": ["greenie", "snake", "sandy", "netBirdie", "netEagle"],
  "junkGamePayouts": {
    "greenie": 2,
    "snake": 10,
    "sandy": 2,
    "netBirdie": 2,
    "netEagle": 4
  },
  "playerRounds": [
    {
      "playerId": "uuid-string",
      "handicapIndex": 9.6,
      "courseHandicap": 12,
      "differential": 3,
      "strokeHolesMatchPlay": [4, 11, 3],
      "strokeHolesSkins": [4, 11, 8, 9, 18, 1, 13, 16, 6, 15, 3, 17]
    }
  ],
  "holes": [],
  "wolfHoles": [],
  "createdAt": "2026-07-04T00:00:00Z",
  "updatedAt": "2026-07-04T00:00:00Z"
}
```

**Rules:**
- A round has **2-4 players** (`playerIds`), selected on the player-selection screen.
- **Team game** (`teamGame`) is exactly one of `"bestBall"`, `"scramble"`, or `null` (no team game). At most one team game per round.
- `teamAssignments` maps each player to `"A"` or `"B"`. Only populated when a team game is selected (otherwise `{}`). Team games require **even teams** (1v1, 2v2); a 3-player team game is not allowed.
- `teamGamePayout` is a single number: the per-player team-game stake (see §2.6 best ball and §2.8 scramble for how each spends it).
- **Individual games** (`individualGames`) is any subset of `["skins", "wolf"]`. Payouts in `individualGamePayouts`: `skins` (pool) and `wolfPointValue` (dollars per Wolf point). Wolf requires exactly 4 players.
- **Junk games** (`junkGames`) is any subset of `["greenie", "snake", "sandy", "netBirdie", "netEagle"]`, all on by default. Payouts in `junkGamePayouts`. Note the junk key `sandy` maps to the side-bet engine's `sandie`.
- `wolfHoles` holds the per-hole Wolf records (§2.7); empty when Wolf is not played.
- `handicapIndex` on a playerRound is snapshotted at round creation. Changing a player profile after a round starts does not affect that round.
- `differential` is courseHandicap minus the low man's courseHandicap. Low man's differential is always 0.
- `strokeHolesMatchPlay`: holes where hcpRank <= differential. `strokeHolesSkins`: holes where hcpRank <= courseHandicap.
- Both stroke lists are computed at round setup and stored. **Never recomputed mid-round.**

**Legacy shape:** The settlement engine also accepts the pre-v1.1 round shape (flat `games` map, `teams: {A,B}` arrays, flat `payouts`) by normalizing it internally, so historical rounds still settle. New rounds are always written in the shape above.

---

### 1.5 Course Handicap Calculation

```
courseHandicap = round( handicapIndex * (slope / 113) + (rating - par) )
```

This is the USGA formula. Round to nearest integer. Compute for each player at round setup using the selected course's rating and slope.

---

### 1.6 HoleScore

```json
{
  "holeNumber": 1,
  "scores": {
    "playerId1": {
      "gross": 5,
      "threePutt": false,
      "inBunker": false,
      "closestOnParThree": false
    }
  },
  "snakeHolder": "playerId | null",
  "snakeSimultaneous": false,
  "skinsCarryIn": 0,
  "enteredAt": "2026-07-04T14:32:00Z"
}
```

**Rules:**
- gross is required for all players.
- threePutt triggers snake transfer logic.
- inBunker is required for sandie eligibility.
- closestOnParThree is only meaningful when isParThree is true.
- snakeHolder is the playerId holding the snake after this hole resolves. Null on hole 1 before any three-putts.
- snakeSimultaneous flags that Peter manually resolved a simultaneous three-putt on this hole.
- skinsCarryIn is the number of skins carried into this hole from prior unresolved holes.
- **Scramble holes** do not use per-player `scores`. In a scramble round each hole instead records a single team gross per side: `"teamScores": { "A": 4, "B": 5 }` (a `null` team score means that team picked up). See §2.8.
- **Wolf** decisions/results are stored per hole in the round's `wolfHoles` array as WolfHoleRecords (§2.7), not inside HoleScore.

---

## 2. Scoring Engine

The scoring engine is a pure set of functions. No side effects. Input is round state. Output is computed game state. The engine never mutates state directly. The UI calls engine functions to derive display values and settlement figures.

All engine functions live in `src/engine/` as a standalone module with no React dependencies. This module must be fully testable in isolation.

---

### 2.1 Function Signatures

```javascript
// Compute course handicap for one player
computeCourseHandicap(handicapIndex, slope, rating, par) => integer

// Compute differential for one player given low man's course handicap
computeDifferential(playerCH, lowManCH) => integer  // always >= 0

// Compute stroke holes for match play (differential method)
computeStrokeHolesMatchPlay(differential, holes) => number[]  // hole numbers

// Compute stroke holes for skins/side bets (full CH method)
// Returns a map of hole number -> stroke count (>=1), so double strokes (CH > 18)
// are represented. RoundSetup flattens this to a sorted number[] (hardest first)
// for storage in playerRound.strokeHolesSkins.
computeStrokeHolesSkins(courseHandicap, holes) => { [holeNumber]: number }

// (Net scores are computed internally by each resolver from the stroke-hole lists
// above; there is no standalone exported net-score function.)

// Resolve match play hole winner
resolveMatchPlayHole(holeScores, playerRounds, teams, holes) => {
  winner: 'A' | 'B' | 'halved',
  netScores: { [playerId]: number | null }
}

// Resolve skins hole winner
resolveSkinsHole(holeScores, playerRounds, holes, skinsCarryIn) => {
  winner: playerId | null,  // null = carry
  skinsAwarded: number,
  skinsCarryOut: number
}

// Resolve snake after a hole. selectedHolder is required only when two or more
// players three-putt the same hole (Peter's manual pick); ignored otherwise.
resolveSnake(holeScores, previousSnakeHolder, selectedHolder = null) => {
  holder: playerId | null,
  changed: boolean,
  simultaneous: boolean   // true when 2+ players three-putted this hole
}

// Resolve side bets for one hole
resolveSideBets(holeScores, playerRounds, holeData) => {
  greenie: playerId | null,
  netBirdies: playerId[],
  netEagles: playerId[],
  sandies: playerId[]
}

// Compute full match play result through current hole
computeMatchPlayStatus(round) => {
  holesPlayed: number,
  score: { A: number, B: number },  // holes won
  status: string,  // e.g. "Team A 2UP", "All Square", "Team B wins 3&2"
  winner: 'A' | 'B' | null  // null if still in progress
}

// Compute full skins standings through current hole
computeSkinsStandings(round) => {
  standings: [{ playerId, skinsWon }],  // sorted descending
  currentCarry: number,
  unresolved: boolean  // true if 18th hole carried
}

// Compute snake final result
computeSnakeFinal(round) => {
  holder: playerId | null,
  payout: { [playerId]: number }  // positive = receives, negative = pays
}

// Also exported from snake.js: FINAL_HOLE = 18 — the last hole of a round, used
// to trigger end-of-round resolution (snake payout, dead 18th-hole skins carry).

// Compute side bet totals per player
computeSideBetTotals(round) => {
  [playerId]: {
    greenies: number,
    netBirdies: number,
    netEagles: number,
    sandies: number,
    total: number  // in dollars
  }
}

// --- Scramble (team game, §2.8) ---
resolveScrambleHole(teamScores) => { winner: 'A' | 'B' | 'halved' | null }
computeScrambleStatus(round, holes) => {
  holesPlayed: number,
  score: { A: number, B: number },
  status: string,   // e.g. "Team A 2UP", "All Square", "Team B wins 3&2"
  winner: 'A' | 'B' | null
}
computeScrambleSettlement(round) => { [playerId]: number }  // + receives, - pays

// --- Wolf (individual game, exactly 4 players, §2.7) ---
getWolfForHole(holeNumber, playerIds) => playerId
resolveWolfHole(holeScores, wolfPlayerId, partnerPlayerId, playerRounds, holeData) => {
  wolfResult: 'won' | 'lost' | 'halved',
  isLoneWolf: boolean,
  pointChanges: { [playerId]: number },
  netScores: { [playerId]: number | null }
}
createWolfHoleRecord(holeNumber, decision, holeScores, playerRounds, holeData) => WolfHoleRecord
computeWolfStandings(round, wolfHoles) => {
  standings: [{ playerId, points, holesAsWolf, holesAsPartner }]  // points descending
}
computeWolfSettlement(round, wolfHoles) => { [playerId]: number }  // + receives, - pays

// Compute full settlement (all game combinations, §2.9)
computeSettlement(round) => {
  [playerId]: {
    teamGame: number,   // best ball OR scramble (0 if no team game)
    skins: number,
    wolf: number,
    snake: number,
    sideBets: number,
    net: number         // positive = receives, negative = pays
  },
  instructions: string[]  // ["Peter pays Aaron $101.34", ...]
}
```

---

### 2.2 Stroke Eligibility Rule

A player receives a stroke on a hole if and only if:

```
holeHcpRank <= playerDifferential    // match play
holeHcpRank <= playerCourseHandicap  // skins and side bets
```

Equal to is included. This is the USGA standard. Applies consistently everywhere in the engine.

---

### 2.3 Skins Resolution Logic

```
For each hole 1-18:
  skinsAtStake = skinsCarryIn + 1
  
  Eligible players = players with a gross score entered
  
  For eligible players, compute net score using full CH stroke holes
  
  If exactly one player has the lowest net score among eligible players:
    That player wins skinsAtStake skins
    skinsCarryOut = 0
  Else (tie or no eligible players):
    No winner
    skinsCarryOut = skinsAtStake

If hole 18 carries:
  Skins are unawarded. No split. Pot is dead.
```

---

### 2.4 Snake Logic

```
snakeHolder starts as null before hole 1.

After each hole:
  threePutters = players where threePutt is true
  
  If threePutters is empty:
    snakeHolder unchanged
  
  If threePutters has exactly one player:
    snakeHolder = that player
  
  If threePutters has two or more players:
    snakeSimultaneous = true
    App presents manual confirmation UI
    Peter selects which player holds it (last to complete putting)
    snakeHolder = selected player

After hole 18:
  If snakeHolder is not null:
    That player pays snake payout amount to each other player
    Net for holder = -3 * snakePayout
    Net for each other = +snakePayout
  If snakeHolder is null (no three-putts all round):
    No snake payout
```

---

### 2.5 Side Bet Logic

**Greenie:**
```
Only applies on par 3 holes.
Eligible = player marked as closestOnParThree AND grossScore <= holePar
Maximum one greenie winner per hole.
If no player qualifies: no greenie awarded, no carry.
```

**Net Birdie:**
```
netScore = grossScore - strokesReceived
Qualifies if netScore <= holePar - 1
All qualifying players each collect $2 from each non-qualifying player.
```

**Net Eagle:**
```
netScore <= holePar - 2
All qualifying players each collect $4 from each non-qualifying player.
A player cannot win both net birdie and net eagle on the same hole. Eagle supersedes.
```

**Sandie:**
```
Player must have inBunker = true on that hole.
Player must achieve par or better net (using full CH strokes).
Maximum one sandie per player per hole regardless of bunkers visited.
All qualifying players each collect $2 from each non-qualifying player.
```

---

### 2.6 Best Ball (Team Match Play) Resolution Logic

`teamGame === "bestBall"`. This is the differential-stroke, best-ball team match.

```
For each hole:
  Team A net = lower net score of Team A players (best ball)
  Team B net = lower net score of Team B players (best ball)
  
  Net scores use differential stroke holes.
  
  If a player has no gross entered: their score is excluded from best ball. 
  If neither player on a team has a gross entered: that team loses the hole.
  
  If Team A net < Team B net: Team A wins hole
  If Team B net < Team A net: Team B wins hole
  If equal: hole halved

Match status expressed as holes up, e.g. "Team A 2UP" / "Team B wins 3&2".
Match ends early (closeout) if one team is up by more holes than remain.
Full 18 holes played regardless (no concession in v1).

Payout is pairwise using teamGamePayout as the per-opponent stake: each losing-team
player pays each winning-team player the stake. For the standard 2v2 at a $25 stake
this nets +$50 to each winner and -$50 from each loser (2 opponents x $25).
If tied after 18: no payout (no playoff in v1).
```

---

### 2.7 Wolf Logic

`individualGames` includes `"wolf"`. A per-hole game for **exactly 4 players**. Net scores use the full course-handicap (skins) stroke allocation, including double strokes — the same method as skins and side bets.

**Wolf rotation** (fixed by `playerIds` order from round setup):
```
wolf(holeNumber) = playerIds[(holeNumber - 1) % 4]
Hole 1 -> playerIds[0], hole 2 -> [1], hole 3 -> [2], hole 4 -> [3], hole 5 -> [0] ...
Holes 17 and 18 simply continue the cycle (playerIds[0], then [1]).
```

**Decision rules:**
```
Players tee off in order. After each tee shot the Wolf may take that player as
partner (2v2) or pass. The Wolf must decide before the next player hits.
The Wolf may also declare Lone Wolf up front (before any tee shots).
If the Wolf has picked no partner by the last other player's tee shot, the Wolf
is AUTOMATICALLY Lone Wolf for that hole (isAutomaticLoneWolf = true).
```

**Scoring (net scores decide the hole):**
```
Partner Wolf (Wolf + partner vs the other two, best ball each side):
  Wolf side wins  -> Wolf +1, partner +1, each opponent -1
  Wolf side loses -> Wolf -1, partner -1, each opponent +1
  Halved          -> no point change

Lone Wolf (Wolf vs the other three, Wolf's net vs the best opponent net):
  Wolf wins ONLY if strictly lower than every opponent (a tie with the lowest
  opponent is a LOSS -- a Lone Wolf hole cannot be halved).
  Wolf wins  -> Wolf +2 from each opponent (Wolf +6 total, each opponent -2)
  Wolf loses -> Wolf -2 to each opponent (Wolf -6 total, each opponent +2)
```

**WolfHoleRecord** (one per hole, stored in `round.wolfHoles`):
```json
{
  "holeNumber": 1,
  "wolfPlayerId": "playerId",
  "partnerPlayerId": "playerId | null",
  "isLoneWolf": false,
  "isAutomaticLoneWolf": false,
  "wolfResult": "won | lost | halved",
  "pointChanges": { "playerId": 1 },
  "netScores": { "playerId": 4 }
}
```

**Settlement (point-to-point):** points are conserved every hole (each hole's `pointChanges` sum to zero), so a player's Wolf settlement is simply `totalPoints x wolfPointValue`. Zero-sum across the group. `computeWolfStandings` also reports `holesAsWolf` / `holesAsPartner` per player.

---

### 2.8 Scramble Logic

`teamGame === "scramble"`. A **2v2 team stroke play** format, **gross score only** — no handicap strokes. Both players on a team hit every shot, the team plays its best ball, and a single team gross is recorded per hole (`hole.teamScores = { A, B }`).

```
Lower team gross wins the hole. Equal gross halves the hole.
A null team score = that team picked up; both null = no winner for the hole.

Match status uses the same closeout notation as best ball
("Team A 2UP", "All Square", "Team A wins 3&2").
Full 18 holes played in v1 regardless of an early closeout.

Payout (flat, per player): each player on the winning team receives teamGamePayout;
each player on the losing team pays teamGamePayout. For 2v2 this is +/-teamGamePayout
and zero-sum. A tie after 18 pays nobody.
```
Note: best ball uses a *pairwise* stake (§2.6) while scramble uses a *flat* per-player payout — both read the single `teamGamePayout` field.

---

### 2.9 Settlement (All Game Combinations)

`computeSettlement(round)` combines every active game into one per-player net plus plain-English payment instructions. It reads the new round shape (and normalizes the legacy shape internally):

```
teamGame column:
  "bestBall"  -> best ball pairwise settlement (§2.6)
  "scramble"  -> scramble flat settlement (§2.8)
  null        -> 0 for every player
skins  column: only if "skins" in individualGames  (pool = individualGamePayouts.skins)
wolf   column: only if "wolf"  in individualGames  (wolfPointValue, from round.wolfHoles)
snake  column: only if "snake" in junkGames
sideBets column: sum of the active junk bets (greenie / netBirdie / netEagle / sandy)
```

**Invariants:**
- Every column is independently **zero-sum** across all players.
- `net` = teamGame + skins + wolf + snake + sideBets.
- Works for **2-4 players** (nothing assumes a fixed four).
- `instructions` is a deterministic, greedy debtor→creditor list ("Peter pays Aaron $50.00").

---

## 3. Test Cases

The engine must reproduce these results exactly before UI work begins.
Source: July 3, 2026 -- Meadows AM round.

**Suite status:** 123 tests across 10 files (engine + storage), all passing. Coverage includes courseHandicap, strokeHoles, matchPlay, skins, snake, sideBets, **scramble**, **wolf**, and **settlement** (legacy shape *and* the new grouped round shape, including scramble+wolf and a 3-player round), plus the storage/player-model tests. In this July 3 best-ball round the settlement `teamGame` column equals the "Match" figures below.

---

### 3.1 Course Handicap Inputs (Meadows, Blue Tees)

Rating: 72.3 | Slope: 133 | Par: 72

| Player | Index | CH Expected | Differential |
|---|---|---|---|
| Peter Newton | 9.6 | 12 | 3 |
| Aaron Bailey | 7.2 | 9 | 0 (low man) |
| Sean Cunningham | 17.3 | 21 | 12 |
| Brooks Kaufman | 11.0 | 13 | 4 |

---

### 3.2 Stroke Holes (Meadows, Blue Tees)

Using Meadows HCP rankings. Stroke rule: hcpRank <= differential (match play) or hcpRank <= CH (skins).

**Match Play stroke holes (differential off Aaron):**

| Player | Differential | Stroke Holes (hcpRank <= diff) |
|---|---|---|
| Peter | 3 | 4 (hcp1), 11 (hcp2), 3 (hcp3) |
| Aaron | 0 | none |
| Sean | 12 | 4,11,3,8,18,9,1,16,13,15,6,17 |
| Brooks | 4 | 4,11,3,8 |

**Skins stroke holes (full CH):**

| Player | CH | Stroke Holes (hcpRank <= CH) |
|---|---|---|
| Peter | 12 | 4,11,3,8,18,9,1,16,13,15,6,17 |
| Aaron | 9 | 4,11,3,8,18,9,1,16,13 |
| Sean | 21 | all 18 holes (CH > 18, gets double stroke on hcp1, hcp2, and hcp3) |
| Brooks | 13 | 4,11,3,8,18,9,1,16,13,15,6,17,5 |

Note on Sean's double strokes: CH 21 means Sean gets 2 strokes on holes ranked hcp1, hcp2, and hcp3 (holes 4, 11, and 3), and 1 stroke on holes ranked hcp4 through hcp18. This follows the standard USGA lapping allocation: 18 base strokes (one per hole) plus 3 additional strokes on the three lowest-ranked holes, totaling 21. The engine must handle double strokes correctly for skins net score calculation. (A prior version of this note incorrectly stated that only hcp1 and hcp2 receive doubles, which totaled 20 strokes and understated Sean's allocation by one.)

---

### 3.3 July 3 Meadows Scorecard

**Gross Scores:**

| Player | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Par | 4 | 3 | 5 | 4 | 5 | 4 | 3 | 4 | 4 | 3 | 4 | 5 | 4 | 3 | 4 | 4 | 5 | 4 | 72 |
| Peter | 5 | 4 | 5 | 6 | 6 | 5 | 4 | 3 | 7 | 3 | 5 | 6 | 5 | 4 | 7 | 7 | 7 | 5 | 94 |
| Aaron | 3 | 3 | 7 | 5 | 6 | 4 | 4 | 6 | 4 | 4 | 6 | 4 | 5 | 4 | 5 | 6 | 4 | 6 | 87 |
| Sean | 4 | 2 | 6 | 5 | 7 | 7 | 5 | 7 | 6 | 4 | 6 | 5 | 6 | 5 | 7 | 5 | 6 | 4 | 97 |
| Brooks | 6 | 3 | 5 | 4 | 5 | 7 | 4 | 5 | 7 | 3 | 5 | 5 | 6 | 4 | 4 | 6 | 5 | 5 | 89 |

**Side Bets and Snake per Hole:**

| Game | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Snake | BK | | | | | PN | PN | AB | | | | | | PN | | | AB | |
| Net Birdie | | SC | | | | | | | | | | | | | | | | |
| Net Eagle | AB | | | | | | | | | | | | | | | | | |
| Greenie | | | | | | | | | | | | | | | | | | |
| Sandie | | | PN | | | | | | | | | | | | | | | |

**Match Play Teams:**
- Team A: Peter + Sean
- Team B: Aaron + Brooks
- Result: Team B wins

---

### 3.4 Final Skins Result (Meadows)

| Player | Skins Won |
|---|---|
| Brooks | 9 |
| Sean | 4 |
| Peter | 3 |
| Aaron | 2 |

Total: 18 skins across 18 holes. $80 pool / 18 skins = $4.44 per skin.

---

### 3.5 Settlement Validation (Meadows)

| Player | Match | Skins Net | Snake | Side Bets | NET |
|---|---|---|---|---|---|
| Peter | -$50 | -$6.67 | +$10 | -$10 | -$56.67 |
| Aaron | +$50 | -$11.11 | -$30 | -$2 | +$6.89 |
| Sean | -$50 | -$2.22 | +$10 | +$14 | -$28.22 |
| Brooks | +$50 | +$20.00 | +$10 | -$2 | +$78.00 |

Skins Net = (skins won × $4.44) − $20 buy-in, using exact division ($80/18) so the column reconciles to $0.00.

Side Bets are computed from gross scores plus full-CH strokes per section 2.5 (net birdie/eagle are not manually recorded — the data model has no such field). The figures (Peter -$10, Aaron -$2, Sean +$14, Brooks -$2) sum to $0. Every settlement column is independently zero-sum, so the NET column reconciles to exactly $0.00. These figures reflect the corrected Meadows hole 5 (par 5, per the official scorecard — not par 4): Brooks nets 4 there for a net birdie that the prior par-4 value missed, shifting side bets by $2 per player (previously Peter -$8, Aaron $0, Sean +$16, Brooks -$8). Note: section 3.3's hand-written net-birdie/eagle rows are an incomplete record and do not drive settlement (e.g. Sean's hole 2 is a net eagle, not the birdie noted on the card).

Engine must reproduce these net figures exactly.

---

## 4. UI Specification

### 4.1 Design Principles

- Mobile first. Designed for an iPhone screen held one-handed on a golf cart.
- Touch targets minimum 48x48px. Prefer 60px+ for number inputs.
- High contrast. Direct sunlight readability required.
- No small text. Minimum 16px body, 20px for scores, 24px for key status.
- Dark mode preferred (easier in sunlight than white backgrounds).
- Zero horizontal scrolling anywhere.
- Maximum two taps to enter a score from the score entry screen.
- All touch targets minimum 56px tall. 16px horizontal padding throughout.

**Color system:**

| Token | Hex | Use |
|---|---|---|
| Background (navy) | `#0a1628` | page background, headers, bottom bars |
| Surface | `#1e3a5f` | cards, inputs |
| Secondary surface | `#162d4a` | unselected segments/buttons |
| Primary green | `#22c55e` | primary actions, selected state, nicknames |
| Amber | `#f59e0b` | handicap index / accent |
| Danger red | `#ef4444` | delete, negative amounts |
| Border | `#2d4a6b` | borders |
| Text primary | `#f8fafc` | primary text |
| Text secondary | `#94a3b8` | labels, secondary text |

**Voice:**
- Tagline (home): **"Play Fair. Pay Up. Repeat."**
- Settlement snark (settlement header): **"Hate paying out? Play better."**

---

### 4.2 Screens

**Screen 1: Home**

Displays:
- Full-bleed background image `/golf-bg.jpg` with a navy overlay for contrast.
- App name "4 Right!" and the tagline "Play Fair. Pay Up. Repeat."
- Two buttons: "New Round" and "View Rounds"
- Active round indicator if a round is in progress ("Resume Round -- Hole 7")

"New Round" navigates to the **player-selection** screen (`/round/players`, the Players screen in `mode=select`), not directly to Round Setup.

---

**Screen 2: Players (roster) + PlayerForm**

The roster screen replaces the old fixed-four "Player Setup". It has **two modes**:

- **`mode=roster`** (route `/players`, reached from the hamburger menu) — roster management.
  - Navy header, hamburger left, "Players" centered, `+` button top-right to add.
  - One card per player: nickname in large green (falls back to first name), full name below, handicap index in amber with an "HCP" label.
  - **Tap a card → edit** that player (route `/players/:id/edit`).
  - **Swipe left → reveal a red Delete** button.
  - Empty state: "No players yet. Add your first player."

- **`mode=select`** (route `/round/players`, reached from Home's "New Round") — player selection for a new round.
  - Header "Select Players" with a live "N of M selected" subtitle. **No** `+` button, **no** swipe-to-delete.
  - **Tap a card → toggle selection.** Selected cards show a green left border and a green checkmark.
  - Minimum 2, maximum 4 selected. A fixed bottom bar's green **"Continue"** button is disabled (opacity 0.4) until 2+ are selected; Continue passes the selected player IDs to Round Setup (`/round/setup?players=...`).

**PlayerForm** (route `/players/new` or `/players/:id/edit`) — add/edit a player.
- Navy header, back arrow, title "New Player" or "Edit Player".
- Fields: First Name (required), Last Name (required), Nickname (optional, max 5 chars with a live `n/5` counter), Handicap Index (required, 0.0-54.0, one decimal).
- Inputs: surface background, focus shows a green border, errors show a red border + message.
- Green "Save Player" (validates, upserts via `savePlayer`, returns to roster). In edit mode, a red-outlined "Delete Player" confirms ("Delete [FirstName]? This cannot be undone.") then `deletePlayer`.

No GHIN integration in v1. Manual entry only.

---

**Screen 3: Round Setup**

Single scrollable screen for the 2-4 players passed from selection. Back arrow returns to player selection. Sections top to bottom:

1. **Date** — surface card showing today formatted "Jul 8, 2026"; tap opens the native date picker. Stored as `YYYY-MM-DD`.
2. **Course** — segmented control Meadows / Highlands / Fairways (active = green filled, inactive = secondary surface with border), full width, 56px segments.
3. **Games**
   - **Team Game** ("Pick one or none"): `Best Ball | Scramble` toggle buttons — selecting one deselects the other; tapping a selected one turns it off. Selected = green filled with a checkmark.
   - **Team Assignment** (only shown when a team game is selected): one row per player with A / B buttons. Defaults first half of players to A, the rest to B. **Requires even teams** — a 3-player team game shows "…requires even teams" and blocks Start.
   - **Individual Games** ("Pick any"): `Skins | Wolf`, multi-select toggles.
   - **Junk** ("All on by default"): `Greenie / Snake / Sandy / Net Birdie / Net Eagle` in a 2-column grid, all on at load, each toggles independently.
4. **Payouts** — only shows a field per **currently active** game, updating live as games toggle. Label left, right-aligned `$` input (48px, focus green). Defaults: **Team Game $20, Skins Pot $10, Wolf (per point) $2, Greenie $2, Snake $10, Sandy $2, Net Birdie $2, Net Eagle $4**.

**Start Round** — fixed bottom bar, full-width green, 56px. Disabled (opacity 0.4) when no course is selected or a team game is selected with an incomplete/uneven team assignment. On tap:
- Engine computes course handicaps, differentials, and both stroke-hole lists per player.
- Builds the round object (§1.4) with the selected games, `teamAssignments`, grouped payouts, `playerIds`, empty `holes` and `wolfHoles`, `status: "active"`.
- Saves the active round and navigates to Stroke Allocation Confirmation (§Screen 4), where the player taps "Looks Good" to proceed to hole 1.

---

**Screen 4: Stroke Allocation Confirmation**

Displayed once after round setup before hole 1.

Shows for each player:
- Name, Handicap Index, Course Handicap, Differential
- Match play stroke holes: list of hole numbers
- Skins stroke holes: list of hole numbers

Two buttons: "Looks Good" (proceed to hole 1) and "Back" (return to round setup).

This screen is the pre-flight check that was missing on July 3.

---

**Screen 5: Score Entry (per hole)**

This is the primary on-course screen. Optimized for speed and sunlight.

Header bar:
- Hole number and par (e.g. "Hole 7 -- Par 3")
- HCP rank of hole
- Match play score (e.g. "Team A 1UP")
- Skins carry count (e.g. "3 skins up for grabs")
- Snake holder name (e.g. "Snake: Aaron")

Score entry area (one row per player):
- Player name
- Large tap targets: 1 through 9+ for gross score
- Stroke indicator: dot or "+" showing if player receives a stroke this hole (both match play and skins, displayed separately if different)
- Net score displayed automatically once gross is entered

Toggle row per player (only relevant toggles shown per hole):
- Three-putt (always shown)
- Sandy — in-bunker flag (always shown)
- Closest to Pin (shown only on par 3 holes)

Bottom bar:
- "Next Hole" button (disabled until all four gross scores entered)
- "View Scoreboard" link

Snake simultaneous alert:
- If two or more players have three-putt toggled on the same hole, before allowing "Next Hole" the app presents: "Two players three-putted. Who holds the snake?" with player name buttons.
- Peter taps the player who finished putting last.
- Selection is recorded as snakeSimultaneous = true.

---

**Screen 6: Scoreboard**

Accessible from any hole via "View Scoreboard" link. Read only.

Sections:
- Match Play: current status, hole-by-hole result grid (W / L / H per hole per team)
- Skins: standings table (player, skins won), current carry count
- Snake: current holder, history of transfers
- Side Bets: per-player tally (G / NB / NE / S counts and dollar totals)

Back button returns to score entry.

---

**Screen 7: End of Round -- Settlement**

Triggered when "Finish Round" is tapped after hole 18. Header snark: **"Hate paying out? Play better."**

On load, the screen resolves the course from `round.courseId` via `getCourses()` and attaches `course.holes` as `courseHoles` (with `round.holes` from the active round) so the engine has full hole definitions, then calls `computeSettlement`.

Displays only the sections for games that were played (`teamGame` / `individualGames` / `junkGames`):
- Team-game result — Best Ball match status **or** Scramble status
- Final skins standings
- Wolf points (when Wolf was played)
- Snake final holder
- Side-bet totals per player
- Settlement breakdown per player: `Team / Skins / Wolf / Snake / Side` columns + net (every column zero-sum)
- Payment instructions in plain English: "Peter pays Aaron $101.34"

"Save Round" button saves to round history. "New Round" button returns to home.

---

**Screen 8: Round History**

List of completed rounds, most recent first.

Each entry shows:
- Date, course, winner summary
- Tap to expand full settlement detail

No editing of completed rounds in v1.

---

## 5. File Structure

```
fourright/
  src/
    engine/
      courseHandicap.js      -- CH and differential calculations
      strokeHoles.js         -- stroke hole list generation
      matchPlay.js           -- best-ball (team match play) resolution
      skins.js               -- skins resolution
      snake.js               -- snake tracking
      sideBets.js            -- greenie, net birdie, net eagle, sandie
      scramble.js            -- scramble resolution + settlement
      wolf.js                -- wolf rotation, resolution, standings + settlement
      settlement.js          -- final settlement (all game combinations)
      index.js               -- exports all engine functions
    components/
      Home.jsx
      Players.jsx            -- roster list; roster + select modes
      PlayerForm.jsx         -- add/edit a player
      RoundSetup.jsx
      StrokeConfirmation.jsx
      ScoreEntry.jsx
      Scoreboard.jsx
      Settlement.jsx
      RoundHistory.jsx
      AppChrome.jsx          -- shared header + navigation drawer
    utils/
      generateId.js
      playerUtils.js         -- getPlayerName / getPlayerFullName
    storage/
      store.js               -- local storage read/write; player + round APIs;
                                pre-loaded Prestonwood course data
    App.jsx                  -- hash router (incl. /players, /round/players, /round/setup)
    main.jsx
    styles.css
  public/
    golf-bg.jpg              -- home screen background
  index.html                 -- Vite entry HTML (project root)
  tests/
    engine/
      courseHandicap.test.js
      strokeHoles.test.js
      matchPlay.test.js
      skins.test.js
      snake.test.js
      sideBets.test.js
      scramble.test.js
      wolf.test.js
      settlement.test.js     -- legacy shape + new grouped shape (incl. 3-player)
    storage/
      store.test.js
  package.json
  vite.config.js             -- Vite for build, fast dev server
```

Total: 123 tests across 10 files (engine + storage suites), all passing.

---

## 6. Build Sequence

Build in this order. Do not move to the next step until the current step passes its test.

1. Engine only. Write all engine functions. No UI. Run all test files. All settlement figures must match exactly.
2. Storage layer. Write store.js. Test read/write of all data types in browser console.
3. Round setup flow. Screens 1 through 4. Confirm stroke allocation displays correctly for a test round with July 3 players and Meadows data.
4. Score entry. Screen 5. Manual entry of all 18 holes from July 3 scorecard. Confirm scoreboard updates correctly after each hole.
5. Settlement. Screen 7. Confirm settlement matches July 3 results exactly.
6. Round history. Screen 8.
7. Polish. Sunlight contrast, touch target sizing, snake simultaneous edge case.
8. Deploy. GitHub Pages. Bookmark to home screen.

---

## 7. Open Items

All blocking items are resolved. No open items remain before build starts.

---

## 8. Decisions Locked -- Do Not Revisit in v1

- Stroke rule: hcpRank <= differential or CH, equal included
- Skins carry: N+1 skins awarded, 18th hole carry is dead
- Snake: last to complete putting stroke holds it
- Greenie: no carry, no award if no qualifier, par 3 holes only
- Wolf: net scores (full CH), Lone Wolf tie-with-lowest is a loss, points settle at wolfPointValue
- Scramble: gross only (no strokes), lower team gross wins, flat teamGamePayout, tie = no payout
- **Default payouts:** team game $20, skins $10, wolf $2/point, greenie $2, snake $10, sandy $2, net birdie $2, net eagle $4
- 18 holes only
- No backend, no shared view
- **Player model:** firstName + lastName + nickname (max 5) + handicapIndex; no single `name` field (UPDATED 2026-07-10)
- **Roster:** N players, no fixed limit (UPDATED 2026-07-10)
- **2-4 players per round** (SUPERSEDED 2026-07-08: was "four players fixed per round")
- **Game structure:** one `teamGame` (bestBall/scramble/null) + any `individualGames` (skins/wolf) + any `junkGames` (greenie/snake/sandy/netBirdie/netEagle) (UPDATED 2026-07-10)
- Wolf requires exactly 4 players; team games require even teams
- Three courses: Meadows (par 72), Highlands (par 72), Fairways (par 70)
- Manual handicap entry, stored in player profiles
- Blue tees at all three Prestonwood courses
- Meadows: Rating 72.3, Slope 133
- Highlands: Rating 72.0, Slope 129
- Fairways: Rating 68.4, Slope 127
