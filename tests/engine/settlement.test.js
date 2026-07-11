import { describe, it, expect } from 'vitest';
import { computeSettlement } from '../../src/engine/settlement.js';

// --- Full July 3 Meadows round fixture (spec section 3.3) ----------------------
// Combines everything the sub-engines need: gross scores, match-play differentials,
// full course handicaps, three-putt flags (snake), and the one recorded bunker.

const MEADOWS_HOLES = [
  { number: 1, par: 4, hcpRank: 7, isParThree: false },
  { number: 2, par: 3, hcpRank: 15, isParThree: true },
  { number: 3, par: 5, hcpRank: 3, isParThree: false },
  { number: 4, par: 4, hcpRank: 1, isParThree: false },
  { number: 5, par: 5, hcpRank: 13, isParThree: false },
  { number: 6, par: 4, hcpRank: 11, isParThree: false },
  { number: 7, par: 3, hcpRank: 17, isParThree: true },
  { number: 8, par: 4, hcpRank: 5, isParThree: false },
  { number: 9, par: 4, hcpRank: 9, isParThree: false },
  { number: 10, par: 3, hcpRank: 18, isParThree: true },
  { number: 11, par: 4, hcpRank: 2, isParThree: false },
  { number: 12, par: 5, hcpRank: 14, isParThree: false },
  { number: 13, par: 4, hcpRank: 6, isParThree: false },
  { number: 14, par: 3, hcpRank: 16, isParThree: true },
  { number: 15, par: 4, hcpRank: 10, isParThree: false },
  { number: 16, par: 4, hcpRank: 8, isParThree: false },
  { number: 17, par: 5, hcpRank: 12, isParThree: false },
  { number: 18, par: 4, hcpRank: 4, isParThree: false },
];

const GROSS = {
  peter: [5, 4, 5, 6, 6, 5, 4, 3, 7, 3, 5, 6, 5, 4, 7, 7, 7, 5],
  aaron: [3, 3, 7, 5, 6, 4, 4, 6, 4, 4, 6, 4, 5, 4, 5, 6, 4, 6],
  sean: [4, 2, 6, 5, 7, 7, 5, 7, 6, 4, 6, 5, 6, 5, 7, 5, 6, 4],
  brooks: [6, 3, 5, 4, 5, 7, 4, 5, 7, 3, 5, 5, 6, 4, 4, 6, 5, 5],
};

const PLAYER_IDS = ['peter', 'aaron', 'sean', 'brooks'];

const PLAYER_ROUNDS = [
  { playerId: 'peter', name: 'Peter', courseHandicap: 12, differential: 3 },
  { playerId: 'aaron', name: 'Aaron', courseHandicap: 9, differential: 0 },
  { playerId: 'sean', name: 'Sean', courseHandicap: 21, differential: 12 },
  { playerId: 'brooks', name: 'Brooks', courseHandicap: 13, differential: 4 },
];

const TEAMS = { A: ['peter', 'sean'], B: ['aaron', 'brooks'] };

// Three-putts per hole (snake) and the single recorded bunker (Peter, hole 3).
const THREE_PUTTS = { 1: ['brooks'], 6: ['peter'], 7: ['peter'], 8: ['aaron'], 14: ['peter'], 17: ['aaron'] };
const BUNKER = { 3: ['peter'] };

function holeScoresFor(holeNumber) {
  const idx = holeNumber - 1;
  const threePutters = THREE_PUTTS[holeNumber] || [];
  const bunkered = BUNKER[holeNumber] || [];
  const scores = {};
  for (const id of PLAYER_IDS) {
    scores[id] = {
      gross: GROSS[id][idx],
      threePutt: threePutters.includes(id),
      inBunker: bunkered.includes(id),
      closestOnParThree: false,
    };
  }
  return { holeNumber, scores };
}

const ROUND = {
  teams: TEAMS,
  playerRounds: PLAYER_ROUNDS,
  holes: MEADOWS_HOLES.map((h) => holeScoresFor(h.number)),
  courseHoles: MEADOWS_HOLES,
  payouts: {
    matchPlay: 25,
    skinsPool: 80,
    snake: 10,
    greenie: 2,
    netBirdie: 2,
    netEagle: 4,
    sandie: 2,
  },
  games: {
    matchPlay: true, skins: true, snake: true,
    greenie: true, netBirdie: true, netEagle: true, sandie: true,
  },
};

// Corrected spec 3.5 settlement (Meadows hole 5 = par 5, so Brooks nets a birdie there).
const EXPECTED = {
  peter: { teamGame: -50, skins: -6.67, snake: 10, sideBets: -10, net: -56.67 },
  aaron: { teamGame: 50, skins: -11.11, snake: -30, sideBets: -2, net: 6.89 },
  sean: { teamGame: -50, skins: -2.22, snake: 10, sideBets: 14, net: -28.22 },
  brooks: { teamGame: 50, skins: 20, snake: 10, sideBets: -2, net: 78 },
};

// --- Full settlement -----------------------------------------------------------

describe('computeSettlement — July 3 Meadows (corrected spec 3.5)', () => {
  const settlement = computeSettlement(ROUND);

  it('reproduces every per-player column exactly', () => {
    for (const id of PLAYER_IDS) {
      const e = EXPECTED[id];
      expect(settlement[id].teamGame).toBeCloseTo(e.teamGame, 2);
      expect(settlement[id].skins).toBeCloseTo(e.skins, 2);
      expect(settlement[id].snake).toBeCloseTo(e.snake, 2);
      expect(settlement[id].sideBets).toBeCloseTo(e.sideBets, 2);
      expect(settlement[id].net).toBeCloseTo(e.net, 2);
    }
  });

  it('final nets: Peter -$56.67, Aaron +$6.89, Sean -$28.22, Brooks +$78.00', () => {
    expect(settlement.peter.net).toBeCloseTo(-56.67, 2);
    expect(settlement.aaron.net).toBeCloseTo(6.89, 2);
    expect(settlement.sean.net).toBeCloseTo(-28.22, 2);
    expect(settlement.brooks.net).toBeCloseTo(78.0, 2);
  });

  it('net sums to zero across all players', () => {
    const sum = PLAYER_IDS.reduce((a, id) => a + settlement[id].net, 0);
    expect(Math.round(sum * 100) / 100).toBe(0);
  });

  it('each column is independently zero-sum', () => {
    for (const col of ['teamGame', 'skins', 'snake', 'sideBets']) {
      const sum = PLAYER_IDS.reduce((a, id) => a + settlement[id][col], 0);
      expect(Math.round(sum * 100) / 100).toBe(0);
    }
  });

  it('per-player net equals the sum of its columns', () => {
    for (const id of PLAYER_IDS) {
      const s = settlement[id];
      expect(s.net).toBeCloseTo(s.teamGame + s.skins + s.snake + s.sideBets, 2);
    }
  });
});

// --- Payment instructions ------------------------------------------------------

describe('computeSettlement — instructions', () => {
  const settlement = computeSettlement(ROUND);

  it('produces plain-English transfers in the expected format', () => {
    expect(settlement.instructions).toEqual([
      'Peter pays Brooks $56.67',
      'Sean pays Brooks $21.33',
      'Sean pays Aaron $6.89',
    ]);
  });

  it('every instruction is well-formed "<name> pays <name> $<amount>"', () => {
    for (const line of settlement.instructions) {
      expect(line).toMatch(/^[A-Za-z ]+ pays [A-Za-z ]+ \$\d+\.\d{2}$/);
    }
  });

  it('instructions reconcile to each player net', () => {
    const implied = Object.fromEntries(PLAYER_IDS.map((id) => [id, 0]));
    const byName = { Peter: 'peter', Aaron: 'aaron', Sean: 'sean', Brooks: 'brooks' };
    for (const line of settlement.instructions) {
      const m = line.match(/^(\w+) pays (\w+) \$(\d+\.\d{2})$/);
      const amount = Number(m[3]);
      implied[byName[m[1]]] -= amount; // payer
      implied[byName[m[2]]] += amount; // payee
    }
    for (const id of PLAYER_IDS) {
      expect(implied[id]).toBeCloseTo(settlement[id].net, 2);
    }
  });
});

// --- Disabled games ------------------------------------------------------------

describe('computeSettlement — disabled games', () => {
  it('omits a game when its toggle is off (snake off -> no snake money)', () => {
    const noSnake = { ...ROUND, games: { ...ROUND.games, snake: false } };
    const settlement = computeSettlement(noSnake);
    for (const id of PLAYER_IDS) expect(settlement[id].snake).toBe(0);
    // Net still zero-sum without the snake column.
    const sum = PLAYER_IDS.reduce((a, id) => a + settlement[id].net, 0);
    expect(Math.round(sum * 100) / 100).toBe(0);
    // Peter's net loses his +$10 snake credit: -56.67 - 10 = -66.67.
    expect(settlement.peter.net).toBeCloseTo(-66.67, 2);
  });
});

// --- New game-model wiring (teamGame / individualGames / junkGames) ------------

// Shared payouts for the new-model rounds below.
const NEW_PAYOUTS = {
  matchPlay: 25, skinsPool: 80, snake: 10,
  greenie: 2, netBirdie: 2, netEagle: 4, sandie: 2, teamGame: 20,
};

// One lone-wolf hole Peter wins: +6 to Peter, -2 to each opponent.
const WOLF_HOLES = [
  {
    holeNumber: 1,
    wolfPlayerId: 'peter',
    partnerPlayerId: null,
    isLoneWolf: true,
    isAutomaticLoneWolf: false,
    wolfResult: 'won',
    pointChanges: { peter: 6, aaron: -2, sean: -2, brooks: -2 },
    netScores: {},
  },
];

// Column-wise zero-sum assertion helper.
const columnsZeroSum = (settlement, columns) => {
  for (const col of columns) {
    const sum = PLAYER_IDS.reduce((a, id) => a + settlement[id][col], 0);
    // + 0 normalizes JS negative zero so -0 compares equal to 0.
    expect(Math.round(sum * 100) / 100 + 0).toBe(0);
  }
};

describe('computeSettlement — team game: bestBall only', () => {
  const round = {
    ...ROUND,
    teamGame: 'bestBall',
    individualGames: [],
    junkGames: [],
    payouts: NEW_PAYOUTS,
    games: undefined,
  };
  const settlement = computeSettlement(round);

  it('pays out the match (Team B wins 4&3) and zeroes every other column', () => {
    expect(settlement.peter.teamGame).toBeCloseTo(-50, 2);
    expect(settlement.sean.teamGame).toBeCloseTo(-50, 2);
    expect(settlement.aaron.teamGame).toBeCloseTo(50, 2);
    expect(settlement.brooks.teamGame).toBeCloseTo(50, 2);
    for (const id of PLAYER_IDS) {
      expect(settlement[id].skins).toBe(0);
      expect(settlement[id].wolf).toBe(0);
      expect(settlement[id].snake).toBe(0);
      expect(settlement[id].sideBets).toBe(0);
      expect(settlement[id].net).toBeCloseTo(settlement[id].teamGame, 2);
    }
    columnsZeroSum(settlement, ['teamGame', 'skins', 'wolf', 'snake', 'sideBets', 'net']);
  });
});

describe('computeSettlement — team game: scramble only', () => {
  // Team A wins holes 1-3, all others halved -> Team A wins the match.
  const scrambleHoles = [];
  for (let n = 1; n <= 18; n += 1) {
    scrambleHoles.push({ holeNumber: n, teamScores: { A: 4, B: n <= 3 ? 5 : 4 } });
  }
  const round = {
    teams: TEAMS,
    playerRounds: PLAYER_ROUNDS,
    holes: scrambleHoles,
    courseHoles: MEADOWS_HOLES,
    payouts: NEW_PAYOUTS,
    teamGame: 'scramble',
    individualGames: [],
    junkGames: [],
  };
  const settlement = computeSettlement(round);

  it('winning team receives the payout, losing team pays it', () => {
    expect(settlement.peter.teamGame).toBeCloseTo(20, 2); // Team A
    expect(settlement.sean.teamGame).toBeCloseTo(20, 2);
    expect(settlement.aaron.teamGame).toBeCloseTo(-20, 2); // Team B
    expect(settlement.brooks.teamGame).toBeCloseTo(-20, 2);
    for (const id of PLAYER_IDS) {
      expect(settlement[id].skins).toBe(0);
      expect(settlement[id].wolf).toBe(0);
      expect(settlement[id].net).toBeCloseTo(settlement[id].teamGame, 2);
    }
    columnsZeroSum(settlement, ['teamGame', 'net']);
  });
});

describe('computeSettlement — individual games: skins + wolf', () => {
  const round = {
    ...ROUND,
    teamGame: null,
    individualGames: ['skins', 'wolf'],
    junkGames: [],
    payouts: NEW_PAYOUTS,
    individualGamePayouts: { wolfPointValue: 5 },
    wolfHoles: WOLF_HOLES,
    games: undefined,
  };
  const settlement = computeSettlement(round);

  it('no team game; wolf pays points*value; skins distributes; both zero-sum', () => {
    for (const id of PLAYER_IDS) expect(settlement[id].teamGame).toBe(0);
    // Wolf: Peter +6*$5, each opponent -2*$5.
    expect(settlement.peter.wolf).toBeCloseTo(30, 2);
    expect(settlement.aaron.wolf).toBeCloseTo(-10, 2);
    expect(settlement.sean.wolf).toBeCloseTo(-10, 2);
    expect(settlement.brooks.wolf).toBeCloseTo(-10, 2);
    // Snake/side bets off (not in junkGames).
    for (const id of PLAYER_IDS) {
      expect(settlement[id].snake).toBe(0);
      expect(settlement[id].sideBets).toBe(0);
      expect(settlement[id].net).toBeCloseTo(settlement[id].skins + settlement[id].wolf, 2);
    }
    columnsZeroSum(settlement, ['teamGame', 'skins', 'wolf', 'snake', 'sideBets', 'net']);
  });
});

describe('computeSettlement — all games active', () => {
  const round = {
    ...ROUND,
    teamGame: 'bestBall',
    individualGames: ['skins', 'wolf'],
    junkGames: ['greenie', 'snake', 'sandy', 'netBirdie', 'netEagle'],
    payouts: NEW_PAYOUTS,
    individualGamePayouts: { wolfPointValue: 5 },
    wolfHoles: WOLF_HOLES,
    games: undefined,
  };
  const settlement = computeSettlement(round);

  it('every column and the net are zero-sum', () => {
    columnsZeroSum(settlement, ['teamGame', 'skins', 'wolf', 'snake', 'sideBets', 'net']);
  });

  it('per-player net equals the sum of its columns', () => {
    for (const id of PLAYER_IDS) {
      const s = settlement[id];
      expect(s.net).toBeCloseTo(s.teamGame + s.skins + s.wolf + s.snake + s.sideBets, 2);
    }
  });

  it('all game columns actually contributed (none silently zero)', () => {
    const nonZero = (col) => PLAYER_IDS.some((id) => Math.abs(settlement[id][col]) > 0.001);
    for (const col of ['teamGame', 'skins', 'wolf', 'snake', 'sideBets']) {
      expect(nonZero(col)).toBe(true);
    }
  });
});

describe('computeSettlement — no team game, skins only', () => {
  const round = {
    ...ROUND,
    teamGame: null,
    individualGames: ['skins'],
    junkGames: [],
    payouts: NEW_PAYOUTS,
    games: undefined,
  };
  const settlement = computeSettlement(round);

  it('teamGame column is all zeros', () => {
    for (const id of PLAYER_IDS) expect(settlement[id].teamGame).toBe(0);
  });

  it('skins still distributes and stays zero-sum', () => {
    columnsZeroSum(settlement, ['skins', 'net']);
    expect(PLAYER_IDS.some((id) => Math.abs(settlement[id].skins) > 0.001)).toBe(true);
  });
});

describe('computeSettlement — wolf inactive', () => {
  it('wolf column is zero when wolf is not in individualGames (records present but ignored)', () => {
    const round = {
      ...ROUND,
      teamGame: null,
      individualGames: ['skins'], // wolf omitted
      junkGames: [],
      payouts: NEW_PAYOUTS,
      individualGamePayouts: { wolfPointValue: 5 },
      wolfHoles: WOLF_HOLES, // present but must be ignored
      games: undefined,
    };
    const settlement = computeSettlement(round);
    for (const id of PLAYER_IDS) expect(settlement[id].wolf).toBe(0);
  });
});

// --- Pure new round shape (grouped fields; NO legacy teams/payouts/games) -------
// These rounds carry teamGamePayout / teamAssignments / individualGamePayouts /
// junkGamePayouts / playerIds only — proving computeSettlement consumes the new
// round object end to end.

describe('computeSettlement — new shape reproduces the legacy result', () => {
  // The July 3 Meadows scenario, expressed entirely in the new round shape.
  const newRound = {
    playerIds: PLAYER_IDS,
    playerRounds: PLAYER_ROUNDS,
    holes: ROUND.holes,
    courseHoles: MEADOWS_HOLES,
    teamGame: 'bestBall',
    teamGamePayout: 25,
    teamAssignments: { peter: 'A', sean: 'A', aaron: 'B', brooks: 'B' },
    individualGames: ['skins'],
    individualGamePayouts: { skins: 80, wolfPointValue: 2 },
    junkGames: ['greenie', 'snake', 'sandy', 'netBirdie', 'netEagle'],
    junkGamePayouts: { greenie: 2, snake: 10, sandy: 2, netBirdie: 2, netEagle: 4 },
    wolfHoles: [],
  };
  const settlement = computeSettlement(newRound);

  it('every per-player column matches the legacy-shape EXPECTED values', () => {
    for (const id of PLAYER_IDS) {
      const e = EXPECTED[id];
      expect(settlement[id].teamGame).toBeCloseTo(e.teamGame, 2);
      expect(settlement[id].skins).toBeCloseTo(e.skins, 2);
      expect(settlement[id].snake).toBeCloseTo(e.snake, 2);
      expect(settlement[id].sideBets).toBeCloseTo(e.sideBets, 2);
      expect(settlement[id].net).toBeCloseTo(e.net, 2);
    }
  });

  it('every column is zero-sum', () => {
    columnsZeroSum(settlement, ['teamGame', 'skins', 'wolf', 'snake', 'sideBets', 'net']);
  });
});

describe('computeSettlement — new shape: scramble + wolf', () => {
  // Team A wins holes 1-3, the rest halved -> Team A wins the scramble.
  const scrambleHoles = [];
  for (let n = 1; n <= 18; n += 1) {
    scrambleHoles.push({ holeNumber: n, teamScores: { A: 4, B: n <= 3 ? 5 : 4 } });
  }
  const round = {
    playerIds: PLAYER_IDS,
    playerRounds: PLAYER_ROUNDS,
    holes: scrambleHoles,
    courseHoles: MEADOWS_HOLES,
    teamGame: 'scramble',
    teamGamePayout: 20,
    teamAssignments: { peter: 'A', sean: 'A', aaron: 'B', brooks: 'B' },
    individualGames: ['wolf'],
    individualGamePayouts: { skins: 10, wolfPointValue: 5 },
    junkGames: [],
    junkGamePayouts: { greenie: 2, snake: 10, sandy: 2, netBirdie: 2, netEagle: 4 },
    wolfHoles: WOLF_HOLES,
  };
  const settlement = computeSettlement(round);

  it('scramble pays the winning team; wolf pays points*value; both zero-sum', () => {
    // Scramble: Team A +$20 each, Team B -$20 each.
    expect(settlement.peter.teamGame).toBeCloseTo(20, 2);
    expect(settlement.sean.teamGame).toBeCloseTo(20, 2);
    expect(settlement.aaron.teamGame).toBeCloseTo(-20, 2);
    expect(settlement.brooks.teamGame).toBeCloseTo(-20, 2);
    // Wolf: Peter +6*$5, each opponent -2*$5.
    expect(settlement.peter.wolf).toBeCloseTo(30, 2);
    expect(settlement.aaron.wolf).toBeCloseTo(-10, 2);
    expect(settlement.sean.wolf).toBeCloseTo(-10, 2);
    expect(settlement.brooks.wolf).toBeCloseTo(-10, 2);
    for (const id of PLAYER_IDS) {
      expect(settlement[id].skins).toBe(0);
      expect(settlement[id].snake).toBe(0);
      expect(settlement[id].sideBets).toBe(0);
      expect(settlement[id].net).toBeCloseTo(settlement[id].teamGame + settlement[id].wolf, 2);
    }
    columnsZeroSum(settlement, ['teamGame', 'skins', 'wolf', 'snake', 'sideBets', 'net']);
  });
});

describe('computeSettlement — new shape: 3-player round (no fixed four)', () => {
  const ids3 = ['peter', 'aaron', 'sean'];
  const round = {
    playerIds: ids3,
    playerRounds: PLAYER_ROUNDS.slice(0, 3),
    holes: ROUND.holes, // extra 4th-player scores are ignored (only playerRounds count)
    courseHoles: MEADOWS_HOLES,
    teamGame: null,
    teamGamePayout: 20,
    teamAssignments: {},
    individualGames: ['skins'],
    individualGamePayouts: { skins: 30, wolfPointValue: 2 },
    junkGames: [],
    junkGamePayouts: { greenie: 2, snake: 10, sandy: 2, netBirdie: 2, netEagle: 4 },
    wolfHoles: [],
  };
  const settlement = computeSettlement(round);

  it('settles exactly the three players, no team game, skins zero-sum', () => {
    const keys = Object.keys(settlement).filter((k) => k !== 'instructions');
    expect(keys.sort()).toEqual([...ids3].sort());
    for (const id of ids3) expect(settlement[id].teamGame).toBe(0);
    for (const col of ['skins', 'net']) {
      const sum = ids3.reduce((a, id) => a + settlement[id][col], 0);
      expect(Math.round(sum * 100) / 100 + 0).toBe(0);
    }
    expect(ids3.some((id) => Math.abs(settlement[id].skins) > 0.001)).toBe(true);
  });
});
