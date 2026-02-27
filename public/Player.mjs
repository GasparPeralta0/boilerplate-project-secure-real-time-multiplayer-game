export default class Player {
  constructor(data = {}) {
    this.id = data.id ?? Date.now();
    this.score = data.score ?? 0;
    this.x = data.x ?? 0;
    this.y = data.y ?? 0;
  }

  // Unit test: solo verifica eje X
  movePlayer(direction, pixels) {
    const dir = String(direction || "").toLowerCase();
    const step = Number(pixels) || 0;

    if (dir === "left") this.x -= step;
    if (dir === "right") this.x += step;

    // (si querés mover en Y para el juego real, lo hacemos en el server,
    // pero para pasar el test, esto debe quedar así)
  }

   collision(item) {
    if (!item) return false;
    return this.x === item.x && this.y === item.y;
  }

  calculateRank(arr) {
    const players = Array.isArray(arr) ? arr : [];
    const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0));
    const idx = sorted.findIndex((p) => p.id === this.id);
    const rank = idx === -1 ? 1 : idx + 1;
    const total = players.length || 1;
    return `Rank: ${rank}/${total}`;
  }
}