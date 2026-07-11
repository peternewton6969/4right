// Stroke hole list generation.
// Pure functions, no side effects, no React dependencies. See spec sections 2.2, 3.2.
//
// Stroke eligibility rule (equal-to included, USGA standard):
//   match play:  hole receives a stroke if hcpRank <= differential
//   skins:       hole receives a stroke if hcpRank <= courseHandicap,
//                with an additional stroke each time courseHandicap laps 18.

/**
 * Compute match-play stroke holes (differential method).
 * A hole is a stroke hole when its hcpRank <= differential.
 * Match-play differentials never exceed a single 18-hole allocation, so each
 * hole receives at most one stroke — the result is a flat list of hole numbers.
 *
 * @param {number} differential - Player differential off the low man.
 * @param {Array<{number:number, hcpRank:number}>} holes - Course holes.
 * @returns {number[]} Hole numbers that receive a stroke, ordered hardest first (by hcpRank).
 */
export function computeStrokeHolesMatchPlay(differential, holes) {
  return holes
    .filter((h) => h.hcpRank <= differential)
    .sort((a, b) => a.hcpRank - b.hcpRank)
    .map((h) => h.number);
}

/**
 * Compute skins/side-bet stroke holes (full course-handicap method).
 * Uses the standard USGA allocation: every hole gets floor(CH / 18) strokes,
 * then holes ranked hcpRank <= (CH mod 18) get one additional stroke. When
 * CH > 18 this yields double strokes on the lowest-ranked holes.
 *
 * @param {number} courseHandicap - Player course handicap.
 * @param {Array<{number:number, hcpRank:number}>} holes - Course holes.
 * @returns {Object<number, number>} Map of hole number -> stroke count.
 *   Only holes that receive at least one stroke are included.
 */
export function computeStrokeHolesSkins(courseHandicap, holes) {
  const holeCount = holes.length;
  const base = Math.floor(courseHandicap / holeCount);
  const remainder = courseHandicap % holeCount;

  const result = {};
  for (const h of holes) {
    const strokes = base + (h.hcpRank <= remainder ? 1 : 0);
    if (strokes > 0) {
      result[h.number] = strokes;
    }
  }
  return result;
}
