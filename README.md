# Neon Bay — Open-World Crime

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/Lagabara77/neon-bay/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/Lagabara77/neon-bay/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original open-world crime game built for the **make.fun gta6-01 ("Make GTA 6")** competition. No assets, names, or story elements from any existing franchise — the city, the crew, and every character are invented for this game.

You are **Jax Marlowe**, wheelman for **Mara Voss** and her crew in Neon Bay, a low-poly city at dusk. Walk the streets, steal cars, outrun the Bay PD, and run three story missions to get paid.

## Features

- **Open city** — 8×8 blocks (~400×400 m) of roads, lit towers, sidewalks, street lamps, traffic lights, trees, hydrants, benches, and a harbour with water, pier, containers, and cranes. Dusk sky, fog, neon signs.
- **On foot** — third-person WASD movement, mouse-drag orbit camera, Shift to run, Space handbrake in cars, F to punch, Q / right-click to shoot (hitscan pistol, 12 rounds, R reloads).
- **Driving** — arcade physics (accelerate, steer, brake, handbrake), chase camera, speedometer. Press E near a car to steal it (+1 wanted star).
- **Living streets** — 12 AI traffic cars looping the roads, 20 pedestrians who walk the sidewalks and flee from danger.
- **Wanted 0–5 stars** — stealing cars, hitting pedestrians, and punching cops raise your heat. Police cruisers chase and ram you; foot cops chase and beat you down. Get **Busted** or **Wasted** and you wake up at the hospital minus 20% of your cash.
- **3 story missions** — *The Pickup* ($150), *Hot Wheels* ($300), *Harbor Run* ($500, timed), with waypoint beams, minimap blips, and objective banners.
- **HUD** — health bar, cash, wanted stars, objective banner, speedometer, and a 2D top-down minimap (player arrow, police blips, mission blip, cars).
- **Save / pause** — title screen with Start New / Continue (localStorage), Esc to pause, Busted/Wasted respawn screens.
- **Audio** — 100% procedural WebAudio: engine hum that follows speed, two-tone siren, pickup blips, punch and gunshot sounds. M mutes.

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
| Esc | Pause |

## Run it

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network needed at runtime (three.js is vendored under `game/vendor/`).

## Screenshot staging

The game supports `?shot=start|drive|wanted|mission&seed=1` for deterministic staged scenes (used for the entry screenshots).

## Tech

- three.js 0.160.0 (vendored, `game/vendor/three.module.min.js`)
- Plain ES modules, no build tools
- Entry build: `MAKEFUN_OUTPUT_DIR=out node main.ts`
