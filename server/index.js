import { createServer } from "node:http";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "socket.io";
import { act, createGame, finishAuction } from "../shared/game.js";

const PORT = process.env.PORT || 3000;
const HOST_GRACE_MS = Number(process.env.HOST_GRACE_MS) || 30_000;
const dist = fileURLToPath(new URL("../dist", import.meta.url));

const app = express();
const server = createServer(app);
// destroyUpgrade: false leaves non-socket.io upgrades (Vite's hot reload) alone in dev.
const io = new Server(server, { destroyUpgrade: false });

if (process.argv.includes("--dev")) {
  // One process in dev: Vite serves the client with hot reload on the same port as the game.
  const { createServer: createVite } = await import("vite");
  const vite = await createVite({ server: { middlewareMode: true, hmr: { server } }, appType: "spa" });
  app.use(vite.middlewares);
} else {
  app.use(express.static(dist));
  app.get("/{*path}", (req, res) => res.sendFile("index.html", { root: dist }));
}

// roomId -> { game, secrets: Map(secret -> playerId), cleanup }
// ponytail: rooms live in memory, a restart ends every game. Persist to disk/Redis if that matters.
const rooms = new Map();

const newRoomId = () => randomBytes(4).toString("base64url").replace(/[-_]/g, "x").slice(0, 6).toLowerCase();
// serverNow lets clients correct for clock skew when showing the auction countdown.
const broadcast = (id) => io.to(id).emit("state", { ...rooms.get(id).game, serverNow: Date.now() });

// Auctions end on a server timer; every bid can push the end time back, so reschedule after each action.
function scheduleAuction(id) {
  const r = rooms.get(id);
  clearTimeout(r.auctionTimer);
  if (!r.game.auction) return;
  r.auctionTimer = setTimeout(() => {
    finishAuction(r.game);
    broadcast(id);
  }, Math.max(0, r.game.auction.endsAt - Date.now()));
}

function socketsFor(roomId, playerId) {
  return [...(io.sockets.adapter.rooms.get(roomId) ?? [])].filter((sid) => io.sockets.sockets.get(sid)?.data.playerId === playerId);
}

io.on("connection", (socket) => {
  socket.on("create", (ack) => {
    let id;
    do id = newRoomId();
    while (rooms.has(id));
    rooms.set(id, { game: createGame(id), secrets: new Map() });
    ack?.({ id });
  });

  // secret is a random string the browser keeps in localStorage, so a refresh rejoins the same seat.
  socket.on("hello", ({ room, secret } = {}, ack) => {
    const r = rooms.get(room);
    if (!r) return ack?.({ error: "This room doesn't exist. It may have ended." });
    socket.join(room);
    clearTimeout(r.cleanup);
    const me = r.game.players.find((p) => p.id === r.secrets.get(secret));
    socket.data = { room, secret: String(secret).slice(0, 64), playerId: me?.id ?? null };
    if (me) me.online = true;
    ack?.({ playerId: socket.data.playerId });
    broadcast(room);
  });

  socket.on("act", ({ type, payload } = {}, ack) => {
    const { room, secret } = socket.data ?? {};
    const r = rooms.get(room);
    if (!r) return ack?.({ error: "Room not found" });
    try {
      if (type === "join") {
        if (r.game.players.some((p) => p.id === socket.data.playerId)) throw new Error("You're already in this room");
        const playerId = randomUUID();
        act(r.game, playerId, "join", payload);
        r.secrets.set(secret, playerId);
        socket.data.playerId = playerId;
        ack?.({ playerId });
      } else {
        act(r.game, socket.data.playerId, String(type), payload ?? {});
        ack?.({});
      }
      broadcast(room);
      scheduleAuction(room);
    } catch (err) {
      ack?.({ error: err.message });
    }
  });

  socket.on("disconnect", () => {
    const { room, playerId } = socket.data ?? {};
    const r = rooms.get(room);
    if (!r) return;
    const game = r.game;
    const me = game.players.find((p) => p.id === playerId);
    if (me && !socketsFor(room, playerId).length) me.online = false;
    // If the host is gone for good, hand host to someone still here so the game can be started / offline players removed.
    // The grace period keeps a page refresh from losing it.
    if (me && me.id === game.hostId) {
      setTimeout(() => {
        if (rooms.get(room) !== r || game.players.find((p) => p.id === game.hostId)?.online) return;
        const next = game.players.find((p) => p.online);
        if (!next) return;
        game.hostId = next.id;
        broadcast(room);
      }, HOST_GRACE_MS);
    }
    if (!io.sockets.adapter.rooms.get(room)?.size) r.cleanup = setTimeout(() => rooms.delete(room), 60 * 60 * 1000);
    broadcast(room);
  });
});

server.listen(PORT, () => console.log(`Landgrab running on http://localhost:${PORT}`));
