# DHURANDHAR UNO

**Play a chaotic card game with 2–10 players, including practice bots, online or entirely offline using a phone hotspot.**

**Project name:** Dhurandhar UNO. **Tagline:** Friends. Cards. Chaos.

This is an independent, unofficial prototype inspired by the mechanics of the UNO Show 'Em No Mercy card game. All graphics, UI, and source code in this project are original. It does not use Mattel card artwork or the official UNO logo. **UNO and UNO Show 'Em No Mercy are trademarks of Mattel, and including “UNO” in an independently published game's title may create trademark concerns.** This project is not affiliated with or endorsed by Mattel. If you plan to distribute or monetize it publicly, consider choosing a trademark-distinct public name or getting qualified legal guidance.

## What's playable now

- Real-time private rooms for 2–10 players. Humans and bots count toward the same 10-player limit.
- Host-managed practice bots: add or remove bots in the lobby or between completed rounds, then play alone against bots or mix bots with friends. Bots run on the local server and need no Internet, accounts, or extra packages.
- Six-character room codes and one-tap invite links; the link includes the server's address and room code.
- 168-card deck, including color cards, numerical cards, draw penalties, hand swap (7), hand pass (0), skip, reverse, discard all, skip everyone, wild reverse +4, wild +6, wild +10, and wild color roulette.
- Penalty stacking: only equal or higher draw penalties can be stacked. Additive chains (+2 -> +6 = +8, and so on).
- Draw until playable, 25-card knockout, playable-card highlighting, UNO calls and +2 catches.
- Fully server-controlled game rules; other players can see hand sizes, but **not** your actual cards.
- Rematches, live event feed, quick emoji reactions, reconnecting after a page reload, sound toggle, and mobile layout.
- **No external JavaScript packages, CDN, database or Internet needed to run a local game.**

## Quick start on a computer

Install Node.js 18 or newer once. Extract this ZIP and open a terminal in the `dhurandhar-uno` folder:

```bash
node server.js
```

Open `http://localhost:3000` on the server computer. Create a room and share the displayed invite link. Friends must be connected to the **same Wi-Fi or hotspot** and use the **server computer's LAN IP**, for example `http://192.168.1.10:3000/?room=ABC123`. The exact IP and room code will be different. The terminal usually lists the available IP addresses.

To stop the server, press `Ctrl+C`. Run the test suite with:

```bash
npm test
```

No `npm install` is needed.

If another app already uses port 3000, choose a different port. For example, in Windows PowerShell:

```powershell
$env:PORT = '3001'
node server.js
```

Then open `http://localhost:3001`. Invite links use the selected port automatically.

## Test with bots

1. Create a room in your browser.
2. Press **Add bot** to add a computer player. You can fill the room with up to nine bots when playing alone, or mix humans and bots up to ten players total.
3. Press **Start the game** once the room has at least two players. Bots take their own turns and handle special card choices automatically.
4. After a round finishes, the host can use **Add bot** or a bot's **Remove** button before pressing **Play another round**. Bot changes are disabled during an active round.

Bots are simple automated opponents for testing and practice, rather than configurable difficulty levels. They use the same rules engine as human players, including draw penalties, hand swaps, roulette, and UNO calls. The automated test suite also checks bot management and the ten-player room limit.

## Offline mode: Android host phone hotspot

**Important:** a mobile hotspot alone does not host a browser game. The host phone must run the included local Node.js server. One-time installation of Node.js/Termux requires Internet; gameplay itself does not.

1. On the host Android phone, install **Termux** from its official F-Droid or Termux GitHub release, while you still have Internet access.
2. Open Termux and run:

   ```bash
   pkg update
   pkg install nodejs unzip
   termux-setup-storage
   ```

3. Download/extract `dhurandhar-uno.zip` into the host phone's **Downloads** folder (or transfer it there from a computer). Assuming the ZIP is in Downloads, run:

   ```bash
   cd ~/storage/downloads
   unzip dhurandhar-uno.zip -d ~
   cd ~/dhurandhar-uno
   node server.js
   ```

4. Turn on the host phone's hotspot. Connect the other phones to it, even when mobile data is off.
5. On the host phone, open **`http://localhost:3000`**. Create a game and note its room code.
6. On each friend's phone, open the **host phone's hotspot LAN address**, which looks something like `http://192.168.43.1:3000`. Then enter the room code, or use a full invite URL such as `http://192.168.43.1:3000/?room=ABC123`.
7. If `localhost` appears in the shared link, enter the host's actual local IP in the lobby's **Host's hotspot / LAN IP** field, then share the updated link. You can find the hotspot gateway IP in the Wi-Fi connection details on a friend's phone. **Do not assume the example IP is your real address.**
8. The host presses **Start game** once at least one friend has joined or a practice bot has been added.

**Android-specific notes:**

- Keep Termux running and turn off battery restrictions for it so the server does not get suspended when the screen turns off.
- The phone hosting the hotspot must remain powered on, and the hotspot must stay enabled for the entire game.
- Some device firmware blocks communication between hotspot clients, or blocks clients from reaching the host phone. If friends cannot open the host's IP:port even though the server is running, test on a shared Wi-Fi network or a computer host.
- A phone cannot reach *another* phone's `localhost`; always use the host's **LAN IP**.
- Android versions, hotspot addresses, and Termux storage paths vary. The printed address is a suggestion, not guaranteed to be the correct hotspot IP.

## Online mode: play across different cities

The *same* Node.js server can be deployed to an always-running Node host, for example Render, Railway, or a VPS. Use the following general settings:

| Setting | Value |
|---|---|
| Runtime | Node.js 18+ |
| Install command | None required |
| Start command | `node server.js` |
| Port | Use host-provided `PORT` environment variable; falls back to 3000 |
| Host | `0.0.0.0` |

The hosting platform should supply a public **HTTPS** URL. Open it, create a room, and share the generated invite link or code. Players connecting from different networks **must** use the same deployed server address; a room code alone cannot connect separate servers.

**This ZIP is source code, not a deployed public website.** It does not contain a live Internet link. Deployment on a public host is a separate step. This prototype keeps room data in server memory, so restarting or sleeping the server ends all active games. A production deployment should add persistent room state, rate limits, logging controls, and additional abuse protection.

## Basic rules and gameplay

Players match the current color, number, or action symbol, or play wild cards. If a player cannot match, they draw until they get a playable card, which must be played. Draw penalties can be stacked by an equal or higher draw card, or accepted in full. A 7 forces a hand swap with a chosen opponent, and a 0 passes everyone's hand in the direction of play. At 25 or more cards, a player is eliminated from that round. A player wins by emptying their hand or being the last player still active. When a player reaches one card, they must call UNO before another player catches them for a two-card penalty.

Special cards include Skip, Reverse, Skip Everyone, Discard All, Wild Reverse Draw Four, Wild Draw Six, Wild Draw Ten, and Wild Color Roulette. In a two-player game, Wild Reverse Draw Four sends the draw penalty back to the player who played it (unless they can stack again).

The game is intentionally not a verbatim reproduction of the published rulebook or artwork. See [Mattel's official rule sheet](https://service.mattel.com/instruction_sheets/HVW18-Eng.pdf) for the commercial game's rules.

## Project structure

```text
dhurandhar-uno/
├── server.js          # HTTP server, room manager, turn logic and SSE events
├── package.json       # Node scripts (no dependencies)
├── public/
│   ├── index.html     # Responsive app shell
│   ├── app.js         # Room flow, actions, modals, card rendering
│   ├── style.css      # Original neon tabletop + card artwork (CSS)
│   └── icon.svg       # Original application mark
└── test/
    └── game.test.js  # Rules engine + multiplayer API checks
```

## Suggested improvements in priority order

**Phase 2 — quality of life:** add a host-configurable 15/25/35 card limit, stacking settings, pause/resume for disconnected players, a turn timer, clearer connection status, and QR-coded local invites. For local hotspot games, a QR code should contain the host IP *and* room code.

**Phase 3 — more social:** a tournament mode with scoreboards and round history, rematch voting, invite-only spectators, custom avatars, and better card animations. Quick emoji reactions already work; optional chat should include moderation/reporting features.

**Phase 4 — full product:** make it installable as a PWA, use a persistent room store (Redis/PostgreSQL), provide HTTPS and stable online deployment, prevent inactive lobbies piling up, and add better network-recovery handling. Add configurable bot difficulty and more advanced strategy.

**Best design choice:** keep one shared rules engine and user interface across LAN and online mode. A phone hotspot is just another local network; it does not need a separate game client. The only difference is where the single server runs and which address friends open.

## Known limitations in version 1

- Rooms only survive as long as their Node server is running. Game state isn't stored on disk.
- It has no hosted public website URL and no built-in QR generator yet.
- On a phone hotspot, the host must install/run Termux; a normal web page opened from Downloads cannot act as a multiplayer server.
- Bots have simple automated strategy and no difficulty settings. There is no matchmaking, account profiles, text chat, or voice chat.
- The UI and rules engine have automated tests, but this prototype has not been tested across physical Android phone models or different hotspot firmwares.
- Room joining is disabled mid-round. Players may join in the lobby or after a completed round.

## Privacy and security

No account or email is required. A random private authentication token is stored in each player's browser storage. Invite links contain only the public **room code**, never the secret player token. Use a **trusted private hotspot** for unencrypted HTTP LAN games. For public Internet hosting, use HTTPS, add stronger rate limiting, request size enforcement, security headers, and persistent session handling.
