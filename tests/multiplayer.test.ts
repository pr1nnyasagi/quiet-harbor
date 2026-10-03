import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io, type Socket } from "socket.io-client";
import { type AddressInfo } from "node:net";
import { createGameServer } from "../server/app";
import { defaultDeployment, type Reply, type RoomView } from "../shared/game";

let server: ReturnType<typeof createGameServer>;
let url: string;
let clients: Socket[];
const latest = new Map<Socket, RoomView>();
async function connect() {
  const client = io(url, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  clients.push(client);
  client.on("room:state", (view: RoomView) => latest.set(client, view));
  await new Promise<void>((resolve, reject) => {
    client.once("connect", resolve);
    client.once("connect_error", reject);
  });
  return client;
}
function emit(
  client: Socket,
  event: string,
  data: object = {},
): Promise<Reply> {
  return new Promise((resolve, reject) =>
    client
      .timeout(2000)
      .emit(event, data, (error: Error | null, reply: Reply) =>
        error ? reject(error) : resolve(reply),
      ),
  );
}
async function state(client: Socket, predicate: (room: RoomView) => boolean) {
  await expect
    .poll(() => {
      const view = latest.get(client);
      return view ? predicate(view) : false;
    })
    .toBe(true);
  return latest.get(client)!;
}
beforeEach(async () => {
  server = createGameServer();
  clients = [];
  latest.clear();
  await new Promise<void>((resolve) =>
    server.http.listen(0, "127.0.0.1", resolve),
  );
  url = `http://127.0.0.1:${(server.http.address() as AddressInfo).port}`;
});
afterEach(async () => {
  clients.forEach((c) => c.disconnect());
  await server.close();
});
async function pair() {
  const host = await connect();
  const guest = await connect();
  const created = await emit(host, "room:create", { name: "North" });
  expect(created.ok).toBe(true);
  expect(
    (await emit(guest, "room:join", { name: "South", code: created.code })).ok,
  ).toBe(true);
  return { host, guest, created };
}
async function start(host: Socket, guest: Socket) {
  expect(
    (await emit(host, "game:deploy", { placements: defaultDeployment(0) })).ok,
  ).toBe(true);
  expect(
    (await emit(guest, "game:deploy", { placements: defaultDeployment(1) })).ok,
  ).toBe(true);
  await state(host, (v) => v.game.phase === "playing");
  await state(guest, (v) => v.game.phase === "playing");
}
describe("Authoritative multiplayer protocol", () => {
  it("creates a private room, joins a second player, refuses a third, and protects resume tokens", async () => {
    const { host, guest, created } = await pair();
    const view = await state(host, (v) => v.players[1]?.name === "South");
    expect(view.players[0].name).toBe("North");
    expect(JSON.stringify(view)).not.toContain(created.token);
    const third = await connect();
    expect(
      (await emit(third, "room:join", { name: "Third", code: created.code }))
        .ok,
    ).toBe(false);
    expect(
      (
        await emit(third, "room:resume", {
          code: created.code,
          token: "f".repeat(64),
        })
      ).ok,
    ).toBe(false);
    expect((await emit(guest, "room:create", { name: "Extra" })).ok).toBe(
      false,
    );
  });
  it("hides ranks over the wire, synchronizes moves, and rejects a forged move", async () => {
    const { host, guest } = await pair();
    await start(host, guest);
    const hostView = latest.get(host)!;
    const guestView = latest.get(guest)!;
    expect(
      hostView.game.pieces
        .filter((p) => p.side === 1)
        .every((p) => p.rank === null),
    ).toBe(true);
    expect(
      guestView.game.pieces
        .filter((p) => p.side === 0)
        .every((p) => p.rank === null),
    ).toBe(true);
    const mover = hostView.game.pieces.find(
      (p) => p.side === 0 && p.row === 5 && p.col === 0,
    )!;
    expect(
      (await emit(guest, "game:move", { id: mover.id, row: 4, col: 0 })).ok,
    ).toBe(false);
    expect(
      (await emit(host, "game:move", { id: mover.id, row: 4, col: 0 })).ok,
    ).toBe(true);
    const next = await state(guest, (v) => v.game.moves === 1);
    expect(next.game.turn).toBe(1);
    expect(next.game.pieces.find((p) => p.id === mover.id)).toMatchObject({
      row: 4,
      col: 0,
      rank: null,
    });
    expect(
      (await emit(host, "game:move", { id: mover.id, row: 3, col: 0 })).ok,
    ).toBe(false);
  });
  it("pauses when a player disconnects and restores their seat with a private token", async () => {
    const { host, guest, created } = await pair();
    await start(host, guest);
    host.disconnect();
    await state(guest, (v) => !v.players[0].connected);
    const guestPiece = latest
      .get(guest)!
      .game.pieces.find((p) => p.side === 1)!;
    expect(
      (await emit(guest, "game:move", { id: guestPiece.id, row: 3, col: 8 }))
        .error,
    ).toContain("paused");
    const resumed = await connect();
    expect(
      (
        await emit(resumed, "room:resume", {
          code: created.code,
          token: created.token,
        })
      ).ok,
    ).toBe(true);
    const view = await state(resumed, (v) => v.game.phase === "playing");
    expect(view.side).toBe(0);
    expect(view.players[0].name).toBe("North");
    const duplicate = await connect();
    expect(
      (
        await emit(duplicate, "room:resume", {
          code: created.code,
          token: created.token,
        })
      ).ok,
    ).toBe(false);
  });
  it("supports draw agreement, reveals surviving pieces, and requires both players for a rematch", async () => {
    const { host, guest } = await pair();
    await start(host, guest);
    expect((await emit(host, "game:draw", { action: "offer" })).ok).toBe(true);
    expect((await emit(host, "game:draw", { action: "accept" })).ok).toBe(
      false,
    );
    expect((await emit(guest, "game:draw", { action: "decline" })).ok).toBe(
      true,
    );
    expect((await emit(host, "game:draw", { action: "offer" })).ok).toBe(true);
    expect((await emit(guest, "game:draw", { action: "accept" })).ok).toBe(
      true,
    );
    const finished = await state(host, (v) => v.game.phase === "finished");
    expect(finished.game.winner).toBe("draw");
    expect(finished.game.pieces.every((p) => p.rank !== null)).toBe(true);
    expect((await emit(host, "game:rematch")).ok).toBe(true);
    await state(host, (v) => v.rematch[0]);
    expect(latest.get(host)!.game.phase).toBe("finished");
    expect((await emit(guest, "game:rematch")).ok).toBe(true);
    const rematch = await state(host, (v) => v.game.phase === "setup");
    expect(rematch.first).toBe(1);
    expect(rematch.game.turn).toBe(1);
    expect(rematch.game.pieces).toHaveLength(0);
  });
  it("handles resignation and validates malformed payloads without crashing", async () => {
    const { host, guest } = await pair();
    await start(host, guest);
    expect(
      (await emit(host, "game:move", { id: 5, row: "bad", col: 3 })).ok,
    ).toBe(false);
    expect((await emit(host, "game:resign")).ok).toBe(true);
    const result = await state(guest, (v) => v.game.phase === "finished");
    expect(result.game.winner).toBe(1);
    expect((await emit(host, "game:resign")).ok).toBe(false);
  });
});
