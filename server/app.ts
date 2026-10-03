import express from "express";
import { createServer } from "node:http";
import { randomBytes, randomInt } from "node:crypto";
import { Server } from "socket.io";
import { z } from "zod";
import {
  deploy,
  finish,
  move,
  newGame,
  other,
  visibleGame,
  type Game,
  type Reply,
  type RoomView,
  type Side,
} from "../shared/game.js";

interface Player {
  name: string;
  token: string;
  socketId: string | null;
}
interface Room {
  code: string;
  players: [Player, Player | null];
  game: Game;
  rematch: [boolean, boolean];
  updated: number;
  first: Side;
}
const nameSchema = z
  .string()
  .trim()
  .min(1, "Enter your commander name.")
  .max(24);
const codeSchema = z
  .string()
  .regex(/^[A-Z2-9]{6}$/, "Enter a valid six-character room code.");
const placementSchema = z
  .array(
    z.object({
      rank: z.number().int(),
      row: z.number().int(),
      col: z.number().int(),
    }),
  )
  .length(21);
type Ack = (reply: Reply) => void;

export function createGameServer(allowedOrigin?: string) {
  const app = express();
  app.disable("x-powered-by");
  const http = createServer(app);
  const io = new Server(http, {
    maxHttpBufferSize: 8192,
    cors: allowedOrigin ? { origin: allowedOrigin.split(",") } : undefined,
  });
  const rooms = new Map<string, Room>();
  const connections = new Map<string, { count: number; since: number }>();
  io.use((socket, next) => {
    const address = socket.handshake.address;
    const now = Date.now();
    const bucket = connections.get(address);
    if (!bucket || now - bucket.since > 60_000)
      connections.set(address, { count: 1, since: now });
    else if (++bucket.count > 120) {
      next(new Error("Too many connections. Try again shortly."));
      return;
    }
    next();
  });
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  const broadcast = (room: Room) => {
    room.updated = Date.now();
    room.players.forEach((player, index) => {
      if (!player?.socketId) return;
      const side = index as Side;
      const view: RoomView = {
        code: room.code,
        side,
        game: visibleGame(room.game, side),
        rematch: room.rematch,
        first: room.first,
        players: [
          {
            name: room.players[0].name,
            connected: !!room.players[0].socketId,
            ready: room.game.ready[0],
          },
          room.players[1]
            ? {
                name: room.players[1].name,
                connected: !!room.players[1].socketId,
                ready: room.game.ready[1],
              }
            : null,
        ],
      };
      io.to(player.socketId).emit("room:state", view);
    });
  };
  io.on("connection", (socket) => {
    let seat: { code: string; side: Side } | null = null;
    let windowStart = Date.now();
    let requests = 0;
    function limit() {
      if (Date.now() - windowStart > 10_000) {
        requests = 0;
        windowStart = Date.now();
      }
      if (++requests > 30) throw new Error("Slow down and try again shortly.");
    }
    const seatedRoom = () => {
      const room = seat && rooms.get(seat.code);
      if (!room || !seat || room.players[seat.side]?.socketId !== socket.id)
        throw new Error("Reconnect to your room first.");
      return { room, side: seat.side };
    };
    const detach = () => {
      if (!seat) return;
      const room = rooms.get(seat.code);
      if (room && room.players[seat.side]?.socketId === socket.id) {
        room.players[seat.side]!.socketId = null;
        broadcast(room);
      }
      seat = null;
    };
    function handle<T>(
      event: string,
      schema: z.ZodType<T>,
      fn: (data: T) => Reply,
    ) {
      socket.on(event, (data: unknown, ack: Ack) => {
        if (typeof ack !== "function") return;
        try {
          limit();
          ack(fn(schema.parse(data)));
        } catch (error) {
          ack({
            ok: false,
            error:
              error instanceof z.ZodError
                ? error.issues[0]?.message
                : error instanceof Error
                  ? error.message
                  : "Request failed.",
          });
        }
      });
    }
    handle("room:create", z.object({ name: nameSchema }), (data) => {
      if (seat) throw new Error("Leave your current room first.");
      if (rooms.size >= 500)
        throw new Error("The server is full. Try again later.");
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      let code: string;
      do {
        code = Array.from(
          { length: 6 },
          () => alphabet[randomInt(alphabet.length)],
        ).join("");
      } while (rooms.has(code));
      const token = randomBytes(32).toString("hex");
      const room: Room = {
        code,
        players: [{ name: data.name, token, socketId: socket.id }, null],
        game: newGame(),
        rematch: [false, false],
        updated: Date.now(),
        first: 0,
      };
      rooms.set(code, room);
      seat = { code, side: 0 };
      broadcast(room);
      return { ok: true, code, token, side: 0 };
    });
    handle(
      "room:join",
      z.object({ name: nameSchema, code: codeSchema }),
      (data) => {
        if (seat) throw new Error("Leave your current room first.");
        const room = rooms.get(data.code);
        if (!room)
          throw new Error("Room not found. Check the code with your friend.");
        if (room.players[1])
          throw new Error("This room already has two commanders.");
        const token = randomBytes(32).toString("hex");
        room.players[1] = { name: data.name, token, socketId: socket.id };
        seat = { code: room.code, side: 1 };
        broadcast(room);
        return { ok: true, code: room.code, token, side: 1 };
      },
    );
    handle(
      "room:resume",
      z.object({ code: codeSchema, token: z.string().length(64) }),
      (data) => {
        if (seat) throw new Error("Leave your current room first.");
        const room = rooms.get(data.code);
        const index =
          room?.players.findIndex((p) => p?.token === data.token) ?? -1;
        if (!room || index < 0)
          throw new Error("Your room expired. Create or join a new battle.");
        const side = index as Side;
        const player = room.players[side]!;
        if (player.socketId)
          throw new Error("Your seat is already open in another connection.");
        player.socketId = socket.id;
        seat = { code: room.code, side };
        broadcast(room);
        return { ok: true, code: room.code, side };
      },
    );
    handle("room:leave", z.object({}), () => {
      detach();
      return { ok: true };
    });
    handle("game:deploy", z.object({ placements: placementSchema }), (data) => {
      const { room, side } = seatedRoom();
      deploy(room.game, side, data.placements);
      broadcast(room);
      return { ok: true };
    });
    handle(
      "game:move",
      z.object({
        id: z.string().uuid(),
        row: z.number().int(),
        col: z.number().int(),
      }),
      (data) => {
        const { room, side } = seatedRoom();
        if (!room.players[other(side)]?.socketId)
          throw new Error("Your opponent is reconnecting. Battle is paused.");
        move(room.game, side, data.id, data.row, data.col);
        broadcast(room);
        return { ok: true };
      },
    );
    handle("game:resign", z.object({}), () => {
      const { room, side } = seatedRoom();
      if (room.game.phase !== "playing")
        throw new Error("There is no active battle to resign.");
      finish(room.game, other(side), "Battle ended by resignation");
      broadcast(room);
      return { ok: true };
    });
    handle(
      "game:draw",
      z.object({ action: z.enum(["offer", "accept", "decline"]) }),
      (data) => {
        const { room, side } = seatedRoom();
        if (room.game.phase !== "playing")
          throw new Error("There is no active battle.");
        if (data.action === "offer") {
          if (room.game.drawOffer !== null)
            throw new Error("A draw is already pending.");
          room.game.drawOffer = side;
        } else {
          if (room.game.drawOffer !== other(side))
            throw new Error("No opponent draw offer is pending.");
          if (data.action === "accept")
            finish(room.game, "draw", "Draw agreed by both commanders");
          else room.game.drawOffer = null;
        }
        broadcast(room);
        return { ok: true };
      },
    );
    handle("game:rematch", z.object({}), () => {
      const { room, side } = seatedRoom();
      if (room.game.phase !== "finished")
        throw new Error("Finish this battle first.");
      room.rematch[side] = true;
      if (room.rematch.every(Boolean)) {
        room.first = other(room.first);
        room.game = newGame();
        room.game.turn = room.first;
        room.rematch = [false, false];
      }
      broadcast(room);
      return { ok: true };
    });
    socket.on("disconnect", detach);
  });
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms)
      if (now - room.updated > 4 * 60 * 60 * 1000) {
        room.players.forEach((p) => {
          if (p?.socketId) {
            io.to(p.socketId).emit("room:expired");
            io.sockets.sockets.get(p.socketId)?.disconnect(true);
          }
        });
        rooms.delete(code);
      }
    for (const [address, bucket] of connections)
      if (now - bucket.since > 60_000) connections.delete(address);
  }, 60_000);
  cleanup.unref();
  io.on("close", () => clearInterval(cleanup));
  return {
    app,
    http,
    io,
    close: () => {
      clearInterval(cleanup);
      return new Promise<void>((resolve) => io.close(() => resolve()));
    },
  };
}
