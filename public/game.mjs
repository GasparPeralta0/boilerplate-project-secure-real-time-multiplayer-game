const socket = io();

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const meEl = document.getElementById("me");
const lbEl = document.getElementById("leaderboard");

const state = {
  players: new Map(),
  collectibles: new Map(),
  myId: null
};

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // coleccionables
  for (const c of state.collectibles.values()) {
    ctx.fillRect(c.x, c.y, 18, 18);
  }

  // jugadores
  for (const p of state.players.values()) {
    ctx.fillRect(p.x, p.y, 24, 24);
  }

  requestAnimationFrame(draw);
}

function updateLeaderboard() {
  const players = Array.from(state.players.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.id).localeCompare(String(b.id));
  });

  // anti-XSS: NO uses innerHTML con datos externos
  lbEl.innerHTML = "";
  for (const p of players) {
    const li = document.createElement("li");
    li.textContent = `${p.id === state.myId ? "Yo" : p.id}: ${p.score}`;
    lbEl.appendChild(li);
  }

  const my = state.players.get(state.myId);
  meEl.textContent = my ? `Tu puntuación: ${my.score}` : "";
}

socket.on("state", (snap) => {
  state.myId = socket.id;

  state.players.clear();
  snap.players.forEach(p => state.players.set(p.id, p));

  state.collectibles.clear();
  snap.collectibles.forEach(c => state.collectibles.set(c.id, c));

  updateLeaderboard();
});

socket.on("playerJoined", (p) => {
  state.players.set(p.id, p);
  updateLeaderboard();
});

socket.on("playerMoved", (p) => {
  state.players.set(p.id, p);
  updateLeaderboard();
});

socket.on("playerLeft", ({ id }) => {
  state.players.delete(id);
  updateLeaderboard();
});

socket.on("collectibleTaken", (msg) => {
  state.collectibles.delete(msg.collectibleId);
  if (msg.newCollectible) state.collectibles.set(msg.newCollectible.id, msg.newCollectible);

  const p = state.players.get(msg.playerId);
  if (p) p.score = msg.score;

  updateLeaderboard();
});

const STEP = 8;
window.addEventListener("keydown", (e) => {
  let direction = null;
  if (e.key === "ArrowUp") direction = "up";
  if (e.key === "ArrowDown") direction = "down";
  if (e.key === "ArrowLeft") direction = "left";
  if (e.key === "ArrowRight") direction = "right";
  if (direction) socket.emit("move", { direction, pixels: STEP });
});

draw();