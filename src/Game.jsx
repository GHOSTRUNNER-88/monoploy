import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowLeftRight, Check, CircleHelp, Droplets, Gavel, Gift, Lock, Palmtree, Plane, Receipt, Siren, X, Zap } from "lucide-react";
import { Blob } from "./Blob.jsx";
import { Flag } from "./Flag.jsx";

// Icons for the non-city squares.
function TileIcon({ tile }) {
  const Icon = {
    airport: Plane,
    company: tile.name.startsWith("Water") ? Droplets : Zap,
    treasure: Gift,
    surprise: CircleHelp,
    tax: Receipt,
    vacation: Palmtree,
    gotojail: Siren,
    jail: Lock,
    start: ArrowLeft,
  }[tile.type];
  return Icon ? <Icon className="tile-icon" strokeWidth={2.2} aria-hidden /> : null;
}
import { DICE_MS, badgeIn, bannerIn, blinkLoop, boardIntro, confettiBurst, flipIn, floatDelta, gsap, hopAlong, jumpTo, popIn, reducedMotion, throwDie, useGSAP } from "./motion.js";
import { AIRPORT_RENT, BOARD, COMPANY_MULTIPLIER, GROUPS, JAIL_FINE, groupTiles, isOwnable } from "../shared/board.js";
import { AUCTION_MS, canBuild, canMortgage, canSell, canTradeTile, canUnmortgage, current, rentFor, unmortgageCost } from "../shared/game.js";

const money = (n) => `$${n.toLocaleString()}`;

const randomFace = () => 1 + Math.floor(Math.random() * 6);

// Dice show random faces while GSAP throws them, then land on the real roll. Runs for every viewer.
function useDice(game) {
  const [faces, setFaces] = useState(game.dice);
  const [rolling, setRolling] = useState(false);
  const seen = useRef(game.rolls);

  useEffect(() => {
    if (game.rolls === seen.current || reducedMotion()) {
      seen.current = game.rolls;
      setFaces(game.dice);
      return;
    }
    seen.current = game.rolls;
    setRolling(true);
    const spin = setInterval(() => setFaces([randomFace(), randomFace()]), 90);
    const stop = setTimeout(() => {
      clearInterval(spin);
      setFaces(game.dice);
      setRolling(false);
    }, DICE_MS);
    return () => {
      clearInterval(spin);
      clearTimeout(stop);
      setRolling(false);
    };
  }, [game.rolls, game.dice]);

  return { faces, rolling };
}

function chime() {
  try {
    const ctx = new AudioContext();
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.12 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.32);
    });
  } catch {
    // No audio before the first click, or no Web Audio: the banner and tab title still show.
  }
}

// When the turn passes to you: a big banner, a chime, and the tab title changes so you notice from another tab.
function useYourTurnAlert(game, me) {
  const [show, setShow] = useState(false);
  const mine = game.status === "playing" && current(game).id === me;

  useEffect(() => {
    document.title = mine ? "🎲 Your turn! | Landgrab" : "Landgrab";
    if (!mine) return;
    setShow(true);
    chime();
    const t = setTimeout(() => setShow(false), 2300);
    return () => clearTimeout(t);
  }, [mine, game.turn]);

  useEffect(() => () => { document.title = "Landgrab"; }, []);
  return show;
}

// Tokens sit toward the outer edge of their square so the name stays readable.
const EDGE = { bottom: [0, 3.4], top: [0, -3.4], left: [-3.8, 0], right: [3.8, 0] };
const pointFor = (pos) => {
  const { row, col, side } = cell(pos);
  const [dx, dy] = pos % 10 === 0 ? [0, 3.6] : EDGE[side];
  return { left: `${center(col) + dx}%`, top: `${center(row) + dy}%` };
};

// GSAP owns the token's left/top: it hops square by square after the dice land.
function Token({ player, target, rolls, index, count, active, onSettle }) {
  const ref = useRef(null);
  const at = useRef(target);
  const lastRolls = useRef(rolls);
  const tl = useRef(null);

  useGSAP(() => {
    gsap.set(ref.current, { ...pointFor(at.current), xPercent: -50, yPercent: -50 });
    if (!reducedMotion()) blinkLoop(ref.current);
  }, []);

  useGSAP(
    () => {
      const justRolled = rolls !== lastRolls.current;
      lastRolls.current = rolls;
      const from = at.current;
      if (from === target) return;
      at.current = target;
      tl.current?.kill();
      const done = () => onSettle(player.id, target);
      const delay = justRolled ? DICE_MS / 1000 : 0;
      const steps = (target - from + 40) % 40;
      if (reducedMotion()) {
        gsap.set(ref.current, pointFor(target));
        done();
      } else if (steps > 12) tl.current = jumpTo(ref.current, pointFor(target), { delay, onComplete: done });
      else tl.current = hopAlong(ref.current, Array.from({ length: steps }, (_, k) => pointFor((from + k + 1) % 40)), { delay, onComplete: done });
    },
    { dependencies: [target, rolls] }
  );

  return (
    <span
      ref={ref}
      className={`token ${active ? "active" : ""}`}
      title={player.name}
      style={{
        "--c": player.color,
        marginLeft: (index - (count - 1) / 2) * 12,
        marginTop: (index % 2) * 6,
      }}
    >
      <Blob color={player.color} />
    </span>
  );
}

function Popped({ className }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!reducedMotion()) popIn(ref.current);
  }, []);
  return <i ref={ref} className={className} />;
}

function YourTurnBanner({ color }) {
  const ref = useRef(null);
  useGSAP(() => {
    if (!reducedMotion()) bannerIn(ref.current);
  }, []);
  return (
    <div ref={ref} className="your-turn" role="status" style={{ "--c": color }}>
      Your turn!
    </div>
  );
}

function DrawnCard({ card }) {
  const ref = useRef(null);
  useGSAP(() => {
    if (!reducedMotion()) flipIn(ref.current);
  }, []);
  return (
    <div ref={ref} className={`drawn-card ${card.deck.toLowerCase()}`}>
      <strong>{card.deck}</strong>
      {card.text}
    </div>
  );
}

function TurnBadge({ turn, myTurn, status }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!reducedMotion()) badgeIn(ref.current);
  }, []);
  return (
    <div ref={ref} className="turn-badge" style={{ "--c": turn.color }}>
      <Blob color={turn.color} />
      <span>
        <strong>{myTurn ? "Your turn!" : `${turn.name}'s turn`}</strong>
        <small>{status}</small>
      </span>
    </div>
  );
}

// Board is an 11x11 grid: corners are 1.6 units wide, the 9 squares between them 1 unit each.
function cell(i) {
  if (i <= 10) return { row: 11, col: 11 - i, side: "bottom" };
  if (i <= 20) return { row: 11 - (i - 10), col: 1, side: "left" };
  if (i <= 30) return { row: 1, col: 1 + (i - 20), side: "top" };
  return { row: 1 + (i - 30), col: 11, side: "right" };
}
const center = (n) => ((n === 1 ? 0.8 : n === 11 ? 11.4 : 1.6 + (n - 2) + 0.5) / 12.2) * 100;

// Flags sit on the inner edge of their square, half over the board centre.
const INNER = (1.6 / 12.2) * 100;
function flagPos(i) {
  const { row, col, side } = cell(i);
  if (side === "bottom") return { left: `${center(col)}%`, top: `${100 - INNER}%` };
  if (side === "top") return { left: `${center(col)}%`, top: `${INNER}%` };
  if (side === "left") return { left: `${INNER}%`, top: `${center(row)}%` };
  return { left: `${100 - INNER}%`, top: `${center(row)}%` };
}

const DIE_DOTS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function Die({ value, rolling, index }) {
  const ref = useRef(null);
  useGSAP(
    () => {
      if (rolling && !reducedMotion()) throwDie(ref.current, index);
    },
    { dependencies: [rolling] }
  );
  return (
    <div ref={ref} className="die" aria-label={`Die showing ${value}`}>
      {Array.from({ length: 9 }, (_, i) => <span key={i} className={DIE_DOTS[value].includes(i) ? "pip" : ""} />)}
    </div>
  );
}

export function Game({ game, me, send }) {
  const [selected, setSelected] = useState(null);
  const [trading, setTrading] = useState(null); // null, or the offer to pre-fill the trade window with
  const dice = useDice(game);
  const yourTurn = useYourTurnAlert(game, me);
  const mine = game.players.find((p) => p.id === me);
  const playerById = Object.fromEntries(game.players.map((p) => [p.id, p]));

  return (
    <div className="game">
      <aside className="col-left">
        <Brand />
        <Players game={game} me={me} send={send} />
        {mine && !mine.bankrupt && game.status === "playing" && (
          <MyStuff game={game} me={me} onSelect={setSelected} onTrade={() => setTrading({})} send={send} />
        )}
      </aside>

      <Board game={game} me={me} send={send} dice={dice} playerById={playerById} selected={selected} onSelect={setSelected} />

      <aside className="col-right">
        {selected != null && <TileCard game={game} me={me} index={selected} send={send} playerById={playerById} onClose={() => setSelected(null)} />}
        <Trades game={game} me={me} send={send} playerById={playerById} onCounter={(tr) => setTrading({ to: tr.from, give: tr.get, get: tr.give, counterOf: tr.id })} />
        <Activity game={game} />
        <Chat game={game} me={me} send={send} />
      </aside>

      {yourTurn && <YourTurnBanner color={mine?.color} />}

      {trading && <TradeDialog game={game} me={me} send={send} initial={trading} onClose={() => setTrading(null)} />}

      {game.status === "over" && (
        <div className="overlay">
          <Confetti />
          <div className="card winner">
            <p className="muted">Game over</p>
            <h2 style={{ color: playerById[game.winner]?.color }}>{playerById[game.winner]?.name} wins!</h2>
            <a className="btn btn-big" href="/">Play again</a>
          </div>
        </div>
      )}
    </div>
  );
}

function Brand() {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard?.writeText(location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <section className="card brand">
      <a href="/" className="logo small">
        Land<span>grab</span>
      </a>
      <div className="invite">
        <input readOnly value={location.href} aria-label="Room link" onFocus={(e) => e.target.select()} />
        <button className="btn" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
      </div>
    </section>
  );
}

function Activity({ game }) {
  return (
    <section className="card">
      <h2>Activity</h2>
      <ol className="log" aria-label="Game log">
        {game.log.slice(-7).reverse().map((line, i) => <li key={game.log.length - i}>{line}</li>)}
      </ol>
    </section>
  );
}

function Confetti() {
  const ref = useRef(null);
  useEffect(() => {
    if (!reducedMotion()) confettiBurst(ref.current);
  }, []);
  return <div ref={ref} className="confetti" aria-hidden />;
}

function Board({ game, me, send, dice, playerById, selected, onSelect }) {
  const [shown, setShown] = useState(() => Object.fromEntries(game.players.map((p) => [p.id, p.pos])));
  const onSettle = (id, pos) => setShown((s) => ({ ...s, [id]: pos }));
  const boardRef = useRef(null);
  const mover = current(game);

  useEffect(() => {
    if (!reducedMotion()) boardIntro(boardRef.current.querySelectorAll(".tile"));
  }, []);
  const settled = !dice.rolling && (shown[mover.id] ?? mover.pos) === mover.pos;
  const groupsOnTile = {};
  game.players.filter((p) => !p.bankrupt).forEach((p) => (groupsOnTile[shown[p.id] ?? p.pos] ??= []).push(p));

  return (
    <div className="board-wrap">
      <div ref={boardRef} className={`board ${mover.id === me ? "my-turn" : ""}`} style={{ "--turn": mover.color }}>
        {BOARD.map((tile, i) => {
          const { row, col, side } = cell(i);
          const t = game.tiles[i];
          const owner = t?.owner && playerById[t.owner];
          return (
            <button
              key={i}
              data-i={i}
              className={`tile ${side} ${tile.type} ${i % 10 === 0 ? "corner" : ""} ${selected === i ? "selected" : ""} ${t?.mortgaged ? "mortgaged" : ""}`}
              style={{ gridRow: row, gridColumn: col, "--owner": owner?.color ?? "transparent", "--group": tile.group ? GROUPS[tile.group].color : undefined }}
              onClick={() => onSelect(i)}
              aria-label={`${tile.name}${owner ? `, owned by ${owner.name}` : ""}`}
            >
              {/* Side squares rotate this so names run along the square, like a real board. */}
              <span className="tile-inner">
              <TileIcon tile={tile} />
              <span className="tile-name">{tile.name}</span>
              {t?.houses > 0 && (
                <span className="houses">
                  {t.houses === 5 ? <Popped key="hotel" className="hotel" /> : Array.from({ length: t.houses }, (_, h) => <Popped key={h} className="house" />)}
                </span>
              )}
              {tile.price &&
                (owner ? (
                  <span key={owner.id} className="tile-price owned">
                    <Blob color={owner.color} />
                  </span>
                ) : (
                  <span className="tile-price">{money(tile.price)}</span>
                ))}
              {tile.type === "vacation" && game.settings.vacationCash && <span className="tile-price">{money(game.pot)}</span>}
              </span>
            </button>
          );
        })}

        {BOARD.map((tile, i) => tile.group && <Flag key={`flag-${i}`} group={tile.group} className="board-flag" style={flagPos(i)} />)}

        <div className="board-center">
          <p className="center-mark" aria-hidden>
            Land<span>grab</span>
          </p>
          <Controls game={game} me={me} send={send} dice={dice} settled={settled} />
        </div>

        {Object.entries(groupsOnTile).flatMap(([pos, players]) =>
          players.map((p, k) => (
            <Token key={p.id} player={p} target={p.pos} rolls={game.rolls} onSettle={onSettle} index={k} count={players.length} active={mover.id === p.id && game.status === "playing"} />
          ))
        )}
      </div>
    </div>
  );
}

function turnStatus(game, turn, myTurn, settled) {
  const here = BOARD[turn.pos];
  if (!settled) return "Moving...";
  if (game.auction) return `Auctioning ${BOARD[game.auction.tile].name}`;
  if (turn.money < 0) return myTurn ? "Pay off your debt to continue" : "Paying off a debt";
  if (game.phase === "buy") return myTurn ? `Buy ${here.name}?` : `Deciding whether to buy ${here.name}`;
  if (game.phase === "end") return myTurn ? "All done? End your turn" : "Finishing their turn";
  if (turn.inJail) return myTurn ? "In jail: roll doubles or pay to leave" : "In jail";
  if (game.rolledDouble) return myTurn ? "Doubles! Roll again" : "Rolled doubles, rolling again";
  return myTurn ? "Roll the dice" : "Rolling the dice";
}

function Controls({ game, me, send, dice, settled }) {
  const turn = current(game);
  const myTurn = turn.id === me && game.status === "playing";
  const here = BOARD[turn.pos];

  return (
    <div className="controls">
      <div className="dice">
        <Die value={dice.faces[0]} rolling={dice.rolling} index={0} />
        <Die value={dice.faces[1]} rolling={dice.rolling} index={1} />
      </div>

      <TurnBadge key={`turn-${game.turn}`} turn={turn} myTurn={myTurn} status={turnStatus(game, turn, myTurn, settled)} />

      {game.card && settled && <DrawnCard key={`card-${game.rolls}`} card={game.card} />}

      {game.auction && settled && <AuctionPanel game={game} me={me} send={send} />}

      {myTurn && settled && !game.auction && (
        <div className="actions">
          {turn.money < 0 && <p className="debt">You owe {money(-turn.money)}. Sell buildings or mortgage properties to pay, or declare bankruptcy.</p>}
          {game.phase === "roll" && turn.inJail && (
            <>
              <button className="btn" onClick={() => send("payJail")} disabled={turn.money < JAIL_FINE}>Pay {money(JAIL_FINE)} to leave</button>
              {turn.jailCards > 0 && <button className="btn" onClick={() => send("jailCard")}>Use jail card</button>}
            </>
          )}
          {game.phase === "roll" && (
            <button className="btn btn-big btn-roll" onClick={() => send("roll")} disabled={turn.money < 0}>
              {turn.inJail ? "Roll for doubles" : game.rolledDouble ? "Doubles! Roll again" : "Roll the dice"}
            </button>
          )}
          {game.phase === "buy" && (
            <>
              <button className="btn btn-big" onClick={() => send("buy")} disabled={turn.money < here.price}>
                Buy {here.name} for {money(here.price)}
              </button>
              <button className="btn btn-ghost" onClick={() => send("skipBuy")}>Don&apos;t buy</button>
            </>
          )}
          {game.phase === "end" && (
            <button className="btn btn-big" onClick={() => send("endTurn")} disabled={turn.money < 0}>End turn</button>
          )}
        </div>
      )}
    </div>
  );
}

function BidAmount({ value }) {
  const ref = useRef(null);
  useEffect(() => {
    if (value && !reducedMotion()) popIn(ref.current);
  }, [value]);
  return <strong ref={ref} className="bid-amount">{money(value)}</strong>;
}

// Live auction: everyone still in the game can bid; the server closes it when the timer runs out.
function AuctionPanel({ game, me, send }) {
  const a = game.auction;
  const tile = BOARD[a.tile];
  const leader = game.players.find((p) => p.id === a.leader);
  const mine = game.players.find((p) => p.id === me && !p.bankrupt);
  // Correct for the difference between this device's clock and the server's.
  const [skew] = useState(() => (game.serverNow ?? Date.now()) - Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, a.endsAt - (now + skew));

  return (
    <div className="auction" style={{ "--g": tile.group ? GROUPS[tile.group].color : "#6b62b8" }}>
      <header>
        {tile.group ? <Flag group={tile.group} className="auction-flag" /> : <TileIcon tile={tile} />}
        <div>
          <small>
            <Gavel size={13} /> Auction
          </small>
          <strong>{tile.name}</strong>
        </div>
        <span className="auction-worth">Worth {money(tile.price)}</span>
      </header>
      <div className="auction-bid">
        {leader ? (
          <>
            <Blob color={leader.color} className="avatar-blob" />
            <span>
              {leader.id === me ? "You lead with" : `${leader.name} leads with`}
              <BidAmount value={a.high} />
            </span>
          </>
        ) : (
          <span className="muted">No bids yet. Anyone can start.</span>
        )}
      </div>
      <div className="auction-timer" aria-label={`${Math.ceil(left / 1000)} seconds left`}>
        <span style={{ width: `${Math.min(100, (left / AUCTION_MS) * 100)}%` }} />
      </div>
      {mine && (
        <div className="auction-buttons">
          {[2, 10, 50, 100].map((inc) => (
            <button key={inc} className="btn btn-ghost" disabled={mine.money < a.high + inc || left === 0} onClick={() => send("bid", { amount: a.high + inc })}>
              +{money(inc)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Floating "+200" / "-50" next to a player's money whenever it changes.
function MoneyDelta({ amount }) {
  const [changes, setChanges] = useState([]);
  const prev = useRef(amount);

  useEffect(() => {
    const diff = amount - prev.current;
    prev.current = amount;
    if (!diff) return;
    const id = Math.random();
    setChanges((c) => [...c, { id, diff }]);
    setTimeout(() => setChanges((c) => c.filter((x) => x.id !== id)), 1600);
  }, [amount]);

  return changes.map(({ id, diff }) => <Delta key={id} diff={diff} />);
}

function Delta({ diff }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!reducedMotion()) floatDelta(ref.current);
  }, []);
  return (
    <span ref={ref} className={`delta ${diff > 0 ? "up" : "down"}`} aria-hidden>
      {diff > 0 ? "+" : "−"}
      {money(Math.abs(diff))}
    </span>
  );
}

function Players({ game, me, send }) {
  const turn = current(game);
  const worth = (p) =>
    p.money +
    Object.entries(game.tiles)
      .filter(([, t]) => t.owner === p.id)
      .reduce((sum, [i, t]) => sum + (t.mortgaged ? 0 : BOARD[i].price) + (BOARD[i].group ? t.houses * GROUPS[BOARD[i].group].house : 0), 0);

  return (
    <section className="card">
      <h2>Players</h2>
      <ul className="players">
        {game.players.map((p) => (
          <li key={p.id} style={{ "--c": p.color }} className={`${p.id === turn.id && game.status === "playing" ? "turn" : ""} ${p.bankrupt ? "out" : ""}`}>
            <Blob color={p.color} className="avatar-blob" />
            <span className="p-name">
              {p.name}
              {p.id === me && <span className="pill">You</span>}
              {p.id === turn.id && game.status === "playing" && <span className="pill playing">Playing</span>}
              {!p.online && !p.bankrupt && <span className="pill dim">Offline</span>}
              {p.inJail && <span className="pill">Jail</span>}
            </span>
            <span className={`p-money ${p.money < 0 ? "neg" : ""}`} title={`Net worth ${money(worth(p))}`}>
              {p.bankrupt ? "Out" : money(p.money)}
              <MoneyDelta amount={p.money} />
            </span>
            {me === game.hostId && !p.online && !p.bankrupt && game.status === "playing" && (
              <button className="link" onClick={() => confirm(`Remove ${p.name}? Their properties go back to the bank.`) && send("kick", { player: p.id })}>
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Owned properties grouped by country (or airports / companies), with set progress and buildings.
function MyStuff({ game, me, onSelect, onTrade, send }) {
  const groups = [];
  BOARD.forEach((tile, i) => {
    if (game.tiles[i]?.owner !== me) return;
    const key = tile.group ?? tile.type;
    let g = groups.find((x) => x.key === key);
    if (!g) {
      const total = tile.group ? groupTiles(tile.group).length : BOARD.filter((b) => b.type === tile.type).length;
      g = { key, tile, total, items: [], label: tile.group ? GROUPS[tile.group].name : tile.type === "airport" ? "Airports" : "Companies" };
      groups.push(g);
    }
    g.items.push(i);
  });
  const count = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <section className="card mine">
      <header className="mine-head">
        <h2>Your properties</h2>
        {count > 0 && <span className="count">{count}</span>}
      </header>
      {groups.length ? (
        <div className="mine-groups">
          {groups.map((g) => {
            const full = g.items.length === g.total;
            return (
              <div key={g.key} className="mine-group" style={{ "--g": g.tile.group ? GROUPS[g.tile.group].color : "#6b62b8" }}>
                <div className="mine-group-head">
                  {g.tile.group ? <Flag group={g.tile.group} className="mine-flag" /> : <TileIcon tile={g.tile} />}
                  <strong>{g.label}</strong>
                  <span className={`set ${full ? "full" : ""}`}>{full ? "Full set" : `${g.items.length}/${g.total}`}</span>
                </div>
                <ul>
                  {g.items.map((i) => {
                    const t = game.tiles[i];
                    return (
                      <li key={i}>
                        <button className="mine-item" onClick={() => onSelect(i)}>
                          <span className="mine-name">{BOARD[i].name}</span>
                          {t.mortgaged ? (
                            <span className="tag muted-tag">Mortgaged</span>
                          ) : t.houses ? (
                            <span className="mine-houses" aria-label={t.houses === 5 ? "Hotel" : `${t.houses} houses`}>
                              {t.houses === 5 ? <i className="hotel" /> : Array.from({ length: t.houses }, (_, h) => <i key={h} className="house" />)}
                            </span>
                          ) : (
                            <span className="mine-rent">{BOARD[i].type === "company" ? "×dice" : `Rent ${money(rentFor(game, i, 7))}`}</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="muted">Nothing yet. Land on a city and buy it, or win it at auction.</p>
      )}
      <div className="mine-actions">
        <button className="btn" onClick={onTrade}>
          <ArrowLeftRight size={16} /> Trade
        </button>
        <button className="link danger" onClick={() => confirm("Declare bankruptcy and leave the game?") && send("bankrupt")}>Go bankrupt</button>
      </div>
    </section>
  );
}

function TileCard({ game, me, index, send, playerById, onClose }) {
  const tile = BOARD[index];
  const t = game.tiles[index];
  const owner = t?.owner && playerById[t.owner];
  const group = tile.group && GROUPS[tile.group];

  return (
    <section className="card tile-card">
      <header style={{ background: group?.color ?? "#2b3350" }}>
        {group && <small>{group.name}</small>}
        <h2>{tile.name}</h2>
        <button className="close" onClick={onClose} aria-label="Close">×</button>
      </header>

      {tile.type === "city" && (
        <table>
          <tbody>
            <tr><td>Rent</td><td>{money(tile.rent[0])}</td></tr>
            {game.settings.doubleRent && <tr><td>With the full set</td><td>{money(tile.rent[0] * 2)}</td></tr>}
            {[1, 2, 3, 4].map((h) => <tr key={h} className={t.houses === h ? "now" : ""}><td>With {h} {h === 1 ? "house" : "houses"}</td><td>{money(tile.rent[h])}</td></tr>)}
            <tr className={t.houses === 5 ? "now" : ""}><td>With a hotel</td><td>{money(tile.rent[5])}</td></tr>
            <tr><td>House cost</td><td>{money(group.house)}</td></tr>
          </tbody>
        </table>
      )}
      {tile.type === "airport" && (
        <table>
          <tbody>{AIRPORT_RENT.map((r, k) => <tr key={k}><td>Owner has {k + 1} {k ? "airports" : "airport"}</td><td>{money(r)}</td></tr>)}</tbody>
        </table>
      )}
      {tile.type === "company" && (
        <p className="muted">Rent is {COMPANY_MULTIPLIER[0]}× the dice roll, or {COMPANY_MULTIPLIER[1]}× if the owner has both companies.</p>
      )}
      {tile.type === "tax" && <p className="muted">Pay {money(tile.amount)} to the bank.</p>}
      {(tile.type === "surprise" || tile.type === "treasure") && <p className="muted">Draw a card. It could help or hurt.</p>}
      {tile.type === "gotojail" && <p className="muted">Go straight to jail. Don&apos;t collect {money(200)} for passing Start.</p>}
      {tile.type === "jail" && <p className="muted">Just visiting, unless you were sent here. Roll doubles or pay {money(JAIL_FINE)} to get out.</p>}
      {tile.type === "start" && (
        <p className="muted">
          Collect {money(game.settings.passStart)} every time you pass
          {game.settings.doubleOnStart ? `, or ${money(game.settings.passStart * 2)} for landing exactly here` : ""}.
        </p>
      )}
      {tile.type === "vacation" && (
        <p className="muted">
          {game.settings.vacationCash ? `Land here to collect the vacation pot, now ${money(game.pot)}.` : "Nothing happens here. Enjoy the break."}
        </p>
      )}

      {isOwnable(tile) && (
        <>
          <p className="owner-line">
            {owner ? <>Owned by <strong style={{ color: owner.color }}>{owner.name}</strong>{t.mortgaged && " (mortgaged)"}</> : <>For sale: {money(tile.price)}</>}
          </p>
          {t.owner === me && (
            <div className="row wrap">
              {canBuild(game, me, index) && <button className="btn" onClick={() => send("build", { tile: index })}>Build {t.houses === 4 ? "hotel" : "house"} ({money(group.house)})</button>}
              {canSell(game, me, index) && <button className="btn btn-ghost" onClick={() => send("sell", { tile: index })}>Sell building (+{money(group.house / 2)})</button>}
              {canMortgage(game, me, index) && <button className="btn btn-ghost" onClick={() => send("mortgage", { tile: index })}>Mortgage (+{money(tile.price / 2)})</button>}
              {t.mortgaged && (
                <button className="btn" disabled={!canUnmortgage(game, me, index)} onClick={() => send("unmortgage", { tile: index })}>
                  Pay off mortgage ({money(unmortgageCost(index))})
                </button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function TradeChips({ side }) {
  if (!side.tiles.length && !side.money) return <span className="muted">Nothing</span>;
  return (
    <span className="trade-chips">
      {side.tiles.map((i) => (
        <span key={i} className="trade-chip" style={{ "--g": BOARD[i].group ? GROUPS[BOARD[i].group].color : "#6b62b8" }}>
          {BOARD[i].name}
        </span>
      ))}
      {side.money > 0 && <span className="trade-chip cash">{money(side.money)}</span>}
    </span>
  );
}

function Trades({ game, me, send, playerById, onCounter }) {
  const incoming = game.trades.filter((t) => t.to === me);
  const outgoing = game.trades.filter((t) => t.from === me);
  return (
    <>
      {incoming.length > 0 && (
        <div className="trade-inbox" role="region" aria-label="Trade offers">
          {incoming.map((t) => {
            const from = playerById[t.from];
            return (
              <div key={t.id} className="card trade-offer" style={{ "--c": from.color }}>
                <header>
                  <Blob color={from.color} className="avatar-blob" />
                  <strong>{from.name} wants to trade</strong>
                </header>
                <div className="trade-offer-body">
                  <div>
                    <small>You get</small>
                    <TradeChips side={t.give} />
                  </div>
                  <div>
                    <small>You give</small>
                    <TradeChips side={t.get} />
                  </div>
                </div>
                <div className="row">
                  <button className="btn" onClick={() => send("acceptTrade", { trade: t.id })}>
                    <Check size={16} /> Accept
                  </button>
                  <button className="btn btn-ghost" onClick={() => onCounter(t)}>
                    <ArrowLeftRight size={16} /> Counter
                  </button>
                  <button className="link danger" onClick={() => send("declineTrade", { trade: t.id })}>Decline</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {outgoing.length > 0 && (
        <section className="card">
          <h2>Your offers</h2>
          <ul className="trades">
            {outgoing.map((t) => (
              <li key={t.id}>
                <p>
                  Waiting for <strong style={{ color: playerById[t.to].color }}>{playerById[t.to].name}</strong>
                </p>
                <div className="trade-offer-body">
                  <div>
                    <small>You give</small>
                    <TradeChips side={t.give} />
                  </div>
                  <div>
                    <small>You get</small>
                    <TradeChips side={t.get} />
                  </div>
                </div>
                <button className="link" onClick={() => send("declineTrade", { trade: t.id })}>Withdraw</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

const EMPTY_SIDE = { tiles: [], money: 0 };

// One side of a trade: pick properties as cards, set cash with a slider.
function TradeSide({ game, title, player, side, setSide }) {
  const tiles = BOARD.flatMap((_, i) => (canTradeTile(game, player.id, i) ? [i] : []));
  const value = side.tiles.reduce((sum, i) => sum + BOARD[i].price, 0) + side.money;
  const toggle = (i) => setSide({ ...side, tiles: side.tiles.includes(i) ? side.tiles.filter((x) => x !== i) : [...side.tiles, i] });
  const maxCash = Math.max(0, player.money);

  return (
    <section className="trade-side" style={{ "--c": player.color }}>
      <header>
        <Blob color={player.color} className="avatar-blob" />
        <div>
          <strong>{title}</strong>
          <small>Has {money(player.money)}</small>
        </div>
      </header>
      <div className="pick-grid">
        {tiles.map((i) => {
          const on = side.tiles.includes(i);
          return (
            <button key={i} type="button" className={`pick ${on ? "on" : ""}`} aria-pressed={on} style={{ "--g": BOARD[i].group ? GROUPS[BOARD[i].group].color : "#6b62b8" }} onClick={() => toggle(i)}>
              <span className="pick-name">{BOARD[i].name}</span>
              <small>
                {money(BOARD[i].price)}
                {game.tiles[i].mortgaged && " · mortgaged"}
              </small>
              {on && <Check className="pick-check" size={14} strokeWidth={3} />}
            </button>
          );
        })}
        {!tiles.length && <p className="muted">No properties to trade.</p>}
      </div>
      <label className="cash">
        <span>Cash</span>
        <input type="range" min="0" max={maxCash} step="10" value={Math.min(side.money, maxCash)} disabled={!maxCash} onChange={(e) => setSide({ ...side, money: Number(e.target.value) })} />
        <input type="number" min="0" max={maxCash} step="10" value={side.money} onChange={(e) => setSide({ ...side, money: Math.max(0, Math.min(maxCash, Number(e.target.value) || 0)) })} aria-label={`${title} cash`} />
      </label>
      <p className="trade-value">Value {money(value)}</p>
    </section>
  );
}

function TradeDialog({ game, me, send, initial, onClose }) {
  const others = game.players.filter((p) => p.id !== me && !p.bankrupt);
  const [to, setTo] = useState(initial.to ?? others[0]?.id);
  const [give, setGive] = useState(initial.give ?? EMPTY_SIDE);
  const [get, setGet] = useState(initial.get ?? EMPTY_SIDE);
  const mine = game.players.find((p) => p.id === me);
  const them = game.players.find((p) => p.id === to);
  const empty = !give.tiles.length && !get.tiles.length && !give.money && !get.money;

  async function submit(e) {
    e.preventDefault();
    if (await send("proposeTrade", { to, give, get, counterOf: initial.counterOf })) onClose();
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="card dialog trade-dialog" onSubmit={submit}>
        <header className="dialog-head">
          <h2>{initial.counterOf ? `Counter ${them?.name}'s offer` : "Propose a trade"}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </header>
        {!them ? (
          <p className="muted">There&apos;s nobody left to trade with.</p>
        ) : (
          <>
            {!initial.counterOf && (
              <div className="partner-picker" role="radiogroup" aria-label="Trade with">
                {others.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={p.id === to}
                    className="partner"
                    style={{ "--c": p.color }}
                    onClick={() => {
                      setTo(p.id);
                      setGet(EMPTY_SIDE);
                    }}
                  >
                    <Blob color={p.color} className="avatar-blob" />
                    {p.name}
                  </button>
                ))}
              </div>
            )}
            <div className="trade-cols">
              <TradeSide game={game} title="You give" player={mine} side={give} setSide={setGive} />
              <span className="trade-swap" aria-hidden>
                <ArrowLeftRight size={18} />
              </span>
              <TradeSide game={game} title={`${them.name} gives`} player={them} side={get} setSide={setGet} />
            </div>
            <footer className="row">
              <button className="btn btn-big" disabled={empty}>
                {initial.counterOf ? "Send counter-offer" : "Send offer"}
              </button>
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            </footer>
          </>
        )}
      </form>
    </div>
  );
}

function Chat({ game, me, send }) {
  const [text, setText] = useState("");
  const listRef = useRef(null);
  const joined = game.players.some((p) => p.id === me);

  useEffect(() => {
    listRef.current?.scrollTo(0, listRef.current.scrollHeight);
  }, [game.chat.length]);

  return (
    <section className="card chat">
      <h2>Chat</h2>
      <ul ref={listRef}>
        {game.chat.map((m, i) => (
          <li key={i}><strong style={{ color: m.color }}>{m.name}</strong> {m.text}</li>
        ))}
        {!game.chat.length && <li className="muted">Say hi, or talk some trash.</li>}
      </ul>
      {joined && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) send("chat", { text }).then(() => setText(""));
          }}
        >
          <input className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" maxLength={300} aria-label="Chat message" />
        </form>
      )}
    </section>
  );
}
