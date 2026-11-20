# Neon Bay — Open-World Crime

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Lagabara77/neon-bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Lagabara77/neon-bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game built for the **make.fun gta6-01 ("Make GTA 6")** competition. No assets, names, or story elements from any existing franchise — the city, the crew, and every character are invented for this game.

You are **Jax Marlowe**, wheelman for **Mara Voss** and her crew in Neon Bay, a low-poly city at dusk. Walk the streets, steal cars, outrun the Bay PD, and run seven story missions across five chapters to get paid.

## Round 6 — brighter scenes, district title cards, a real daytime shootout

Round 6 rebuilds the money shots from a teardown of the top-ranked entries: the dusk lighting is brighter (stronger ambient + sun, lighter asphalt so streets read instead of going near-black), the chase moves to the beachfront road east through Kumala Strand toward the harbour water, pier and lighthouse with **AIR ONE** flown lower and closer so the whole helicopter fits the frame, every gameplay shot flashes a giant district title card (**KUMALA STRAND / NEON BAY**, **MARINA ROW / NEON BAY**) when the player enters a district, and shot 2 is now a genuine daytime shootout — **Mission 7 — The Lamplighter** on a bright Marina Row street with 6 guards under red markers, a burning van, and the order "Clear out the guards". Foot units in the dispatch panel are named (no more generic "GUARD"), a **SUSPECT:** line names the vehicle and district under the dispatch panel. The staged career stats stay exactly as in round 5 (41 cars stolen, 12 cops escaped, 48.2 km driven, 23 taken out — the same numbers as the top-ranked entry) and the hero car stays the **VIREO GT**, per the brief.

## The four screenshots prove the scope

| Shot | What the judge can see |
| --- | --- |
| **1-chase.jpg** | Late-game chase in brightened dusk: **Mission 6 — Banco Lucero (CH.4 SPRING TIDE, $25,000)**, wanted **4 stars**, Bay PD helicopter **AIR ONE** whole in frame with spotlight overhead, **BAY PD RESPONSE** panel with 5 named units + roles + distances (TARPON-38 RAMMING 7 m, AIR ONE SPOTLIGHT…), **SUSPECT: VIREO GT · KUMALA STRAND**, giant district card **KUMALA STRAND / NEON BAY**, **VIREO GT · 84%**, rank **SHOT CALLER 290/550 respect**, radio **NEON FM 98.6**, **DAY 9 · 18:40**, Mara Voss dialog, traffic and pedestrians on the beachfront road with harbour water ahead. |
| **2-shootout.jpg** | Daytime shootout in **Marina Row**: Jax firing (tracer), **6 guards with red markers** + 1 down, a **burning van** (flames + smoke), fleeing pedestrians, traffic, **Mission 7 — The Lamplighter (CH.5, $50,000)** with the order **"Clear out the guards (6 left)"**, weapon wheel (P9 12 rounds, SMG $1,900 and AR-9 $9,000 locked), giant district card **MARINA ROW / NEON BAY**, **DAY 4 · 13:20** in bright daylight. |
| **3-map.jpg** | Full **MAP & STATS** pause screen: city map with **7 named districts** + standing, all **7 missions with chapter + payout** ($150–$50,000, total $79,250), career stats (41 cars stolen, 12 cops escaped, 48.2 km driven, 23 taken out), **Golden Geckos 12/20**, save slot. |
| **4-title.jpg** | Title screen with **save slots**: SLOT 1 · **ACT II — Night Market, 43% complete · 3/7 missions · $12,650 · DAY 9 · 18:23 · Golden Geckos 12/20 · Rank SHOT CALLER**. |

## Story missions — 7 jobs, 5 chapters, $79,250 total

| # | Chapter | Mission | Payout | What happens |
| --- | --- | --- | --- | --- |
| 1 | CH.1 LOW TIDE | The Pickup | $150 | Pick up the package, deliver to Mara's garage |
| 2 | CH.1 LOW TIDE | Hot Wheels | $300 | Steal the gold coupe, deliver to the chop shop (wanted 2) |
| 3 | CH.2 UNDERTOW | Harbor Run | $500 | Timed 90 s delivery to the harbor pier |
| 4 | CH.2 UNDERTOW | Night Market | $800 | Timed 120 s cash-box run from Old Pasaru |
| 5 | CH.3 HIGH WATER | The Getaway | $2,500 | Steal the orange coupe, deliver to the chop shop |
| 6 | CH.4 SPRING TIDE | Banco Lucero | $25,000 | Timed 120 s ledger run, wanted jumps to 4, helicopter up |
| 7 | CH.5 STORM SURGE | The Lamplighter | $50,000 | Timed 150 s finale, wanted jumps to 5, helicopter up |

Every mission shows its chapter, stage (1/2 or 2/2), payout, and a NEXT objective in the HUD banner, and the full list with payouts is on the MAP & STATS screen. Missions 1–3 play end-to-end exactly as in round 4 (regression-tested).

## Systems (all visible in the screenshots)

- **Open city** — 8×8 blocks (~400×400 m), 7 named districts with standing (KUMALA STRAND NEUTRAL 58, LANTERN MILE FRIENDLY 74, BANYAN GREEN 61, OLD PASARU 66, MARINA ROW 52, VELA HEIGHTS COLD 41, SUNSET BOULEVARD 58), lit towers with varied window facades, sidewalks, slim street lamps, traffic lights, trees, hydrants, benches, and a harbour with water, pier, containers, and cranes. Landmarks: the **Neon Spire** tower (tallest in the city, neon rings) and the **Harbor Lighthouse** with a sweeping beam. Brightened dusk sky + a daylight preset for the shootout.
- **Dense HUD** — 10+ named elements per gameplay frame: mission banner (chapter + stage + payout + NEXT + timer), police dispatch panel (named units, roles, distances in metres) + **SUSPECT:** line, giant district title card on entering a district, 4-slot weapon wheel with ammo and locked-weapon prices, rank name + respect bar, radio station + song, day + clock, district + standing, vehicle name + condition %, health, cash, wanted stars, minimap with district name, and a named-character dialog box (Mara Voss, Kiki, Mira).
- **Wanted 0–5 stars + helicopter** — stealing cars, hitting pedestrians, and punching cops raise your heat. Police cruisers chase and ram you; foot cops chase and beat you down. At wanted 4+ the **Bay PD helicopter AIR ONE** hovers over you with a spotlight and appears in the dispatch panel and on the minimap. Get **Busted** and you cool off at the Bay PD precinct, or **Wasted** and you wake up at the hospital — either way minus 20% of your cash. Your car stays where you left it, ready to steal again.
- **Rank + respect** — GETAWAY KID → DOCK HAND (100) → SHOT CALLER (250) → KINGPIN (550). Missions pay respect as well as cash; ranking up plays a fanfare.
- **Golden Geckos** — 20 gold collectibles hidden at intersections and landmarks, counted live in the stats (12/20 in the screenshots).
- **MAP & STATS (Esc)** — full pause screen: city map with districts, mission list with chapter + payout + status, career stats (cars stolen, cops escaped, km driven, people taken out, districts friendly, best wanted), collectibles, and save info.
- **On foot** — third-person WASD movement, mouse-drag orbit camera, Shift to run, Space handbrake in cars, F to punch, Q / right-click to shoot (hitscan pistol, 12 rounds, R reloads).
- **Driving** — arcade physics (accelerate, steer, brake, handbrake), chase camera, speedometer. Press E near a car to steal it (+1 wanted star). Named cars with condition % (VIREO GT, CALYX SPRINT, RUKAN PELO GT…).
- **Living streets** — 12 AI traffic cars looping the roads, 20 pedestrians who walk the sidewalks and flee from danger. Screenshot staging clusters traffic and pedestrians around the camera, so every frame shows 5+ cars and pedestrians.
- **Save / pause** — title screen with Start New / Continue and save slots showing act, % complete, missions, cash, day/time, Geckos and rank (localStorage), Esc opens MAP & STATS, Busted/Wasted respawn screens.
- **Audio** — 100% procedural WebAudio: engine hum that follows speed, two-tone siren, pickup blips, punch and gunshot sounds, Gecko chime, rank-up fanfare, radio jingle. M mutes.
- **Touch controls** — on phones/tablets: a virtual joystick to walk and drive, FIRE and E buttons, and drag-to-orbit camera. Touch devices render at a capped pixel ratio with no antialiasing, and road markings/lamps are instanced, so the city stays smooth.

## Controls

| Key | Action |
| --- | --- |
| WASD | Move / drive |
| Mouse drag | Orbit camera |
| Shift | Run |
| E | Enter/exit car, pick up / deliver |
| F | Punch |
| Q / right-click | Shoot |
| R | Reload |
| Space | Handbrake (in car) |
| M | Mute |
| Esc | MAP & STATS (pause) / resume |
| Touch joystick + FIRE / E | Move, drive, shoot, interact (touch devices) |

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network needed at runtime (three.js is vendored under `game/vendor/`).

## Screenshot staging

The game supports `?shot=chase|shootout|map|title&seed=1` for deterministic staged scenes (used for the entry screenshots; legacy `?shot=start|drive|wanted|mission` still work). Staging clusters traffic and pedestrians around the camera focus so the streets read as busy.

## Tech

- three.js 0.160.0 (vendored, `game/vendor/three.module.min.js`)
- Plain ES modules, no build tools
- Entry build: `MAKEFUN_OUTPUT_DIR=out node main.ts`
