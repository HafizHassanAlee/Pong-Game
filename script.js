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
  const leftName = document.getElementById("leftName");
  const rightName = document.getElementById("rightName");
  const pauseButton = document.getElementById("pauseButton");
  const restartButton = document.getElementById("restartButton");
  const soundButton = document.getElementById("soundButton");
  const modeSelect = document.getElementById("modeSelect");
  const difficultySelect = document.getElementById("difficultySelect");
  const targetSelect = document.getElementById("targetSelect");
  const speedSelect = document.getElementById("speedSelect");
  const paddleSelect = document.getElementById("paddleSelect");
  const themeSelect = document.getElementById("themeSelect");
  const difficultyField = document.getElementById("difficultyField");
  const onlinePanel = document.getElementById("onlinePanel");
  const connectionMessage = document.getElementById("connectionMessage");
  const roomCodeInput = document.getElementById("roomCodeInput");
  const tournamentPanel = document.getElementById("tournamentPanel");
  const tournamentStatus = document.getElementById("tournamentStatus");
  const tournamentTitle = document.getElementById("tournamentTitle");
  const highScoreList = document.getElementById("highScoreList");
  const matchHistoryList = document.getElementById("matchHistory");
  const touchPlayerTwo = document.getElementById("touchPlayerTwo");

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  const PADDLE_WIDTH = 12;
  const BALL_RADIUS = 9;
  const STORAGE_KEY = "neon-rally-records-v1";
  const themes = {
    neon: { left: "#f2f5ff", right: "#73f5cf", ball: "#f3fff9", glow: "rgba(115, 245, 207, 0.72)", court: "#0c1220", line: "rgba(162, 178, 215, 0.2)" },
    sunset: { left: "#ffe0bb", right: "#ff9a76", ball: "#fff4df", glow: "rgba(255, 154, 118, 0.72)", court: "#1b101c", line: "rgba(255, 188, 156, 0.22)" },
    ice: { left: "#e5f7ff", right: "#83d9ff", ball: "#f2fcff", glow: "rgba(131, 217, 255, 0.72)", court: "#0c1925", line: "rgba(163, 218, 243, 0.22)" },
    mono: { left: "#f5f5f5", right: "#bdbdbd", ball: "#ffffff", glow: "rgba(230, 230, 230, 0.62)", court: "#151515", line: "rgba(210, 210, 210, 0.2)" },
  };
  const difficulty = {
    easy: { speed: 285, error: 76 },
    normal: { speed: 385, error: 39 },
    hard: { speed: 510, error: 8 },
  };
  const keys = new Set();
  const left = { x: 30, y: (HEIGHT - 96) / 2, score: 0, height: 96, boostUntil: 0 };
  const right = { x: WIDTH - 42, y: (HEIGHT - 96) / 2, score: 0, height: 96, boostUntil: 0 };
  const ball = { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0, speed: 390 };
  let state = "ready";
  let mode = "cpu";
  let previousTime = 0;
  let rallyCount = 0;
  let roundSettings = null;
  let records = { best: 0, history: [] };
  let audioContext = null;
  let soundEnabled = false;
  let musicTimer = null;
  let musicStep = 0;
  let powerup = null;
  let powerupTimer = 0;
  let powerupEffect = null;
  let tournament = { round: 0, playerWins: 0, cpuWins: 0, active: false };
  let socket = null;
  let onlineSide = null;
  let remoteState = null;

  function setStatus(nextState, label) {
    statusPill.dataset.state = nextState;
    statusText.textContent = label;
  }

  function setOverlay(kicker, title, message, button) {
    overlayKicker.textContent = kicker;
    overlayTitle.textContent = title;
    overlayMessage.textContent = message;
    overlayButton.textContent = button;
    overlay.hidden = false;
  }

  function setState(nextState) {
    state = nextState;
    const labels = { ready: "Ready", playing: "In play", paused: "Paused", finished: "Match over", connecting: "Connecting", waiting: "Waiting" };
    setStatus(nextState, labels[nextState] || "Ready");
    pauseButton.textContent = nextState === "paused" ? "▶" : "Ⅱ";
    pauseButton.setAttribute("aria-label", nextState === "paused" ? "Resume game" : "Pause game");
    pauseButton.disabled = mode === "online" || !["playing", "paused"].includes(nextState);
    const settingsLocked = ["playing", "paused"].includes(nextState);
    [modeSelect, difficultySelect, targetSelect, speedSelect, paddleSelect].forEach((control) => {
      control.disabled = settingsLocked;
    });
    if (nextState === "playing") {
      overlay.hidden = true;
      return;
    }
    if (nextState === "paused") setOverlay("Take your time", "Game paused", "Your rally is waiting right here.", "Resume game");
    if (nextState === "ready") setOverlay("Ready when you are", "Ready to rally?", `First to ${mode === "tournament" ? 5 : targetScore()} points wins.`, "Start game");
  }

  function targetScore() {
    return Number(targetSelect.value);
  }

  function baseBallSpeed() {
    return { slow: 310, normal: 390, fast: 500 }[speedSelect.value];
  }

  function basePaddleHeight() {
    return { small: 72, normal: 96, large: 122 }[paddleSelect.value];
  }

  function refreshModeUI() {
    mode = modeSelect.value;
    document.body.dataset.mode = mode;
    overlayButton.disabled = false;
    if (mode === "tournament") {
      tournament = { round: 0, playerWins: 0, cpuWins: 0, active: false };
      tournamentTitle.textContent = "Tournament";
      tournamentStatus.textContent = "Win 2 of 3 matches to lift the cup.";
    }
    difficultyField.hidden = mode !== "cpu" && mode !== "tournament";
    onlinePanel.hidden = mode !== "online";
    tournamentPanel.hidden = mode !== "tournament";
    touchPlayerTwo.hidden = mode !== "local";
    document.getElementById("rightControls").hidden = mode === "cpu" || mode === "tournament";
    leftName.textContent = mode === "online" ? "You" : mode === "local" ? "Player 1" : "You";
    rightName.textContent = mode === "online" ? "Opponent" : mode === "local" ? "Player 2" : "CPU";
    canvas.setAttribute("aria-label", mode === "local"
      ? "Pong court. Player one uses W and S; player two uses the up and down arrow keys."
      : "Pong court. Use W and S or the up and down arrow keys to move your paddle.");
    if (state !== "playing" && state !== "paused") setState("ready");
  }

  function readRecords() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed.best === "number" && Array.isArray(parsed.history)) records = parsed;
      }
    } catch (error) {
      console.error("Could not load saved Pong records.", error);
      connectionMessage.textContent = "Local storage is unavailable; match records may not persist.";
    }
    renderRecords();
  }

  function saveRecords() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (error) {
      console.error("Could not save Pong records.", error);
      connectionMessage.textContent = "Could not save records in this browser.";
    }
  }

  function renderRecords() {
    highScoreList.replaceChildren();
    if (!records.best) {
      addEmpty(highScoreList, "Your first win is waiting.");
    } else {
      const item = document.createElement("li");
      const label = document.createElement("span");
      const score = document.createElement("span");
      label.textContent = "Best winning score";
      score.textContent = String(records.best);
      item.append(label, score);
      highScoreList.append(item);
    }

    matchHistoryList.replaceChildren();
    if (!records.history.length) {
      addEmpty(matchHistoryList, "Finished games will show up here.");
      return;
    }
    records.history.slice(0, 5).forEach((match) => {
      const item = document.createElement("li");
      const date = new Date(match.date).toLocaleDateString();
      const modeLabel = { cpu: "Solo", local: "2P", online: "Online", tournament: "Cup" }[match.mode] || "Match";
      const summary = document.createElement("span");
      const score = document.createElement("span");
      summary.textContent = `${date} · ${modeLabel} · ${match.result}`;
      score.textContent = match.score;
      item.append(summary, score);
      matchHistoryList.append(item);
    });
  }

  function addEmpty(list, message) {
    const item = document.createElement("li");
    item.className = "empty-record";
    item.textContent = message;
    list.append(item);
  }

  function saveMatchResult() {
    const won = mode === "online"
      ? (onlineSide === "left" ? left.score > right.score : right.score > left.score)
      : left.score > right.score;
    records.best = Math.max(records.best, won ? left.score : 0);
    records.history.unshift({
      date: new Date().toISOString(),
      mode,
      result: mode === "local" ? (won ? "P1 won" : "P2 won") : won ? "Won" : "Lost",
      score: `${left.score}–${right.score}`,
    });
    records.history = records.history.slice(0, 20);
    saveRecords();
    renderRecords();
  }

  function sound(type) {
    if (!soundEnabled || !audioContext) return;
    const notes = { hit: [520, 0.055], wall: [390, 0.045], score: [740, 0.16], power: [920, 0.12] };
    const [frequency, duration] = notes[type];
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type === "score" ? "triangle" : "sine";
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    if (type === "score") oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.65, audioContext.currentTime + duration);
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, audioContext.currentTime + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration + 0.01);
  }

  async function toggleSound() {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        connectionMessage.textContent = "Audio is not supported in this browser.";
        return;
      }
      audioContext = new AudioContextClass();
    }
    if (audioContext.state === "suspended") await audioContext.resume();
    soundEnabled = !soundEnabled;
    soundButton.textContent = soundEnabled ? "♫" : "♪";
    soundButton.setAttribute("aria-label", soundEnabled ? "Mute sound and music" : "Enable sound");
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
    if (soundEnabled) {
      musicStep = 0;
      musicTimer = setInterval(() => {
        const melody = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = melody[musicStep % melody.length];
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.018, audioContext.currentTime + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.24);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.25);
        musicStep += 1;
      }, 360);
    }
  }

  function resetBall(direction = Math.random() < 0.5 ? -1 : 1) {
    ball.x = WIDTH / 2;
    ball.y = HEIGHT / 2;
    ball.speed = (roundSettings?.ballSpeed ?? baseBallSpeed()) + Math.min(rallyCount, 8) * 9;
    const angle = Math.random() * 0.7 - 0.35;
    ball.vx = Math.cos(angle) * ball.speed * direction;
    ball.vy = Math.sin(angle) * ball.speed;
  }

  function resetPaddles() {
    const height = roundSettings?.paddleHeight ?? basePaddleHeight();
    left.height = height;
    right.height = height;
    left.y = (HEIGHT - height) / 2;
    right.y = (HEIGHT - height) / 2;
    left.boostUntil = 0;
    right.boostUntil = 0;
  }

  function startMatch() {
    if (state === "paused") {
      setState("playing");
      return;
    }
    if (mode === "online") {
      if (onlineSide !== "left") return;
      sendSocket({
        type: "start",
        settings: {
          target: targetScore(),
          ballSpeed: baseBallSpeed(),
          paddleHeight: basePaddleHeight(),
        },
      });
      return;
    }
    if (mode === "tournament" && !tournament.active) {
      startTournament();
      return;
    }
    if (state === "finished") {
      left.score = 0;
      right.score = 0;
      rallyCount = 0;
      if (mode === "tournament" && tournament.active && tournament.round < 3) beginTournamentMatch();
      else if (mode === "tournament") startTournament();
    }
    roundSettings = {
      target: mode === "tournament" ? 5 : targetScore(),
      ballSpeed: baseBallSpeed(),
      paddleHeight: basePaddleHeight(),
    };
    resetPaddles();
    clearPowerups();
    resetBall();
    updateScore();
    setState("playing");
  }

  function startTournament() {
    tournament = { round: 0, playerWins: 0, cpuWins: 0, active: true };
    tournamentPanel.hidden = false;
    beginTournamentMatch();
  }

  function beginTournamentMatch() {
    tournament.round += 1;
    tournamentStatus.textContent = `Match ${tournament.round} of 3 · Series ${tournament.playerWins}–${tournament.cpuWins}`;
    roundSettings = {
      target: 5,
      ballSpeed: baseBallSpeed(),
      paddleHeight: basePaddleHeight(),
    };
    resetPaddles();
    left.score = 0;
    right.score = 0;
    rallyCount = 0;
    clearPowerups();
    resetBall();
    updateScore();
    setState("playing");
  }

  function pauseMatch() {
    if (state === "playing" && mode !== "online") {
      keys.clear();
      setState("paused");
    } else if (state === "paused") setState("playing");
  }

  function restartMatch() {
    if (mode === "online") {
      sendSocket({ type: "restart" });
      return;
    }
    left.score = 0;
    right.score = 0;
    rallyCount = 0;
    roundSettings = { target: targetScore(), ballSpeed: baseBallSpeed(), paddleHeight: basePaddleHeight() };
    resetPaddles();
    clearPowerups();
    updateScore();
    setState("ready");
  }

  function movePaddle(paddle, amount) {
    paddle.y = Math.max(0, Math.min(HEIGHT - paddle.height, paddle.y + amount));
  }

  function hitPaddle(paddle, direction) {
    const impact = (ball.y - (paddle.y + paddle.height / 2)) / (paddle.height / 2);
    const angle = Math.max(-1, Math.min(1, impact)) * 0.95;
    ball.speed = Math.min(ball.speed * 1.055, 820);
    ball.vx = Math.cos(angle) * ball.speed * direction;
    ball.vy = Math.sin(angle) * ball.speed;
    rallyCount += 1;
    ball.x = direction > 0 ? paddle.x + PADDLE_WIDTH + BALL_RADIUS : paddle.x - BALL_RADIUS;
    sound("hit");
  }

  function spawnPowerup() {
    if (powerup || mode === "online" || Math.random() > 0.002) return;
    const types = ["wide", "slow", "shrink"];
    powerup = { x: WIDTH / 2 + (Math.random() - 0.5) * 180, y: 80 + Math.random() * (HEIGHT - 160), type: types[Math.floor(Math.random() * types.length)] };
  }

  function clearPowerups() {
    powerup = null;
    powerupTimer = 0;
    powerupEffect = null;
    left.height = roundSettings?.paddleHeight ?? basePaddleHeight();
    right.height = roundSettings?.paddleHeight ?? basePaddleHeight();
    ball.speed = roundSettings?.ballSpeed ?? baseBallSpeed();
  }

  function activatePowerup() {
    if (!powerup) return;
    const target = ball.vx < 0 ? left : right;
    if (powerup.type === "wide") {
      target.height = Math.min(HEIGHT * 0.48, target.height * 1.55);
      target.y = Math.min(target.y, HEIGHT - target.height);
      target.boostUntil = performance.now() + 7000;
      powerupEffect = { type: "wide", target, until: target.boostUntil };
    } else if (powerup.type === "shrink") {
      const other = target === left ? right : left;
      other.height = Math.max(50, other.height * 0.66);
      other.boostUntil = performance.now() + 7000;
      powerupEffect = { type: "shrink", target: other, until: other.boostUntil };
    } else {
      ball.speed = Math.max(190, ball.speed * 0.68);
      ball.vx *= 0.68;
      ball.vy *= 0.68;
      powerupEffect = { type: "slow", target: null, until: performance.now() + 5000 };
    }
    powerup = null;
    powerupTimer = 0;
    sound("power");
  }

  function updatePowerups(now, delta) {
    if (powerupEffect && now > powerupEffect.until) {
      if (powerupEffect.target) {
        powerupEffect.target.height = roundSettings.paddleHeight;
        powerupEffect.target.y = Math.min(powerupEffect.target.y, HEIGHT - powerupEffect.target.height);
      }
      if (powerupEffect.type === "slow") {
        const currentSpeed = Math.hypot(ball.vx, ball.vy);
        const nextSpeed = Math.min(820, roundSettings.ballSpeed + rallyCount * 8);
        if (currentSpeed > 0) {
          ball.vx *= nextSpeed / currentSpeed;
          ball.vy *= nextSpeed / currentSpeed;
        }
        ball.speed = nextSpeed;
      }
      powerupEffect = null;
    }
    if (!powerup) {
      powerupTimer += delta;
      if (powerupTimer > 2) spawnPowerup();
    }
    if (powerup && Math.hypot(ball.x - powerup.x, ball.y - powerup.y) < 23) activatePowerup();
  }

  function endLocalMatch() {
    setState("finished");
    sound("score");
    if (mode === "tournament") {
      if (left.score > right.score) tournament.playerWins += 1;
      else tournament.cpuWins += 1;
      if (tournament.playerWins === 2 || tournament.cpuWins === 2 || tournament.round === 3) {
        tournament.active = false;
        tournamentTitle.textContent = tournament.playerWins > tournament.cpuWins ? "🏆 Tournament champion" : "Tournament complete";
        tournamentStatus.textContent = `Final series ${tournament.playerWins}–${tournament.cpuWins}. ${tournament.playerWins > tournament.cpuWins ? "You lifted the cup!" : "Run it back for the cup."}`;
        overlayKicker.textContent = tournament.playerWins > tournament.cpuWins ? "Champion" : "Tournament complete";
        overlayTitle.textContent = tournament.playerWins > tournament.cpuWins ? "You win the cup!" : "The CPU wins the cup.";
        overlayMessage.textContent = `Series score ${tournament.playerWins}–${tournament.cpuWins}.`;
        overlayButton.textContent = "New tournament";
      } else {
        overlayKicker.textContent = "Match complete";
        overlayTitle.textContent = left.score > right.score ? "Match won!" : "Match lost";
        overlayMessage.textContent = `Series ${tournament.playerWins}–${tournament.cpuWins}. Next match starts when you are ready.`;
        overlayButton.textContent = "Next match";
        tournamentStatus.textContent = `Match ${tournament.round} of 3 · Series ${tournament.playerWins}–${tournament.cpuWins}`;
      }
    } else {
      const won = left.score > right.score;
      overlayKicker.textContent = won ? "Nice rally" : "Good game";
      overlayTitle.textContent = mode === "local" ? (won ? "Player 1 wins!" : "Player 2 wins!") : (won ? "You win!" : "CPU takes it.");
      overlayMessage.textContent = `${left.score} — ${right.score}. Ready for a rematch?`;
      overlayButton.textContent = "Play again";
      saveMatchResult();
    }
  }

  function updateLocal(delta, now) {
    if (state !== "playing") return;
    const leftUp = keys.has("w") || keys.has("W");
    const leftDown = keys.has("s") || keys.has("S");
    const rightUp = keys.has("ArrowUp");
    const rightDown = keys.has("ArrowDown");
    const paddleSpeed = 510;
    if (leftUp) movePaddle(left, -paddleSpeed * delta);
    if (leftDown) movePaddle(left, paddleSpeed * delta);

    if (mode === "local") {
      if (rightUp) movePaddle(right, -paddleSpeed * delta);
      if (rightDown) movePaddle(right, paddleSpeed * delta);
    } else {
      const level = difficulty[mode === "tournament" ? ["easy", "normal", "hard"][(tournament.round - 1) % 3] : difficultySelect.value];
      let aiTarget = HEIGHT / 2 - right.height / 2;
      if (ball.vx > 0 && ball.x > WIDTH * 0.38) {
        aiTarget = ball.y - right.height / 2 + (Math.random() - 0.5) * level.error;
      }
      const difference = aiTarget - right.y;
      movePaddle(right, Math.max(-level.speed * delta, Math.min(level.speed * delta, difference)));
    }

    ball.x += ball.vx * delta;
    ball.y += ball.vy * delta;
    if ((ball.y - BALL_RADIUS <= 0 && ball.vy < 0) || (ball.y + BALL_RADIUS >= HEIGHT && ball.vy > 0)) {
      ball.y = Math.max(BALL_RADIUS, Math.min(HEIGHT - BALL_RADIUS, ball.y));
      ball.vy *= -1;
      sound("wall");
    }

    const leftHit = ball.vx < 0 && ball.x - BALL_RADIUS <= left.x + PADDLE_WIDTH
      && ball.x + BALL_RADIUS >= left.x && ball.y + BALL_RADIUS >= left.y && ball.y - BALL_RADIUS <= left.y + left.height;
    const rightHit = ball.vx > 0 && ball.x + BALL_RADIUS >= right.x
      && ball.x - BALL_RADIUS <= right.x + PADDLE_WIDTH && ball.y + BALL_RADIUS >= right.y && ball.y - BALL_RADIUS <= right.y + right.height;
    if (leftHit) hitPaddle(left, 1);
    if (rightHit) hitPaddle(right, -1);

    updatePowerups(now, delta);
    if (ball.x + BALL_RADIUS < 0) {
      right.score += 1;
      rallyCount = 0;
      sound("score");
      if (right.score >= roundSettings.target) endLocalMatch();
      else resetBall(1);
      updateScore();
    } else if (ball.x - BALL_RADIUS > WIDTH) {
      left.score += 1;
      rallyCount = 0;
      sound("score");
      if (left.score >= roundSettings.target) endLocalMatch();
      else resetBall(-1);
      updateScore();
    }
  }

  function updateScore() {
    playerScoreElement.textContent = String(left.score);
    cpuScoreElement.textContent = String(right.score);
  }

  function drawPaddle(paddle, color, glowColor) {
    ctx.save();
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 18;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(paddle.x, paddle.y, PADDLE_WIDTH, paddle.height, 6);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    const palette = themes[themeSelect.value];
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = palette.court;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const glow = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 30, WIDTH / 2, HEIGHT / 2, WIDTH * 0.55);
    glow.addColorStop(0, "rgba(65, 84, 125, 0.15)");
    glow.addColorStop(1, "rgba(12, 18, 32, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.save();
    ctx.setLineDash([9, 13]);
    ctx.strokeStyle = palette.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(WIDTH / 2, 28);
    ctx.lineTo(WIDTH / 2, HEIGHT - 28);
    ctx.stroke();
    ctx.restore();

    if (powerup) {
      ctx.save();
      ctx.fillStyle = powerup.type === "wide" ? "#81f7b2" : powerup.type === "slow" ? "#87ccff" : "#ff9abb";
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(powerup.x, powerup.y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#101522";
      ctx.font = "bold 13px system-ui";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(powerup.type === "wide" ? "+" : powerup.type === "slow" ? "S" : "−", powerup.x, powerup.y);
      ctx.restore();
    }

    drawPaddle(left, palette.left, palette.glow);
    drawPaddle(right, palette.right, palette.glow);
    ctx.save();
    ctx.shadowColor = palette.glow;
    ctx.shadowBlur = 22;
    ctx.fillStyle = palette.ball;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (state !== "playing") {
      ctx.fillStyle = "rgba(173, 190, 227, 0.28)";
      ctx.beginPath();
      ctx.arc(WIDTH / 2, HEIGHT / 2, 22, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawOnline() {
    if (!remoteState) return;
    left.y = remoteState.leftY;
    right.y = remoteState.rightY;
    left.height = remoteState.paddleHeight;
    right.height = remoteState.paddleHeight;
    ball.x = remoteState.ballX;
    ball.y = remoteState.ballY;
    left.score = remoteState.leftScore;
    right.score = remoteState.rightScore;
    updateScore();
    applyOnlineState();
    draw();
  }

  function applyOnlineState() {
    left.score = remoteState.leftScore;
    right.score = remoteState.rightScore;
    updateScore();
    if (remoteState.status === "playing" && state !== "playing") setState("playing");
    if (remoteState.status === "ready" && state === "playing") setState("ready");
    if (remoteState.status === "finished" && state !== "finished") {
      setState("finished");
      overlayKicker.textContent = "Match complete";
      overlayTitle.textContent = remoteState.winner === onlineSide ? "You win!" : "Opponent wins";
      overlayMessage.textContent = `${left.score} — ${right.score}.`;
      overlayButton.textContent = "Play again";
      saveMatchResult();
    }
  }

  function frame(time) {
    const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.032) : 0;
    previousTime = time;
    if (mode === "online") drawOnline();
    else {
      updateLocal(delta, time);
      draw();
    }
    requestAnimationFrame(frame);
  }

  function sendSocket(payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      connectionMessage.textContent = "Not connected. Start the server and create or join a room.";
      return;
    }
    socket.send(JSON.stringify(payload));
  }

  function connectOnline(action) {
    if (location.protocol === "file:") {
      connectionMessage.textContent = "Online mode needs the game server. Start it with npm start, then open http://localhost:8080.";
      return;
    }
    if (socket && socket.readyState !== WebSocket.CLOSED) socket.close();
    onlineSide = null;
    remoteState = null;
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${location.host}`);
    setState("connecting");
    connectionMessage.textContent = "Connecting to the game server…";
    socket.addEventListener("open", () => {
      if (action.type === "join") action.roomCode = roomCodeInput.value.trim().toUpperCase();
      socket.send(JSON.stringify(action));
    }, { once: true });
    socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        console.error("Received an invalid multiplayer message.", error);
        return;
      }
      if (message.type === "error") {
        connectionMessage.textContent = message.message;
        setState("ready");
      } else if (message.type === "created" || message.type === "joined") {
        onlineSide = message.side;
        restartButton.disabled = message.side !== "left";
        roomCodeInput.value = message.roomCode;
        connectionMessage.textContent = message.type === "created"
          ? `Room ${message.roomCode} created. Share the code with your friend.`
          : `Joined room ${message.roomCode}. Waiting for the host to start.`;
        overlayButton.textContent = message.side === "left" ? "Start online match" : "Waiting for host";
        overlayButton.disabled = message.side !== "left";
        setOverlay("Online room", message.side === "left" ? "Room ready" : "Connected", "The host starts the match when both players are ready.", overlayButton.textContent);
        setState("waiting");
      } else if (message.type === "state") {
        remoteState = message.state;
        if (message.state.playerCount === 2) connectionMessage.textContent = `Room ${message.roomCode} · both players connected`;
        else connectionMessage.textContent = `Room ${message.roomCode} · waiting for your opponent`;
        applyOnlineState();
      } else if (message.type === "disconnected") {
        connectionMessage.textContent = "Your opponent disconnected. You can restart or create another room.";
        setState("ready");
      }
    });
    socket.addEventListener("close", () => {
      if (mode === "online" && state !== "ready") {
        connectionMessage.textContent = "Connection closed. Check that the multiplayer server is running.";
        setState("ready");
      }
    });
    socket.addEventListener("error", () => {
      connectionMessage.textContent = "Could not connect. Make sure the game server is running and reachable.";
    });
  }

  function updateOnlineInput() {
    if (mode !== "online" || !socket || socket.readyState !== WebSocket.OPEN || !onlineSide) return;
    const up = onlineSide === "left" ? keys.has("w") || keys.has("W") : keys.has("ArrowUp");
    const down = onlineSide === "left" ? keys.has("s") || keys.has("S") : keys.has("ArrowDown");
    sendSocket({ type: "input", up, down });
  }

  function moveByPointer(event) {
    if (state !== "playing") return;
    const rect = canvas.getBoundingClientRect();
    const y = ((event.clientY - rect.top) / rect.height) * HEIGHT;
    const onRight = mode === "local" && event.clientX > rect.left + rect.width / 2;
    const paddle = onRight ? right : left;
    if (mode === "online") {
      const ownLeft = onlineSide === "left";
      const ownRight = onlineSide === "right";
      if ((onRight && !ownRight) || (!onRight && !ownLeft)) return;
      sendSocket({ type: "move", y: Math.max(0, Math.min(1, y / HEIGHT)) });
      return;
    }
    if (mode !== "local" && onRight) return;
    paddle.y = Math.max(0, Math.min(HEIGHT - paddle.height, y - paddle.height / 2));
  }

  function isGameKey(key) {
    return ["ArrowUp", "ArrowDown", " ", "Escape"].includes(key) || key.toLowerCase() === "w" || key.toLowerCase() === "s";
  }

  document.addEventListener("keydown", (event) => {
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) return;
    if (event.key === " " && event.target instanceof Element && event.target.closest("button, a")) return;
    if (!isGameKey(event.key)) return;
    event.preventDefault();
    if (event.key === " " || event.key === "Escape") {
      if (!event.repeat && ["playing", "paused"].includes(state)) pauseMatch();
      else if (!event.repeat && ["ready", "waiting", "finished"].includes(state)) startMatch();
      return;
    }
    keys.add(event.key);
    updateOnlineInput();
  });
  document.addEventListener("keyup", (event) => {
    keys.delete(event.key);
    updateOnlineInput();
  });
  window.addEventListener("blur", () => {
    keys.clear();
    updateOnlineInput();
  });
  overlayButton.addEventListener("click", () => {
    if (mode === "online" && onlineSide !== "left") return;
    startMatch();
  });
  pauseButton.addEventListener("click", pauseMatch);
  restartButton.addEventListener("click", restartMatch);
  soundButton.addEventListener("click", toggleSound);
  modeSelect.addEventListener("change", () => {
    if (["playing", "paused"].includes(state)) {
      modeSelect.value = mode;
      return;
    }
    if (socket) {
      socket.close();
      socket = null;
      onlineSide = null;
      remoteState = null;
    }
    restartButton.disabled = false;
    refreshModeUI();
  });
  themeSelect.addEventListener("change", () => { document.body.dataset.theme = themeSelect.value; });
  document.getElementById("hostButton").addEventListener("click", () => connectOnline({ type: "create" }));
  document.getElementById("joinButton").addEventListener("click", () => {
    if (!/^[A-Z0-9]{6}$/i.test(roomCodeInput.value.trim())) {
      connectionMessage.textContent = "Enter the 6-character room code from your host.";
      return;
    }
    connectOnline({ type: "join" });
  });
  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture(event.pointerId);
    moveByPointer(event);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (event.buttons || event.pointerType === "touch") moveByPointer(event);
  });
  document.querySelectorAll(".touch-button").forEach((button) => {
    const control = {
      up: "w",
      down: "s",
      "p2-up": "ArrowUp",
      "p2-down": "ArrowDown",
    }[button.dataset.control];
    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      keys.add(control);
      button.setPointerCapture(event.pointerId);
      updateOnlineInput();
    });
    const release = () => {
      keys.delete(control);
      updateOnlineInput();
    };
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
  });

  refreshModeUI();
  readRecords();
  updateScore();
  requestAnimationFrame(frame);
})();
