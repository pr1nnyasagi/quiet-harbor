export type Side = 0 | 1;
export const RANKS = [
  { rank: 15, name: "Spy", short: "SPY", count: 2 },
  { rank: 14, name: "Five-star General", short: "5★", count: 1 },
  { rank: 13, name: "Four-star General", short: "4★", count: 1 },
  { rank: 12, name: "Lieutenant General", short: "3★", count: 1 },
  { rank: 11, name: "Major General", short: "2★", count: 1 },
  { rank: 10, name: "Brigadier General", short: "1★", count: 1 },
  { rank: 9, name: "Colonel", short: "COL", count: 1 },
  { rank: 8, name: "Lieutenant Colonel", short: "LTC", count: 1 },
  { rank: 7, name: "Major", short: "MAJ", count: 1 },
  { rank: 6, name: "Captain", short: "CPT", count: 1 },
  { rank: 5, name: "First Lieutenant", short: "1LT", count: 1 },
  { rank: 4, name: "Second Lieutenant", short: "2LT", count: 1 },
  { rank: 3, name: "Sergeant", short: "SGT", count: 1 },
  { rank: 2, name: "Private", short: "PVT", count: 6 },
  { rank: 1, name: "Flag", short: "FLG", count: 1 },
] as const;
export const ARMY = RANKS.flatMap(({ rank, count }) =>
  Array<number>(count).fill(rank),
);
export interface Piece {
  id: string;
  side: Side;
  rank: number;
  row: number;
  col: number;
}
export interface VisiblePiece extends Omit<Piece, "rank"> {
  rank: number | null;
}
export interface Deployment {
  rank: number;
  row: number;
  col: number;
}
export interface LogEntry {
  move: number;
  side: Side;
  from: string;
  to: string;
  outcome: string;
}
export interface Game {
  pieces: Piece[];
  phase: "setup" | "playing" | "finished";
  ready: [boolean, boolean];
  turn: Side;
  moves: number;
  winner: Side | "draw" | null;
  reason: string;
  pendingFlag: Side | null;
  log: LogEntry[];
  drawOffer: Side | null;
}
export interface PlayerView {
  name: string;
  connected: boolean;
  ready: boolean;
}
export interface RoomView {
  code: string;
  side: Side;
  players: [PlayerView, PlayerView | null];
  game: Omit<Game, "pieces"> & { pieces: VisiblePiece[] };
  rematch: [boolean, boolean];
  first: Side;
}
export interface Reply {
  ok: boolean;
  error?: string;
  code?: string;
  token?: string;
  side?: Side;
}
export const other = (side: Side): Side => (side === 0 ? 1 : 0);
export const square = (row: number, col: number) =>
  `${"ABCDEFGHI"[col]}${8 - row}`;
export const adjacent = (
  a: { row: number; col: number },
  b: { row: number; col: number },
) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
export function newGame(): Game {
  return {
    pieces: [],
    phase: "setup",
    ready: [false, false],
    turn: 0,
    moves: 0,
    winner: null,
    reason: "",
    pendingFlag: null,
    log: [],
    drawOffer: null,
  };
}
export function defaultDeployment(side: Side): Deployment[] {
  const order = [
    2, 15, 9, 14, 3, 13, 8, 15, 2, 4, 2, 10, 6, 12, 7, 11, 2, 5, 2, 1, 2,
  ];
  return order.map((rank, i) => ({
    rank,
    row: side === 0 ? 5 + Math.floor(i / 9) : 2 - Math.floor(i / 9),
    col: side === 0 ? i % 9 : 8 - (i % 9),
  }));
}
export function deploy(game: Game, side: Side, placements: Deployment[]): void {
  if (game.phase !== "setup" || game.ready[side])
    throw new Error("Your formation is already locked.");
  if (
    placements.length !== 21 ||
    placements
      .map((p) => p.rank)
      .sort((a, b) => a - b)
      .join() !== [...ARMY].sort((a, b) => a - b).join()
  )
    throw new Error("Deploy all 21 pieces with the correct ranks.");
  const occupied = new Set<string>();
  for (const p of placements) {
    if (
      !Number.isInteger(p.row) ||
      !Number.isInteger(p.col) ||
      p.col < 0 ||
      p.col > 8 ||
      (side === 0 ? p.row < 5 || p.row > 7 : p.row < 0 || p.row > 2)
    )
      throw new Error("Deploy inside your three home rows.");
    const key = `${p.row}:${p.col}`;
    if (occupied.has(key)) throw new Error("Only one piece fits on a square.");
    occupied.add(key);
  }
  game.pieces = [
    ...game.pieces.filter((p) => p.side !== side),
    ...placements.map((p) => ({ ...p, id: crypto.randomUUID(), side })),
  ];
  game.ready[side] = true;
  if (game.ready.every(Boolean)) game.phase = "playing";
}
export function challenge(
  attacker: number,
  defender: number,
): "attacker" | "defender" | "both" {
  if (defender === 1) return "attacker";
  if (attacker === 1) return "defender";
  if (attacker === defender) return "both";
  if (attacker === 15) return defender === 2 ? "defender" : "attacker";
  if (defender === 15) return attacker === 2 ? "attacker" : "defender";
  return attacker > defender ? "attacker" : "defender";
}
export function finish(
  game: Game,
  winner: Side | "draw",
  reason: string,
): void {
  game.phase = "finished";
  game.winner = winner;
  game.reason = reason;
  game.drawOffer = null;
}
export function move(
  game: Game,
  side: Side,
  id: string,
  row: number,
  col: number,
): void {
  if (game.phase !== "playing")
    throw new Error("The battle has not started or has ended.");
  if (game.turn !== side) throw new Error("Wait for your turn.");
  const piece = game.pieces.find((p) => p.id === id && p.side === side);
  if (
    !piece ||
    !Number.isInteger(row) ||
    !Number.isInteger(col) ||
    row < 0 ||
    row > 7 ||
    col < 0 ||
    col > 8 ||
    !adjacent(piece, { row, col })
  )
    throw new Error("Move one square horizontally or vertically.");
  const target = game.pieces.find((p) => p.row === row && p.col === col);
  if (target?.side === side)
    throw new Error("A friendly piece occupies that square.");
  const from = square(piece.row, piece.col);
  let outcome = "Advance";
  if (target) {
    const result = challenge(piece.rank, target.rank);
    const removed =
      result === "both"
        ? [piece.id, target.id]
        : result === "attacker"
          ? [target.id]
          : [piece.id];
    game.pieces = game.pieces.filter((p) => !removed.includes(p.id));
    outcome =
      result === "both"
        ? "Both pieces eliminated"
        : result === "attacker"
          ? "Attacker wins"
          : "Defender holds";
    if (target.rank === 1) finish(game, side, "Enemy flag captured");
    else if (piece.rank === 1) finish(game, other(side), "Enemy flag captured");
  }
  if (game.pieces.includes(piece)) {
    piece.row = row;
    piece.col = col;
  }
  game.moves++;
  game.log.push({
    move: game.moves,
    side,
    from,
    to: square(row, col),
    outcome,
  });
  game.log = game.log.slice(-100);
  game.drawOffer = null;
  if (game.winner !== null) return;
  if (game.pendingFlag !== null) {
    finish(game, game.pendingFlag, "Flag survived at the far edge");
    return;
  }
  if (piece.rank === 1 && row === (side === 0 ? 0 : 7)) {
    if (game.pieces.some((p) => p.side !== side && adjacent(p, piece)))
      game.pendingFlag = side;
    else {
      finish(game, side, "Flag reached the far edge");
      return;
    }
  }
  game.turn = other(side);
}
export function visibleGame(game: Game, side: Side): RoomView["game"] {
  return {
    ...game,
    pieces: game.pieces
      .filter((p) => game.phase !== "setup" || p.side === side)
      .map((p) => ({
        ...p,
        rank: p.side === side || game.phase === "finished" ? p.rank : null,
      })),
  };
}
