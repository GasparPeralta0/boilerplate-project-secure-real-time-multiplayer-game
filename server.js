require("regenerator-runtime/runtime");
require("dotenv").config();

const http = require("http");
const express = require("express");
const bodyParser = require("body-parser");
const helmet = require("helmet");
const socketio = require("socket.io");

const fccTestingRoutes = require("./routes/fcctesting.js");
const runner = require("./test-runner.js");

const app = express();
app.disable("x-powered-by");

// Helmet 3.21.3 (sin CSP para no romper boilerplate)
app.use(helmet({ contentSecurityPolicy: false }));

/* ---------------------------
   CORS ÚNICO (sin duplicados)
   - Si viene de freeCodeCamp => eco del origin + credentials
   - Si no => abierto con *
---------------------------- */
const FCC_ORIGINS = new Set([
  "https://www.freecodecamp.org",
  "https://www.freecodecamp.org/espanol",
]);

const EXPOSE =
  "x-content-type-options, x-xss-protection, cache-control, pragma, expires, surrogate-control, x-powered-by, content-type";

app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (origin && FCC_ORIGINS.has(origin)) {
    // Con credentials, NO puede ser "*"
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  } else {

  }

  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Expose-Headers", EXPOSE);

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* ---------------------------
   Body
---------------------------- */
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

/* ---------------------------
   Headers requeridos (16-19)
   EN TODAS LAS RESPUESTAS
---------------------------- */
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff"); // 16
  res.setHeader("X-XSS-Protection", "1; mode=block"); // 17
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  ); // 18
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("X-Powered-By", "PHP 7.4.3"); // 19
  next();
});

/* ---------------------------
   Static sin cache
---------------------------- */
app.use(
  "/public",
  express.static(process.cwd() + "/public", {
    etag: false,
    lastModified: false,
    setHeaders(res) {
      res.setHeader(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate"
      );
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Surrogate-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-XSS-Protection", "1; mode=block");
      res.setHeader("X-Powered-By", "PHP 7.4.3");
    },
  })
);

/* ---------------------------
   Endpoint usado por tester
---------------------------- */
app.get("/_api/app-info", (req, res) => {
  res.json({ status: "ok" });
});

/* ---------------------------
   Index
---------------------------- */
app.get("/", (req, res) => {
  res.sendFile(process.cwd() + "/views/index.html");
});

/* ---------------------------
   FCC testing routes
---------------------------- */
fccTestingRoutes(app);

/* ---------------------------
   404
---------------------------- */
app.use((req, res) => {
  res.status(404).type("text").send("Not Found");
});

/* ---------------------------
   Server + Socket.io v2
---------------------------- */
const portNum = process.env.PORT || 3000;

const server = http.createServer(app);
const io = socketio(server);

/* ---------------------------
   Game state
---------------------------- */
const players = new Map();
const collectibles = new Map();

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function loadGameClasses() {
  const modPlayer = await import("./public/Player.mjs");
  const modCollectible = await import("./public/Collectible.mjs");

  const Player = modPlayer.default ?? modPlayer.Player;
  const Collectible = modCollectible.default ?? modCollectible.Collectible;

  return { Player, Collectible };
}

let classesPromise = null;
function getClasses() {
  if (!classesPromise) classesPromise = loadGameClasses();
  return classesPromise;
}

async function spawnCollectible() {
  const { Collectible } = await getClasses();
  const id = `c_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const c = new Collectible({
    id,
    x: randomInt(20, 620),
    y: randomInt(20, 440),
    value: 1,
  });
  collectibles.set(c.id, c);
  return c;
}

// mínimo 1 coleccionable
spawnCollectible();

function snapshot() {
  return {
    players: Array.from(players.values()),
    collectibles: Array.from(collectibles.values()),
  };
}

io.on("connection", async (socket) => {
  const { Player } = await getClasses();

  const p = new Player({
    id: socket.id,
    x: randomInt(40, 580),
    y: randomInt(40, 420),
    score: 0,
  });

  players.set(socket.id, p);

  socket.emit("state", snapshot());
  socket.broadcast.emit("playerJoined", p);

  socket.on("move", async (data) => {
    const me = players.get(socket.id);
    if (!me) return;

    const direction = typeof data?.direction === "string" ? data.direction : "";
    const pixels = Number(data?.pixels);

    const allowed = new Set(["up", "down", "left", "right"]);
    if (!allowed.has(direction)) return;
    if (!Number.isFinite(pixels) || pixels <= 0 || pixels > 40) return;

    // Player.mjs en tests mueve X, pero acá movemos 2D completo
    if (direction === "up") me.y -= pixels;
    if (direction === "down") me.y += pixels;
    if (direction === "left" || direction === "right")
      me.movePlayer(direction, pixels);

    // límites canvas (640x480)
    me.x = Math.max(0, Math.min(640 - 24, me.x));
    me.y = Math.max(0, Math.min(480 - 24, me.y));

    for (const c of collectibles.values()) {
      // (simple) colisión por igualdad exacta
      if (me.x === c.x && me.y === c.y) {
        me.score += c.value ?? 1;
        collectibles.delete(c.id);

        const newC = await spawnCollectible();

        io.emit("collectibleTaken", {
          playerId: me.id,
          collectibleId: c.id,
          newCollectible: { id: newC.id, x: newC.x, y: newC.y },
          score: me.score,
        });
        break;
      }
    }

    io.emit("playerMoved", me);
  });

  socket.on("disconnect", () => {
    players.delete(socket.id);
    io.emit("playerLeft", { id: socket.id });
  });
});

/* ---------------------------
   Start + tests
---------------------------- */
server.listen(portNum, () => {
  console.log(`Listening on port ${portNum}`);

  if (process.env.NODE_ENV === "test") {
    console.log("Running Tests...");
    setTimeout(() => {
      try {
        runner.run();
      } catch (error) {
        console.log("Tests are not valid:");
        console.error(error);
      }
    }, 1500);
  }
});

module.exports = app;