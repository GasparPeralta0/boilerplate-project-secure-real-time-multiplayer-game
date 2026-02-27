require("regenerator-runtime/runtime");
require("dotenv").config();

const http = require("http");
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const bodyParser = require("body-parser");
const socketio = require("socket.io");
const { pathToFileURL } = require("url");

const fccTestingRoutes = require("./routes/fcctesting.js");
const runner = require("./test-runner.js");

const app = express();
app.disable("x-powered-by");

// Helmet 3.21.3 (FCC pide esa versión). Sin CSP para no romper.
app.use(helmet({ contentSecurityPolicy: false }));

/* -------------------------
   CORS (FCC tester usa credentials: "include")
   => NO puede ser "*"
-------------------------- */
const ALLOWED_ORIGINS = new Set([
  "https://www.freecodecamp.org",
  "https://freecodecamp.org",
  "https://www.freecodecamp.org/espanol",
  "https://freecodecamp.org/espanol",
  "https://secure-real-time-multiplayer-game.freecodecamp.rocks",
]);

const EXPOSED_HEADERS =
  "x-content-type-options, x-xss-protection, cache-control, pragma, expires, surrogate-control, x-powered-by, content-type";

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Expose-Headers", EXPOSED_HEADERS);
    res.setHeader("Vary", "Origin");
  }
}

// CORS + preflight para todo (antes que estáticos y rutas)
app.use((req, res, next) => {
  applyCors(req, res);
  next();
});

app.options("*", (req, res) => {
  applyCors(req, res);
  res.sendStatus(204);
});

/* -------------------------
   Headers 16-19 (SIEMPRE)
-------------------------- */
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("X-Powered-By", "PHP 7.4.3");
  next();
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

/* -------------------------
   Static (sin cache)
-------------------------- */
app.use(
  "/public",
  express.static(path.join(process.cwd(), "public"), {
    etag: false,
    lastModified: false,
    setHeaders(res) {
      // refuerzo
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.setHeader("Surrogate-Control", "no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Powered-By", "PHP 7.4.3");
    },
  })
);

/* -------------------------
   Socket.io client JS
   IMPORTANTE: lo servimos con Express (para que pase CORS + headers)
-------------------------- */
app.get("/socket.io/socket.io.js", (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("X-Powered-By", "PHP 7.4.3");

  res.type("application/javascript; charset=UTF-8");
  res.sendFile(require.resolve("socket.io-client/dist/socket.io.js"));
});

/* -------------------------
   Endpoint del tester
-------------------------- */
app.get("/_api/app-info", (req, res) => {
  applyCors(req, res);
  res.json({ status: "ok" });
});

/* -------------------------
   Home
-------------------------- */
app.get("/", (req, res) => {
  applyCors(req, res);
  res.sendFile(path.join(process.cwd(), "views", "index.html"));
});

// FCC testing routes
fccTestingRoutes(app);

/* -------------------------
   404
-------------------------- */
app.use((req, res) => {
  res.status(404).type("text").send("Not Found");
});

/* -------------------------
   Server + Socket.io v2
   serveClient: false => para que NO intercepte /socket.io/socket.io.js
-------------------------- */
const portNum = process.env.PORT || 3000;
const server = http.createServer(app);
const io = socketio(server, { path: "/ws", serveClient: false });

/* -------------------------
   Juego (carga .mjs desde CommonJS)
-------------------------- */
const players = new Map();
const collectibles = new Map();

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

let classesPromise = null;
function getClasses() {
  if (!classesPromise) {
    const playerUrl = pathToFileURL(path.join(process.cwd(), "public", "Player.mjs")).href;
    const collectibleUrl = pathToFileURL(path.join(process.cwd(), "public", "Collectible.mjs")).href;

    classesPromise = Promise.all([import(playerUrl), import(collectibleUrl)]).then(
      ([modPlayer, modCollectible]) => ({
        Player: modPlayer.default ?? modPlayer.Player,
        Collectible: modCollectible.default ?? modCollectible.Collectible,
      })
    );
  }
  return classesPromise;
}

async function spawnCollectible() {
  const { Collectible } = await getClasses();
  const id = `c_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  // canvas 640x480, item 18x18 => limitamos
  const c = new Collectible({ id, x: randomInt(20, 640 - 18 - 20), y: randomInt(20, 480 - 18 - 20), value: 1 });
  collectibles.set(c.id, c);
  return c;
}

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

// 1 collectible mínimo
getClasses()
  .then(() => spawnCollectible())
  .catch((e) => console.error("Error loading game classes:", e));

io.on("connection", async (socket) => {
  const { Player } = await getClasses();

  const p = new Player({
    id: socket.id,
    x: randomInt(40, 640 - 24 - 40),
    y: randomInt(40, 480 - 24 - 40),
    score: 0,
  });

  players.set(socket.id, p);

  socket.emit("state", snapshot());
  socket.broadcast.emit("playerJoined", { id: p.id, x: p.x, y: p.y, score: p.score });

  socket.on("move", async (data) => {
    const me = players.get(socket.id);
    if (!me) return;

    const direction = typeof data?.direction === "string" ? data.direction : "";
    const pixels = Number(data?.pixels);

    const allowed = new Set(["up", "down", "left", "right"]);
    if (!allowed.has(direction)) return;
    if (!Number.isFinite(pixels) || pixels <= 0 || pixels > 40) return;

    // Player.mjs (por tests) mueve X solamente. Para el juego real movemos Y acá.
    if (direction === "up") me.y -= pixels;
    if (direction === "down") me.y += pixels;
    if (direction === "left" || direction === "right") me.movePlayer(direction, pixels);

    // límites
    me.x = Math.max(0, Math.min(640 - 24, me.x));
    me.y = Math.max(0, Math.min(480 - 24, me.y));

    // colisión: tu Player.mjs usa igualdad exacta x/y. Entonces hacemos exacta acá también.
    for (const c of collectibles.values()) {
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

    io.emit("playerMoved", { id: me.id, x: me.x, y: me.y, score: me.score });
  });

  socket.on("disconnect", () => {
    players.delete(socket.id);
    io.emit("playerLeft", { id: socket.id });
  });
});

/* -------------------------
   Start + tests
-------------------------- */
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