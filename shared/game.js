// Game rules. Pure state + actions: the server runs act() and broadcasts the state;
// the client only uses the can*() helpers to decide which buttons to show.
import {
  AIRPORT_RENT, BOARD, COLORS, COMPANY_MULTIPLIER, GROUPS, JAIL, JAIL_FINE, MAX_PLAYERS, PASS_START, START_MONEY, groupTiles, isOwnable,
} from "./board.js";

const SURPRISE = [
  ["Advance to Start.", (s, p) => moveTo(s, p, 0)],
  ["Take a flight to New York.", (s, p) => moveTo(s, p, 39)],
  ["Advance to Rome.", (s, p) => moveTo(s, p, 14)],
  ["Fly to Charles de Gaulle.", (s, p) => moveTo(s, p, 25)],
  ["Go back 3 squares.", (s, p) => { p.pos = (p.pos + 37) % 40; land(s, p); }],
  ["Go to jail.", (s, p) => sendToJail(s, p)],
  ["Get out of jail free. Keep this card.", (s, p) => { p.jailCards++; }],
  ["Speeding fine. Pay 15.", (s, p) => charge(s, p, 15, null)],
  ["Your investment paid off. Collect 150.", (s, p) => { p.money += 150; }],
  ["You won a design award. Collect 100.", (s, p) => { p.money += 100; }],
  ["Pay each player 50 in tour guide fees.", (s, p) => alive(s).forEach((o) => o !== p && charge(s, p, 50, o.id))],
  ["Property repairs. Pay 25 per house and 100 per hotel.", (s, p) => repairs(s, p, 25, 100)],
];

const TREASURE = [
  ["Bank error in your favour. Collect 200.", (s, p) => { p.money += 200; }],
  ["Doctor's fees. Pay 50.", (s, p) => charge(s, p, 50, null)],
  ["It's your birthday. Collect 10 from every player.", (s, p) => alive(s).forEach((o) => o !== p && charge(s, o, 10, p.id))],
  ["Get out of jail free. Keep this card.", (s, p) => { p.jailCards++; }],
  ["Go to jail.", (s, p) => sendToJail(s, p)],
  ["Holiday fund matures. Collect 100.", (s, p) => { p.money += 100; }],
  ["Hospital bill. Pay 100.", (s, p) => charge(s, p, 100, null)],
  ["Tax refund. Collect 20.", (s, p) => { p.money += 20; }],
  ["Advance to Start.", (s, p) => moveTo(s, p, 0)],
  ["You inherit 100.", (s, p) => { p.money += 100; }],
  ["School fees. Pay 50.", (s, p) => charge(s, p, 50, null)],
  ["Street repairs. Pay 40 per house and 115 per hotel.", (s, p) => repairs(s, p, 40, 115)],
];

// Host-editable room rules. Each entry: default value and how to clean what the client sent.
const clampInt = (min, max) => (v) => Math.min(max, Math.max(min, Math.round(Number(v)) || min));
export const SETTINGS = {
  startMoney: { value: START_MONEY, clean: clampInt(500, 5000) },
  maxPlayers: { value: MAX_PLAYERS, clean: clampInt(2, MAX_PLAYERS) },
  passStart: { value: PASS_START, clean: clampInt(0, 1000) },
  doubleOnStart: { value: false, clean: Boolean },
  doubleRent: { value: true, clean: Boolean },
  vacationCash: { value: false, clean: Boolean },
  noRentInJail: { value: false, clean: Boolean },
  evenBuild: { value: true, clean: Boolean },
  auctions: { value: true, clean: Boolean },
};

export const AUCTION_MS = 10_000;
const AUCTION_BUMP_MS = 8_000; // every bid gives the others at least this long to answer

export function createGame(id) {
  return {
    id,
    status: "lobby", // lobby | playing | over
    hostId: null,
    players: [],
    tiles: Object.fromEntries(BOARD.flatMap((t, i) => (isOwnable(t) ? [[i, { owner: null, houses: 0, mortgaged: false }]] : []))),
    turn: 0,
    phase: "roll", // roll | buy | end
    dice: [1, 1],
    rolls: 0, // bumps every roll so clients can animate even when the dice repeat
    doubles: 0,
    rolledDouble: false,
    card: null,
    trades: [],
    log: [],
    chat: [],
    winner: null,
    nextTradeId: 1,
    settings: Object.fromEntries(Object.entries(SETTINGS).map(([k, v]) => [k, v.value])),
    pot: 0, // Vacation cash: taxes and fines collect here
    auction: null, // { tile, high, leader, endsAt } while a declined property is up for bids

  };
}

// ---------- helpers ----------

const fail = (msg) => { throw new Error(msg); };
const player = (s, id) => s.players.find((p) => p.id === id);
const alive = (s) => s.players.filter((p) => !p.bankrupt);
const log = (s, text) => { s.log.push(text); if (s.log.length > 200) s.log.shift(); };
export const current = (s) => s.players[s.turn];
const nameOf = (s, id) => (id ? player(s, id)?.name : "the bank");

export function ownsGroup(s, pid, group) {
  return groupTiles(group).every((i) => s.tiles[i].owner === pid);
}

const groupHasHouses = (s, i) => BOARD[i].type === "city" && groupTiles(BOARD[i].group).some((j) => s.tiles[j].houses > 0);

export function rentFor(s, i, diceTotal) {
  const tile = BOARD[i];
  const { owner, houses } = s.tiles[i];
  const owned = (type) => BOARD.filter((t, j) => t.type === type && s.tiles[j].owner === owner).length;
  if (tile.type === "airport") return AIRPORT_RENT[owned("airport") - 1];
  if (tile.type === "company") return COMPANY_MULTIPLIER[owned("company") - 1] * diceTotal;
  if (houses) return tile.rent[houses];
  return tile.rent[0] * (s.settings.doubleRent && ownsGroup(s, owner, tile.group) ? 2 : 1);
}

export const unmortgageCost = (i) => Math.ceil((BOARD[i].price / 2) * 1.1);

// Money can go negative: the player then has to sell/mortgage or go bankrupt before playing on.
function charge(s, p, amount, toId) {
  p.money -= amount;
  if (toId) player(s, toId).money += amount;
  else if (s.settings.vacationCash) s.pot += amount;
  if (p.money < 0) p.debtTo = toId;
  log(s, `${p.name} paid ${amount} to ${nameOf(s, toId)}`);
}

function repairs(s, p, perHouse, perHotel) {
  const cost = Object.values(s.tiles)
    .filter((t) => t.owner === p.id)
    .reduce((sum, t) => sum + (t.houses === 5 ? perHotel : t.houses * perHouse), 0);
  if (cost) charge(s, p, cost, null);
}

function sendToJail(s, p) {
  p.pos = JAIL;
  p.inJail = true;
  p.jailTurns = 0;
  s.rolledDouble = false;
  log(s, `${p.name} went to jail`);
}

function moveTo(s, p, target) {
  if (target < p.pos) {
    p.money += s.settings.passStart;
    log(s, `${p.name} passed Start and collected ${s.settings.passStart}`);
  }
  p.pos = target;
  land(s, p);
}

function move(s, p, steps) {
  const target = (p.pos + steps) % 40;
  if (target === 0) {
    p.pos = 0;
    const salary = s.settings.passStart * (s.settings.doubleOnStart ? 2 : 1);
    p.money += salary;
    log(s, `${p.name} landed on Start and collected ${salary}`);
    return;
  }
  moveTo(s, p, target);
}

function land(s, p) {
  const i = p.pos;
  const tile = BOARD[i];
  if (isOwnable(tile)) {
    const t = s.tiles[i];
    if (!t.owner) s.phase = "buy";
    else if (t.owner !== p.id && !t.mortgaged) {
      if (s.settings.noRentInJail && player(s, t.owner).inJail) log(s, `${player(s, t.owner).name} is in jail, so no rent`);
      else charge(s, p, rentFor(s, i, s.dice[0] + s.dice[1]), t.owner);
    }
  } else if (tile.type === "tax") charge(s, p, tile.amount, null);
  else if (tile.type === "gotojail") sendToJail(s, p);
  else if (tile.type === "vacation" && s.pot) {
    p.money += s.pot;
    log(s, `${p.name} collected ${s.pot} of vacation cash`);
    s.pot = 0;
  }
  else if (tile.type === "surprise" || tile.type === "treasure") {
    const deck = tile.type === "surprise" ? SURPRISE : TREASURE;
    const [text, effect] = deck[Math.floor(s.rng() * deck.length)];
    s.card = { deck: tile.name, text, player: p.id };
    log(s, `${p.name} drew ${tile.name}: ${text}`);
    effect(s, p);
  }
}

// After a landing is resolved: roll again on doubles, otherwise wait for End turn.
function settle(s) {
  if (s.phase === "buy") return;
  s.phase = s.rolledDouble && !current(s).inJail ? "roll" : "end";
}

function nextTurn(s) {
  if (s.status !== "playing") return;
  do s.turn = (s.turn + 1) % s.players.length;
  while (current(s).bankrupt);
  s.phase = "roll";
  s.doubles = 0;
  s.rolledDouble = false;
  s.card = null;
}

function goBankrupt(s, p) {
  const heir = p.debtTo && p.money < 0 ? player(s, p.debtTo) : null;
  for (const t of Object.values(s.tiles)) {
    if (t.owner !== p.id) continue;
    t.houses = 0;
    if (heir && !heir.bankrupt) t.owner = heir.id;
    else Object.assign(t, { owner: null, mortgaged: false });
  }
  if (heir) heir.jailCards += p.jailCards;
  const wasTurn = current(s) === p;
  if (wasTurn) s.auction = null;
  Object.assign(p, { bankrupt: true, money: 0, jailCards: 0 });
  s.trades = s.trades.filter((tr) => tr.from !== p.id && tr.to !== p.id);
  log(s, `${p.name} went bankrupt`);

  const left = alive(s);
  if (left.length === 1) {
    s.status = "over";
    s.winner = left[0].id;
    log(s, `${left[0].name} wins!`);
  } else if (wasTurn) nextTurn(s);
}

export function finishAuction(s) {
  const a = s.auction;
  if (!a) return;
  s.auction = null;
  const winner = a.leader && player(s, a.leader);
  // Money can change mid-auction (trades, mortgages), so check again before paying.
  if (winner && !winner.bankrupt && winner.money >= a.high && !s.tiles[a.tile].owner) {
    winner.money -= a.high;
    s.tiles[a.tile].owner = winner.id;
    log(s, `${winner.name} won ${BOARD[a.tile].name} at auction for ${a.high}`);
  } else log(s, `Nobody bought ${BOARD[a.tile].name}`);
  if (s.status === "playing" && s.phase === "auction") {
    s.phase = "roll";
    settle(s);
  }
}

// ---------- checks the client also uses ----------

export function canBuild(s, pid, i) {
  const tile = BOARD[i];
  const t = s.tiles[i];
  if (tile?.type !== "city" || t.owner !== pid || t.houses >= 5) return false;
  if (!ownsGroup(s, pid, tile.group)) return false;
  const group = groupTiles(tile.group).map((j) => s.tiles[j]);
  if (group.some((g) => g.mortgaged)) return false;
  const even = !s.settings.evenBuild || t.houses === Math.min(...group.map((g) => g.houses));
  return even && player(s, pid).money >= GROUPS[tile.group].house;
}

export function canSell(s, pid, i) {
  const tile = BOARD[i];
  const t = s.tiles[i];
  if (tile?.type !== "city" || t.owner !== pid || !t.houses) return false;
  return !s.settings.evenBuild || t.houses === Math.max(...groupTiles(tile.group).map((j) => s.tiles[j].houses));
}

export const canMortgage = (s, pid, i) => s.tiles[i]?.owner === pid && !s.tiles[i].mortgaged && !groupHasHouses(s, i);
export const canUnmortgage = (s, pid, i) => s.tiles[i]?.owner === pid && s.tiles[i].mortgaged && player(s, pid).money >= unmortgageCost(i);
export const canTradeTile = (s, pid, i) => s.tiles[i]?.owner === pid && !groupHasHouses(s, i);

// ---------- actions ----------

const ACTIONS = {
  join(s, id, { name, color }) {
    if (s.status !== "lobby") fail("The game has already started");
    if (s.players.length >= s.settings.maxPlayers) fail("The room is full");
    name = String(name ?? "").trim().slice(0, 16);
    if (!name) fail("Enter a name");
    if (!COLORS.includes(color) || s.players.some((p) => p.color === color)) color = COLORS.find((c) => !s.players.some((p) => p.color === c));
    s.players.push({ id, name, color, pos: 0, money: s.settings.startMoney, inJail: false, jailTurns: 0, jailCards: 0, bankrupt: false, online: true, debtTo: null });
    s.hostId ??= id;
  },

  settings(s, id, changes) {
    if (id !== s.hostId) fail("Only the host can change settings");
    if (s.status !== "lobby") fail("Settings are locked once the game starts");
    for (const [key, value] of Object.entries(changes ?? {})) {
      if (Object.hasOwn(SETTINGS, key)) s.settings[key] = SETTINGS[key].clean(value);
    }
    if (s.players.length > s.settings.maxPlayers) s.settings.maxPlayers = s.players.length;
  },

  leaveLobby(s, id) {
    if (s.status !== "lobby") fail("The game has started");
    s.players = s.players.filter((p) => p.id !== id);
    if (s.hostId === id) s.hostId = s.players[0]?.id ?? null;
  },

  color(s, id, { color }) {
    if (s.status !== "lobby") fail("The game has started");
    if (!COLORS.includes(color) || s.players.some((p) => p.color === color)) fail("That colour is taken");
    player(s, id).color = color;
  },

  start(s, id) {
    if (id !== s.hostId) fail("Only the host can start");
    if (s.status !== "lobby") fail("Already started");
    if (s.players.length < 2) fail("Need at least 2 players");
    s.status = "playing";
    s.players.forEach((p) => { p.money = s.settings.startMoney; });
    s.turn = Math.floor(s.rng() * s.players.length);
    log(s, `Game started. ${current(s).name} goes first`);
  },

  roll(s, id) {
    const p = mustBeTurn(s, id);
    if (s.phase !== "roll") fail("You can't roll now");
    if (p.money < 0) fail("Pay off your debt first");
    const d = [1 + Math.floor(s.rng() * 6), 1 + Math.floor(s.rng() * 6)];
    const isDouble = d[0] === d[1];
    s.dice = d;
    s.rolls++;
    s.card = null;
    log(s, `${p.name} rolled ${d[0]} + ${d[1]}`);

    if (p.inJail) {
      if (isDouble) {
        p.inJail = false;
        log(s, `${p.name} rolled doubles and left jail`);
      } else if (++p.jailTurns >= 3) {
        charge(s, p, JAIL_FINE, null);
        p.inJail = false;
      } else {
        s.phase = "end";
        return;
      }
      s.rolledDouble = false;
    } else if (isDouble && ++s.doubles === 3) {
      sendToJail(s, p);
      s.phase = "end";
      return;
    } else s.rolledDouble = isDouble;

    s.phase = "moving";
    move(s, p, d[0] + d[1]);
    if (s.phase === "moving") s.phase = "roll";
    settle(s);
  },

  buy(s, id) {
    const p = mustBeTurn(s, id);
    if (s.phase !== "buy") fail("Nothing to buy");
    const tile = BOARD[p.pos];
    if (p.money < tile.price) fail("Not enough money");
    p.money -= tile.price;
    s.tiles[p.pos].owner = p.id;
    log(s, `${p.name} bought ${tile.name} for ${tile.price}`);
    s.phase = "roll";
    settle(s);
  },

  skipBuy(s, id) {
    const p = mustBeTurn(s, id);
    if (s.phase !== "buy") fail("Nothing to skip");
    if (s.settings.auctions && alive(s).length > 1) {
      s.auction = { tile: p.pos, high: 0, leader: null, endsAt: s.now + AUCTION_MS };
      s.phase = "auction";
      log(s, `${BOARD[p.pos].name} is up for auction`);
      return;
    }
    s.phase = "roll";
    settle(s);
  },

  bid(s, id, { amount }) {
    const p = mustPlay(s, id);
    const a = s.auction;
    if (!a) fail("There's no auction running");
    amount = Math.floor(Number(amount));
    if (!(amount > a.high)) fail(`Bid more than ${a.high}`);
    if (amount > p.money) fail("You can't afford that bid");
    a.high = amount;
    a.leader = id;
    a.endsAt = Math.max(a.endsAt, s.now + AUCTION_BUMP_MS);
  },

  endTurn(s, id) {
    const p = mustBeTurn(s, id);
    if (s.phase !== "end") fail("Finish your move first");
    if (p.money < 0) fail("Pay off your debt first");
    nextTurn(s);
  },

  payJail(s, id) {
    const p = mustBeTurn(s, id);
    if (!p.inJail || s.phase !== "roll") fail("You can't do that now");
    if (p.money < JAIL_FINE) fail("Not enough money");
    charge(s, p, JAIL_FINE, null);
    p.inJail = false;
  },

  jailCard(s, id) {
    const p = mustBeTurn(s, id);
    if (!p.inJail || !p.jailCards || s.phase !== "roll") fail("You can't do that now");
    p.jailCards--;
    p.inJail = false;
    log(s, `${p.name} used a get out of jail free card`);
  },

  build(s, id, { tile }) {
    mustPlay(s, id);
    if (!canBuild(s, id, tile)) fail("You can't build there");
    const cost = GROUPS[BOARD[tile].group].house;
    player(s, id).money -= cost;
    const houses = ++s.tiles[tile].houses;
    log(s, `${player(s, id).name} built ${houses === 5 ? "a hotel" : "a house"} in ${BOARD[tile].name}`);
  },

  sell(s, id, { tile }) {
    mustPlay(s, id);
    if (!canSell(s, id, tile)) fail("Sell evenly across the group");
    s.tiles[tile].houses--;
    player(s, id).money += GROUPS[BOARD[tile].group].house / 2;
    log(s, `${player(s, id).name} sold a building in ${BOARD[tile].name}`);
  },

  mortgage(s, id, { tile }) {
    mustPlay(s, id);
    if (!canMortgage(s, id, tile)) fail("Sell the buildings in this group first");
    s.tiles[tile].mortgaged = true;
    player(s, id).money += BOARD[tile].price / 2;
    log(s, `${player(s, id).name} mortgaged ${BOARD[tile].name}`);
  },

  unmortgage(s, id, { tile }) {
    mustPlay(s, id);
    if (!canUnmortgage(s, id, tile)) fail("Not enough money");
    s.tiles[tile].mortgaged = false;
    player(s, id).money -= unmortgageCost(tile);
    log(s, `${player(s, id).name} paid off the mortgage on ${BOARD[tile].name}`);
  },

  proposeTrade(s, id, { to, give, get, counterOf }) {
    mustPlay(s, id);
    const other = player(s, to);
    if (!other || other.bankrupt || to === id) fail("Pick another player");
    const clean = (side) => ({ money: Math.max(0, Math.floor(Number(side?.money) || 0)), tiles: [...new Set(side?.tiles ?? [])].map(Number) });
    const trade = { id: s.nextTradeId++, from: id, to, give: clean(give), get: clean(get) };
    if (!trade.give.tiles.length && !trade.get.tiles.length && !trade.give.money && !trade.get.money) fail("The trade is empty");
    checkTrade(s, trade);
    // A counter-offer replaces the offer it answers.
    const answered = counterOf && s.trades.find((t) => t.id === counterOf && t.to === id);
    if (answered) s.trades = s.trades.filter((t) => t !== answered);
    s.trades.push(trade);
    log(s, answered ? `${player(s, id).name} sent ${other.name} a counter-offer` : `${player(s, id).name} offered ${other.name} a trade`);
  },

  acceptTrade(s, id, { trade: tradeId }) {
    mustPlay(s, id);
    const trade = s.trades.find((t) => t.id === tradeId && t.to === id);
    if (!trade) fail("That trade is gone");
    checkTrade(s, trade);
    const from = player(s, trade.from);
    const to = player(s, trade.to);
    from.money += trade.get.money - trade.give.money;
    to.money += trade.give.money - trade.get.money;
    trade.give.tiles.forEach((i) => { s.tiles[i].owner = to.id; });
    trade.get.tiles.forEach((i) => { s.tiles[i].owner = from.id; });
    // Trades touching these tiles are now stale.
    const moved = new Set([...trade.give.tiles, ...trade.get.tiles]);
    s.trades = s.trades.filter((t) => t !== trade && ![...t.give.tiles, ...t.get.tiles].some((i) => moved.has(i)));
    log(s, `${to.name} accepted a trade with ${from.name}`);
  },

  declineTrade(s, id, { trade: tradeId }) {
    const trade = s.trades.find((t) => t.id === tradeId && (t.to === id || t.from === id));
    if (!trade) fail("That trade is gone");
    s.trades = s.trades.filter((t) => t !== trade);
    log(s, `${player(s, id).name} ${trade.from === id ? "withdrew" : "declined"} a trade`);
  },

  bankrupt(s, id) {
    mustPlay(s, id);
    goBankrupt(s, player(s, id));
  },

  // Host can remove a player who dropped out, so the game doesn't stall on their turn.
  kick(s, id, { player: target }) {
    if (id !== s.hostId) fail("Only the host can remove players");
    const p = player(s, target);
    if (!p || p.online || p.bankrupt) fail("You can only remove players who are offline");
    if (s.status === "playing") {
      p.debtTo = null;
      goBankrupt(s, p);
    } else s.players = s.players.filter((x) => x !== p);
  },

  chat(s, id, { text }) {
    const p = player(s, id);
    text = String(text ?? "").trim().slice(0, 300);
    if (!p || !text) return;
    s.chat.push({ name: p.name, color: p.color, text });
    if (s.chat.length > 100) s.chat.shift();
  },
};

function mustPlay(s, id) {
  const p = player(s, id);
  if (s.status !== "playing" || !p || p.bankrupt) fail("You're not in this game");
  return p;
}

function mustBeTurn(s, id) {
  const p = mustPlay(s, id);
  if (current(s) !== p) fail("It's not your turn");
  return p;
}

function checkTrade(s, trade) {
  const from = player(s, trade.from);
  const to = player(s, trade.to);
  if (from.bankrupt || to.bankrupt) fail("That player is out");
  if (!trade.give.tiles.every((i) => canTradeTile(s, from.id, i)) || !trade.get.tiles.every((i) => canTradeTile(s, to.id, i)))
    fail("Some of those properties can't be traded (not owned, or the group has buildings)");
  if (from.money < trade.give.money || to.money < trade.get.money) fail("Not enough money for that trade");
}

// Runs an action. Throws Error with a user-facing message if it isn't allowed.
export function act(s, playerId, type, payload = {}, rng = Math.random, now = Date.now()) {
  if (!Object.hasOwn(ACTIONS, type)) fail("Unknown action");
  const handler = ACTIONS[type];
  s.rng = rng;
  s.now = now;
  try {
    handler(s, playerId, payload);
  } finally {
    delete s.rng;
    delete s.now;
  }
}
