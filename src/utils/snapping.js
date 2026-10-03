export function distance(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function snapToEndpoint(point, walls = [], threshold = 14) {
  let best = null;
  let bestDistance = threshold;

  for (const wall of walls) {
    if (!wall?.start || !wall?.end) continue;

    const candidates = [wall.start, wall.end];

    for (const candidate of candidates) {
      const d = distance(point, candidate);
      if (d <= bestDistance) {
        bestDistance = d;
        best = { x: candidate.x, y: candidate.y };
      }
    }
  }

  return best || { x: point.x, y: point.y };
}

export function snapAngle(start, end, thresholdDegrees = 12) {
  if (!start || !end) return end;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length === 0) return end;

  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 2;
  const nearest = Math.round(angle / step) * step;
  const difference = Math.abs(angle - nearest);
  const threshold = (thresholdDegrees * Math.PI) / 180;

  if (difference > threshold) return end;

  return {
    x: start.x + Math.cos(nearest) * length,
    y: start.y + Math.sin(nearest) * length,
  };
}

function closestPointOnSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return { x: start.x, y: start.y };
  }

  let t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));

  return {
    x: start.x + t * dx,
    y: start.y + t * dy,
  };
}

export function findNearestWall(point, walls = [], maxDistance = Infinity) {
  let nearest = null;
  let nearestDistance = maxDistance;

  for (const wall of walls) {
    if (!wall?.start || !wall?.end) continue;

    const projected = closestPointOnSegment(point, wall.start, wall.end);
    const d = distance(point, projected);

    if (d <= nearestDistance) {
      nearestDistance = d;
      nearest = {
        wall,
        point: projected,
        distance: d,
      };
    }
  }

  return nearest;
}

export function getWallRotation(wall) {
  if (!wall?.start || !wall?.end) return 0;
  return Math.atan2(
    wall.end.y - wall.start.y,
    wall.end.x - wall.start.x
  );
}
