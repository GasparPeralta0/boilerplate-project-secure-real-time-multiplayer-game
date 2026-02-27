export default class Collectible {
  constructor(data = {}) {
    this.id = data.id ?? Date.now();
    this.value = data.value ?? 1;
    this.x = data.x ?? 0;
    this.y = data.y ?? 0;
  }
}