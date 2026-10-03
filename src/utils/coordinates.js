export function screenToMap(
  screenX,
  screenY,
  rect,
  mapWidth,
  mapHeight
) {
  const x =
    ((screenX - rect.left) / rect.width) *
    mapWidth;

  const y =
    ((screenY - rect.top) / rect.height) *
    mapHeight;

  return {
    x,
    y
  };
}


export function mapToScreen(
  mapX,
  mapY,
  rect,
  mapWidth,
  mapHeight
) {
  const x =
    rect.left +
    (mapX / mapWidth) * rect.width;

  const y =
    rect.top +
    (mapY / mapHeight) * rect.height;

  return {
    x,
    y
  };
}