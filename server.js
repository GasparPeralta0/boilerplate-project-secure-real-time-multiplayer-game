require("regenerator-runtime/runtime");
require("dotenv").config();
const http = require("http");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const socketio = require("socket.io");

const fccTestingRoutes = require("./routes/fcctesting.js");
const runner = require("./test-runner.js");

const app = express();
app.disable("x-powered-by");

/* ---------------------------
   Seguridad requerida (16-19)
---------------------------- */
app.use(helmet({ contentSecurityPolicy: false }));

app.use((req, res, next) => {
  // 16) nosniff
  res.setHeader("X-Content-Type-Options", "nosniff");

  // 17) anti-XSS (extra)
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // 18) no cache
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate"
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");

  // 19) fake PHP header
  res.setHeader("X-Powered-By", "PHP 7.4.3");

  next();
});

app.use((req, res, next) => {
  // Log solo para endpoints típicos del tester
  if (req.path === "/" || req.path.startsWith("/_api")) {
    res.on("finish", () => {
      console.log("[DEBUG]", req.method, req.path, "->", res.statusCode, {
        "x-content-type-options": res.getHeader("X-Content-Type-Options"),
        "x-xss-protection": res.getHeader("X-XSS-Protection"),
        "cache-control": res.getHeader("Cache-Control"),
        "surrogate-control": res.getHeader("Surrogate-Control"),
        "x-powered-by": res.getHeader("X-Powered-By"),
        "content-type": res.getHeader("Content-Type"),
      });
    });
  }
  next();
});

/* ---------------------------------------------------
   CORS para FCC: dejarlo abierto (boilerplate style)
   + Expose-Headers para que el tester pueda leerlos
---------------------------------------------------- */
app.use(
  cors({
    origin: "*",
    methods: ["GET", "HEAD", "OPTIONS"],
    exposedHeaders: [
      "x-content-type-options",
      "x-xss-protection",
      "cache-control",
      "pragma",
      "expires",
      "surrogate-control",
      "x-powered-by",
      "content-type",
    ],
  })
);

/* ---------------------------
   Middleware estándar FCC
---------------------------- */
app.use("/public", express.static(process.cwd() + "/public", {
  etag: false,
  lastModified: false,
  setHeaders(res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Powered-By", "PHP/7.4.3");
  }
}));

app.use("/assets", express.static(process.cwd() + "/assets", {
  etag: false,
  lastModified: false,
  setHeaders(res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Powered-By", "PHP/7.4.3");
  }
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

/* ---------------------------
   Endpoint que el tester usa
---------------------------- */
app.get("/_api/app-info", (req, res) => {
  // CORS + expose para que FCC lea headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Expose-Headers",
    "x-content-type-options, x-xss-protection, cache-control, pragma, expires, surrogate-control, x-powered-by, content-type"
  );
  res.json({ status: "ok" });
});

/* ---------------------------
   Index
---------------------------- */
app.route("/").get(function (req, res) {
  // Asegura que FCC pueda leer headers desde /
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Expose-Headers",
    "x-content-type-options, x-xss-protection, cache-control, pragma, expires, surrogate-control, x-powered-by, content-type"
  );
  res.sendFile(process.cwd() + "/views/index.html");
});

/* ---------------------------
   Rutas de testing FCC
---------------------------- */
fccTestingRoutes(app);

app.use((req, res, next) => {
  // Si ya se enviaron headers, no se puede
  if (res.headersSent) return next();

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Powered-By", "PHP/7.4.3");

  next();
});

/* ---------------------------
   404
---------------------------- */
app.use(function (req, res) {
  res.status(404).type("text").send("Not Found");
});

const portNum = process.env.PORT || 3000;

/* ---------------------------
   Crear server HTTP + Socket.io v2
---------------------------- */
const server = http.createServer(app);
const io = socketio(server);

/* ---------------------------
   Juego (usa import() dinámico para .mjs)
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

app.get("/socket.io/socket.io.js", (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
  res.setHeader("X-Powered-By", "PHP 7.4.3");

  res.sendFile(require.resolve("socket.io-client/dist/socket.io.js"));
});


io.on("connection", (socket) => {
  // Cargamos clases una sola vez y las reutilizamos
  getClasses()
    .then(({ Player }) => {
      const p = new Player(socket.id, randomInt(40, 740), randomInt(40, 540));
      players.set(socket.id, p);

      socket.emit("state", snapshot());
      socket.broadcast.emit("playerJoined", {
        id: p.id,
        x: p.x,
        y: p.y,
        score: p.score,
      });

      socket.on("move", async (data) => {
        const me = players.get(socket.id);
        if (!me) return;

        const direction = typeof data?.direction === "string" ? data.direction : "";
        const pixels = Number(data?.pixels);

        const allowed = new Set(["up", "down", "left", "right"]);
        if (!allowed.has(direction)) return;
        if (!Number.isFinite(pixels) || pixels <= 0 || pixels > 40) return;

        me.movePlayer(direction, pixels);

        for (const c of collectibles.values()) {
          if (me.collision(c)) {
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
    })
    .catch((err) => {
      console.error("Failed to load Player class:", err);
    });
});
/* ---------------------------
   Levantar server + tests
---------------------------- */
server.listen(portNum, () => {
  console.log(`Listening on port ${portNum}`);

  if (process.env.NODE_ENV === "test") {
    console.log("Running Tests...");
    setTimeout(function () {
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