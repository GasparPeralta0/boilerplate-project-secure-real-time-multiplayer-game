export class Collectible {
  constructor(a, b, c) {
    // Soporta:
    // new Collectible({ x, y, value, id })
    // new Collectible(id, x, y)
    const isObj = a && typeof a === "object";

    const data = isObj ? a : { id: a, x: b, y: c };

    this.id = data.id ?? Math.random().toString(36).slice(2);
    this.x = typeof data.x === "number" ? data.x : Math.floor(Math.random() * 600);
    this.y = typeof data.y === "number" ? data.y : Math.floor(Math.random() * 400);
    this.value = typeof data.value === "number" ? data.value : 1;

    this.size = 20;
  }
}