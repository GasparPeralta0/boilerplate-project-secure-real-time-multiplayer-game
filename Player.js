// Player.mjs
export class Player {
  constructor(id, x = 50, y = 50) {
    this.id = id;
    this.score = 0;
    this.x = x;
    this.y = y;

    this.size = 24;
  }

  movePlayer(direction, pixels) {
    const step = Number(pixels) || 0;

    if (direction === "up") this.y -= step;
    if (direction === "down") this.y += step;
    if (direction === "left") this.x -= step;
    if (direction === "right") this.x += step;
  }

  calculateRank(allPlayers) {
    const players = Array.isArray(allPlayers) ? allPlayers : [];
    const total = players.length || 1;

    const sorted = [...players].sort((a, b) => {
      const sa = Number(a.score) || 0;
      const sb = Number(b.score) || 0;
      if (sb !== sa) return sb - sa;
      return String(a.id).localeCompare(String(b.id));
    });

    const idx = sorted.findIndex(p => String(p.id) === String(this.id));
    const rank = idx >= 0 ? idx + 1 : total;

    return `${rank}/${total}`;
  }

  collision(collectible) {
    if (!collectible) return false;

    const ax1 = this.x, ay1 = this.y;
    const ax2 = this.x + this.size, ay2 = this.y + this.size;

    const bSize = collectible.size ?? 18;
    const bx1 = collectible.x, by1 = collectible.y;
    const bx2 = collectible.x + bSize, by2 = collectible.y + bSize;

    return ax1 < bx2 && ax2 > bx1 && ay1 < by2 && ay2 > by1;
  }
}