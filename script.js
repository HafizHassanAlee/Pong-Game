(() => {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const overlay = document.getElementById("gameOverlay");
  const overlayKicker = document.getElementById("overlayKicker");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayMessage = document.getElementById("overlayMessage");
  const overlayButton = document.getElementById("overlayButton");
  const statusPill = document.getElementById("statusPill");
  const statusText = document.getElementById("statusText");
  const playerScoreElement = document.getElementById("playerScore");
  const cpuScoreElement = document.getElementById("cpuScore");
  const pauseButton = document.getElementById("pauseButton");
  const restartButton = document.getElementById("restartButton");

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const WINNING_SCORE = 7;
  const PADDLE_WIDTH = 12;
  const PADDLE_HEIGHT = 96;
  const BALL_RADIUS = 9;
  const PLAYER_SPEED = 510;
  const AI_SPEED = 385;
  const keys = new Set();
  const player = { x: 30, y: (HEIGHT - PADDLE_HEIGHT) / 2, score: 0 };
  const cpu = { x: WIDTH - 30 - PADDLE_WIDTH, y: (HEIGHT - PADDLE_HEIGHT) / 2, score: 0 };
  const ball = { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0, speed: 390 };
  let state = "ready";
  let previousTime = 0;
  let rallyCount = 0;

  function setState(nextState) {
    state = nextState;
    statusPill.dataset.state = nextState;
    statusText.textContent = nextState === "playing" ? "In play" : nextState === "paused" ? "Paused" : nextState === "finished" ? "Match over" : "Ready";
    pauseButton.textContent = nextState === "paused" ? "▶" : "Ⅱ";
    pauseButton.setAttribute("aria-label", nextState === "paused" ? "Resume game" : "Pause game");
    pauseButton.disabled = nextState === "ready" || nextState === "finished";

    if (nextState === "playing") {
      overlay.hidden = true;
      return;
    }

    overlay.hidden = false;
    if (nextState === "paused") {
      overlayKicker.textContent = "Take your time";
      overlayTitle.textContent = "Game paused";
      overlayMessage.textContent = "Your rally is waiting right here.";
      overlayButton.textContent = "Resume game";
    } else if (nextState === "finished") {
      const playerWon = player.score > cpu.score;
      overlayKicker.textContent = playerWon ? "Nice rally" : "Good game";
      overlayTitle.textContent = playerWon ? "You win!" : "CPU takes it.";
      overlayMessage.textContent = `${player.score} — ${cpu.score}. Ready for a rematch?`;
      overlayButton.textContent = "Play again";
    } else {
      overlayKicker.textContent = "Ready when you are";
      overlayTitle.textContent = "Ready to rally?";
      overlayMessage.textContent = "Move your paddle, return the ball, and be the first to score 7.";
      overlayButton.textContent = "Start game";
    }
  }

  function updateScore() {
    playerScoreElement.textContent = String(player.score);
    cpuScoreElement.textContent = String(cpu.score);
  }

  function resetBall(direction = Math.random() < 0.5 ? -1 : 1) {
    ball.x = WIDTH / 2;
    ball.y = HEIGHT / 2;
    ball.speed = 390 + Math.min(rallyCount, 8) * 9;
    const angle = (Math.random() * 0.7 - 0.35);
    ball.vx = Math.cos(angle) * ball.speed * direction;
    ball.vy = Math.sin(angle) * ball.speed;
  }

  function startMatch() {
    if (state === "paused") {
      setState("playing");
      return;
    }
    if (state === "finished") {
      player.score = 0;
      cpu.score = 0;
      rallyCount = 0;
      updateScore();
    }
    player.y = (HEIGHT - PADDLE_HEIGHT) / 2;
    cpu.y = (HEIGHT - PADDLE_HEIGHT) / 2;
    resetBall();
    setState("playing");
  }

  function pauseMatch() {
    if (state === "playing") {
      keys.clear();
      setState("paused");
    } else if (state === "paused") {
      setState("playing");
    }
  }

  function restartMatch() {
    player.score = 0;
    cpu.score = 0;
    rallyCount = 0;
    player.y = (HEIGHT - PADDLE_HEIGHT) / 2;
    cpu.y = (HEIGHT - PADDLE_HEIGHT) / 2;
    updateScore();
    resetBall();
    setState("ready");
  }

  function movePaddle(paddle, amount) {
    paddle.y = Math.max(0, Math.min(HEIGHT - PADDLE_HEIGHT, paddle.y + amount));
  }

  function hitPaddle(paddle, direction) {
    const impact = (ball.y - (paddle.y + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
    const angle = impact * 0.95;
    ball.speed = Math.min(ball.speed * 1.055, 820);
    ball.vx = Math.cos(angle) * ball.speed * direction;
    ball.vy = Math.sin(angle) * ball.speed;
    rallyCount += 1;
    ball.x = direction > 0 ? paddle.x + PADDLE_WIDTH + BALL_RADIUS : paddle.x - BALL_RADIUS;
  }

  function update(delta) {
    if (state !== "playing") return;

    if (keys.has("ArrowUp") || keys.has("w") || keys.has("W")) movePaddle(player, -PLAYER_SPEED * delta);
    if (keys.has("ArrowDown") || keys.has("s") || keys.has("S")) movePaddle(player, PLAYER_SPEED * delta);

    const aiTarget = ball.vx > 0 && ball.x > WIDTH * 0.38
      ? ball.y - PADDLE_HEIGHT / 2
      : HEIGHT / 2 - PADDLE_HEIGHT / 2;
    const aiDifference = aiTarget - cpu.y;
    movePaddle(cpu, Math.max(-AI_SPEED * delta, Math.min(AI_SPEED * delta, aiDifference)));

    ball.x += ball.vx * delta;
    ball.y += ball.vy * delta;

    if (ball.y - BALL_RADIUS <= 0 && ball.vy < 0) {
      ball.y = BALL_RADIUS;
      ball.vy = Math.abs(ball.vy);
    } else if (ball.y + BALL_RADIUS >= HEIGHT && ball.vy > 0) {
      ball.y = HEIGHT - BALL_RADIUS;
      ball.vy = -Math.abs(ball.vy);
    }

    const overlapsPlayer = ball.vx < 0
      && ball.x - BALL_RADIUS <= player.x + PADDLE_WIDTH
      && ball.x + BALL_RADIUS >= player.x
      && ball.y + BALL_RADIUS >= player.y
      && ball.y - BALL_RADIUS <= player.y + PADDLE_HEIGHT;
    const overlapsCpu = ball.vx > 0
      && ball.x + BALL_RADIUS >= cpu.x
      && ball.x - BALL_RADIUS <= cpu.x + PADDLE_WIDTH
      && ball.y + BALL_RADIUS >= cpu.y
      && ball.y - BALL_RADIUS <= cpu.y + PADDLE_HEIGHT;

    if (overlapsPlayer) hitPaddle(player, 1);
    if (overlapsCpu) hitPaddle(cpu, -1);

    if (ball.x + BALL_RADIUS < 0) {
      cpu.score += 1;
      updateScore();
      rallyCount = 0;
      if (cpu.score >= WINNING_SCORE) setState("finished");
      else resetBall(1);
    } else if (ball.x - BALL_RADIUS > WIDTH) {
      player.score += 1;
      updateScore();
      rallyCount = 0;
      if (player.score >= WINNING_SCORE) setState("finished");
      else resetBall(-1);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "#0c1220";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const glow = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 30, WIDTH / 2, HEIGHT / 2, WIDTH * 0.55);
    glow.addColorStop(0, "rgba(45, 70, 114, 0.15)");
    glow.addColorStop(1, "rgba(12, 18, 32, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.save();
    ctx.setLineDash([9, 13]);
    ctx.strokeStyle = "rgba(162, 178, 215, 0.2)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(WIDTH / 2, 28);
    ctx.lineTo(WIDTH / 2, HEIGHT - 28);
    ctx.stroke();
    ctx.restore();

    drawPaddle(player, "#f2f5ff", "rgba(242, 245, 255, 0.24)");
    drawPaddle(cpu, "#73f5cf", "rgba(115, 245, 207, 0.24)");

    ctx.save();
    ctx.shadowColor = "rgba(115, 245, 207, 0.72)";
    ctx.shadowBlur = 22;
    ctx.fillStyle = "#f3fff9";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (state !== "playing") {
      ctx.fillStyle = "rgba(173, 190, 227, 0.35)";
      ctx.beginPath();
      ctx.arc(WIDTH / 2, HEIGHT / 2, 22, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPaddle(paddle, color, glowColor) {
    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(paddle.x, paddle.y, PADDLE_WIDTH, PADDLE_HEIGHT, 6);
    ctx.fill();
    ctx.restore();
  }

  function frame(time) {
    const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.032) : 0;
    previousTime = time;
    update(delta);
    draw();
    requestAnimationFrame(frame);
  }

  function isControlKey(key) {
    return key === "ArrowUp" || key === "ArrowDown" || key === " " || key.toLowerCase() === "w" || key.toLowerCase() === "s";
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === " " && event.target instanceof Element && event.target.closest("button, a, input, textarea, select, [contenteditable='true']")) return;
    if (isControlKey(event.key)) event.preventDefault();
    if (event.key === " " || event.key === "Escape") {
      if (!event.repeat && (state === "playing" || state === "paused")) pauseMatch();
      else if (!event.repeat && state !== "playing" && state !== "paused") startMatch();
      return;
    }
    keys.add(event.key);
  });

  document.addEventListener("keyup", (event) => keys.delete(event.key));
  window.addEventListener("blur", () => keys.clear());
  overlayButton.addEventListener("click", startMatch);
  pauseButton.addEventListener("click", pauseMatch);
  restartButton.addEventListener("click", restartMatch);

  document.querySelectorAll(".touch-button").forEach((button) => {
    const control = button.dataset.control === "up" ? "ArrowUp" : "ArrowDown";
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      keys.add(control);
      button.setPointerCapture(event.pointerId);
    });
    const release = () => keys.delete(control);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  });

  setState("ready");
  updateScore();
  requestAnimationFrame(frame);
})();
