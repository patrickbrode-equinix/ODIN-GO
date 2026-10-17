/* ================================================ */
/* Preferred colleagues: align whole shift blocks   */
/*                                                  */
/* The planner assigns people one by one, so two    */
/* colleagues end up in the same shift type only by */
/* chance. This pass swaps complete blocks between  */
/* two people who work exactly the same days, so    */
/* the daily staffing stays unchanged and two       */
/* colleagues land in the same shift type.          */
/* Rules are not re-implemented here: the caller    */
/* decides through canTake() whether an employee    */
/* may work a block.                                */
/* ================================================ */

/**
 * Maximal runs of the same shift code per employee.
 * assignments: { [employee]: { [day]: code } }
 */
export function findBlocks(assignments, { isSwappable, firstDay, lastDay } = {}) {
  const blocks = [];
  for (const [employee, days] of Object.entries(assignments)) {
    let current = null;
    for (let day = firstDay; day <= lastDay + 1; day++) {
      const code = day <= lastDay ? days[day] : null;
      if (current && code === current.code) {
        current.end = day;
        continue;
      }
      if (current) blocks.push(current);
      current = code ? { employee, code, start: day, end: day } : null;
    }
  }
  // A block that touches the first or last day may continue into the neighbouring month: leave it alone.
  return blocks.filter((block) => block.start > firstDay && block.end < lastDay && isSwappable(block));
}

function sharedDays(assignments, getType, left, right, startDay, endDay) {
  let shared = 0;
  for (let day = startDay; day <= endDay; day++) {
    const leftType = getType(assignments[left]?.[day]);
    const rightType = getType(assignments[right]?.[day]);
    if (leftType && leftType === rightType) shared += 1;
  }
  return shared;
}

/**
 * wishes: [{ employee, colleague }] (a wish counts for both people).
 * Returns the swaps that were applied: [{ first, second, startDay, endDay, firstCode, secondCode }].
 */
export function alignPreferredColleagues({
  assignments,
  wishes,
  getType,
  isSwappable,
  canTake,
  swap,
  firstDay,
  lastDay,
  maxPasses = 4,
  stats = null,
}) {
  const wishPairs = new Map();
  const addPair = (left, right) => {
    if (!wishPairs.has(left)) wishPairs.set(left, new Set());
    wishPairs.get(left).add(right);
  };
  for (const wish of wishes) {
    addPair(wish.employee, wish.colleague);
    addPair(wish.colleague, wish.employee);
  }
  const applied = [];

  // How many shared shift-type days the two people have with all of their wished colleagues in a window.
  const windowScore = (employee, startDay, endDay) => {
    let score = 0;
    for (const colleague of wishPairs.get(employee) || []) {
      score += sharedDays(assignments, getType, employee, colleague, startDay, endDay);
    }
    return score;
  };

  for (let pass = 0; pass < maxPasses; pass++) {
    let changed = false;
    const blocks = findBlocks(assignments, { isSwappable, firstDay, lastDay });
    const blockKey = (block) => `${block.start}-${block.end}`;
    const byWindow = new Map();
    for (const block of blocks) {
      const key = blockKey(block);
      if (!byWindow.has(key)) byWindow.set(key, []);
      byWindow.get(key).push(block);
    }

    for (const block of blocks) {
      const wished = wishPairs.get(block.employee);
      if (!wished || wished.size === 0) continue;
      const peers = byWindow.get(blockKey(block)) || [];

      // The block may have been swapped earlier in this pass.
      if (assignments[block.employee]?.[block.start] !== block.code) continue;
      const ownType = getType(block.code);

      for (const colleague of wished) {
        const colleagueCode = assignments[colleague]?.[block.start];
        const colleagueType = getType(colleagueCode);
        if (!colleagueType || colleagueType === ownType) { if (stats) stats[colleagueType ? 'already' : 'colleagueIdle'] = (stats[colleagueType ? 'already' : 'colleagueIdle'] || 0) + 1; continue; }
        if (stats) stats.mismatch = (stats.mismatch || 0) + 1;

        // Someone in the colleague's shift type who works exactly the same days takes our place.
        let best = null;
        for (const peer of peers) {
          if (peer.employee === block.employee || peer.employee === colleague) continue;
          if (assignments[peer.employee]?.[peer.start] !== peer.code || getType(peer.code) !== colleagueType) continue;
          const before = windowScore(block.employee, block.start, block.end) + windowScore(peer.employee, block.start, block.end);
          if (stats) stats.peers = (stats.peers || 0) + 1;
          if (!canTake(block.employee, block.start, block.end, peer.code)
            || !canTake(peer.employee, block.start, block.end, block.code)) { if (stats) stats.cannotTake = (stats.cannotTake || 0) + 1; continue; }
          swap(block, peer);
          const after = windowScore(block.employee, block.start, block.end) + windowScore(peer.employee, block.start, block.end);
          // Undo the trial swap, the real one happens after the best peer is known.
          swap({ ...block, code: peer.code }, { ...peer, code: block.code });
          const gain = after - before;
          if (gain > 0 && (!best || gain > best.gain)) best = { peer, gain };
        }
        if (!best) { if (stats) stats.noGain = (stats.noGain || 0) + 1; continue; }

        const { peer } = best;
        swap(block, peer);
        applied.push({
          first: block.employee,
          second: peer.employee,
          startDay: block.start,
          endDay: block.end,
          firstCode: peer.code,
          secondCode: block.code,
          colleague,
        });
        // Keep the lookup tables in sync for later wishes in this pass.
        const previousCode = block.code;
        block.code = peer.code;
        peer.code = previousCode;
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }

  return applied;
}
