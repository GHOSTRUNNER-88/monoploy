import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { COLORS, MAX_PLAYERS } from "../shared/board.js";
import { Blob, BlobDefs } from "./Blob.jsx";
import { Game } from "./Game.jsx";
import { blinkLoop, gsap, reducedMotion, useGSAP } from "./motion.js";

const socket = io();

// Kept in the browser so a refresh puts you back in your seat.
function getSecret() {
  try {
    let secret = localStorage.getItem("landgrab-secret");
    if (!secret) localStorage.setItem("landgrab-secret", (secret = crypto.randomUUID()));
    return secret;
  } catch {
    return (window.__landgrabSecret ??= crypto.randomUUID());
  }
}

const roomFromPath = () => location.pathname.match(/^\/room\/([a-z0-9]+)/)?.[1] ?? null;

export function App() {
  const [room, setRoom] = useState(roomFromPath);

  useEffect(() => {
    const onPop = () => setRoom(roomFromPath());
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  const go = (id) => {
    history.pushState(null, "", id ? `/room/${id}` : "/");
    setRoom(id);
  };

  return (
    <>
      <BlobDefs />
      {room ? <Room key={room} id={room} onLeave={() => go(null)} /> : <Home onCreated={go} />}
    </>
  );
}

function Home({ onCreated }) {
  const [busy, setBusy] = useState(false);

  function create() {
    setBusy(true);
    socket.emit("create", ({ id }) => onCreated(id));
  }

  const crew = useRef(null);
  // The cast hops in a wave and blinks while you decide.
  useGSAP(
    () => {
      if (reducedMotion()) return;
      const blobs = gsap.utils.toArray(".home-blob");
      gsap.to(blobs, { y: -28, scaleY: 1.12, scaleX: 0.9, duration: 0.32, ease: "power2.out", yoyo: true, repeat: -1, repeatDelay: 0.5, stagger: { each: 0.12, repeat: -1, yoyo: true, repeatDelay: 0.5 } });
      blobs.forEach(blinkLoop);
    },
    { scope: crew }
  );

  return (
    <main className="home">
      <div className="home-crew" ref={crew} aria-hidden>
        {COLORS.map((c) => (
          <span key={c} className="home-blob">
            <Blob color={c} />
          </span>
        ))}
      </div>
      <h1 className="logo">
        Land<span>grab</span>
      </h1>
      <p className="home-lead">Buy cities, build hotels and bankrupt your friends.</p>
      <button className="btn btn-big home-cta" onClick={create} disabled={busy}>
        {busy ? "Creating room..." : "Create a room"}
      </button>
      <ul className="home-facts">
        <li>2 to {MAX_PLAYERS} players</li>
        <li>No sign-up</li>
        <li>Auctions and trading</li>
      </ul>
    </main>
  );
}

function Room({ id, onLeave }) {
  const [game, setGame] = useState(null);
  const [me, setMe] = useState(null);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const hello = () =>
      socket.emit("hello", { room: id, secret: getSecret() }, (res) => {
        if (res.error) setError(res.error);
        else setMe(res.playerId);
      });
    hello();
    socket.on("connect", hello);
    socket.on("state", setGame);
    return () => {
      socket.off("connect", hello);
      socket.off("state", setGame);
    };
  }, [id]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const send = useCallback(
    (type, payload) =>
      new Promise((resolve) =>
        socket.emit("act", { type, payload }, (res) => {
          if (res?.error) setToast(res.error);
          if (res?.playerId) setMe(res.playerId);
          resolve(!res?.error);
        })
      ),
    []
  );

  if (error)
    return (
      <main className="home">
        <p className="home-lead">{error}</p>
        <button className="btn" onClick={onLeave}>Create a new room</button>
      </main>
    );
  if (!game) return <main className="home muted">Connecting...</main>;

  return (
    <>
      {game.status === "lobby" ? <Lobby game={game} me={me} send={send} onLeave={onLeave} /> : <Game game={game} me={me} send={send} />}
      {toast && <div className="toast" role="alert">{toast}</div>}
    </>
  );
}

function Lobby({ game, me, send, onLeave }) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(null);
  const [copied, setCopied] = useState(false);
  const joined = game.players.some((p) => p.id === me);
  const taken = new Set(game.players.map((p) => p.color));
  const myColor = game.players.find((p) => p.id === me)?.color;

  function copyLink() {
    navigator.clipboard?.writeText(location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function pick(c) {
    if (joined) send("color", { color: c });
    else setColor(c);
  }

  return (
    <main className="lobby">
      <h1 className="logo small">
        Land<span>grab</span>
      </h1>
      <div className="lobby-cols">
      <div className="lobby-col">

      <section className="card">
        <h2>Invite friends</h2>
        <div className="invite">
          <input readOnly value={location.href} aria-label="Room link" onFocus={(e) => e.target.select()} />
          <button className="btn" onClick={copyLink}>{copied ? "Copied" : "Copy link"}</button>
        </div>
      </section>

      {!joined && game.players.length < game.settings.maxPlayers && (
        <form
          className="card"
          onSubmit={(e) => {
            e.preventDefault();
            send("join", { name, color: color ?? COLORS.find((c) => !taken.has(c)) });
          }}
        >
          <h2>Join this room</h2>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" maxLength={16} autoFocus aria-label="Your name" />
          <ColorPicker taken={taken} value={color} onPick={pick} />
          <button className="btn btn-big" disabled={!name.trim()}>Join</button>
        </form>
      )}

      <section className="card">
        <h2>Players ({game.players.length}/{game.settings.maxPlayers})</h2>
        <ul className="lobby-players">
          {game.players.map((p) => (
            <li key={p.id}>
              <Blob color={p.color} className="avatar-blob" />
              {p.name}
              {p.id === game.hostId && <span className="pill">Host</span>}
              {!p.online && <span className="pill dim">Offline</span>}
              {p.id === me && <span className="pill">You</span>}
              {me === game.hostId && !p.online && (
                <button className="link" onClick={() => send("kick", { player: p.id })}>Remove</button>
              )}
            </li>
          ))}
          {!game.players.length && <li className="muted">Nobody here yet.</li>}
        </ul>
        {joined && (
          <>
            <p className="muted">Your colour</p>
            <ColorPicker taken={taken} value={myColor} onPick={pick} />
          </>
        )}
        {joined && me === game.hostId ? (
          <button className="btn btn-big" disabled={game.players.length < 2} onClick={() => send("start")}>
            {game.players.length < 2 ? "Waiting for another player" : "Start game"}
          </button>
        ) : (
          joined && <p className="muted">Waiting for the host to start.</p>
        )}
        {joined && (
          <button className="link" onClick={() => send("leaveLobby").then((ok) => ok && onLeave())}>Leave room</button>
        )}
      </section>
      </div>
      <Settings game={game} isHost={joined && me === game.hostId} send={send} />
      </div>
    </main>
  );
}

const money = (n) => `$${n.toLocaleString()}`;

// [key, label, help, options] — options means a dropdown, no options means an on/off switch.
const SETTING_ROWS = [
  ["startMoney", "Starting money", "Cash everyone starts with", [500, 1000, 1500, 2000, 2500, 3000, 4000, 5000], money],
  ["maxPlayers", "Maximum players", "How many people can join", [2, 3, 4, 5, 6], String],
  ["passStart", "Start salary", "Collected every time you pass Start", [0, 100, 200, 300, 400, 500], money],
  ["doubleOnStart", "Double salary on Start", "Land exactly on Start to collect twice"],
  ["doubleRent", "Double rent on full sets", "Owning a whole country doubles its base rent"],
  ["vacationCash", "Vacation cash", "Taxes and fines build a pot for whoever lands on Vacation"],
  ["noRentInJail", "No rent from jail", "Owners in jail can't collect rent"],
  ["evenBuild", "Build evenly", "Houses go up evenly across a country"],
  ["auctions", "Auctions", "Declined properties go to the highest bidder"],
];

function Settings({ game, isHost, send }) {
  const change = (key, value) => send("settings", { [key]: value });
  const host = game.players.find((p) => p.id === game.hostId);
  return (
    <section className="card settings">
      <h2>Game settings</h2>
      {!isHost && (
        <p className="muted">
          {host ? `Only ${host.name}, the host, can change these.` : "The first player to join becomes the host and can change these."}
        </p>
      )}
      <ul>
        {SETTING_ROWS.map(([key, label, help, options, format]) => (
          <li key={key}>
            <label htmlFor={`set-${key}`}>
              <strong>{label}</strong>
              <small>{help}</small>
            </label>
            {options ? (
              <select id={`set-${key}`} value={game.settings[key]} disabled={!isHost} onChange={(e) => change(key, Number(e.target.value))}>
                {options.map((o) => (
                  <option key={o} value={o} disabled={key === "maxPlayers" && o < game.players.length}>{format(o)}</option>
                ))}
              </select>
            ) : (
              <input
                id={`set-${key}`}
                type="checkbox"
                role="switch"
                className="switch"
                checked={game.settings[key]}
                disabled={!isHost}
                onChange={(e) => change(key, e.target.checked)}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ColorPicker({ taken, value, onPick }) {
  return (
    <div className="colors" role="radiogroup" aria-label="Colour">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          disabled={taken.has(c) && value !== c}
          className="color-blob"
          style={{ "--c": c }}
          onClick={() => onPick(c)}
        >
          <Blob color={c} />
        </button>
      ))}
    </div>
  );
}
