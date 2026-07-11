import { describe, it, expect } from 'vitest';
import {
  getWolfForHole,
  resolveWolfHole,
  createWolfHoleRecord,
  computeWolfStandings,
  computeWolfSettlement,
} from '../../src/engine/wolf.js';

const PLAYER_IDS = ['p1', 'p2', 'p3', 'p4'];

// Scratch players (CH 0) unless a test overrides — keeps net == gross so hole
// outcomes are easy to hand-verify.
const SCRATCH_ROUNDS = PLAYER_IDS.map((playerId) => ({ playerId, courseHandicap: 0 }));

// A generic hard hole (hcpRank 1) so any handicap stroke lands here.
const HOLE = { number: 1, par: 4, hcpRank: 1, isParThree: false };

const scores = (obj) => {
  const out = {};
  for (const id of PLAYER_IDS) out[id] = { gross: obj[id] };
  return out;
};

// --- getWolfForHole ------------------------------------------------------------

describe('getWolfForHole', () => {
  it('assigns the correct Wolf for holes 1-18 (four players in order)', () => {
    // (holeNumber - 1) % 4 -> cycles p1,p2,p3,p4; 17 -> p1, 18 -> p2.
    const expected = [
      'p1', 'p2', 'p3', 'p4', // 1-4
      'p1', 'p2', 'p3', 'p4', // 5-8
      'p1', 'p2', 'p3', 'p4', // 9-12
      'p1', 'p2', 'p3', 'p4', // 13-16
      'p1', 'p2', // 17-18
    ];
    for (let n = 1; n <= 18; n += 1) {
      expect(getWolfForHole(n, PLAYER_IDS)).toBe(expected[n - 1]);
    }
  });
});

// --- resolveWolfHole: Partner Wolf ---------------------------------------------

describe('resolveWolfHole — Partner Wolf (2v2)', () => {
  it('win: Wolf + partner +1 each, opponents -1 each', () => {
    // Wolf p1 + partner p2 vs p3,p4. Best nets: team 4, opp 5 -> team wins.
    const res = resolveWolfHole(scores({ p1: 4, p2: 5, p3: 5, p4: 6 }), 'p1', 'p2', SCRATCH_ROUNDS, HOLE);
    expect(res.wolfResult).toBe('won');
    expect(res.isLoneWolf).toBe(false);
    expect(res.pointChanges).toEqual({ p1: 1, p2: 1, p3: -1, p4: -1 });
  });

  it('loss: Wolf + partner -1 each, opponents +1 each', () => {
    // Team best 5, opp best 4 -> team loses.
    const res = resolveWolfHole(scores({ p1: 6, p2: 5, p3: 4, p4: 5 }), 'p1', 'p2', SCRATCH_ROUNDS, HOLE);
    expect(res.wolfResult).toBe('lost');
    expect(res.pointChanges).toEqual({ p1: -1, p2: -1, p3: 1, p4: 1 });
  });

  it('halved: equal best balls, no point movement', () => {
    // Team best 4, opp best 4 -> halved.
    const res = resolveWolfHole(scores({ p1: 4, p2: 6, p3: 4, p4: 7 }), 'p1', 'p2', SCRATCH_ROUNDS, HOLE);
    expect(res.wolfResult).toBe('halved');
    expect(res.pointChanges).toEqual({ p1: 0, p2: 0, p3: 0, p4: 0 });
  });
});

// --- resolveWolfHole: Lone Wolf ------------------------------------------------

describe('resolveWolfHole — Lone Wolf (1v3)', () => {
  it('win: Wolf +6, each opponent -2', () => {
    const res = resolveWolfHole(scores({ p1: 3, p2: 4, p3: 5, p4: 6 }), 'p1', null, SCRATCH_ROUNDS, HOLE);
    expect(res.wolfResult).toBe('won');
    expect(res.isLoneWolf).toBe(true);
    expect(res.pointChanges).toEqual({ p1: 6, p2: -2, p3: -2, p4: -2 });
  });

  it('loss: Wolf -6, each opponent +2', () => {
    const res = resolveWolfHole(scores({ p1: 5, p2: 4, p3: 5, p4: 6 }), 'p1', null, SCRATCH_ROUNDS, HOLE);
    expect(res.wolfResult).toBe('lost');
    expect(res.pointChanges).toEqual({ p1: -6, p2: 2, p3: 2, p4: 2 });
  });

  it('tying the lowest opponent is a loss for the Wolf', () => {
    // Wolf 4, best opponent also 4 -> Wolf must be strictly lower, so loses.
    const res = resolveWolfHole(scores({ p1: 4, p2: 4, p3: 5, p4: 6 }), 'p1', null, SCRATCH_ROUNDS, HOLE);
    expect(res.wolfResult).toBe('lost');
    expect(res.pointChanges).toEqual({ p1: -6, p2: 2, p3: 2, p4: 2 });
  });
});

// --- Net scores use the full course-handicap stroke allocation -----------------

describe('resolveWolfHole — net scores apply stroke holes', () => {
  it('a handicap stroke flips a Lone Wolf win into a loss', () => {
    // p3, p4 get CH 18 -> one stroke on every hole (base floor(18/18)=1).
    const rounds = [
      { playerId: 'p1', courseHandicap: 0 },
      { playerId: 'p2', courseHandicap: 0 },
      { playerId: 'p3', courseHandicap: 18 },
      { playerId: 'p4', courseHandicap: 18 },
    ];
    // Gross p1 5, p2 6, p3 6, p4 7. Nets: p1 5, p2 6, p3 5, p4 6.
    // Without strokes the Wolf (5) would beat everyone; p3's stroke ties it -> loss.
    const res = resolveWolfHole(scores({ p1: 5, p2: 6, p3: 6, p4: 7 }), 'p1', null, rounds, HOLE);
    expect(res.netScores).toEqual({ p1: 5, p2: 6, p3: 5, p4: 6 });
    expect(res.wolfResult).toBe('lost');
  });
});

// --- createWolfHoleRecord: automatic Lone Wolf flag ----------------------------

describe('createWolfHoleRecord — automatic Lone Wolf', () => {
  const holeScores = scores({ p1: 3, p2: 4, p3: 5, p4: 6 });

  it('flags an automatic Lone Wolf when no partner and no declaration', () => {
    const rec = createWolfHoleRecord(
      1,
      { wolfPlayerId: 'p1', partnerPlayerId: null, declaredLoneWolf: false },
      holeScores,
      SCRATCH_ROUNDS,
      HOLE,
    );
    expect(rec.isLoneWolf).toBe(true);
    expect(rec.isAutomaticLoneWolf).toBe(true);
    expect(rec.wolfResult).toBe('won');
  });

  it('a declared Lone Wolf is not automatic', () => {
    const rec = createWolfHoleRecord(
      1,
      { wolfPlayerId: 'p1', partnerPlayerId: null, declaredLoneWolf: true },
      holeScores,
      SCRATCH_ROUNDS,
      HOLE,
    );
    expect(rec.isLoneWolf).toBe(true);
    expect(rec.isAutomaticLoneWolf).toBe(false);
  });

  it('a partner hole is neither Lone nor automatic Lone Wolf', () => {
    const rec = createWolfHoleRecord(
      1,
      { wolfPlayerId: 'p1', partnerPlayerId: 'p2' },
      holeScores,
      SCRATCH_ROUNDS,
      HOLE,
    );
    expect(rec.isLoneWolf).toBe(false);
    expect(rec.isAutomaticLoneWolf).toBe(false);
  });
});

// --- computeWolfStandings & computeWolfSettlement ------------------------------

// Build an 18-hole record set: p1 lone-wolf wins every hole they are Wolf
// (holes 1,5,9,13,17), and every other hole is a halved partner hole so only the
// lone-wolf holes move points. Deterministic and hand-summable.
function build18() {
  const records = [];
  for (let n = 1; n <= 18; n += 1) {
    const wolf = getWolfForHole(n, PLAYER_IDS);
    if (wolf === 'p1') {
      // Lone Wolf win: p1 +6, others -2.
      records.push({
        holeNumber: n,
        wolfPlayerId: 'p1',
        partnerPlayerId: null,
        isLoneWolf: true,
        isAutomaticLoneWolf: false,
        wolfResult: 'won',
        pointChanges: { p1: 6, p2: -2, p3: -2, p4: -2 },
        netScores: {},
      });
    } else {
      // Halved partner hole (wolf + p1 as partner on non-p1 wolf holes): no movement.
      records.push({
        holeNumber: n,
        wolfPlayerId: wolf,
        partnerPlayerId: 'p1',
        isLoneWolf: false,
        isAutomaticLoneWolf: false,
        wolfResult: 'halved',
        pointChanges: { p1: 0, p2: 0, p3: 0, p4: 0 },
        netScores: {},
      });
    }
  }
  return records;
}

describe('computeWolfStandings', () => {
  it('accumulates cumulative points and wolf/partner counts over 18 holes', () => {
    const round = { playerIds: PLAYER_IDS };
    const { standings } = computeWolfStandings(round, build18());

    // p1 is Wolf on 5 holes (1,5,9,13,17), each +6 -> +30.
    // Each opponent -2 on those 5 holes -> -10.
    const byId = Object.fromEntries(standings.map((s) => [s.playerId, s]));
    expect(byId.p1.points).toBe(30);
    expect(byId.p2.points).toBe(-10);
    expect(byId.p3.points).toBe(-10);
    expect(byId.p4.points).toBe(-10);

    // p1 is Wolf 5 times; partner on the other 13 holes.
    expect(byId.p1.holesAsWolf).toBe(5);
    expect(byId.p1.holesAsPartner).toBe(13);
    // p2 is Wolf on holes 2,6,10,14,18 -> 5.
    expect(byId.p2.holesAsWolf).toBe(5);

    // Sorted by points descending -> p1 first.
    expect(standings[0].playerId).toBe('p1');
    // Zero-sum.
    expect(standings.reduce((a, s) => a + s.points, 0)).toBe(0);
  });
});

describe('computeWolfSettlement', () => {
  it('pays point-to-point: dollars = net points * point value, zero-sum', () => {
    const round = { playerIds: PLAYER_IDS, payouts: { wolfPointValue: 5 } };
    const settlement = computeWolfSettlement(round, build18());
    expect(settlement).toEqual({ p1: 150, p2: -50, p3: -50, p4: -50 });
    expect(Object.values(settlement).reduce((a, b) => a + b, 0)).toBe(0);
  });
});
