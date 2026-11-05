const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomInt } = require("node:crypto");
const { WebSocket, WebSocketServer } = require("ws");

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || "0.0.0.0";
const WIDTH = 960;
const HEIGHT = 540;
const PADDLE_WIDTH = 12;
const BALL_RADIUS = 9;
const PADDLE_SPEED = 510;
const WINNING_SCORE = 7;
const rooms = new Map();
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};
const publicFiles = new Set(["index.html", "styles.css", "script.js"]);

function serveFile(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end("Method not allowed");
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response.writeHead(400);
    response.end("Invalid URL");
    return;
  }

  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  if (!publicFiles.has(relativePath)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  const absolutePath = path.resolve(ROOT, relativePath);
  if (!absolutePath.startsWith(`${ROOT}${path.sep}`) && absolutePath !== path.join(ROOT, "index.html")) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.stat(absolutePath, (statError, stat) => {
    if (statError || !stat.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(absolutePath)] || "application/octet-stream",
      "Content-Length": stat.size,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    });
    if (request.method === "HEAD") response.end();
    else fs.createReadStream(absolutePath).pipe(response);
  });
}

function newGame() {
  return {
    status: "ready",
    target: WINNING_SCORE,
    ballSpeed: 390,
    paddleHeight: 96,
    leftY: (HEIGHT - 96) / 2,
    rightY: (HEIGHT - 96) / 2,
    leftScore: 0,
    rightScore: 0,
    ballX: WIDTH / 2,
    ballY: HEIGHT / 2,
    vx: 0,
    vy: 0,
    winner: null,
    input: { left: { up: false, down: false }, right: { up: false, down: false } },
    lastTick: Date.now(),
  };
}

function send(client, payload) {
  if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(payload));
}

function gameSnapshot(room) {
  const game = room.game;
  return {
    status: game.status,
    target: game.target,
    paddleHeight: game.paddleHeight,
    leftY: game.leftY,
    rightY: game.rightY,
    leftScore: game.leftScore,
    rightScore: game.rightScore,
    ballX: game.ballX,
    ballY: game.ballY,
    playerCount: room.players.filter(Boolean).length,
    winner: game.winner,
  };
}

function broadcast(room) {
  const message = JSON.stringify({ type: "state", roomCode: room.code, state: gameSnapshot(room) });
  room.players.forEach((client) => {
    if (client && client.readyState === WebSocket.OPEN) client.send(message);
  });
}

function serveError(client, message) {
  send(client, { type: "error", message });
}

function attachPlayer(client, room, side) {
  room.players[side === "left" ? 0 : 1] = client;
  client.roomCode = room.code;
  client.side = side;
  send(client, { type: side === "left" ? "created" : "joined", roomCode: room.code, side });
  broadcast(room);
}

function resetRound(game) {
  game.leftScore = 0;
  game.rightScore = 0;
  game.leftY = (HEIGHT - game.paddleHeight) / 2;
  game.rightY = (HEIGHT - game.paddleHeight) / 2;
  game.winner = null;
  game.input.left = { up: false, down: false };
  game.input.right = { up: false, down: false };
  resetBall(game, randomInt(0, 2) === 0 ? -1 : 1);
}

function resetBall(game, direction) {
  game.ballX = WIDTH / 2;
  game.ballY = HEIGHT / 2;
  const angle = (Math.random() - 0.5) * 0.7;
  game.vx = Math.cos(angle) * game.ballSpeed * direction;
  game.vy = Math.sin(angle) * game.ballSpeed;
}

function startGame(room, settings = {}) {
  const game = room.game;
  game.target = [3, 5, 7, 11].includes(settings.target) ? settings.target : WINNING_SCORE;
  game.ballSpeed = [310, 390, 500].includes(settings.ballSpeed) ? settings.ballSpeed : 390;
  game.paddleHeight = [72, 96, 122].includes(settings.paddleHeight) ? settings.paddleHeight : 96;
  game.leftScore = 0;
  game.rightScore = 0;
  game.leftY = (HEIGHT - game.paddleHeight) / 2;
  game.rightY = (HEIGHT - game.paddleHeight) / 2;
  game.status = "playing";
  game.winner = null;
  game.input.left = { up: false, down: false };
  game.input.right = { up: false, down: false };
  resetBall(game, randomInt(0, 2) === 0 ? -1 : 1);
  broadcast(room);
}

function updateRoom(room, delta) {
  const game = room.game;
  if (game.status !== "playing" || room.players.some((client) => !client)) return;
  const leftInput = game.input.left;
  const rightInput = game.input.right;
  if (leftInput.up) game.leftY -= PADDLE_SPEED * delta;
  if (leftInput.down) game.leftY += PADDLE_SPEED * delta;
  if (rightInput.up) game.rightY -= PADDLE_SPEED * delta;
  if (rightInput.down) game.rightY += PADDLE_SPEED * delta;
  game.leftY = Math.max(0, Math.min(HEIGHT - game.paddleHeight, game.leftY));
  game.rightY = Math.max(0, Math.min(HEIGHT - game.paddleHeight, game.rightY));

  game.ballX += game.vx * delta;
  game.ballY += game.vy * delta;
  if ((game.ballY - BALL_RADIUS <= 0 && game.vy < 0) || (game.ballY + BALL_RADIUS >= HEIGHT && game.vy > 0)) {
    game.ballY = Math.max(BALL_RADIUS, Math.min(HEIGHT - BALL_RADIUS, game.ballY));
    game.vy *= -1;
  }

  const leftHit = game.vx < 0 && game.ballX - BALL_RADIUS <= 30 + PADDLE_WIDTH
    && game.ballX + BALL_RADIUS >= 30 && game.ballY + BALL_RADIUS >= game.leftY
    && game.ballY - BALL_RADIUS <= game.leftY + game.paddleHeight;
  const rightX = WIDTH - 42;
  const rightHit = game.vx > 0 && game.ballX + BALL_RADIUS >= rightX
    && game.ballX - BALL_RADIUS <= rightX + PADDLE_WIDTH && game.ballY + BALL_RADIUS >= game.rightY
    && game.ballY - BALL_RADIUS <= game.rightY + game.paddleHeight;
  if (leftHit || rightHit) {
    const paddleY = leftHit ? game.leftY : game.rightY;
    const impact = (game.ballY - (paddleY + game.paddleHeight / 2)) / (game.paddleHeight / 2);
    const angle = Math.max(-1, Math.min(1, impact)) * 0.95;
    const direction = leftHit ? 1 : -1;
    const speed = Math.min(Math.hypot(game.vx, game.vy) * 1.035, 760);
    game.vx = Math.cos(angle) * speed * direction;
    game.vy = Math.sin(angle) * speed;
    game.ballX = leftHit ? 30 + PADDLE_WIDTH + BALL_RADIUS : rightX - BALL_RADIUS;
  }

  if (game.ballX + BALL_RADIUS < 0) {
    game.rightScore += 1;
    if (game.rightScore >= game.target) {
      game.status = "finished";
      game.winner = "right";
    } else resetBall(game, 1);
  } else if (game.ballX - BALL_RADIUS > WIDTH) {
    game.leftScore += 1;
    if (game.leftScore >= game.target) {
      game.status = "finished";
      game.winner = "left";
    } else resetBall(game, -1);
  }
}

const server = http.createServer(serveFile);
const webSocketServer = new WebSocketServer({ server, maxPayload: 2048 });

webSocketServer.on("connection", (client, request) => {
  const origin = request.headers.origin;
  if (origin) {
    let originHost;
    try {
      originHost = new URL(origin).host;
    } catch {
      client.close(1008, "Invalid origin");
      return;
    }
    if (originHost !== request.headers.host) {
      client.close(1008, "Origin not allowed");
      return;
    }
  }

  client.lastInputAt = 0;
  client.on("error", (error) => console.error("WebSocket client error:", error.message));
  client.on("message", (rawMessage) => {
    let message;
    try {
      message = JSON.parse(rawMessage.toString());
    } catch {
      serveError(client, "Invalid request.");
      return;
    }
    if (!message || typeof message.type !== "string") {
      serveError(client, "Invalid request.");
      return;
    }

    if (message.type === "create") {
      let code;
      do {
        code = randomInt(0, 36 ** 6).toString(36).toUpperCase().padStart(6, "0");
      } while (rooms.has(code));
      const room = { code, players: [null, null], game: newGame() };
      rooms.set(code, room);
      attachPlayer(client, room, "left");
      return;
    }

    if (message.type === "join") {
      const code = typeof message.roomCode === "string" ? message.roomCode.toUpperCase() : "";
      const room = rooms.get(code);
      if (!room || room.players[1] || !room.players[0]) {
        serveError(client, "That room code is invalid or the room is full.");
        return;
      }
      attachPlayer(client, room, "right");
      return;
    }

    const room = rooms.get(client.roomCode);
    if (!room || room.players[client.side === "left" ? 0 : 1] !== client) {
      serveError(client, "Create or join a room first.");
      return;
    }

    if (message.type === "start" && client.side === "left") {
      if (!room.players[1]) {
        serveError(client, "Wait for an opponent to join before starting.");
        return;
      }
      startGame(room, message.settings || {});
    } else if (message.type === "restart" && client.side === "left") {
      room.game.status = "ready";
      resetRound(room.game);
      broadcast(room);
    } else if (message.type === "input") {
      if (Date.now() - client.lastInputAt < 8) return;
      client.lastInputAt = Date.now();
      const input = room.game.input[client.side];
      input.up = message.up === true;
      input.down = message.down === true;
    } else if (message.type === "move" && Number.isFinite(message.y)) {
      if (Date.now() - client.lastInputAt < 8) return;
      client.lastInputAt = Date.now();
      const y = Math.max(0, Math.min(1, message.y)) * HEIGHT;
      room.game[client.side === "left" ? "leftY" : "rightY"] = Math.max(0, Math.min(HEIGHT - room.game.paddleHeight, y - room.game.paddleHeight / 2));
    }
  });

  client.on("close", () => {
    const room = rooms.get(client.roomCode);
    if (!room) return;
    const index = client.side === "left" ? 0 : 1;
    if (room.players[index] !== client) return;
    room.players[index] = null;
    room.game.status = "ready";
    room.game.input.left = { up: false, down: false };
    room.game.input.right = { up: false, down: false };
    const opponent = room.players[index === 0 ? 1 : 0];
    if (opponent) {
      send(opponent, { type: "disconnected" });
      broadcast(room);
    } else rooms.delete(room.code);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    const delta = Math.min((now - room.game.lastTick) / 1000, 0.04);
    room.game.lastTick = now;
    updateRoom(room, delta);
    broadcast(room);
  }
}, 1000 / 30);

server.listen(PORT, HOST, () => {
  console.log(`Neon Rally is listening on http://${HOST}:${PORT}`);
});
