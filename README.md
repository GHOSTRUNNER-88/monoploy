# Landgrab

An online multiplayer property-trading board game. Create a room, share the link, and 2 to 6 friends play in the browser with no sign-up.

## Run locally

```sh
npm install
npm run dev      # game server + client with hot reload, http://localhost:3000
npm test         # rules engine tests
```

## Deploy on your own server

```sh
npm install
npm run build              # builds the client into dist/
PORT=3000 npm start        # serves dist/ and the game socket on one port
```

Keep it running with pm2 (`pm2 start "npm start" --name landgrab`) or a systemd service.

Put nginx in front for your domain. The `Upgrade` headers are required, otherwise the live game connection falls back to slow polling:

```nginx
server {
    server_name game.priyanshubegwani.com.np;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Then add HTTPS with `certbot --nginx -d game.priyanshubegwani.com.np`.

## Where things are

- `shared/board.js` — the 40 squares, prices, rents, colours
- `shared/game.js` — all the rules; the server runs them, the client uses the `can*()` checks for buttons
- `server/index.js` — rooms and Socket.IO
- `src/` — React client (`App.jsx` home and lobby, `Game.jsx` board and panels)

Rooms live in memory, so restarting the server ends every game in progress.
