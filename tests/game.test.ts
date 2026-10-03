import { describe, expect, it } from "vitest";
import {
  ARMY,
  challenge,
  defaultDeployment,
  deploy,
  move,
  newGame,
  visibleGame,
  type Game,
  type Piece,
} from "../shared/game";

function battle(pieces: Piece[]): Game {
  return { ...newGame(), pieces, phase: "playing", ready: [true, true] };
}
const piece = (
  id: string,
  side: 0 | 1,
  rank: number,
  row: number,
  col: number,
): Piece => ({ id, side, rank, row, col });
describe("Army and deployment", () => {
  it("has the complete 21-piece army, including both one- and two-star generals", () => {
    expect(ARMY).toHaveLength(21);
    expect(ARMY.filter((r) => r === 2)).toHaveLength(6);
    expect(ARMY.filter((r) => r === 15)).toHaveLength(2);
    expect(ARMY).toContain(10);
    expect(ARMY).toContain(11);
  });
  it("starts only when both players lock a legal formation", () => {
    const game = newGame();
    deploy(game, 0, defaultDeployment(0));
    expect(game.phase).toBe("setup");
    deploy(game, 1, defaultDeployment(1));
    expect(game.phase).toBe("playing");
    expect(game.pieces).toHaveLength(42);
    expect(new Set(game.pieces.map((p) => p.id)).size).toBe(42);
    expect(game.pieces.every((p) => /^[0-9a-f-]{36}$/.test(p.id))).toBe(true);
  });
  it("rejects wrong inventories, duplicate squares, out-of-zone pieces, and editing a locked army", () => {
    const game = newGame();
    const formation = defaultDeployment(0);
    expect(() =>
      deploy(
        game,
        0,
        formation.map((p, i) => (i === 0 ? { ...p, rank: 14 } : p)),
      ),
    ).toThrow("correct ranks");
    expect(() =>
      deploy(
        game,
        0,
        formation.map((p, i) =>
          i === 1 ? { ...p, row: formation[0].row, col: formation[0].col } : p,
        ),
      ),
    ).toThrow("one piece");
    expect(() =>
      deploy(
        game,
        0,
        formation.map((p, i) => (i === 0 ? { ...p, row: 4 } : p)),
      ),
    ).toThrow("three home rows");
    expect(game.pieces).toHaveLength(0);
    deploy(game, 0, formation);
    expect(() => deploy(game, 0, formation)).toThrow("locked");
  });
  it("does not disclose the enemy formation before play or ranks during play", () => {
    const game = newGame();
    deploy(game, 0, defaultDeployment(0));
    expect(visibleGame(game, 1).pieces).toHaveLength(0);
    deploy(game, 1, defaultDeployment(1));
    const view = visibleGame(game, 0);
    expect(
      view.pieces.filter((p) => p.side === 1).every((p) => p.rank === null),
    ).toBe(true);
    expect(
      view.pieces.filter((p) => p.side === 0).every((p) => p.rank !== null),
    ).toBe(true);
    game.phase = "finished";
    expect(visibleGame(game, 0).pieces.every((p) => p.rank !== null)).toBe(
      true,
    );
  });
});
describe("Challenges", () => {
  it("uses the full officer hierarchy and splits equal ranks", () => {
    for (let a = 2; a <= 14; a++)
      for (let b = 2; b <= 14; b++)
        expect(challenge(a, b)).toBe(
          a === b ? "both" : a > b ? "attacker" : "defender",
        );
    expect(challenge(15, 15)).toBe("both");
  });
  it("makes spies defeat every officer but lose to privates in either direction", () => {
    for (let r = 3; r <= 14; r++) {
      expect(challenge(15, r)).toBe("attacker");
      expect(challenge(r, 15)).toBe("defender");
    }
    expect(challenge(15, 2)).toBe("defender");
    expect(challenge(2, 15)).toBe("attacker");
  });
  it("allows an attacking flag to capture a defending flag", () => {
    expect(challenge(1, 1)).toBe("attacker");
    for (let r = 2; r <= 15; r++) {
      expect(challenge(r, 1)).toBe("attacker");
      expect(challenge(1, r)).toBe("defender");
    }
  });
});
describe("Moves and victory", () => {
  it("rejects out-of-turn, diagonal, off-board, enemy-piece and friendly-square moves without mutation", () => {
    const game = battle([
      piece("a", 0, 14, 5, 4),
      piece("b", 0, 2, 5, 5),
      piece("c", 1, 3, 2, 4),
    ]);
    const before = JSON.stringify(game);
    expect(() => move(game, 1, "c", 3, 4)).toThrow("turn");
    expect(() => move(game, 0, "a", 4, 5)).toThrow("one square");
    expect(() => move(game, 0, "a", -1, 4)).toThrow("one square");
    expect(() => move(game, 0, "c", 3, 4)).toThrow("one square");
    expect(() => move(game, 0, "a", 5, 5)).toThrow("friendly");
    expect(JSON.stringify(game)).toBe(before);
  });
  it("moves a flag just like any other piece and alternates turns", () => {
    const game = battle([
      piece("flag", 0, 1, 5, 4),
      piece("enemy", 1, 14, 2, 4),
    ]);
    move(game, 0, "flag", 4, 4);
    expect(game.pieces[0].row).toBe(4);
    expect(game.turn).toBe(1);
    expect(game.log[0]).toMatchObject({
      from: "E3",
      to: "E4",
      outcome: "Advance",
    });
  });
  it("eliminates both equally ranked pieces", () => {
    const game = battle([piece("a", 0, 5, 4, 4), piece("b", 1, 5, 3, 4)]);
    move(game, 0, "a", 3, 4);
    expect(game.pieces).toHaveLength(0);
    expect(game.log[0].outcome).toBe("Both pieces eliminated");
  });
  it("wins by flag capture and prevents further moves", () => {
    const game = battle([piece("a", 0, 1, 1, 4), piece("b", 1, 1, 0, 4)]);
    move(game, 0, "a", 0, 4);
    expect(game.phase).toBe("finished");
    expect(game.winner).toBe(0);
    expect(() => move(game, 0, "a", 0, 5)).toThrow("ended");
  });
  it("immediately wins at an unchallenged far edge", () => {
    const game = battle([
      piece("flag", 0, 1, 1, 4),
      piece("enemy", 1, 14, 0, 1),
    ]);
    move(game, 0, "flag", 0, 4);
    expect(game.winner).toBe(0);
    expect(game.reason).toBe("Flag reached the far edge");
  });
  it("waits exactly one enemy move if the flag has an adjacent challenger", () => {
    const game = battle([
      piece("flag", 0, 1, 1, 4),
      piece("enemy", 1, 14, 0, 5),
    ]);
    move(game, 0, "flag", 0, 4);
    expect(game.winner).toBeNull();
    expect(game.pendingFlag).toBe(0);
    move(game, 1, "enemy", 1, 5);
    expect(game.winner).toBe(0);
    expect(game.reason).toBe("Flag survived at the far edge");
  });
  it("allows the adjacent challenger to capture that flag on its next move", () => {
    const game = battle([
      piece("flag", 0, 1, 1, 4),
      piece("enemy", 1, 14, 0, 5),
    ]);
    move(game, 0, "flag", 0, 4);
    move(game, 1, "enemy", 0, 4);
    expect(game.winner).toBe(1);
  });
  it("also supports a second-player flag breaking through", () => {
    const game = battle([
      piece("flag", 1, 1, 6, 2),
      piece("enemy", 0, 14, 7, 7),
    ]);
    game.turn = 1;
    move(game, 1, "flag", 7, 2);
    expect(game.winner).toBe(1);
  });
});
