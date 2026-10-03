import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  Crown,
  Eye,
  Flag,
  Globe2,
  Layers3,
  Link2,
  LockKeyhole,
  RotateCcw,
  Shield,
  Shuffle,
  Sparkles,
  Swords,
  Target,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { io } from "socket.io-client";
import { z } from "zod";
import {
  adjacent,
  defaultDeployment,
  other,
  RANKS,
  square,
  type Deployment,
  type Reply,
  type RoomView,
  type Side,
  type VisiblePiece,
} from "../shared/game";

const socket = io(import.meta.env.VITE_SERVER_URL || undefined, {
  autoConnect: false,
});
const sessionSchema = z.object({ code: z.string(), token: z.string() });
function readSession() {
  try {
    return sessionSchema.parse(
      JSON.parse(sessionStorage.getItem("salpakan-seat") || "null"),
    );
  } catch {
    return null;
  }
}
function request(event: string, data: object): Promise<Reply> {
  return new Promise((resolve) => {
    if (!socket.connected) {
      resolve({
        ok: false,
        error: "Connecting to the game server. Try again in a moment.",
      });
      return;
    }
    socket
      .timeout(8000)
      .emit(event, data, (error: Error | null, reply: Reply) =>
        resolve(
          error
            ? {
                ok: false,
                error: "The server did not respond. Please try again.",
              }
            : reply,
        ),
      );
  });
}
function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark ${small ? "small" : ""}`}>
      <Swords size={small ? 16 : 23} strokeWidth={1.5} />
    </span>
  );
}
function Insignia({ rank }: { rank: number | null }) {
  if (rank === null) return <Shield strokeWidth={1.3} size={22} />;
  if (rank === 1) return <Flag size={23} strokeWidth={1.5} />;
  if (rank === 15) return <Eye size={23} strokeWidth={1.5} />;
  if (rank >= 10)
    return <span className="rank-stars">{"★".repeat(rank - 9)}</span>;
  if (rank >= 7) return <Crown size={23} strokeWidth={1.5} />;
  if (rank >= 4)
    return <span className="rank-bars">{"▴".repeat(rank - 3)}</span>;
  return (
    <span className="chevrons">
      {rank === 3 ? (
        <>
          <ChevronDown size={23} />
          <ChevronDown size={23} />
        </>
      ) : (
        <ChevronDown size={25} />
      )}
    </span>
  );
}
function Piece({
  rank,
  enemy = false,
}: {
  rank: number | null;
  enemy?: boolean;
}) {
  return (
    <span className={`piece ${enemy ? "enemy" : "friendly"}`}>
      <Insignia rank={rank} />
      <span className="piece-label">
        {rank === null ? "• • •" : RANKS.find((r) => r.rank === rank)?.short}
      </span>
    </span>
  );
}
function Board({
  pieces,
  side = 0,
  selected,
  destinations = [],
  setup = false,
  onSquare,
}: {
  pieces: VisiblePiece[];
  side?: Side;
  selected?: string | null;
  destinations?: string[];
  setup?: boolean;
  onSquare?: (row: number, col: number) => void;
}) {
  const rows = Array.from({ length: 8 }, (_, i) => (side === 0 ? i : 7 - i));
  const cols = Array.from({ length: 9 }, (_, i) => (side === 0 ? i : 8 - i));
  return (
    <div className={`board-frame ${onSquare ? "interactive" : "showcase"}`}>
      <div className="board-columns">
        {cols.map((c) => (
          <span key={c}>{"ABCDEFGHI"[c]}</span>
        ))}
      </div>
      <div className="board-middle">
        <div className="board-rows">
          {rows.map((r) => (
            <span key={r}>{8 - r}</span>
          ))}
        </div>
        <div
          className="board"
          aria-label="Game board, eight rows by nine columns"
        >
          {rows.flatMap((row) =>
            cols.map((col) => {
              const piece = pieces.find((p) => p.row === row && p.col === col);
              const legal = destinations.includes(`${row}:${col}`);
              const home = side === 0 ? row >= 5 : row <= 2;
              const classes = `cell ${(row + col) % 2 ? "alternate" : ""} ${row === 3 || row === 4 ? "middle-row" : ""} ${piece && piece.id === selected ? "selected" : ""} ${legal ? "legal" : ""} ${setup && home ? "deployment-zone" : ""}`;
              const content = (
                <>
                  {piece ? (
                    <Piece rank={piece.rank} enemy={piece.side !== side} />
                  ) : legal ? (
                    <span className="move-dot" />
                  ) : (
                    <span className="cell-cross">+</span>
                  )}
                </>
              );
              return onSquare ? (
                <button
                  className={classes}
                  key={`${row}:${col}`}
                  onClick={() => onSquare(row, col)}
                  aria-label={`${square(row, col)}${piece ? `, ${piece.side === side ? "your" : "opponent"} ${piece.rank === null ? "hidden piece" : RANKS.find((r) => r.rank === piece.rank)?.name}` : ", empty"}${legal ? ", legal destination" : ""}`}
                  aria-pressed={!!piece && piece.id === selected}
                >
                  {content}
                </button>
              ) : (
                <div className={classes} key={`${row}:${col}`}>
                  {content}
                </div>
              );
            }),
          )}
        </div>
        <div className="board-rows right">
          {rows.map((r) => (
            <span key={r}>{8 - r}</span>
          ))}
        </div>
      </div>
      <div className="board-columns bottom">
        {cols.map((c) => (
          <span key={c}>{"ABCDEFGHI"[c]}</span>
        ))}
      </div>
    </div>
  );
}
function Modal({
  children,
  title,
  onClose,
}: {
  children: ReactNode;
  title: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="modal-title">
      <div className="modal-head">
        <span className="eyebrow">FIELD MANUAL</span>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <h2 id="modal-title">{title}</h2>
      {children}
    </dialog>
  );
}
function Rules({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"rules" | "ranks">("rules");
  return (
    <Modal title="Know the battlefield." onClose={onClose}>
      <div className="tabs">
        <button
          className={tab === "rules" ? "active" : ""}
          onClick={() => setTab("rules")}
        >
          How to play
        </button>
        <button
          className={tab === "ranks" ? "active" : ""}
          onClick={() => setTab("ranks")}
        >
          The 21-piece army
        </button>
      </div>
      {tab === "rules" ? (
        <div className="rules-content">
          <article>
            <span>01</span>
            <div>
              <h3>Deploy in secret</h3>
              <p>
                Arrange 21 pieces in your nearest three rows of the 9 × 8 board.
                Leave six squares empty. Only you can see your ranks.
              </p>
            </div>
          </article>
          <article>
            <span>02</span>
            <div>
              <h3>One move. Many possibilities.</h3>
              <p>
                The room creator moves first. Take turns moving one piece one
                square horizontally or vertically. Every piece, including the
                flag, can move.
              </p>
            </div>
          </article>
          <article>
            <span>03</span>
            <div>
              <h3>Challenge the unknown</h3>
              <p>
                Move onto an enemy square to challenge. Higher ranks win; equal
                ranks both fall. Spies defeat every officer, but lose to
                privates. The server resolves challenges without revealing
                ranks.
              </p>
            </div>
          </article>
          <article>
            <span>04</span>
            <div>
              <h3>Capture. Or break through.</h3>
              <p>
                Capture the enemy flag to win. Or bring your own flag to the
                farthest row: you win immediately if no enemy is adjacent,
                otherwise survive the opponent’s next move. An attacking flag
                beats a defending flag.
              </p>
            </div>
          </article>
          <div className="manual-note">
            <Shield size={19} />
            <p>
              Both commanders can agree to a draw. Surviving ranks are revealed
              when the battle ends. Rematches alternate who moves first.
            </p>
          </div>
        </div>
      ) : (
        <div className="rank-list">
          {RANKS.map((r) => (
            <div key={r.rank}>
              <span className="rank-icon">
                <Insignia rank={r.rank} />
              </span>
              <span>{r.name}</span>
              <span className="muted">× {r.count}</span>
            </div>
          ))}
          <p className="muted">
            Spies lose to privates. All pieces can capture a flag.
          </p>
        </div>
      )}
      <button className="primary full" onClick={onClose}>
        Understood <ArrowRight size={17} />
      </button>
    </Modal>
  );
}
const previewPieces: VisiblePiece[] = [
  ...defaultDeployment(0).map((p, i) => ({
    ...p,
    id: `show-0-${i}`,
    side: 0 as Side,
  })),
  ...defaultDeployment(1).map((p, i) => ({
    ...p,
    rank: null,
    id: `show-1-${i}`,
    side: 1 as Side,
  })),
];

export default function App() {
  const [room, setRoom] = useState<RoomView | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(
    () => localStorage.getItem("salpakan-name") || "",
  );
  const [code, setCode] = useState(
    () => new URLSearchParams(location.search).get("room")?.toUpperCase() || "",
  );
  const [mode, setMode] = useState<"create" | "join">(() =>
    new URLSearchParams(location.search).has("room") ? "join" : "create",
  );
  const [rules, setRules] = useState(false);
  const [confirm, setConfirm] = useState<"leave" | "resign" | null>(null);
  const [placements, setPlacements] = useState<Deployment[]>(
    defaultDeployment(0),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const roomCode = room?.code;
  const side = room?.side;
  const phase = room?.game.phase;
  const moves = room?.game.moves;
  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      setError("");
      const saved = readSession();
      const invitedRoom = new URLSearchParams(location.search)
        .get("room")
        ?.toUpperCase();
      if (saved && (!invitedRoom || invitedRoom === saved.code))
        void request("room:resume", saved).then((reply) => {
          if (!reply.ok) {
            setError(reply.error || "Unable to resume.");
            sessionStorage.removeItem("salpakan-seat");
            setRoom(null);
          }
        });
    };
    const onDisconnect = (reason: string) => {
      setConnected(false);
      if (reason === "io server disconnect") socket.connect();
    };
    const onState = (view: RoomView) => setRoom(view);
    const onExpired = () => {
      sessionStorage.removeItem("salpakan-seat");
      setRoom(null);
      setError("This room expired after four hours without activity.");
    };
    const onError = () =>
      setError(
        "Unable to reach the game server. Check your connection and retry.",
      );
    socket
      .on("connect", onConnect)
      .on("disconnect", onDisconnect)
      .on("room:state", onState)
      .on("room:expired", onExpired)
      .on("connect_error", onError);
    socket.connect();
    return () => {
      socket
        .off("connect", onConnect)
        .off("disconnect", onDisconnect)
        .off("room:state", onState)
        .off("room:expired", onExpired)
        .off("connect_error", onError);
      socket.disconnect();
    };
  }, []);
  useEffect(() => {
    if (phase === "setup" && side !== undefined)
      setPlacements(defaultDeployment(side));
    setSelected(null);
  }, [roomCode, side, phase]);
  useEffect(() => {
    setSelected(null);
  }, [moves]);
  async function action(event: string, data: object = {}) {
    setBusy(true);
    setError("");
    const reply = await request(event, data);
    if (!reply.ok) setError(reply.error || "Something went wrong.");
    setBusy(false);
    return reply;
  }
  async function enter(event: FormEvent) {
    event.preventDefault();
    const reply = await action(
      mode === "create" ? "room:create" : "room:join",
      {
        name: name.trim(),
        ...(mode === "join" ? { code: code.trim().toUpperCase() } : {}),
      },
    );
    if (reply.ok && reply.token && reply.code) {
      sessionStorage.setItem(
        "salpakan-seat",
        JSON.stringify({ code: reply.code, token: reply.token }),
      );
      localStorage.setItem("salpakan-name", name.trim());
      history.replaceState(null, "", location.pathname);
    }
  }
  async function copyInvite() {
    if (!room) return;
    const url = new URL(location.href);
    url.searchParams.set("room", room.code);
    try {
      await navigator.clipboard.writeText(url.href);
      setCopied(true);
      setCopyError("");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError("Copy is unavailable. Share the room code above instead.");
    }
  }
  async function leave() {
    const reply = await action("room:leave");
    if (reply.ok || !connected) setRoom(null);
    setConfirm(null);
  }
  const localPieces: VisiblePiece[] = placements.map((p, i) => ({
    ...p,
    id: `local-${i}`,
    side: side ?? 0,
  }));
  const boardPieces = room
    ? phase === "setup" && !room.game.ready[room.side]
      ? localPieces
      : room.game.pieces
    : previewPieces;
  const selectedPiece = boardPieces.find((p) => p.id === selected);
  const opponent = room ? room.players[other(room.side)] : null;
  const yourTurn =
    room && room.game.phase === "playing" && room.game.turn === room.side;
  const destinations =
    room && yourTurn && connected && opponent?.connected && selectedPiece
      ? Array.from({ length: 72 }, (_, i) => ({
          row: Math.floor(i / 9),
          col: i % 9,
        }))
          .filter(
            (p) =>
              adjacent(selectedPiece, p) &&
              !boardPieces.some(
                (b) =>
                  b.row === p.row && b.col === p.col && b.side === room.side,
              ),
          )
          .map((p) => `${p.row}:${p.col}`)
      : [];
  function onSquare(row: number, col: number) {
    if (!room || busy) return;
    const piece = boardPieces.find((p) => p.row === row && p.col === col);
    if (phase === "setup" && !room.game.ready[room.side]) {
      if (room.side === 0 ? row < 5 : row > 2) return;
      if (!selected) {
        if (piece) setSelected(piece.id);
        return;
      }
      if (piece?.id === selected) {
        setSelected(null);
        return;
      }
      const index = Number(selected.replace("local-", ""));
      setPlacements((current) =>
        current.map((p, i) =>
          i === index
            ? { ...p, row, col }
            : p.row === row && p.col === col
              ? { ...p, row: current[index].row, col: current[index].col }
              : p,
        ),
      );
      setSelected(null);
    } else if (yourTurn && connected && opponent?.connected) {
      if (piece?.side === room.side)
        setSelected(piece.id === selected ? null : piece.id);
      else if (selected && destinations.includes(`${row}:${col}`)) {
        void action("game:move", { id: selected, row, col });
        setSelected(null);
      }
    }
  }
  function shuffle() {
    const positions = Array.from({ length: 27 }, (_, i) => ({
      row: room?.side === 1 ? Math.floor(i / 9) : 5 + Math.floor(i / 9),
      col: i % 9,
    }));
    for (let i = positions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    setPlacements((current) =>
      current.map((p, i) => ({ ...p, ...positions[i] })),
    );
    setSelected(null);
  }
  const setupLocked = room && room.game.ready[room.side];
  const status = !connected
    ? "Reconnecting to server"
    : phase === "finished"
      ? room?.game.winner === "draw"
        ? "An honorable draw."
        : room?.game.winner === room?.side
          ? "Victory is yours."
          : "Until the next battle."
      : phase === "setup"
        ? setupLocked
          ? "Formation locked."
          : "Make your first decision."
        : !opponent?.connected
          ? "Battle paused."
          : yourTurn
            ? "Your move, commander."
            : "The enemy is thinking.";

  return (
    <div className="app-shell">
      <header className="site-header">
        <a
          className="brand"
          href={location.pathname}
          onClick={(e) => {
            if (room) {
              e.preventDefault();
              setConfirm("leave");
            }
          }}
        >
          <Mark />
          <span>
            VEILED COMMAND<span className="brand-sub">HIDDEN-RANK STRATEGY</span>
          </span>
        </a>
        <nav>
          <button className="nav-link" onClick={() => setRules(true)}>
            <BookOpen size={16} />
            <span>Field manual</span>
          </button>
          <span className={`connection ${connected ? "" : "offline"}`}>
            {connected ? <Wifi size={14} /> : <WifiOff size={14} />}
            <span>{connected ? "Server connected" : "Connecting"}</span>
          </span>
          {room && (
            <button className="nav-link" onClick={() => setConfirm("leave")}>
              Leave room <ArrowUpRight size={15} />
            </button>
          )}
        </nav>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          {error}
          <button
            className="icon-button"
            aria-label="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {!room ? (
        <main className="home">
          <section className="home-copy">
            <div className="eyebrow">
              <span className="tiny-line" /> A BATTLE OF STRATEGY AND SECRECY
            </div>
            <h1>
              Every move
              <br />
              tells a story.
              <br />
              <em>Every rank hides one.</em>
            </h1>
            <p className="intro">
              Twenty-one pieces. Two commanders. One flag.
              <br className="desktop-break" /> Outsmart a friend in a battle of
              instinct and deception.
            </p>
            <form className="lobby-card" onSubmit={enter}>
              <div className="lobby-card-top">
                <span className="eyebrow">TAKE YOUR SEAT</span>
                <LockKeyhole size={16} />
              </div>
              <div className="tabs">
                <button
                  type="button"
                  className={mode === "create" ? "active" : ""}
                  onClick={() => setMode("create")}
                >
                  Create a room
                </button>
                <button
                  type="button"
                  className={mode === "join" ? "active" : ""}
                  onClick={() => setMode("join")}
                >
                  Join a friend
                </button>
              </div>
              <label htmlFor="name">Commander name</label>
              <input
                id="name"
                autoComplete="nickname"
                placeholder="What should we call you?"
                value={name}
                maxLength={24}
                required
                onChange={(e) => setName(e.target.value)}
              />
              {mode === "join" && (
                <>
                  <label htmlFor="code">Room code</label>
                  <input
                    id="code"
                    className="code-input"
                    placeholder="ABC123"
                    minLength={6}
                    maxLength={6}
                    value={code}
                    required
                    onChange={(e) =>
                      setCode(
                        e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""),
                      )
                    }
                  />
                </>
              )}
              <button className="primary full" disabled={!connected || busy}>
                {busy
                  ? "Preparing your seat…"
                  : mode === "create"
                    ? "Create private room"
                    : "Join the battlefield"}
                <ArrowRight size={18} />
              </button>
              <p className="form-note">
                <Users size={13} /> Just you and a friend. No account needed.
              </p>
            </form>
            <div className="home-highlights">
              <span>
                <Eye size={17} /> Hidden identities
              </span>
              <span>
                <Globe2 size={17} /> Play anywhere
              </span>
              <span>
                <Shield size={17} /> Fair by design
              </span>
            </div>
          </section>
          <section className="home-board">
            <div className="showcase-heading">
              <span className="eyebrow">THE BATTLEFIELD</span>
              <span className="mini-tag">09 × 08</span>
            </div>
            <div className="showcase-player">
              <span className="player-avatar enemy-avatar">
                <Shield size={17} />
              </span>
              <div>
                <strong>The unknown</strong>
                <span>21 pieces. A hidden plan.</span>
              </div>
              <span className="hidden-badge">
                <LockKeyhole size={12} /> Ranks concealed
              </span>
            </div>
            <Board pieces={previewPieces} />
            <div className="showcase-player own">
              <span className="player-avatar">
                <Flag size={18} />
              </span>
              <div>
                <strong>Your army</strong>
                <span>The next move is yours.</span>
              </div>
              <span className="mini-tag">21 PIECES</span>
            </div>
            <div className="board-caption">
              <span className="caption-line" />
              <span>A preview of the battlefield</span>
              <span className="caption-line" />
            </div>
            <div className="floating-note">
              <Eye size={19} />
              <div>
                <strong>What you don’t see is the game.</strong>
                <span>
                  Your opponent’s ranks stay hidden. Trust your instincts.
                </span>
              </div>
            </div>
          </section>
          <section className="how-section">
            <div>
              <span className="eyebrow">SIMPLE RULES. DEEP STRATEGY.</span>
              <h2>A battle of minds.</h2>
              <button className="text-button" onClick={() => setRules(true)}>
                Read the field manual <ArrowUpRight size={16} />
              </button>
            </div>
            <article>
              <span className="step-number">01 /</span>
              <Layers3 size={23} />
              <h3>Arrange your army</h3>
              <p>
                Place your ranks in secret.
                <br />
                Every formation is a new plan.
              </p>
            </article>
            <article>
              <span className="step-number">02 /</span>
              <Swords size={23} />
              <h3>Challenge the unknown</h3>
              <p>
                Move, bluff, and outmaneuver.
                <br />
                The stronger rank survives.
              </p>
            </article>
            <article>
              <span className="step-number">03 /</span>
              <Flag size={23} />
              <h3>Find their flag</h3>
              <p>
                Capture it. Or bring yours
                <br />
                safely to the other side.
              </p>
            </article>
          </section>
        </main>
      ) : (
        <main className="game-layout">
          <aside className="command-panel">
            <div className="eyebrow">PRIVATE BATTLE</div>
            <div className="room-code-row">
              <h2>{room.code}</h2>
              <button
                className="icon-button"
                aria-label="Copy invite link"
                onClick={() => void copyInvite()}
              >
                {copied ? <Check size={19} /> : <Copy size={19} />}
              </button>
            </div>
            <button
              className="secondary full"
              onClick={() => void copyInvite()}
            >
              <Link2 size={15} />
              {copied ? "Invite copied" : "Copy invite link"}
            </button>
            {copyError && (
              <p className="muted" role="status">
                {copyError}
              </p>
            )}
            <p className="muted room-help">
              Share the code or link with your opponent.
            </p>
            <div className="panel-divider" />
            <div className="eyebrow">THE COMMANDERS</div>
            {[room.side, other(room.side)].map((s, i) => {
              const p = room.players[s];
              return (
                <div className="commander" key={s}>
                  <span className={`player-avatar ${i ? "enemy-avatar" : ""}`}>
                    {i ? <Shield size={18} /> : <Flag size={18} />}
                  </span>
                  <div>
                    <strong>{p?.name || "An open seat"}</strong>
                    <span>
                      {i ? (p ? "Opponent" : "Waiting for a friend") : "You"}
                      {p && phase === "setup"
                        ? p.ready
                          ? " · Ready"
                          : " · Arranging"
                        : ""}
                    </span>
                  </div>
                  <span
                    className={`presence ${p?.connected ? "online" : ""}`}
                    title={p?.connected ? "Connected" : "Offline"}
                  />
                </div>
              );
            })}
            <div className="panel-divider" />
            <div className="battle-info">
              <span>Battle format</span>
              <strong>Friendly · Untimed</strong>
              <span>First move</span>
              <strong>
                {room.players[room.first]?.name || "Room creator"}
              </strong>
              <span>Moves played</span>
              <strong>{room.game.moves.toString().padStart(2, "0")}</strong>
            </div>
            <div className="privacy-note">
              <LockKeyhole size={16} />
              <p>
                Your ranks are sent only to you. Challenges are resolved by the
                server.
              </p>
            </div>
            <button className="text-button" onClick={() => setRules(true)}>
              Need a refresher? <BookOpen size={15} />
            </button>
          </aside>
          <section className="battlefield">
            <div className="battlefield-header">
              <div>
                <span className="eyebrow">
                  {phase === "setup"
                    ? "01 / DEPLOYMENT"
                    : phase === "finished"
                      ? "03 / DEBRIEF"
                      : "02 / THE BATTLE"}
                </span>
                <h1>{status}</h1>
              </div>
              <span className={`phase-badge ${yourTurn ? "your-turn" : ""}`}>
                <span />
                {phase === "setup"
                  ? "SETUP"
                  : phase === "finished"
                    ? "COMPLETE"
                    : yourTurn
                      ? "YOUR TURN"
                      : "OPPONENT TURN"}
              </span>
            </div>
            <p className="battlefield-instruction">
              {phase === "setup"
                ? setupLocked
                  ? opponent?.ready
                    ? "Both armies are ready. The battle is about to begin."
                    : "Waiting for your opponent to join and lock their formation."
                  : "Select a piece, then select a square to move or swap it within your three rows."
                : phase === "finished"
                  ? room.game.reason + ". All surviving ranks are now revealed."
                  : !connected || !opponent?.connected
                    ? "Your formation is safe. Play resumes when both commanders reconnect."
                    : yourTurn
                      ? "Select your piece. Highlighted squares show where you can advance or challenge."
                      : "Watch their moves. Remember: every piece could be their flag."}
            </p>
            <Board
              pieces={boardPieces}
              side={room.side}
              selected={selected}
              destinations={destinations}
              setup={phase === "setup" && !setupLocked}
              onSquare={onSquare}
            />
            <div className="board-legend">
              <span>
                <span className="legend-square friendly-legend" /> Your army
              </span>
              <span>
                <span className="legend-square enemy-legend" /> Opponent
              </span>
              <span>
                <LockKeyhole size={12} />
                {phase === "finished" ? "Ranks revealed" : "Enemy ranks hidden"}
              </span>
            </div>
            {phase === "setup" ? (
              <div className="deployment-actions">
                <button
                  className="secondary"
                  onClick={shuffle}
                  disabled={!!setupLocked || busy}
                >
                  <Shuffle size={16} />
                  Shuffle
                </button>
                <button
                  className="icon-button reset"
                  aria-label="Reset formation"
                  disabled={!!setupLocked || busy}
                  onClick={() => {
                    setPlacements(defaultDeployment(room.side));
                    setSelected(null);
                  }}
                >
                  <RotateCcw size={17} />
                </button>
                <span className="muted">21 / 21 deployed</span>
                <button
                  className="primary"
                  disabled={!!setupLocked || busy || !connected}
                  onClick={() => void action("game:deploy", { placements })}
                >
                  {setupLocked ? (
                    <>
                      <Check size={17} />
                      Formation locked
                    </>
                  ) : (
                    <>
                      Lock formation <ArrowRight size={17} />
                    </>
                  )}
                </button>
              </div>
            ) : phase === "finished" ? (
              <div className="result-actions">
                <button
                  className="primary"
                  disabled={busy || room.rematch[room.side] || !connected}
                  onClick={() => void action("game:rematch")}
                >
                  {room.rematch[room.side]
                    ? "Waiting for opponent…"
                    : room.rematch[other(room.side)]
                      ? "Accept rematch"
                      : "Play again"}
                  <RotateCcw size={17} />
                </button>
                <button className="secondary" onClick={() => void leave()}>
                  Back to lobby
                </button>
              </div>
            ) : (
              <div className="battle-actions">
                <button
                  className="text-button"
                  disabled={busy || !connected || room.game.drawOffer !== null}
                  onClick={() => void action("game:draw", { action: "offer" })}
                >
                  {room.game.drawOffer === room.side
                    ? "Draw offer sent"
                    : "Offer a draw"}
                </button>
                <button
                  className="text-button"
                  onClick={() => setConfirm("resign")}
                >
                  Resign <Flag size={14} />
                </button>
              </div>
            )}
            {room.game.drawOffer === other(room.side) && (
              <div className="draw-notice" role="status">
                <p>Your opponent proposes a draw.</p>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void action("game:draw", { action: "decline" })
                  }
                >
                  Decline
                </button>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void action("game:draw", { action: "accept" })}
                >
                  Accept
                </button>
              </div>
            )}
          </section>
          <aside className="intel-panel">
            <div className="intel-heading">
              <Target size={18} />
              <span className="eyebrow">FIELD INTELLIGENCE</span>
            </div>
            {phase === "setup" ? (
              <>
                <h3>
                  A good plan starts
                  <br />
                  before the first move.
                </h3>
                <p className="muted">
                  Protect your flag. Scatter your spies. Leave room for your
                  army to move.
                </p>
                <div className="strategy-tip">
                  <Sparkles size={18} />
                  <span>
                    Try placing privates beside your strongest officers. They’re
                    your defense against spies.
                  </span>
                </div>
                <div className="panel-divider" />
                <span className="eyebrow">YOUR ARMY · 21 PIECES</span>
                <div className="army-overview">
                  {RANKS.map((r) => (
                    <div key={r.rank}>
                      <Insignia rank={r.rank} />
                      <span>{r.short}</span>
                      <strong>×{r.count}</strong>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="army-counts">
                  <div>
                    <strong>
                      {boardPieces.filter((p) => p.side === room.side).length}
                    </strong>
                    <span>Your pieces</span>
                  </div>
                  <div>
                    <strong>
                      {boardPieces.filter((p) => p.side !== room.side).length}
                    </strong>
                    <span>Enemy pieces</span>
                  </div>
                </div>
                <div className="panel-divider" />
                <span className="eyebrow">BATTLE LOG</span>
                <div className="battle-log" aria-live="polite">
                  {room.game.log.length === 0 ? (
                    <div className="log-empty">
                      <Swords size={25} />
                      <p>
                        The board is quiet.
                        <br />
                        Make the opening move.
                      </p>
                    </div>
                  ) : (
                    [...room.game.log].reverse().map((entry) => (
                      <div className="log-entry" key={entry.move}>
                        <span className="log-number">
                          {entry.move.toString().padStart(2, "0")}
                        </span>
                        <div>
                          <strong>
                            {entry.side === room.side ? "You" : "Opponent"}{" "}
                            <span>
                              {entry.from} <ArrowRight size={10} /> {entry.to}
                            </span>
                          </strong>
                          <p>{entry.outcome}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
            <div className="intel-foot">
              <Eye size={15} />
              <span>Observe. Remember. Outmaneuver.</span>
            </div>
          </aside>
        </main>
      )}
      <footer>
        <div>
          <Mark small />
          <span>Every rank concealed. Every move decisive.</span>
        </div>
        <span>
          STRATEGY OVER CHANCE <span className="footer-dot">·</span> VEILED COMMAND
        </span>
        <button onClick={() => setRules(true)}>
          How to play <ArrowUpRight size={13} />
        </button>
      </footer>
      {rules && <Rules onClose={() => setRules(false)} />}
      {confirm && (
        <Modal
          title={
            confirm === "resign"
              ? "Concede this battle?"
              : "Leave the battlefield?"
          }
          onClose={() => setConfirm(null)}
        >
          <p className="muted">
            {confirm === "resign"
              ? "Your opponent will win. You can both choose to play again after the battle."
              : "Your seat is saved in this tab. Refresh to return while the room is still active. Your opponent will wait for you."}
          </p>
          <div className="confirm-actions">
            <button className="secondary" onClick={() => setConfirm(null)}>
              Stay here
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => {
                if (confirm === "leave") void leave();
                else
                  void action("game:resign").then((reply) => {
                    if (reply.ok) setConfirm(null);
                  });
              }}
            >
              {confirm === "resign" ? "Resign battle" : "Leave room"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
