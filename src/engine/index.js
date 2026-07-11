// Engine entry point: re-exports every engine function from one place, so
// callers can `import { computeSettlement, computeSkinsStandings, ... } from './engine'`
// instead of reaching into individual module files. See spec section 5.

export * from './courseHandicap.js'; // computeCourseHandicap, computeDifferential
export * from './strokeHoles.js';    // computeStrokeHolesMatchPlay, computeStrokeHolesSkins
export * from './matchPlay.js';      // resolveMatchPlayHole, computeMatchPlayStatus
export * from './skins.js';          // resolveSkinsHole, computeSkinsStandings
export * from './snake.js';          // resolveSnake, computeSnakeFinal, FINAL_HOLE
export * from './sideBets.js';       // resolveSideBets, computeSideBetTotals
export * from './scramble.js';       // resolveScrambleHole, computeScrambleStatus, computeScrambleSettlement
export * from './wolf.js';           // getWolfForHole, resolveWolfHole, createWolfHoleRecord, computeWolfStandings, computeWolfSettlement
export * from './settlement.js';     // computeSettlement
