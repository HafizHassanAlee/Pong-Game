# Pong — Neon Rally

Neon Rally is an arcade-style Pong game built with HTML, CSS, and vanilla JavaScript. It includes solo, local multiplayer, tournament, and online room play.

## Features

- Solo play with easy, normal, and hard CPU opponents
- Local two-player controls
- Online two-player rooms with six-character invite codes
- Best-of-three tournament mode with progressively harder CPU matches
- Synthesized hit, bounce, score, and power-up sounds plus optional background music
- Personal best and recent match history saved in browser storage
- Configurable winning score, ball speed, paddle size, and visual theme
- Temporary wide-paddle, slow-ball, and opponent-shrink power-ups
- Keyboard, touch-button, and drag-on-court paddle controls

## Run locally

Install Node.js 18 or newer, then run:

```sh
npm install
npm start
```

Open [http://localhost:8080](http://localhost:8080). The game is served by the same Node.js process as its online multiplayer WebSocket server. For offline-only play, you can also open `index.html` directly, but online rooms require the server.

Set `PORT` or `HOST` environment variables to change the server's bind address and port.

## Online multiplayer

Choose **Online multiplayer**, create a room, and share its code with your opponent. They should open the same server address, choose **Online multiplayer**, and join using that code. Both players need to reach a server deployment that supports WebSockets. For public deployment, use HTTPS/WSS behind a TLS-enabled reverse proxy and configure the platform to forward WebSocket upgrades.

Rooms are temporary and held in memory; there are no accounts, persistent lobbies, or matchmaking. A room closes after its players disconnect. Keep the server updated and only share room codes with the intended opponent.

## Controls

- **Player 1:** W / S
- **Player 2:** Up / Down arrows (local two-player)
- **Pause / resume:** Space or Escape
- **Mobile:** on-screen paddle buttons or drag vertically on the court
