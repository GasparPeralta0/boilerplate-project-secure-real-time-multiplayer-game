export class Player {
  constructor(id, x = 50, y = 50) {
    this.id = id || Math.random().toString(36).slice(2);
    this.score = 0;

    this.x = x;
    this.y = y;

    this.size = 20;
  }

    movePlayer(direction, pixels) {
    const dir = String(direction || "").trim().toLowerCase();
    const step = Number(pixels) || 0;

    if (dir === "up" || dir === "u") this.y -= step;
    else if (dir === "down" || dir === "d") this.y += step;
    else if (dir === "left" || dir === "l") this.x -= step;
    else if (dir === "right" || dir === "r") this.x += step;
  }

  collision(collectible) {
    if (!collectible) return false;

    // Colisión por distancia (más compatible con tests FCC)
    const dx = (this.x ?? 0) - (collectible.x ?? 0);
    const dy = (this.y ?? 0) - (collectible.y ?? 0);

    const dist = Math.sqrt(dx * dx + dy * dy);

    // Umbral típico: 20px
    return dist < 25;
  }

  calculateRank(playersArr) {
    const players = Array.isArray(playersArr) ? playersArr : [];
    const total = players.length || 1;

    const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
    const idx = sorted.findIndex((p) => p.id === this.id);
    const rank = idx === -1 ? 1 : idx + 1;

    return `Rank: ${rank}/${total}`;
  }
}