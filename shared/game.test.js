import test from "node:test";
import assert from "node:assert/strict";
import { act, canBuild, createGame, current, finishAuction } from "./game.js";

// rng that makes the next roll exactly [a, b] (dice = 1 + floor(r * 6)).
const dice = (a, b) => { const q = [(a - 1) / 6, (b - 1) / 6]; return () => q.shift() ?? 0; };

function twoPlayers() {
  const s = createGame("t");
  act(s, "a", "join", { name: "Asha" });
  act(s, "b", "join", { name: "Bikash" });
  act(s, "a", "start", {}, () => 0); // Asha goes first
  return s;
}

test("buy, rent, doubles and end turn", () => {
  const s = twoPlayers();
  act(s, "a", "roll", {}, dice(1, 2)); // -> 3 Cairo
  assert.equal(s.phase, "buy");
  act(s, "a", "buy");
  assert.equal(s.tiles[3].owner, "a");
  assert.equal(s.players[0].money, 1440);
  assert.equal(s.phase, "end");
  act(s, "a", "endTurn");

  act(s, "b", "roll", {}, dice(2, 1)); // Bikash -> 3, pays base rent 4
  assert.equal(s.players[1].money, 1496);
  assert.equal(s.players[0].money, 1444);
  act(s, "b", "endTurn");

  act(s, "a", "roll", {}, dice(3, 3)); // doubles -> 9 Kathmandu, rolls again
  act(s, "a", "skipBuy");
  assert.equal(s.phase, "auction");
  finishAuction(s);
  assert.equal(s.phase, "roll");
  assert.throws(() => act(s, "a", "endTurn"), /Finish your move/);
});

test("building needs the full group and goes up evenly", () => {
  const s = twoPlayers();
  s.tiles[1].owner = "a";
  assert.equal(canBuild(s, "a", 1), false);
  s.tiles[3].owner = "a";
  act(s, "a", "build", { tile: 1 });
  assert.throws(() => act(s, "a", "build", { tile: 1 }), /can't build/);
  act(s, "a", "build", { tile: 3 });
  assert.equal(s.tiles[1].houses + s.tiles[3].houses, 2);
  assert.throws(() => act(s, "a", "mortgage", { tile: 1 }), /Sell the buildings/);
});

test("three doubles sends you to jail", () => {
  const s = twoPlayers();
  const rolls = [1 / 6, 1 / 6, 2 / 6, 2 / 6, 3 / 6, 3 / 6]; // 2+2 tax, 3+3 jail (visiting), 4+4
  const rng = () => rolls.shift();
  act(s, "a", "roll", {}, rng);
  if (s.phase === "buy") act(s, "a", "skipBuy");
  act(s, "a", "roll", {}, rng);
  if (s.phase === "buy") act(s, "a", "skipBuy");
  act(s, "a", "roll", {}, rng);
  assert.equal(s.players[0].inJail, true);
  assert.equal(s.players[0].pos, 10);
});

test("debt blocks the turn, bankruptcy hands property to the creditor and ends the game", () => {
  const s = twoPlayers();
  s.tiles[39].owner = "b";
  s.tiles[37].owner = "b";
  s.tiles[39].houses = 5;
  s.tiles[37].houses = 5;
  s.tiles[1].owner = "a";
  s.players[0].pos = 30; // roll 9 -> 39 New York with a hotel: 2000
  act(s, "a", "roll", {}, dice(4, 5));
  assert.ok(s.players[0].money < 0);
  assert.throws(() => act(s, "a", "endTurn"), /debt/);
  act(s, "a", "bankrupt");
  assert.equal(s.tiles[1].owner, "b");
  assert.equal(s.status, "over");
  assert.equal(s.winner, "b");
});

test("trade swaps properties and money", () => {
  const s = twoPlayers();
  s.tiles[1].owner = "a";
  s.tiles[6].owner = "b";
  act(s, "a", "proposeTrade", { to: "b", give: { tiles: [1], money: 50 }, get: { tiles: [6] } });
  assert.throws(() => act(s, "a", "acceptTrade", { trade: 1 }), /gone/);
  act(s, "b", "acceptTrade", { trade: 1 });
  assert.equal(s.tiles[1].owner, "b");
  assert.equal(s.tiles[6].owner, "a");
  assert.equal(s.players[0].money, 1450);
  assert.equal(current(s).id, "a");
});

test("room settings: host only, clamped, applied at start", () => {
  const s = createGame("t");
  act(s, "a", "join", { name: "Asha" });
  act(s, "b", "join", { name: "Bikash" });
  assert.throws(() => act(s, "b", "settings", { startMoney: 3000 }), /Only the host/);
  act(s, "a", "settings", { startMoney: 99999, maxPlayers: 1, vacationCash: 1, doubleRent: false, bogus: 5 });
  assert.equal(s.settings.startMoney, 5000);
  assert.equal(s.settings.maxPlayers, 2); // never below the players already in the room
  assert.equal(s.settings.vacationCash, true);
  assert.equal("bogus" in s.settings, false);
  act(s, "a", "start", {}, () => 0);
  assert.equal(s.players[1].money, 5000);
  assert.throws(() => act(s, "a", "settings", { startMoney: 1000 }), /locked/);

  // Tax goes to the pot; landing on Vacation collects it. No doubled rent with doubleRent off.
  act(s, "a", "roll", {}, dice(1, 3)); // 4: income tax 200
  assert.equal(s.pot, 200);
  s.tiles[1].owner = "b";
  s.tiles[3].owner = "b";
  s.players[0].pos = 18;
  act(s, "a", "endTurn");
  s.players[1].pos = 18;
  act(s, "b", "roll", {}, dice(1, 1)); // 20: Vacation
  assert.equal(s.pot, 0);
  assert.equal(s.players[1].money, 5200);
});

test("declining a property starts an auction; highest bidder wins", () => {
  const s = twoPlayers();
  act(s, "a", "roll", {}, dice(1, 2), 0); // Cairo
  act(s, "a", "skipBuy", {}, undefined, 0);
  assert.equal(s.phase, "auction");
  assert.throws(() => act(s, "a", "endTurn"), /Finish your move/);
  act(s, "b", "bid", { amount: 10 }, undefined, 9_000);
  assert.equal(s.auction.endsAt, 17_000); // a late bid extends the timer
  assert.throws(() => act(s, "a", "bid", { amount: 10 }), /more than 10/);
  assert.throws(() => act(s, "a", "bid", { amount: 99_999 }), /afford/);
  act(s, "a", "bid", { amount: 40 });
  act(s, "b", "bid", { amount: 45 });
  finishAuction(s);
  assert.equal(s.tiles[3].owner, "b");
  assert.equal(s.players[1].money, 1455);
  assert.equal(s.phase, "end");
});

test("auction with no bids leaves the property unsold; setting can turn auctions off", () => {
  const s = twoPlayers();
  act(s, "a", "roll", {}, dice(1, 2));
  act(s, "a", "skipBuy");
  finishAuction(s);
  assert.equal(s.tiles[3].owner, null);
  assert.equal(s.phase, "end");

  const off = createGame("t");
  act(off, "a", "join", { name: "Asha" });
  act(off, "b", "join", { name: "Bikash" });
  act(off, "a", "settings", { auctions: false });
  act(off, "a", "start", {}, () => 0);
  act(off, "a", "roll", {}, dice(1, 2));
  act(off, "a", "skipBuy");
  assert.equal(off.auction, null);
  assert.equal(off.phase, "end");
});

test("counter-offer replaces the offer it answers", () => {
  const s = twoPlayers();
  s.tiles[1].owner = "a";
  s.tiles[6].owner = "b";
  act(s, "a", "proposeTrade", { to: "b", give: { tiles: [1] }, get: { tiles: [6] } });
  act(s, "b", "proposeTrade", { to: "a", give: { tiles: [6] }, get: { tiles: [1], money: 50 }, counterOf: 1 });
  assert.equal(s.trades.length, 1);
  assert.equal(s.trades[0].from, "b");
  act(s, "a", "acceptTrade", { trade: s.trades[0].id });
  assert.equal(s.tiles[6].owner, "a");
  assert.equal(s.players[0].money, 1450);
});
