import http from "http";
import express from "express";
import helmet from "helmet";
import cors from "cors";

// Socket.io v2 (CommonJS) + ESM (mjs) => import robusto
import socketIoPkg from "socket.io";
const socketio = socketIoPkg.default ?? socketIoPkg;

import { Player } from "./Player.mjs";
import { Collectible } from "./Collectible.mjs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.disable("x-powered-by");
// CORS: permitir solo a freeCodeCamp para que el tester pueda hacer fetch
import cors from "cors";

const FCC_ORIGINS = [
  "https://www.freecodecamp.org",
  "https://www.freecodecamp.org/espanol",
  "https://freecodecamp.org",
  "https://freecodecamp.org/espanol"
];

const EXPOSED = [
  "x-content-type-options",
  "x-xss-protection",
  "cache-control",
  "pragma",
  "expires",
  "surrogate-control",
  "x-powered-by",
  "content-type"
];

app.use(cors({
  origin: FCC_ORIGINS,
  methods: ["GET", "HEAD", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  exposedHeaders: EXPOSED
}));

// Por si el tester hace preflight (OPTIONS) a esa ruta:
app.options("/_api/app-info", cors({
  origin: FCC_ORIGINS,
  methods: ["GET", "HEAD", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
  exposedHeaders: EXPOSED
}));

// Helmet 3.21.3
// Nota: desactivo CSP para evitar que bloquee scripts/socket.io en algunos entornos
app.use(helmet({ contentSecurityPolicy: false }));

// Headers requeridos por tests
app.use((req, res, next) => {
  // Anti MIME-sniff
  res.setHeader("X-Content-Type-Options", "nosniff");

  // No cache
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");

  // “Generado por PHP 7.4.3”
  res.setHeader("X-Powered-By", "PHP/7.4.3");

  // Capa extra anti-XSS
  res.setHeader("X-XSS-Protection", "1; mode=block");

  next();
});

app.get("/_api/app-info", (req, res) => {
  res.json({ status: "ok" });
});

// Servir estáticos sin cache
const publicDir = path.join(__dirname, "public");

app.use(express.static(publicDir, {
  etag: false,
  lastModified: false,
  setHeaders(res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Powered-By", "PHP/7.4.3");
  }
}));

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

const server = http.createServer(app);

// Socket.io v2 => se crea así (NO new Server)
const io = socketio(server);

// Estado del juego
const players = new Map(); // socket.id -> Player
const collectibles = new Map(); // id -> Collectible

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function spawnCollectible() {
  const id = `c_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const c = new Collectible(id, randomInt(20, 760), randomInt(20, 560));
  collectibles.set(id, c);
  return c;
}

// mínimo 1 coleccionable
spawnCollectible();

function snapshot() {
  return {
    players: Array.from(players.values()).map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      score: p.score,
    })),
    collectibles: Array.from(collectibles.values()).map((c) => ({
      id: c.id,
      x: c.x,
      y: c.y,
    })),
  };
}

io.on("connection", (socket) => {
  const p = new Player(socket.id, randomInt(40, 740), randomInt(40, 540));
  players.set(socket.id, p);

  socket.emit("state", snapshot());
  socket.broadcast.emit("playerJoined", {
    id: p.id,
    x: p.x,
    y: p.y,
    score: p.score,
  });

  socket.on("move", (data) => {
    const me = players.get(socket.id);
    if (!me) return;

    const direction = typeof data?.direction === "string" ? data.direction : "";
    const pixels = Number(data?.pixels);

    const allowed = new Set(["up", "down", "left", "right"]);
    if (!allowed.has(direction)) return;
    if (!Number.isFinite(pixels) || pixels <= 0 || pixels > 40) return;

    me.movePlayer(direction, pixels);

    // colisión con coleccionables
    for (const c of collectibles.values()) {
      if (me.collision(c)) {
        me.score += c.value ?? 1;
        collectibles.delete(c.id);

        const newC = spawnCollectible();

        io.emit("collectibleTaken", {
          playerId: me.id,
          collectibleId: c.id,
          newCollectible: { id: newC.id, x: newC.x, y: newC.y },
          score: me.score,
        });
        break;
      }
    }

    io.emit("playerMoved", { id: me.id, x: me.x, y: me.y, score: me.score });
  });

  socket.on("disconnect", () => {
    players.delete(socket.id);
    io.emit("playerLeft", { id: socket.id });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Listening on port ${PORT}`));  