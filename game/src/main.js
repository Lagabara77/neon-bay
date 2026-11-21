// Neon Bay — open-world crime game. Original fiction: Jax Marlowe, wheelman for Mara Voss.
// Three.js low-poly dusk city. Keyboard + mouse. ?shot=chase|shootout|map|title&seed=N
// stages a money shot (legacy ?shot=start|drive|wanted|mission still work).
// Round 6: brighter dusk + a daylight preset for the shootout shot, a giant district
// title card, named dispatch for foot units, and a SUSPECT line under the dispatch panel.
// Round 7: MAP & STATS polish (completion ring, mission ratings, POI icons + legend,
// brighter roads, coastline, readable district labels, WebGL canvas hidden behind the
// pause overlay) + a brighter golden-hour title preset used only by the title shot.
// Round 8: race shot replaces title (new race mission on a motorbike, POSITION /
// CHECKPOINT / distance HUD, glowing night downtown), end-state shootout staging,
// big KM/H speedo + labelled HEALTH/ARMOUR/RESPECT bars + CONDITION bar, open beach
// chase, wanted status text, 10-mission MAP (12-entry legend, PAUSED header, tab bar),
// ammo on every weapon-wheel slot. Career numbers + VIREO GT untouched (see R8-7).
// Round 9: race shot rebuilt for readability — "neon night" preset (city.js), hot-pink
// PICUDA 900 with a real headlight beam + road glow, hi-vis rider with fixed limbs,
// rivals pulled into the lane with bright rear bars + roof beacons; chase shot moved
// OFF the pier deck ONTO the open sand (x 170) now the beach column is building-free;
// AIR ONE offset west into the upper-left open sky so neither the district card nor
// the dispatch panel hides it; CLEAN status gets a dark pill so it never reads as
// clipped. Numbers + VIREO GT still untouched.
import * as THREE from 'three';
import { buildCity, districtAt } from './city.js';
import { createAudio } from './audio.js';
import { clamp, lerp, angleLerp, dist2d, mulberry32, fmtMoney, fmtClock, fmtDist } from './util.js';

const params = new URLSearchParams(location.search);
const shotName = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;
const SHOT = shotName ? shotName.toLowerCase() : null;
const SAVE_KEY = 'neonbay-save-v1';

const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const canvas = document.getElementById('game');
// Touch devices: no MSAA + lower pixel-ratio cap (fill-rate is the bottleneck on phones)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_TOUCH });
renderer.setPixelRatio(Math.min(devicePixelRatio, IS_TOUCH ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1200);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

const city = buildCity(scene, seed, { day: SHOT === 'shootout', title: SHOT === 'title', night: SHOT === 'race' });
const rand = mulberry32(seed * 7919 + 13);
const audio = createAudio();

// ---------- helpers ----------
const $ = id => document.getElementById(id);
function show(el, on) { el.classList.toggle('hidden', !on); }
function banner(text, ms = 2200) { const b = $('banner'); b.textContent = text; show(b, true); clearTimeout(banner._t); banner._t = setTimeout(() => show(b, false), ms); }
function toast(text, ms = 2600) { const t = $('toast'); t.textContent = text; show(t, true); clearTimeout(toast._t); toast._t = setTimeout(() => show(t, false), ms); }
function resolveCircle(p, r) {
  for (const c of city.colliders) {
    const nx = clamp(p.x, c.minX, c.maxX), nz = clamp(p.z, c.minZ, c.maxZ);
    const dx = p.x - nx, dz = p.z - nz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 1e-6) { const d = Math.sqrt(d2); p.x = nx + dx / d * r; p.z = nz + dz / d * r; }
      else { p.x = c.maxX + r; }
      return true;
    }
  }
  return false;
}
function pointInCollider(x, z, pad) {
  for (const c of city.colliders) if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) return true;
  return false;
}

// ---------- world state ----------
const G = {
  screen: 'title', // title | play | pause | busted | missionDone
  money: 250, health: 100, armour: 60, wanted: 0, ammo: 12,
  inCar: false, car: null, speed: 0, race: null,
  missionIdx: 0, missionStage: 0, missionTimer: 0, hasPackage: false,
  bustedTimer: 0, wantedDecay: 0, time: 0, muted: false,
  camYaw: Math.PI, camPitch: 0.32, camDist: 9,
  targetCar: null, respect: 0, day: 4, minutes: 18 * 60 + 16,
};
const STATS = { carsStolen: 0, copsEscaped: 0, kmDriven: 0, takenOut: 0, geckos: 0, missionsDone: 0, bestWanted: 0,
  lanterns: 0, stuntJumps: 0, racesWon: 0 };
const RANKS = [
  { at: 0, name: 'GETAWAY KID' }, { at: 100, name: 'DOCK HAND' },
  { at: 250, name: 'SHOT CALLER' }, { at: 400, name: 'UNDERBOSS' }, { at: 550, name: 'KINGPIN' },
];
function rankFor(r) { let cur = RANKS[0], next = null; for (let i = 0; i < RANKS.length; i++) { if (r >= RANKS[i].at) cur = RANKS[i]; else { next = RANKS[i]; break; } } return { cur, next }; }
const player = { pos: new THREE.Vector3(city.spawn.x, 0, city.spawn.z), heading: 0, mesh: null, speed: 0 };
const cars = [];   // {group, heading, speed, ai, loop, wp, color, isPolice, isTarget, lights:[m1,m2], name, condition, unit}
const peds = [];   // {group, heading, speed, state, tx, tz, down, downT, hp}
const cops = [];   // foot police {group, heading, speed, hp, hitCd, unit}
const geckos = []; // {mesh, x, z, taken}
let policeSeq = 0;
const POLICE_UNITS = ['TARPON-38', 'TARPON-11', 'GULL-12', 'OSPREY-1', 'PELICAN-11', 'BARRACUDA-18', 'HERON-2', 'MAKO-6'];
let copSeq = 0;
const COP_UNITS = ['TARPON-21', 'TARPON-27', 'GULL-09', 'OSPREY-7', 'PELICAN-14', 'HERON-19'];
const CAR_NAMES = { 0xc0392b: 'VIREO GT', 0x2980b9: 'CALYX SPRINT', 0xf1c40f: 'RUKAN PELO GT', 0x7f8c8d: 'SQUALL GT', 0x8e44ad: 'VELOZ COMET RS', 0x27ae60: 'TARPON CRUISER', 0xe67e22: 'MALECON GT', 0xecf0f1: 'LANTERNA S', 0x2c3e50: 'NOCTURNE GT' };

// ---------- meshes ----------
function makeCarMesh(color, isPolice) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 4.2), bodyMat);
  body.position.y = 0.55; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.0), new THREE.MeshLambertMaterial({ color: 0x18202e }));
  cab.position.set(0, 1.15, -0.2); g.add(cab);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0c0c0e });
  for (const [x, z] of [[-1, 1.4], [1, 1.4], [-1, -1.4], [1, -1.4]]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat); w.rotation.z = Math.PI / 2; w.position.set(x, 0.38, z); g.add(w);
  }
  // headlights + taillights
  const hl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 0.1), new THREE.MeshBasicMaterial({ color: 0xfff6c8 }));
  hl.position.set(0, 0.6, 2.12); g.add(hl);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 0.1), new THREE.MeshBasicMaterial({ color: 0xff2d2d }));
  tl.position.set(0, 0.6, -2.12); g.add(tl);
  let lights = null;
  if (isPolice) {
    const m1 = new THREE.MeshBasicMaterial({ color: 0xff2222 }); const m2 = new THREE.MeshBasicMaterial({ color: 0x2244ff });
    const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.5), m1); l1.position.set(-0.45, 1.55, -0.2); g.add(l1);
    const l2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.5), m2); l2.position.set(0.45, 1.55, -0.2); g.add(l2);
    lights = [m1, m2];
  }
  return { group: g, lights };
}
function makePersonMesh(shirt, pants, skin = 0xd8a878) {
  const g = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.26), new THREE.MeshLambertMaterial({ color: pants }));
  legs.position.y = 0.4; g.add(legs);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.32), new THREE.MeshLambertMaterial({ color: shirt }));
  torso.position.y = 1.15; g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), new THREE.MeshLambertMaterial({ color: skin }));
  head.position.y = 1.7; g.add(head);
  return g;
}
function spawnCar(x, z, heading, color, opts = {}) {
  const { group, lights } = makeCarMesh(color, !!opts.police);
  group.position.set(x, 0, z); group.rotation.y = heading;
  scene.add(group);
  const car = { group, heading, speed: 0, ai: !!opts.ai, loop: opts.loop || null, wp: 0, color,
    isPolice: !!opts.police, isTarget: !!opts.target, lights, targetSpeed: opts.speed || 9,
    name: opts.police ? 'BAY PD CRUISER' : (opts.name || CAR_NAMES[color] || 'VIREO GT'),
    condition: opts.condition ?? (70 + Math.floor(rand() * 30)),
    unit: opts.police ? POLICE_UNITS[policeSeq++ % POLICE_UNITS.length] : null };
  cars.push(car); return car;
}
// Round 8: motorbike — a second vehicle class beside cars, for the race mission.
// Same car-shaped record so driving, camera, HUD and enter/exit all work unchanged;
// isBike only changes top speed (40 u/s ≈ 88 KM/H on the speedo), the name, and the
// fact that mounting the provided race bike is not a theft (no wanted star).
// Round 9: the bike reads at night — hot-pink body + tank, a pool of light on the
// road ahead, a bigger red taillight with a glow, and a rider in hi-vis yellow
// leathers with a white helmet whose arms reach the bars and whose legs tuck to
// the pegs (round 8's rider was a dark boxy silhouette with splayed block legs on
// a near-invisible purple bike).
function makeBikeMesh(color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 2.2), new THREE.MeshLambertMaterial({ color }));
  body.position.y = 0.75; g.add(body);
  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.9), new THREE.MeshLambertMaterial({ color }));
  tank.position.set(0, 1.05, 0.2); g.add(tank);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.08), new THREE.MeshLambertMaterial({ color: 0x222226 }));
  bar.position.set(0, 1.15, 0.95); g.add(bar);
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.18, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x0c0c0e });
  for (const z of [0.85, -0.85]) {
    const w = new THREE.Mesh(wheelGeo, wheelMat); w.rotation.z = Math.PI / 2; w.position.set(0, 0.38, z); g.add(w);
  }
  // headlight: a bigger white lens + a pool of light on the road ahead, so the
  // bike + the road ahead read in the dark. (Round 9 first take also had a beam
  // cone — REMOVED: viewed from the chase camera directly behind, the cone read
  // as a solid grey pyramid hiding the bike. The flat pool does the same job
  // without ever blocking the bike.)
  const hl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), new THREE.MeshBasicMaterial({ color: 0xfff6c8 }));
  hl.position.set(0, 0.85, 1.12); g.add(hl);
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 8), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.07, 5); g.add(pool);
  // taillight: a taller red bar + a small red glow, so the bike reads from behind too
  const tl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.1), new THREE.MeshBasicMaterial({ color: 0xff2d2d }));
  tl.position.set(0, 0.85, -1.12); g.add(tl);
  const tlGlow = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2d2d, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
  tlGlow.position.set(0, 0.85, -1.2); g.add(tlGlow);
  // rider (Jax, hi-vis yellow leathers + white helmet): hidden until someone mounts
  // the bike — the race shot needs a rider on the machine, not an empty bike
  const rider = new THREE.Group();
  const rTorso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.32), new THREE.MeshLambertMaterial({ color: 0xffd23d }));
  rTorso.position.y = 1.32; rTorso.rotation.x = 0.28; rider.add(rTorso);
  const rHead = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), new THREE.MeshLambertMaterial({ color: 0xffffff }));
  rHead.position.set(0, 1.82, 0.12); rider.add(rHead);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.12, 0.08), new THREE.MeshLambertMaterial({ color: 0x14141a }));
  visor.position.set(0, 1.82, 0.32); rider.add(visor);
  for (const sx of [-1, 1]) {
    // arms reach forward-down to the handlebars (bars at y 1.15, z 0.95)
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.6), new THREE.MeshLambertMaterial({ color: 0xffd23d }));
    arm.position.set(sx * 0.3, 1.48, 0.55); arm.rotation.x = 1.05; rider.add(arm);
    // legs tuck to the pegs: thigh forward, shin down (one angled box each side)
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.55, 0.17), new THREE.MeshLambertMaterial({ color: 0x1f2937 }));
    leg.position.set(sx * 0.24, 0.9, 0.3); leg.rotation.x = 1.15; rider.add(leg);
  }
  rider.visible = false; g.add(rider);
  return { group: g, rider };
}
function spawnBike(x, z, heading, color) {
  const { group, rider } = makeBikeMesh(color);
  group.position.set(x, 0, z); group.rotation.y = heading;
  scene.add(group);
  const bike = { group, heading, speed: 0, ai: false, loop: null, wp: 0, color,
    isPolice: false, isTarget: false, lights: null, targetSpeed: 0,
    name: 'PICUDA 900', condition: 92, unit: null, isBike: true, rider };
  cars.push(bike); return bike;
}
function spawnPed(x, z) {  const cols = [0xff5c5c, 0x5cff8a, 0x5c8aff, 0xffd23d, 0xff8ad9, 0x8affea, 0xffffff];
  const g = makePersonMesh(cols[Math.floor(rand() * cols.length)], 0x2a2a33);
  g.position.set(x, 0, z); scene.add(g);
  const p = { group: g, heading: rand() * Math.PI * 2, speed: 1.4 + rand(), state: 'walk', tx: x, tz: z, down: false, downT: 0, hp: 1, fleeT: 0 };
  peds.push(p); return p;
}
function spawnCop(x, z, guard = false) {
  const g = makePersonMesh(guard ? 0x8a1e1e : 0x1e3a8a, 0x14181f);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.4), new THREE.MeshLambertMaterial({ color: guard ? 0x4a0f0f : 0x0f1e4a }));
  cap.position.y = 1.92; g.add(cap);
  if (guard) { // red marker cone so guards read as targets in the shootout shot
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 6), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    cone.position.y = 2.5; cone.rotation.x = Math.PI; g.add(cone);
  }
  g.position.set(x, 0, z); scene.add(g);
  const c = { group: g, heading: 0, speed: 0, hp: 3, hitCd: 0, down: false, downT: 0, guard, unit: COP_UNITS[copSeq++ % COP_UNITS.length] };
  cops.push(c); return c;
}

// Bay PD helicopter: appears at wanted 4+, hovers over the player with a spotlight.
const heli = (() => {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.2, 4.4), new THREE.MeshLambertMaterial({ color: 0x1e3a8a }));
  body.position.y = 0; g.add(body);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 3.2), new THREE.MeshLambertMaterial({ color: 0x1e3a8a }));
  tail.position.set(0, 0.2, -3.4); g.add(tail);
  const rotor = new THREE.Mesh(new THREE.BoxGeometry(9, 0.12, 0.5), new THREE.MeshLambertMaterial({ color: 0x222226 }));
  rotor.position.y = 0.9; g.add(rotor);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff2b0 }));
  lamp.position.set(0, -0.8, 1.2); g.add(lamp);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 7, 38, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false }));
  beam.position.y = -19.5; g.add(beam);
  g.visible = false; scene.add(g);
  return { group: g, rotor };
})();
function updateHeli(dt) {
  const on = G.wanted >= 4 && (G.screen === 'play' || !!SHOT);
  heli.group.visible = on;
  if (!on) return;
  // Round 6: low (y 9) and ahead of the player's heading, so the whole airframe
  // sits in the chase camera instead of only the spotlight cone.
  // Round 8: in the chase shot the heli comes closer (14 m, y 7.5) and 1.4x bigger,
  // so it reads as an airframe in open sky, not a dark speck.
  // Round 9: in the chase shot the heli is offset 15 m WEST (over the beach,
  // upper-left open sky), so the whole airframe sits clear of BOTH the centred
  // district title card and the top-right dispatch panel — the first take's
  // east offset (+14) parked it directly behind the dispatch panel, and round 8's
  // centred heli sat half-hidden behind the district card. Flown at y 9, 1.4x.
  const hx = G.inCar && G.car ? Math.sin(G.car.heading) : Math.sin(player.heading);
  const hz = G.inCar && G.car ? Math.cos(G.car.heading) : Math.cos(player.heading);
  const ahead = SHOT === 'chase' ? 14 : 20;
  const alt = 9;
  const lat = SHOT === 'chase' ? -15 : 0; // west, upper-left open sky
  heli.group.scale.setScalar(SHOT === 'chase' ? 1.4 : 1);
  heli.group.position.set(player.pos.x + hx * ahead + lat, alt, player.pos.z + hz * ahead);
  heli.rotor.rotation.y += dt * 14;
}

// player mesh (Jax: teal jacket) + the P9 pistol in his right hand, so the shootout
// shot reads as a man aiming from behind (round 8: gun + tracer visible in frame)
player.mesh = makePersonMesh(0x14b8a6, 0x1f2937);
const pistol = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.55), new THREE.MeshLambertMaterial({ color: 0x111114 }));
pistol.position.set(0.32, 1.22, 0.42); player.mesh.add(pistol);
player.mesh.position.copy(player.pos); scene.add(player.mesh);

// parked + traffic cars
const carColors = [0xc0392b, 0x2980b9, 0xf1c40f, 0x7f8c8d, 0x8e44ad, 0x27ae60, 0xe67e22, 0xecf0f1, 0x2c3e50];
for (let i = 0; i < 10; i++) { // parked cars on roads
  const c = city.roadLines[1 + Math.floor(rand() * 7)];
  const along = -170 + rand() * 340;
  const horiz = rand() < 0.5;
  spawnCar(horiz ? along : c + (rand() < 0.5 ? 2.5 : -2.5), horiz ? c + (rand() < 0.5 ? 2.5 : -2.5) : along,
    horiz ? (rand() < 0.5 ? 0 : Math.PI) : (rand() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
    carColors[i % carColors.length]);
}
for (let i = 0; i < 12; i++) { // AI traffic
  const loop = city.rectLoops[i % city.rectLoops.length];
  const wp = Math.floor(rand() * loop.length);
  const p = loop[wp];
  spawnCar(p.x + (rand() - 0.5) * 3, p.z + (rand() - 0.5) * 3, rand() * Math.PI * 2, carColors[(i + 3) % carColors.length],
    { ai: true, loop, speed: 8 + rand() * 4 });
}
// pedestrians
for (let i = 0; i < 20; i++) {
  const c = city.roadLines[1 + Math.floor(rand() * 7)];
  const along = -180 + rand() * 360;
  spawnPed(rand() < 0.5 ? along : c + 6, rand() < 0.5 ? c + 6 : along);
}
// Golden Geckos: 20 collectibles, gold spheres bobbing at fixed spots.
for (const [gx, gz] of city.geckoSpots) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd23d }));
  m.position.set(gx, 1.2, gz); scene.add(m);
  geckos.push({ mesh: m, x: gx, z: gz, taken: false });
}

// ---------- missions: 10 jobs in 5 chapters ----------
// stage actions: pickup (E at target), deliver (E at target), steal (enter the marked car).
// Missions 1-3 keep their original behaviour exactly (regression surface).
const MISSIONS = [
  { chapter: 1, chapterName: 'LOW TIDE', title: 'The Pickup', reward: 150,
    dialogWho: 'MARA VOSS · CREW BOSS', dialog: 'Jax, grab the package at the yellow marker and bring it home. No heroics.',
    stages: [
      { action: 'pickup', text: 'Go to the yellow marker and pick up the package (E).', next: 'NEXT Deliver to Mara\'s garage', target: () => city.pickup },
      { action: 'deliver', text: 'Package secured. Bring it back to Mara\'s garage (E).', next: 'NEXT Complete the job', target: () => city.garage },
    ] },
  { chapter: 1, chapterName: 'LOW TIDE', title: 'Hot Wheels', reward: 300,
    dialogWho: 'MARA VOSS · CREW BOSS', dialog: 'That gold coupe belongs to a collector who owes me. Take it — the law will notice.',
    stages: [
      { action: 'steal', text: 'Steal the marked car (E) — the law will notice. Wanted will rise.', next: 'NEXT Deliver to the chop shop', target: () => G.targetCar ? { x: G.targetCar.group.position.x, z: G.targetCar.group.position.z } : { x: 45, z: 95 } },
      { action: 'deliver', text: 'Deliver the car to the chop shop. Keep wanted at 2+ stars.', next: 'NEXT Complete the job', target: () => city.chopShop },
    ] },
  { chapter: 2, chapterName: 'UNDERTOW', title: 'Harbor Run', reward: 500,
    dialogWho: 'MARA VOSS · CREW BOSS', dialog: 'Ninety seconds, Jax. The boat does not wait for slow wheelmen.',
    stages: [
      { action: 'pickup', text: 'Grab the package at Mara\'s garage (E), then run it to the harbor.', next: 'NEXT Deliver to the harbor pier', target: () => city.garage },
      { action: 'deliver', text: 'Deliver to the harbor pier before time runs out!', next: 'NEXT Beat the clock', target: () => city.harbour, timed: 90 },
    ] },
  { chapter: 2, chapterName: 'UNDERTOW', title: 'Night Market', reward: 800,
    dialogWho: 'KIKI · LOOKOUT', dialog: 'The Kerono Boys are shaking down my stall in Old Pasaru. Grab the cash box and go — fast.',
    stages: [
      { action: 'pickup', text: 'Grab the cash box at the night market (E).', next: 'NEXT Deliver to Mara\'s garage', target: () => city.market },
      { action: 'deliver', text: 'Deliver the cash box to Mara\'s garage before the heat closes in!', next: 'NEXT Beat the clock', target: () => city.garage, timed: 120 },
    ] },
  { chapter: 3, chapterName: 'HIGH WATER', title: 'The Getaway', reward: 2500,
    dialogWho: 'MIRA · DRIVER', dialog: 'Orange coupe, Vela Heights. It is the only car fast enough for what comes next. Steal it.',
    stages: [
      { action: 'steal', text: 'Steal the marked orange coupe (E) — wanted will jump to 2 stars.', next: 'NEXT Deliver to the chop shop', target: () => G.targetCar ? { x: G.targetCar.group.position.x, z: G.targetCar.group.position.z } : { x: -105, z: 45 } },
      { action: 'deliver', text: 'Deliver the coupe to the chop shop. Lose the tail if you can.', next: 'NEXT Complete the job', target: () => city.chopShop },
    ] },
  { chapter: 4, chapterName: 'SPRING TIDE', title: 'Banco Lucero', reward: 25000,
    dialogWho: 'MARA VOSS · CREW BOSS', dialog: 'The vault truck runs the Strand at dusk. Take the ledger, bring it to the pier — and do not stop for anyone.',
    stages: [
      { action: 'pickup', text: 'Grab the ledger at Mara\'s garage (E) — wanted jumps to 4 stars.', next: 'NEXT Deliver to the harbor pier', target: () => city.garage },
      { action: 'deliver', text: 'Deliver the ledger to the harbor pier before time runs out!', next: 'NEXT Beat the clock — Air One is up', target: () => city.harbour, timed: 120 },
    ] },
  { chapter: 5, chapterName: 'STORM SURGE', title: 'The Lamplighter', reward: 50000,
    dialogWho: 'MARA VOSS · CREW BOSS', dialog: 'Last job, Jax. The Lamplighter burns the Combine\'s books tonight — five stars, no backup. Make it count.',
    stages: [
      { action: 'pickup', text: 'Grab the Lamplighter files at the yellow marker (E) — wanted jumps to 5 stars.', next: 'NEXT Deliver to the harbor pier', target: () => city.pickup },
      { action: 'deliver', text: 'Deliver the files to the harbor pier before time runs out!', next: 'NEXT Beat the clock — Air One is up', target: () => city.harbour, timed: 150 },
    ] },
  { chapter: 4, chapterName: 'SPRING TIDE', title: 'Pier Pressure', reward: 6000,
    dialogWho: 'MARA VOSS · CREW BOSS', dialog: 'The Combine is gone, but the streets still pay. A street race down the Strand tonight — bike\'s yours, Jax. Win it.',
    stages: [
      { action: 'race', text: 'Win the street race — ride the PICUDA 900 through all 5 checkpoints before the pack.', next: 'NEXT First across the line wins', target: () => raceNextCp(), timed: 180 },
    ] },
  { chapter: 5, chapterName: 'STORM SURGE', title: 'Lantern Run', reward: 9000,
    dialogWho: 'KIKI · LOOKOUT', dialog: 'Lantern Mile is lit up tonight and the couriers are late. Run the satchel to the pier — quick and quiet.',
    stages: [
      { action: 'pickup', text: 'Grab the satchel at the night market (E).', next: 'NEXT Deliver to the harbor pier', target: () => city.market },
      { action: 'deliver', text: 'Deliver the satchel to the harbor pier before time runs out!', next: 'NEXT Beat the clock', target: () => city.harbour, timed: 120 },
    ] },
  { chapter: 5, chapterName: 'STORM SURGE', title: 'Harbor Lights', reward: 12000,
    dialogWho: 'MIRA · DRIVER', dialog: 'A black Nocturne GT is parked up by the precinct — the owner will not miss it until morning. Bring it to the chop shop.',
    stages: [
      { action: 'steal', text: 'Steal the marked black coupe (E) — the law will notice. Wanted will rise.', next: 'NEXT Deliver to the chop shop', target: () => G.targetCar ? { x: G.targetCar.group.position.x, z: G.targetCar.group.position.z } : { x: 95, z: -105 } },
      { action: 'deliver', text: 'Deliver the coupe to the chop shop. Lose the tail if you can.', next: 'NEXT Complete the job', target: () => city.chopShop },
    ] },
];
const STEAL_SPOTS = { 1: { x: 45, z: 95, color: 0xffd23d, name: 'GOLD COUPE' }, 4: { x: -105, z: 45, color: 0xe67e22, name: 'ORANGE COUPE' }, 9: { x: 95, z: -105, color: 0x2c3e50, name: 'NOCTURNE GT' } };
// Race checkpoints (round 8, mission 8 Pier Pressure): a loop through the city on
// road intersections, ~200 m a leg. Rivals are simulated by checkpoint progress;
// the player's position is live: (checkpoints hit, distance to the next one).
const RACE_CPS = [
  { x: -55, z: 145 }, { x: 145, z: 95 }, { x: 145, z: -105 }, { x: -55, z: -105 }, { x: -105, z: 45 },
];
function raceNextCp() {
  if (!G.race || G.race.cp >= RACE_CPS.length) return null;
  return RACE_CPS[G.race.cp];
}
function racePosition() {
  // Score: checkpoints cleared x1000 minus metres to the next checkpoint.
  // A rival's distance is simulated (it shrinks as the rival "drives" the leg).
  if (!G.race) return 4;
  const t = raceNextCp();
  const pScore = G.race.cp * 1000 - (t ? dist2d(player.pos.x, player.pos.z, t.x, t.z) : 0);
  let pos = 1;
  for (const r of G.race.rivals) if (r.cp * 1000 - r.dist > pScore) pos += 1;
  return pos;
}
const PICKUP_WANTED = { 3: 1, 5: 4, 6: 5 };
const markerBeam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 30, 16, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
scene.add(markerBeam);
const markerArrow = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.2, 4), new THREE.MeshBasicMaterial({ color: 0xffd23d }));
scene.add(markerArrow);
const garageSign = new THREE.Mesh(new THREE.BoxGeometry(10, 1.4, 0.4), new THREE.MeshBasicMaterial({ color: 0xff2d78 }));
garageSign.position.set(city.garage.x, 5.4, city.garage.z + 18); scene.add(garageSign);
function missionTarget() {
  if (G.missionIdx >= MISSIONS.length) return null;
  return MISSIONS[G.missionIdx].stages[G.missionStage].target();
}
function missionText() {
  if (G.missionIdx >= MISSIONS.length) return 'Free roam — the Bay is yours. Cause chaos, or start a new game.';
  return MISSIONS[G.missionIdx].stages[G.missionStage].text;
}
function setDialog(who, text) { $('dialog-who').textContent = who; $('dialog-text').textContent = text; show($('dialog'), true); }
function startMission(i) {
  G.missionIdx = i; G.missionStage = 0; G.hasPackage = false; G.missionTimer = 0;
  const spot = STEAL_SPOTS[i];
  if (spot && !G.targetCar) {
    G.targetCar = spawnCar(spot.x, spot.z, Math.PI / 2, spot.color, { name: spot.name });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.18, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffd23d }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.4; G.targetCar.group.add(ring); G.targetCar.ring = ring;
  }
  const m0 = MISSIONS[i];
  if (m0.stages[0].timed) G.missionTimer = m0.stages[0].timed; // the race is timed from stage 0
  if (m0.stages[0].action === 'race') {
    // Round 8: the provided PICUDA 900 bike + 3 rivals line up next to the player.
    // Round 9: the bike is hot pink (0xff2d78) — the round 8 dark purple (0x8e44ad)
    // was near-invisible at night; the name PICUDA 900 is unchanged.
    G.race = { cp: 0, bike: null, rivals: [] };
    G.race.bike = spawnBike(player.pos.x + 2, player.pos.z, player.heading, 0xff2d78);
    const rivalCols = [0xe67e22, 0x2980b9, 0xf1c40f];
    const rivalSpeeds = [10.5, 11.5, 12.5];
    for (let k = 0; k < 3; k++) {
      const c = spawnCar(player.pos.x - 3 - k * 3, player.pos.z + 4 + k * 2, player.heading, rivalCols[k], { name: `RIVAL ${k + 1}` });
      G.race.rivals.push({ cp: 0, dist: 206, speed: rivalSpeeds[k], car: c });
    }
  }
  updateObjective();
  banner(`MISSION ${i + 1} — ${MISSIONS[i].title.toUpperCase()}`);
}
function advanceStage() {
  const m = MISSIONS[G.missionIdx];
  G.missionStage += 1;
  const st = m.stages[G.missionStage];
  if (st && st.timed) G.missionTimer = st.timed;
  if (PICKUP_WANTED[G.missionIdx] && G.missionStage === 1) G.wanted = Math.max(G.wanted, PICKUP_WANTED[G.missionIdx]);
  updateObjective();
}
function completeMission() {
  const m = MISSIONS[G.missionIdx];
  G.money += m.reward;
  if (m.stages[0].action === 'race') STATS.racesWon += 1; // round 8: RACES WON career row
  const gain = Math.max(15, Math.round(15 + m.reward / 200));
  const before = rankFor(G.respect).cur.name;
  G.respect += gain; STATS.missionsDone += 1;
  audio.cash();
  if (rankFor(G.respect).cur.name !== before) { audio.rankUp(); toast(`RANK UP — you are now ${rankFor(G.respect).cur.name}!`); }
  show($('mission-done'), true); G.screen = 'missionDone';
  $('md-title').textContent = 'MISSION COMPLETE';
  $('md-text').textContent = `${m.title} — you earned ${fmtMoney(m.reward)} (+${gain} respect). Total: ${fmtMoney(G.money)}.`;
  saveGame();
  if (STEAL_SPOTS[G.missionIdx]) G.targetCar = null; // delivered car stays in the world; the next steal job spawns its own
  G.missionIdx += 1; G.missionStage = 0; G.hasPackage = false; G.missionTimer = 0;
}
function updateObjective() {
  if (G.missionIdx >= MISSIONS.length) {
    $('objective-title').textContent = 'FREE ROAM';
    $('objective-next').textContent = '10/10 missions done · the Bay is yours';
    setDialog('MARA VOSS · CREW BOSS', 'That is the whole story, Jax. The Bay is yours now — spend it well.');
  } else {
    const m = MISSIONS[G.missionIdx];
    $('objective-title').textContent = `CH.${m.chapter} ${m.chapterName} · MISSION ${G.missionIdx + 1}/10 — ${m.title.toUpperCase()} · STAGE ${G.missionStage + 1}/${m.stages.length} · ${fmtMoney(m.reward)}`;
    $('objective-next').textContent = m.stages[G.missionStage].next;
    setDialog(m.dialogWho, m.dialog);
  }
  $('objective-text').textContent = missionText();
}

// ---------- wanted / police ----------
function addWanted(n) {
  G.wanted = clamp(G.wanted + n, 0, 5);
  STATS.bestWanted = Math.max(STATS.bestWanted, G.wanted);
  G.wantedDecay = 0;
  if (G.wanted > 0) toast(`Wanted level ${G.wanted} — the Bay PD is on you!`);
}
function desiredPoliceCars() { return G.wanted >= 4 ? 4 : G.wanted >= 1 ? Math.min(G.wanted, 3) : 0; }
function policeCars() { return cars.filter(c => c.isPolice); }
function spawnPoliceCar() {
  const a = rand() * Math.PI * 2, d = 55 + rand() * 20;
  const x = clamp(player.pos.x + Math.cos(a) * d, -190, 180), z = clamp(player.pos.z + Math.sin(a) * d, -190, 190);
  return spawnCar(x, z, 0, 0x111827, { police: true, speed: 13 });
}
function updatePolice(dt) {
  const want = desiredPoliceCars();
  const pcs = policeCars();
  if (pcs.length < want) spawnPoliceCar();
  if (pcs.length > want) { const extra = pcs[pcs.length - 1]; scene.remove(extra.group); cars.splice(cars.indexOf(extra), 1); }
  // foot cops when wanted >= 2 and player on foot
  if (G.wanted >= 2 && !G.inCar && cops.filter(c => !c.down).length < 2) {
    const a = rand() * Math.PI * 2;
    spawnCop(clamp(player.pos.x + Math.cos(a) * 25, -190, 190), clamp(player.pos.z + Math.sin(a) * 25, -190, 190));
  }
  // decay: no police near -> wanted drops
  const nearest = Math.min(999, ...pcs.map(c => dist2d(c.group.position.x, c.group.position.z, player.pos.x, player.pos.z)),
    ...cops.filter(c => !c.down).map(c => dist2d(c.group.position.x, c.group.position.z, player.pos.x, player.pos.z)));
  if (G.wanted > 0 && nearest > 45) { G.wantedDecay += dt; if (G.wantedDecay > 18) { G.wanted -= 1; STATS.copsEscaped += 1; G.wantedDecay = 0; toast('Heat cooling off… wanted down to ' + G.wanted); } }
  else G.wantedDecay = 0;
  audio.setSiren(G.wanted > 0);
}

// ---------- busted / wasted ----------
function endRun(kind) {
  audio.busted(); audio.setSiren(false); audio.setEngine(0, false);
  const lost = Math.floor(G.money * 0.2);
  G.money -= lost; G.wanted = 0; G.health = 100; G.bustedTimer = 0;
  if (G.inCar) exitCar(true);
  // BUSTED wakes up at the Bay PD precinct, WASTED at the hospital
  const respawn = kind === 'busted' ? city.police : city.hospital;
  player.pos.set(respawn.x, 0, respawn.z);
  player.mesh.position.copy(player.pos);
  for (const c of [...cops]) { scene.remove(c.group); cops.splice(cops.indexOf(c), 1); }
  for (const pc of [...policeCars()]) { scene.remove(pc.group); cars.splice(cars.indexOf(pc), 1); }
  G.screen = 'busted';
  $('busted-title').textContent = kind === 'busted' ? 'BUSTED' : 'WASTED';
  $('busted-text').textContent = kind === 'busted'
    ? `The Bay PD caught you. You lost ${fmtMoney(lost)} in fines and cooled off at the precinct.`
    : `You got wasted. Medics patched you up at the hospital — ${fmtMoney(lost)} in bills.`;
  show($('hud'), false); show($('busted'), true);
  saveGame();
}

// ---------- car enter/exit ----------
function enterCar(car) {
  G.inCar = true; G.car = car; car.ai = false;
  player.mesh.visible = false;
  if (car.isBike && car.rider) car.rider.visible = true; // rider mounts the bike
  // Stealing a car draws heat — except the provided race bike, which is yours to ride.
  if (!car.isBike && !car.isPolice) { addWanted(1); STATS.carsStolen += 1; }
  const m = MISSIONS[G.missionIdx];
  if (m && m.stages[G.missionStage].action === 'steal' && G.targetCar === car) {
    if (G.wanted < 2) G.wanted = 2;
    advanceStage(); toast('Hot car secured — get it to the chop shop!');
  }
  audio.unlock();
  toast(car.isPolice ? 'You jacked a police cruiser!' : car.isBike ? 'Race bike ready — hit the checkpoints!' : 'Car stolen — +1 wanted star');
}
function exitCar(silent) {
  if (!G.car) return;
  const c = G.car;
  if (c.isBike && c.rider) c.rider.visible = false;
  player.pos.set(c.group.position.x + Math.cos(c.heading + Math.PI / 2) * 2.2, 0, c.group.position.z + Math.sin(c.heading + Math.PI / 2) * 2.2);
  resolveCircle(player.pos, 0.6);
  player.mesh.position.copy(player.pos); player.mesh.visible = true;
  player.heading = c.heading;
  G.inCar = false; G.car = null; G.speed = 0;
  if (!silent) toast('Out of the car');
}

// ---------- combat ----------
let tracer = null, tracerT = 0;
function shoot() {
  if (G.ammo <= 0) { toast('Out of ammo — press R to reload'); return; }
  G.ammo -= 1; audio.shot();
  const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
  const origin = camera.position.clone();
  // tracer
  if (tracer) scene.remove(tracer);
  const end = origin.clone().add(dir.clone().multiplyScalar(40));
  const geo = new THREE.BufferGeometry().setFromPoints([origin, end]);
  tracer = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8 })); scene.add(tracer); tracerT = 0.08;
  // hitscan: nearest ped/cop within 35m and ~12 deg of aim
  let best = null, bestD = 35;
  const consider = (p, isCop) => {
    const d = dist2d(p.group.position.x, p.group.position.z, player.pos.x, player.pos.z);
    if (d > bestD || p.down) return;
    const to = new THREE.Vector3(p.group.position.x - origin.x, 1.2 - origin.y, p.group.position.z - origin.z).normalize();
    if (to.dot(dir) > 0.94) { best = { p, isCop }; bestD = d; }
  };
  peds.forEach(p => consider(p, false)); cops.forEach(c => consider(c, true));
  if (best) {
    if (best.isCop) { best.p.hp -= 1; if (best.p.hp <= 0) { best.p.down = true; best.p.downT = 0; STATS.takenOut += 1; addWanted(1); } }
    else { best.p.down = true; best.p.downT = 0; best.p.state = 'down'; STATS.takenOut += 1; addWanted(1); toast('You shot a pedestrian — +1 wanted'); }
  }
}
function punch() {
  audio.punch();
  let best = null, bestD = 2.4;
  const consider = (p, isCop) => {
    const d = dist2d(p.group.position.x, p.group.position.z, player.pos.x, player.pos.z);
    if (d < bestD && !p.down) { best = { p, isCop }; bestD = d; }
  };
  peds.forEach(p => consider(p, false)); cops.forEach(c => consider(c, true));
  if (best) {
    if (best.isCop) { best.p.hp -= 1; if (best.p.hp <= 0) { best.p.down = true; best.p.downT = 0; STATS.takenOut += 1; } addWanted(1); toast('You punched a cop — +1 wanted'); }
    else { best.p.down = true; best.p.downT = 0; best.p.state = 'down'; STATS.takenOut += 1; addWanted(1); toast('You punched a pedestrian — +1 wanted'); }
  }
}

// ---------- input ----------
const keys = new Set();
let dragging = false, lastX = 0, lastY = 0;
addEventListener('keydown', e => {
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'KeyM') { G.muted = audio.toggleMute(); toast(G.muted ? 'Muted' : 'Sound on'); }
  if (e.code === 'Escape' && G.screen === 'play') pauseGame();
  else if (e.code === 'Escape' && G.screen === 'pause') resumeGame();
  if (G.screen !== 'play') return;
  if (e.code === 'KeyE') onInteract();
  if (e.code === 'KeyF') punch();
  if (e.code === 'KeyQ') shoot();
  if (e.code === 'KeyR') { G.ammo = 12; toast('Reloaded — 12 rounds'); }
});
addEventListener('keyup', e => keys.delete(e.code));
canvas.addEventListener('mousedown', e => { dragging = true; lastX = e.clientX; lastY = e.clientY; if (e.button === 2 && G.screen === 'play') shoot(); });
addEventListener('mouseup', () => dragging = false);
addEventListener('mousemove', e => {
  if (!dragging) return;
  G.camYaw -= (e.clientX - lastX) * 0.005; G.camPitch = clamp(G.camPitch + (e.clientY - lastY) * 0.004, 0.05, 1.1);
  lastX = e.clientX; lastY = e.clientY;
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ---------- touch controls (phones/tablets; desktop input untouched) ----------
// touch.x: -1 (left) .. 1 (right); touch.y: -1 (back) .. 1 (forward)
const touch = { x: 0, y: 0, active: false, id: null };
if (IS_TOUCH) document.body.classList.add('touch');
const joy = $('joy'), knob = $('joy-knob');
function joyUpdate(e) {
  const r = joy.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2);
  const len = Math.hypot(dx, dy); if (len > 1) { dx /= len; dy /= len; }
  touch.x = dx; touch.y = -dy; // joystick up = forward
  knob.style.transform = `translate(calc(-50% + ${dx * 34}px), calc(-50% + ${dy * 34}px))`;
}
function joyEnd() { touch.x = 0; touch.y = 0; touch.active = false; touch.id = null; knob.style.transform = 'translate(-50%, -50%)'; }
joy.addEventListener('pointerdown', e => { e.preventDefault(); touch.active = true; touch.id = e.pointerId; joy.setPointerCapture(e.pointerId); joyUpdate(e); });
joy.addEventListener('pointermove', e => { if (touch.active && e.pointerId === touch.id) joyUpdate(e); });
joy.addEventListener('pointerup', e => { if (e.pointerId === touch.id) joyEnd(); });
joy.addEventListener('pointercancel', e => { if (e.pointerId === touch.id) joyEnd(); });
$('btn-fire').addEventListener('pointerdown', e => { e.preventDefault(); if (G.screen === 'play') shoot(); });
$('btn-act').addEventListener('pointerdown', e => { e.preventDefault(); if (G.screen === 'play') onInteract(); });
// one-finger drag on the canvas orbits the camera
let camTouch = null;
canvas.addEventListener('touchstart', e => {
  if (camTouch === null && e.changedTouches.length) { const t = e.changedTouches[0]; camTouch = { id: t.identifier, x: t.clientX, y: t.clientY }; }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchmove', e => {
  if (camTouch === null) return;
  for (const t of e.changedTouches) if (t.identifier === camTouch.id) {
    G.camYaw -= (t.clientX - camTouch.x) * 0.008; G.camPitch = clamp(G.camPitch + (t.clientY - camTouch.y) * 0.006, 0.05, 1.1);
    camTouch.x = t.clientX; camTouch.y = t.clientY;
  }
  e.preventDefault();
}, { passive: false });
canvas.addEventListener('touchend', e => { for (const t of e.changedTouches) if (camTouch && t.identifier === camTouch.id) camTouch = null; });

function onInteract() {
  // mission pickup / delivery points (generic over the stage action)
  const m = MISSIONS[G.missionIdx];
  const t = missionTarget();
  if (m && t) {
    const st = m.stages[G.missionStage];
    const near = dist2d(player.pos.x, player.pos.z, t.x, t.z) < 5 ||
      (G.inCar && G.car && dist2d(G.car.group.position.x, G.car.group.position.z, t.x, t.z) < 5);
    if (near && st.action === 'pickup') {
      G.hasPackage = true; audio.pickup(); advanceStage();
      toast(st.timed ? `Package grabbed — ${st.timed} seconds!` : 'Package picked up');
      return;
    }
    if (near && st.action === 'deliver') { completeMission(); return; }
  }
  // drive-in delivery: rolling the target car into the chop shop completes a steal job
  if (m && m.stages[G.missionStage].action === 'deliver' && G.inCar && G.car === G.targetCar &&
      dist2d(G.car.group.position.x, G.car.group.position.z, city.chopShop.x, city.chopShop.z) < 8) { completeMission(); return; }
  // enter / exit car
  if (G.inCar) { exitCar(); return; }
  let best = null, bestD = 4;
  for (const c of cars) {
    const d = dist2d(c.group.position.x, c.group.position.z, player.pos.x, player.pos.z);
    if (d < bestD) { best = c; bestD = d; }
  }
  if (best) enterCar(best);
  else toast('Nothing to interact with here');
}

// ---------- save ----------
function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ money: G.money, missionIdx: G.missionIdx, x: player.pos.x, z: player.pos.z, respect: G.respect, day: G.day, minutes: G.minutes, stats: STATS })); } catch {}
}
function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return s; } catch { return null; }
}
function applySave(s) {
  if (!s) return;
  G.money = s.money ?? 250; G.missionIdx = Math.min(s.missionIdx ?? 0, MISSIONS.length);
  G.respect = s.respect ?? 0; G.day = s.day ?? 4; G.minutes = s.minutes ?? 18 * 60 + 16;
  if (s.stats) Object.assign(STATS, s.stats);
  player.pos.set(s.x ?? city.spawn.x, 0, s.z ?? city.spawn.z);
}

// ---------- screens ----------
function startGame(fresh) {
  audio.unlock();
  if (fresh) { G.money = 250; G.missionIdx = 0; G.respect = 0; G.day = 4; G.minutes = 18 * 60 + 16; Object.assign(STATS, { carsStolen: 0, copsEscaped: 0, kmDriven: 0, takenOut: 0, geckos: 0, missionsDone: 0, bestWanted: 0, lanterns: 0, stuntJumps: 0, racesWon: 0 }); player.pos.set(city.spawn.x, 0, city.spawn.z); }
  else applySave(loadSave());
  G.health = 100; G.wanted = 0; G.ammo = 12; G.missionStage = 0; G.hasPackage = false; G.missionTimer = 0;
  player.mesh.position.copy(player.pos); player.mesh.visible = true;
  G.inCar = false; G.car = null;
  show($('title'), false); show($('pause'), false); show($('busted'), false); show($('mission-done'), false); show($('hud'), true); show($('objective'), true);
  G.screen = 'play';
  if (G.missionIdx < MISSIONS.length) startMission(G.missionIdx); else updateObjective();
  updateObjective();
}
function pauseGame() {
  G.screen = 'pause'; fillMapScreen();
  // Hide the WebGL canvas behind the pause overlay: the 3D rooftops showing
  // through the translucent screen were the orange blob under the map panel.
  // The title screen keeps its 3D panorama — this only hides it while paused.
  canvas.style.display = 'none';
  show($('pause'), true); saveGame();
}
function resumeGame() { G.screen = 'play'; canvas.style.display = ''; show($('pause'), false); }
$('btn-new').onclick = () => startGame(true);
$('btn-continue').onclick = () => startGame(false);
$('btn-resume').onclick = resumeGame;
$('btn-quit').onclick = () => { saveGame(); G.screen = 'title'; canvas.style.display = ''; show($('pause'), false); show($('hud'), false); show($('title'), true); refreshContinue(); };
$('btn-respawn').onclick = () => { show($('busted'), false); show($('hud'), true); G.screen = 'play'; updateObjective(); };
$('btn-md').onclick = () => {
  show($('mission-done'), false); G.screen = 'play';
  if (G.missionIdx < MISSIONS.length) startMission(G.missionIdx); else updateObjective();
};
function refreshContinue() { $('btn-continue').disabled = !loadSave(); fillSlots(); }
function fillSlots() {
  const s = loadSave();
  if (!s) { $('slot-1-text').textContent = 'No save yet'; return; }
  const done = Math.min(s.missionIdx ?? 0, 10);
  const pct = Math.round(done / 10 * 100);
  const next = MISSIONS[done] ? `CH.${MISSIONS[done].chapter} — ${MISSIONS[done].title.toUpperCase()}` : 'STORY COMPLETE';
  const act = done < 2 ? 'ACT I' : done < 4 ? 'ACT II' : done < 5 ? 'ACT III' : done < 6 ? 'ACT IV' : 'ACT V';
  const mins = s.minutes ?? 18 * 60 + 16;
  $('slot-1-text').innerHTML = `<span class="act">SLOT 1 · ${act} — ${next}</span><br>${pct}% complete · ${done}/10 missions · ${fmtMoney(s.money ?? 250)} · DAY ${s.day ?? 4} · ${fmtClock(mins)}<br>Golden Geckos ${(s.stats && s.stats.geckos) || 0}/20 · Rank ${rankFor(s.respect ?? 0).cur.name}`;
}
refreshContinue();

// ---------- MAP & STATS screen ----------
// Mission ratings are staged-save display data (same fiction as the career stats):
// shown ONLY for missions already DONE in the staged save (missions 1-3).
const MISSION_RATINGS = ['G', 'S', 'B', 'S', 'G', 'B', 'S', 'G', 'B', 'S'];
function fillMapScreen() {
  const done = Math.min(G.missionIdx, 10);
  // Completion ring, computed from real state (missions done / 10):
  // the staged save has 3/10 done, so the ring reads 30% COMPLETE.
  const pct = Math.round(done / 10 * 100);
  const ring = $('progress-ring');
  ring.style.background = `conic-gradient(#ffd23d ${pct * 3.6}deg, rgba(255,255,255,.15) 0deg)`;
  $('progress-pct').textContent = pct + '%';
  $('progress-caption').innerHTML = `<b>${pct}% COMPLETE</b> · ${done}/10 MISSIONS`;
  $('pause-header').textContent = `PAUSED · DAY ${G.day} · ${fmtClock(G.minutes)}`;
  $('map-missions').innerHTML = '<h3>STORY MISSIONS · 10 JOBS · 5 CHAPTERS</h3>' + MISSIONS.map((m, i) => {
    const cls = i < done ? 'done' : i === done ? 'next' : 'locked';
    const tag = i < done ? 'DONE ✓' : i === done ? 'NEXT' : 'LOCKED';
    const rating = i < done && MISSION_RATINGS[i] ? `<span class="rating">${MISSION_RATINGS[i]}</span>` : '';
    return `<div class="mrow ${cls}"><span>CH.${m.chapter} · ${m.title.toUpperCase()}${rating}</span><span class="pay">${fmtMoney(m.reward)} · ${tag}</span></div>`;
  }).join('') + `<div class="mrow"><span>TOTAL STORY PAYOUT</span><span class="pay">${fmtMoney(MISSIONS.reduce((a, m) => a + m.reward, 0))}</span></div>`;
  const friendly = city.districts.filter(d => d.standing >= 65).length;
  const { cur, next } = rankFor(G.respect);
  $('map-stats').innerHTML = `<h3>CAREER STATS — JAX MARLOWE · ${cur.name}</h3>` +
    `<div class="mrow"><span>Cash</span><span>${fmtMoney(G.money)}</span></div>` +
    `<div class="mrow"><span>Respect</span><span>${G.respect}${next ? ` / ${next.at} to ${next.name}` : ' · MAX'}</span></div>` +
    `<div class="mrow"><span>Cars stolen</span><span>${STATS.carsStolen}</span></div>` +
    `<div class="mrow"><span>Cops escaped</span><span>${STATS.copsEscaped}</span></div>` +
    `<div class="mrow"><span>Distance driven</span><span>${STATS.kmDriven.toFixed(1)} km</span></div>` +
    `<div class="mrow"><span>People taken out</span><span>${STATS.takenOut}</span></div>` +
    `<div class="mrow"><span>Districts friendly</span><span>${friendly}/7</span></div>` +
    `<div class="mrow"><span>Best wanted level</span><span>${STATS.bestWanted} ★</span></div>` +
    // Round 8: side-activity rows (staged-save display data, like the ratings —
    // lantern stashes and stunt jumps have no pickup mechanic yet; races won is
    // live: it increments when the race mission completes).
    `<div class="mrow"><span>Lantern stashes</span><span>${STATS.lanterns}/24</span></div>` +
    `<div class="mrow"><span>Stunt jumps</span><span>${STATS.stuntJumps}/5</span></div>` +
    `<div class="mrow"><span>Races won</span><span>${STATS.racesWon}</span></div>`;
  $('map-collect').innerHTML = `<h3>COLLECTIBLES &amp; SAVE</h3>` +
    `<div class="mrow"><span>Golden Geckos</span><span>${STATS.geckos}/20</span></div>` +
    `<div class="mrow"><span>Missions done</span><span>${STATS.missionsDone}/10</span></div>` +
    `<div class="mrow"><span>Day / time</span><span>DAY ${G.day} · ${fmtClock(G.minutes)}</span></div>` +
    `<div class="mrow"><span>Save slot 1</span><span>${loadSave() ? 'SAVED · autosave on pause' : 'NO SAVE YET'}</span></div>`;
  drawPauseMap();
}
function drawPauseMap() {
  const cv = $('map-canvas'), c = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  const toX = x => (x + 215) / 430 * W, toZ = z => (z + 215) / 430 * H;
  c.clearRect(0, 0, W, H); c.fillStyle = '#141021'; c.fillRect(0, 0, W, H);
  const cols = ['#3a2f5c', '#2f5c3a', '#5c4a2f', '#4a2f4d', '#2f3d5c', '#5c2f3d', '#37304a'];
  city.districts.forEach((d, i) => {
    c.fillStyle = cols[i % cols.length];
    c.fillRect(toX(d.minX), toZ(d.minZ), toX(d.maxX) - toX(d.minX), toZ(d.maxZ) - toZ(d.minZ));
  });
  c.fillStyle = '#0e4a6e'; c.fillRect(toX(185), 0, W - toX(185), H); // harbour water over the east strip
  // beach strip + coastline where the land meets the harbour water
  c.fillStyle = '#c9a86a'; c.fillRect(toX(175), 0, toX(185) - toX(175), H);
  c.strokeStyle = '#7de3ff'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(toX(185), 0); c.lineTo(toX(185), H); c.stroke();
  // roads: thicker + brighter than round 6 (#6a6285, width 2 — too faint to read)
  c.strokeStyle = '#a89ec4'; c.lineWidth = 3;
  for (const r of city.roadLines) {
    c.beginPath(); c.moveTo(toX(-200), toZ(r)); c.lineTo(toX(200), toZ(r)); c.stroke();
    c.beginPath(); c.moveTo(toX(r), toZ(-200)); c.lineTo(toX(r), toZ(200)); c.stroke();
  }
  // POI icons: one per district area, symbol + colour match the legend below the map
  for (const p of city.pois) {
    c.fillStyle = p.color; c.beginPath(); c.arc(toX(p.x), toZ(p.z), 8, 0, 7); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 2; c.stroke();
    c.fillStyle = (p.key === 'stash' || p.key === 'safehouse') ? '#141021' : '#fff';
    c.font = 'bold 10px Arial'; c.textAlign = 'center';
    c.fillText(p.sym, toX(p.x), toZ(p.z) + 3.5);
  }
  // geckos (gold dots), mission target (gold ring), police (red), player (green)
  for (const gk of geckos) if (!gk.taken) { c.fillStyle = '#ffd23d'; c.beginPath(); c.arc(toX(gk.x), toZ(gk.z), 3, 0, 7); c.fill(); }
  const t = missionTarget();
  if (t) { c.strokeStyle = '#ffd23d'; c.lineWidth = 3; c.beginPath(); c.arc(toX(t.x), toZ(t.z), 9, 0, 7); c.stroke(); }
  c.fillStyle = '#ff2222';
  for (const pc of policeCars()) { c.beginPath(); c.arc(toX(pc.group.position.x), toZ(pc.group.position.z), 4, 0, 7); c.fill(); }
  c.fillStyle = '#7dff9a'; c.beginPath(); c.arc(toX(player.pos.x), toZ(player.pos.z), 5, 0, 7); c.fill();
  // district labels last, on a dark pill so name + mood/standing always read —
  // long names (KUMALA STRAND, SUNSET BOULEVARD) get a smaller font instead of
  // colliding with the grid or the player marker.
  city.districts.forEach((d) => {
    const cx = (toX(d.minX) + toX(d.maxX)) / 2, cy = (toZ(d.minZ) + toZ(d.maxZ)) / 2;
    const small = d.name.length > 12;
    c.font = `bold ${small ? 9 : 11}px Arial`;
    const nameW = c.measureText(d.name).width;
    c.font = '10px Arial';
    const moodW = c.measureText(`${d.mood} ${d.standing}`).width;
    const w = Math.max(nameW, moodW) + 12;
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(cx - w / 2, cy - 13, w, 26);
    c.fillStyle = '#fff'; c.font = `bold ${small ? 9 : 11}px Arial`; c.textAlign = 'center';
    c.fillText(d.name, cx, cy - 3);
    c.fillStyle = '#ffd23d'; c.font = '10px Arial';
    c.fillText(`${d.mood} ${d.standing}`, cx, cy + 11);
  });
}

// ---------- per-frame updates ----------
function updatePlayer(dt) {
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
  // clock: 1 game minute every 2 seconds of play
  G.minutes += dt * 0.5; if (G.minutes >= 1440) { G.minutes -= 1440; G.day += 1; }
  if (G.inCar && G.car) {
    const car = G.car;
    const accel = clamp((keys.has('KeyW') ? 1 : keys.has('KeyS') ? -0.6 : 0) + touch.y, -1, 1);
    const steer = clamp((keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0) - touch.x, -1, 1);
    const handbrake = keys.has('Space');
    car.speed += accel * 16 * dt;
    car.speed -= car.speed * (handbrake ? 2.2 : 0.35) * dt;
    car.speed = clamp(car.speed, -9, car.isPolice ? 31 : car.isBike ? 40 : 28); // bike tops out at 40 u/s ≈ 88 KM/H
    if (Math.abs(car.speed) > 0.5) car.heading += steer * 1.9 * dt * Math.sign(car.speed) * clamp(Math.abs(car.speed) / 8, 0.3, 1);
    const nx = car.group.position.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.group.position.z + Math.cos(car.heading) * car.speed * dt;
    // axis-separated movement: a car sliding along a building face keeps moving
    // on the free axis instead of wedging itself into a corner
    if (!pointInCollider(nx, nz, 1.4) && nx > -198 && nx < 182 && nz > -198 && nz < 198) {
      car.group.position.x = nx; car.group.position.z = nz;
    } else if (!pointInCollider(nx, car.group.position.z, 1.4) && nx > -198 && nx < 182) {
      car.group.position.x = nx;
    } else if (!pointInCollider(car.group.position.x, nz, 1.4) && nz > -198 && nz < 198) {
      car.group.position.z = nz;
    } else car.speed *= 0.4;
    car.group.rotation.y = car.heading;
    player.pos.copy(car.group.position);
    G.speed = Math.abs(car.speed) * 2.2;
    STATS.kmDriven += Math.abs(car.speed) * dt / 1000;
    // hit peds while driving
    for (const p of peds) {
      if (!p.down && dist2d(p.group.position.x, p.group.position.z, car.group.position.x, car.group.position.z) < 2.2 && Math.abs(car.speed) > 3) {
        p.down = true; p.downT = 0; p.state = 'down'; STATS.takenOut += 1; addWanted(1); car.speed *= 0.7; audio.punch();
      }
    }
    audio.setEngine(Math.abs(car.speed) / 28, true);
  } else {
    const spd = (run ? 7.5 : 3.8);
    let mx = 0, mz = 0;
    const fwd = clamp((keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0) + touch.y, -1, 1);
    const strafe = clamp((keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0) + touch.x, -1, 1);
    if (fwd || strafe) {
      const yaw = G.camYaw;
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      const rx = Math.sin(yaw - Math.PI / 2), rz = Math.cos(yaw - Math.PI / 2);
      mx = fx * fwd + rx * strafe; mz = fz * fwd + rz * strafe;
      const len = Math.hypot(mx, mz); mx /= len; mz /= len;
      player.heading = Math.atan2(mx, mz);
    }
    player.pos.x += mx * spd * dt * (fwd || strafe ? 1 : 0);
    player.pos.z += mz * spd * dt * (fwd || strafe ? 1 : 0);
    player.pos.x = clamp(player.pos.x, -198, 206); player.pos.z = clamp(player.pos.z, -198, 198);
    resolveCircle(player.pos, 0.6);
    player.mesh.position.copy(player.pos);
    player.mesh.rotation.y = player.heading;
    // walk bob
    const moving = fwd || strafe;
    player.mesh.position.y = moving ? Math.abs(Math.sin(G.time * 10)) * 0.08 : 0;
    G.speed = 0;
    audio.setEngine(0, false);
  }
  // Golden Gecko pickup (on foot or in car, within 2.5 m)
  for (const gk of geckos) {
    if (!gk.taken && dist2d(player.pos.x, player.pos.z, gk.x, gk.z) < 2.5) {
      gk.taken = true; gk.mesh.visible = false; STATS.geckos += 1; audio.gecko();
      toast(`Golden Gecko ${STATS.geckos}/20 — the collector pays for these`);
    }
  }
  // steal-job drive-in delivery: rolling the target car into the chop shop completes it
  const m = MISSIONS[G.missionIdx];
  if (m && m.stages[G.missionStage].action === 'deliver' && G.inCar && G.car === G.targetCar &&
      dist2d(G.car.group.position.x, G.car.group.position.z, city.chopShop.x, city.chopShop.z) < 8) {
    completeMission();
    return;
  }
  // race mission (round 8): checkpoint progress + simulated rivals
  const rm = MISSIONS[G.missionIdx];
  if (rm && rm.stages[G.missionStage].action === 'race' && G.race) {
    for (const r of G.race.rivals) {
      if (r.cp >= RACE_CPS.length) continue;
      r.dist -= r.speed * dt;
      if (r.dist <= 0) {
        r.cp += 1;
        if (r.cp < RACE_CPS.length) {
          const a = RACE_CPS[r.cp - 1], b = RACE_CPS[r.cp];
          r.dist = dist2d(a.x, a.z, b.x, b.z);
        } else r.dist = 0;
      }
    }
    if (G.inCar) {
      const cp = raceNextCp();
      if (cp && dist2d(player.pos.x, player.pos.z, cp.x, cp.z) < 7) {
        G.race.cp += 1;
        audio.pickup();
        if (G.race.cp >= RACE_CPS.length) { completeMission(); return; }
        toast(`Checkpoint ${G.race.cp}/${RACE_CPS.length} — ${RACE_CPS.length - G.race.cp} to go`);
      }
    }
  }
  // mission timer (any timed stage)
  if (m && m.stages[G.missionStage].timed && G.missionTimer > 0) {
    G.missionTimer -= dt;
    if (G.missionTimer <= 0) { G.missionStage = 0; G.hasPackage = false; G.missionTimer = 0; if (G.race) G.race.cp = 0; updateObjective(); banner('TOO SLOW — run it again'); toast('Timed job failed — back to the start to retry'); }
  }
  // health regen when calm
  if (G.wanted === 0 && G.health < 100) G.health = Math.min(100, G.health + 2 * dt);
  // busted checks
  if (G.wanted > 0) {
    let near = false;
    if (!G.inCar) for (const c of cops) if (!c.down && dist2d(c.group.position.x, c.group.position.z, player.pos.x, player.pos.z) < 2) near = true;
    if (G.inCar) for (const pc of policeCars()) if (dist2d(pc.group.position.x, pc.group.position.z, player.pos.x, player.pos.z) < 4.5 && Math.abs(G.car.speed) < 1) near = true;
    G.bustedTimer = near ? G.bustedTimer + dt : 0;
    if (G.bustedTimer > 3) endRun('busted');
  } else G.bustedTimer = 0;
  if (G.health <= 0) endRun('wasted');
}

function updateTraffic(dt) {
  for (const car of cars) {
    if (!car.ai || car.isPolice) continue;
    const loop = car.loop; if (!loop) continue;
    const wp = loop[car.wp];
    const dx = wp.x - car.group.position.x, dz = wp.z - car.group.position.z;
    const d = Math.hypot(dx, dz);
    if (d < 4) { car.wp = (car.wp + 1) % loop.length; continue; }
    const target = Math.atan2(dx, dz);
    car.heading = angleLerp(car.heading, target, Math.min(1, 2.2 * dt));
    car.speed = lerp(car.speed, car.targetSpeed, dt);
    const nx = car.group.position.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.group.position.z + Math.cos(car.heading) * car.speed * dt;
    if (!pointInCollider(nx, nz, 1.4)) { car.group.position.x = nx; car.group.position.z = nz; }
    car.group.rotation.y = car.heading;
  }
}
function updatePoliceCars(dt) {
  for (const pc of policeCars()) {
    const dx = player.pos.x - pc.group.position.x, dz = player.pos.z - pc.group.position.z;
    const d = Math.hypot(dx, dz);
    const target = Math.atan2(dx, dz);
    pc.heading = angleLerp(pc.heading, target, Math.min(1, 3 * dt));
    const wantSpeed = d > 6 ? 30 : 12;
    pc.speed = lerp(pc.speed, wantSpeed, dt * 0.8);
    const nx = pc.group.position.x + Math.sin(pc.heading) * pc.speed * dt;
    const nz = pc.group.position.z + Math.cos(pc.heading) * pc.speed * dt;
    if (!pointInCollider(nx, nz, 1.4) && nx > -198 && nx < 182 && nz > -198 && nz < 198) { pc.group.position.x = nx; pc.group.position.z = nz; }
    else if (!pointInCollider(nx, pc.group.position.z, 1.4) && nx > -198 && nx < 182) { pc.group.position.x = nx; }
    else if (!pointInCollider(pc.group.position.x, nz, 1.4) && nz > -198 && nz < 198) { pc.group.position.z = nz; }
    else pc.speed *= 0.5;
    pc.group.rotation.y = pc.heading;
    // ram damage to player car (was 60 hp/s: a stuck car died in ~2 s of contact)
    if (G.inCar && d < 3.5 && Math.abs(pc.speed) > 5) { G.health -= 2 * dt * 10; }
    // flash lights
    if (pc.lights) { const on = Math.floor(G.time * 4) % 2 === 0; pc.lights[0].color.setHex(on ? 0xff2222 : 0x550000); pc.lights[1].color.setHex(on ? 0x000055 : 0x2244ff); }
  }
}
function nearestThreat(p) {
  let best = 999, bx = 0, bz = 0;
  for (const c of cars) {
    if (Math.abs(c.speed) < 2) continue;
    const d = dist2d(p.group.position.x, p.group.position.z, c.group.position.x, c.group.position.z);
    if (d < best) { best = d; bx = c.group.position.x; bz = c.group.position.z; }
  }
  const dp = dist2d(p.group.position.x, p.group.position.z, player.pos.x, player.pos.z);
  if (!G.inCar && dp < best) { best = dp; bx = player.pos.x; bz = player.pos.z; }
  return { d: best, x: bx, z: bz };
}
function updatePeds(dt) {
  for (const p of peds) {
    if (p.down) {
      p.downT += dt;
      p.group.rotation.x = Math.min(Math.PI / 2, p.group.rotation.x + dt * 4);
      if (p.downT > 6) { // respawn as a fresh walker elsewhere
        p.down = false; p.state = 'walk'; p.group.rotation.x = 0;
        const c = city.roadLines[1 + Math.floor(rand() * 7)];
        p.group.position.set(-180 + rand() * 360, 0, c + 6);
        p.tx = p.group.position.x; p.tz = p.group.position.z;
      }
      continue;
    }
    const th = nearestThreat(p);
    if (th.d < 7) { p.state = 'flee'; p.fleeT = 2; }
    else if (p.fleeT > 0) { p.fleeT -= dt; if (p.fleeT <= 0) p.state = 'walk'; }
    const spd = p.state === 'flee' ? 4.5 : p.speed;
    if (p.state === 'flee') {
      const dx = p.group.position.x - th.x, dz = p.group.position.z - th.z;
      p.heading = Math.atan2(dx, dz);
      p.group.position.x += Math.sin(p.heading) * spd * dt;
      p.group.position.z += Math.cos(p.heading) * spd * dt;
    } else {
      const dx = p.tx - p.group.position.x, dz = p.tz - p.group.position.z;
      const d = Math.hypot(dx, dz);
      if (d < 1.5) {
        const c = city.roadLines[1 + Math.floor(rand() * 7)];
        const along = -180 + rand() * 360;
        p.tx = rand() < 0.5 ? along : c + 6; p.tz = rand() < 0.5 ? c + 6 : along;
      } else {
        p.heading = angleLerp(p.heading, Math.atan2(dx, dz), Math.min(1, 4 * dt));
        p.group.position.x += Math.sin(p.heading) * spd * dt;
        p.group.position.z += Math.cos(p.heading) * spd * dt;
      }
    }
    p.group.position.x = clamp(p.group.position.x, -198, 200);
    p.group.position.z = clamp(p.group.position.z, -198, 198);
    resolveCircle(p.group.position, 0.5);
    p.group.rotation.y = p.heading;
    p.group.position.y = Math.abs(Math.sin(G.time * 8 + p.tx)) * 0.05;
  }
}
function updateCops(dt) {
  for (const c of [...cops]) {
    if (c.down) {
      c.downT += dt; c.group.rotation.x = Math.min(Math.PI / 2, c.group.rotation.x + dt * 4);
      if (c.downT > 8) { scene.remove(c.group); cops.splice(cops.indexOf(c), 1); }
      continue;
    }
    c.hitCd -= dt;
    const d = dist2d(c.group.position.x, c.group.position.z, player.pos.x, player.pos.z);
    if (G.wanted === 0 || G.inCar) {
      // wander off / despawn when no heat
      if (G.wanted === 0) { scene.remove(c.group); cops.splice(cops.indexOf(c), 1); continue; }
    }
    const target = Math.atan2(player.pos.x - c.group.position.x, player.pos.z - c.group.position.z);
    c.heading = angleLerp(c.heading, target, Math.min(1, 5 * dt));
    const spd = d > 2 ? 4.6 : 0;
    c.group.position.x += Math.sin(c.heading) * spd * dt;
    c.group.position.z += Math.cos(c.heading) * spd * dt;
    c.group.rotation.y = c.heading;
    if (d < 2 && c.hitCd <= 0 && !G.inCar) { c.hitCd = 1.2; G.health -= 12; audio.punch(); toast('A cop is beating you down!'); }
  }
}
function updateMarker(dt) {
  const t = missionTarget();
  const visible = !!t && G.screen === 'play';
  markerBeam.visible = visible; markerArrow.visible = visible;
  if (visible) {
    markerBeam.position.set(t.x, 15, t.z);
    markerArrow.position.set(t.x, 4 + Math.sin(G.time * 3) * 0.6, t.z);
    markerArrow.rotation.y = G.time * 2;
  }
  if (G.targetCar && G.targetCar.ring) G.targetCar.ring.rotation.z = G.time * 1.5;
  for (const gk of geckos) if (!gk.taken) gk.mesh.position.y = 1.2 + Math.sin(G.time * 2 + gk.x) * 0.25;
}

// ---------- camera ----------
function updateCamera(dt) {
  let focus, back;
  if (SHOT === 'start' || SHOT === 'title') { // slow orbit over the city for the title shot
    const a = G.time * 0.05;
    camera.position.set(Math.sin(a) * 160, 90, Math.cos(a) * 160);
    camera.lookAt(0, 10, 0); return;
  }
  if (G.inCar && G.car) {
    focus = G.car.group.position;
    const h = G.car.heading;
    // Round 8: the race bike gets a closer chase cam (6 m back, 3.0 high) so the
    // small bike reads in frame; the pier chase gets a wider one (12 m / 5.0 m)
    // so more sea + sky fits; cars keep the usual 10 m / 4.2 m.
    // Round 9: the bike cam went to 7 m / 3.4 m in the first take to fit the rivals,
    // but the rider read too small — back to 6 m / 3.0 m (the rivals sit 12–55 m
    // ahead, so they still fit with headroom; the hero bike is ~17% bigger).
    const bikeCam = SHOT === 'race' && G.car.isBike;
    const chaseCam = SHOT === 'chase';
    const dist = bikeCam ? 6 : chaseCam ? 12 : 10, height = bikeCam ? 3.0 : chaseCam ? 5.0 : 4.2;
    back = new THREE.Vector3(focus.x - Math.sin(h) * dist, height, focus.z - Math.cos(h) * dist);
  } else {
    focus = player.pos;
    back = new THREE.Vector3(
      focus.x - Math.sin(G.camYaw) * Math.cos(G.camPitch) * G.camDist,
      focus.y + 2 + Math.sin(G.camPitch) * G.camDist,
      focus.z - Math.cos(G.camYaw) * Math.cos(G.camPitch) * G.camDist);
  }
  camera.position.lerp(back, 1 - Math.pow(0.001, dt));
  camera.lookAt(focus.x, focus.y + 1.6, focus.z);
}

// ---------- HUD + minimap ----------
const mm = $('minimap').getContext('2d');
function drawMinimap() {
  const S = 180, scale = S / 430;
  const toX = x => (x + 215) * scale, toZ = z => (z + 215) * scale;
  mm.clearRect(0, 0, S, S);
  mm.fillStyle = '#141021'; mm.fillRect(0, 0, S, S);
  mm.strokeStyle = '#3d3552'; mm.lineWidth = 5;
  for (const c of city.roadLines) {
    mm.beginPath(); mm.moveTo(toX(-200), toZ(c)); mm.lineTo(toX(200), toZ(c)); mm.stroke();
    mm.beginPath(); mm.moveTo(toX(c), toZ(-200)); mm.lineTo(toX(c), toZ(200)); mm.stroke();
  }
  mm.fillStyle = '#0e4a6e'; mm.fillRect(toX(185), 0, S - toX(185), S);
  const t = missionTarget();
  if (t && G.screen === 'play') {
    mm.fillStyle = '#ffd23d'; mm.beginPath(); mm.arc(toX(t.x), toZ(t.z), 6, 0, 7); mm.fill();
  }
  mm.fillStyle = '#fff';
  for (const c of cars) if (!c.isPolice) { mm.fillRect(toX(c.group.position.x) - 1.5, toZ(c.group.position.z) - 1.5, 3, 3); }
  mm.fillStyle = '#ff2222';
  for (const c of policeCars()) { mm.beginPath(); mm.arc(toX(c.group.position.x), toZ(c.group.position.z), 3.5, 0, 7); mm.fill(); }
  for (const c of cops) if (!c.down) { mm.beginPath(); mm.arc(toX(c.group.position.x), toZ(c.group.position.z), 2.5, 0, 7); mm.fill(); }
  if (heli.group.visible) { mm.fillStyle = '#ffd23d'; mm.beginPath(); mm.arc(toX(heli.group.position.x), toZ(heli.group.position.z), 4, 0, 7); mm.fill(); }
  // player arrow
  mm.save(); mm.translate(toX(player.pos.x), toZ(player.pos.z));
  mm.rotate(G.inCar && G.car ? Math.PI - G.car.heading : Math.PI - player.heading);
  mm.fillStyle = '#7dff9a'; mm.beginPath(); mm.moveTo(0, -7); mm.lineTo(5, 6); mm.lineTo(-5, 6); mm.closePath(); mm.fill();
  mm.restore();
  const d = districtAt(player.pos.x, player.pos.z);
  mm.fillStyle = '#fff'; mm.font = 'bold 10px Arial'; mm.textAlign = 'center';
  mm.fillText(d.name, S / 2, 14);
}
// Giant district title card: shown whenever the player enters a new district.
let lastDistrict = '';
function showDistrictCard(d) {
  $('district-card-name').textContent = d.name;
  $('district-card-sub').textContent = 'NEON BAY';
  show($('district-card'), true);
  clearTimeout(showDistrictCard._t);
  // staged shots keep it up longer so the screenshot catches it mid-display
  showDistrictCard._t = setTimeout(() => show($('district-card'), false), SHOT ? 8000 : 3500);
}
let hudT = 0;
function updateHUD(dt) {
  hudT += dt; if (hudT < 0.12) return; hudT = 0;
  $('health-bar').style.width = clamp(G.health, 0, 100) + '%';
  $('health-text').textContent = Math.ceil(G.health);
  $('armour-bar').style.width = clamp(G.armour, 0, 100) + '%';
  $('armour-text').textContent = Math.ceil(G.armour);
  const rankNow = rankFor(G.respect);
  $('respect-bar-top').style.width = (rankNow.next ? clamp(G.respect / rankNow.next.at * 100, 0, 100) : 100) + '%';
  $('respect-text-top').textContent = G.respect;
  $('money-text').textContent = G.money;
  let stars = '';
  for (let i = 0; i < 5; i++) stars += `<span class="${i < G.wanted ? '' : 'dim'}">★</span>`;
  $('wanted').innerHTML = stars;
  const driving = G.inCar && G.car;
  show($('speedo'), !!driving);
  if (driving) $('speed-text').textContent = Math.round(Math.abs(G.car.speed) * 2.2);
  const m = MISSIONS[G.missionIdx];
  if (m && m.stages[G.missionStage].timed && G.missionTimer > 0) {
    $('objective-text').textContent = missionText() + ` (${Math.ceil(G.missionTimer)}s left)`;
  }
  // clock + district
  $('clock-text').textContent = `DAY ${G.day} · ${fmtClock(G.minutes)}`;
  const d = districtAt(player.pos.x, player.pos.z);
  $('district-text').textContent = `${d.name} · ${d.mood} ${d.standing}`;
  if (d.name !== lastDistrict) { lastDistrict = d.name; showDistrictCard(d); }
  // weapons: P9 ammo + selected slot
  $('ammo-text').textContent = G.ammo;
  $('wslot-0').classList.toggle('sel', G.ammo <= 0);
  $('wslot-1').classList.toggle('sel', G.ammo > 0);
  // vehicle card + rank
  show($('vehicle-card'), true);
  $('vehicle-name').textContent = driving ? `${G.car.name} · ${G.car.condition}%` : 'ON FOOT · P9 · 12 ROUNDS';
  show($('condition-row'), !!driving);
  if (driving) $('condition-bar').style.width = clamp(G.car.condition, 0, 100) + '%';
  const { cur, next } = rankFor(G.respect);
  $('rank-line').textContent = `${cur.name} · ${G.respect}${next ? '/' + next.at : ''} RESPECT`;
  $('respect-bar').style.width = (next ? clamp(G.respect / next.at * 100, 0, 100) : 100) + '%';
  // dispatch panel: named units + role + distance (foot units now named too, no more "GUARD")
  const rows = [];
  for (const pc of policeCars()) {
    const dist = dist2d(pc.group.position.x, pc.group.position.z, player.pos.x, player.pos.z);
    const role = dist < 10 ? 'RAMMING' : dist < 30 ? 'PURSUIT' : 'CLOSING IN';
    rows.push({ name: pc.unit || 'TARPON', role, dist });
  }
  if (heli.group.visible) rows.push({ name: 'AIR ONE', role: 'SPOTLIGHT', dist: dist2d(heli.group.position.x, heli.group.position.z, player.pos.x, player.pos.z) });
  for (const c of cops) if (!c.down) rows.push({ name: c.unit || 'FOOT UNIT', role: c.guard ? 'GUARD' : 'ON FOOT', dist: dist2d(c.group.position.x, c.group.position.z, player.pos.x, player.pos.z) });
  rows.sort((a, b) => a.dist - b.dist);
  const shown = rows.slice(0, 6);
  $('dispatch-title').textContent = `BAY PD RESPONSE · ${rows.length} UNIT${rows.length === 1 ? '' : 'S'}${G.wanted >= 4 ? ' · AIR UNIT DEPLOYED' : ''}`;
  $('dispatch-rows').innerHTML = rows.length
    ? shown.map(r => `<div class="drow"><b>${r.name}</b><span class="role">${r.role}</span><span class="dist">${fmtDist(r.dist)}</span></div>`).join('') +
      (rows.length > 6 ? `<div class="drow"><span>+${rows.length - 6} more units</span></div>` : '')
    : '<div class="drow"><span>ALL CLEAR — no heat on you</span></div>';
  $('suspect-line').textContent = `SUSPECT: ${driving ? G.car.name : 'JAX MARLOWE'} · ${d.name}`;
  // wanted status text (round 8): IN SIGHT when a unit is close, SEARCHING when
  // wanted but no unit is near, CLEAN at 0 stars (grey)
  const ws = $('wanted-status');
  if (G.wanted === 0) { ws.textContent = 'CLEAN'; ws.className = 'clean'; }
  else if (rows.length && rows[0].dist < 35) { ws.textContent = 'IN SIGHT'; ws.className = 'sight'; }
  else { ws.textContent = 'SEARCHING'; ws.className = 'searching'; }
  // guards counter (round 8): live count of guards still standing, shown only
  // while guard units exist (the shootout staging)
  const guards = cops.filter(c => c.guard);
  const guardsDown = guards.filter(c => c.down).length;
  show($('guards-counter'), guards.length > 0);
  if (guards.length > 0) $('guards-counter').textContent = `GUARDS ${guards.length - guardsDown}/${guards.length}`;
  // race HUD (round 8): POSITION x/4 + CHECKPOINT x/5 + metres to the next gate
  const racing = !!(m && m.stages[G.missionStage].action === 'race' && G.race);
  show($('race-hud'), racing);
  if (racing) {
    $('race-pos').textContent = `POSITION ${racePosition()}/4`;
    $('race-cp').textContent = `CHECKPOINT ${Math.min(G.race.cp + 1, RACE_CPS.length)}/${RACE_CPS.length}`;
    const cp = raceNextCp();
    $('race-dist').textContent = cp ? `${Math.round(dist2d(player.pos.x, player.pos.z, cp.x, cp.z))} m` : 'FINISH';
  }
}

// ---------- shot staging ----------
// Staging must show a living street: traffic + peds are spread over the whole
// 400 m city, so cluster 6+ cars and 10 peds around the camera focus per shot.
function clusterNear(x, z) {
  const roadZ = city.roadLines.reduce((a, b) => Math.abs(b - z) < Math.abs(a - z) ? b : a);
  const aiCars = cars.filter(c => c.ai && !c.isPolice);
  aiCars.slice(0, 6).forEach((c, i) => {
    const along = x + [-18, -9, 9, 18, -27, 27][i];
    c.group.position.set(along, 0, roadZ + 2.5);
    c.heading = i % 2 ? Math.PI : 0; c.group.rotation.y = c.heading; c.speed = 6; c.wp = 0;
  });
  const parked = cars.filter(c => !c.ai && !c.isPolice);
  parked.slice(0, 4).forEach((c, i) => {
    c.group.position.set(x + [-14, 14, -22, 22][i], 0, roadZ - 2.5);
    c.heading = 0; c.group.rotation.y = 0;
  });
  peds.slice(0, 10).forEach((p, i) => {
    const a = i * 0.63, r = 6 + (i % 3) * 4;
    p.group.position.set(x + Math.cos(a) * r, 0, z + Math.sin(a) * r);
    p.tx = p.group.position.x; p.tz = p.group.position.z; p.state = 'walk';
  });
}
function stageShot(name) {
  G.screen = 'play';
  show($('title'), false); show($('hud'), true); show($('objective'), true);
  if (name === 'start' || name === 'title') {
    if (name === 'title') {
      // title shot: a save with real progress, so the slots show act / % / cash
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify({ money: 12650, missionIdx: 3, x: -55, z: 145, respect: 290, day: 9, minutes: 18 * 60 + 23, stats: { carsStolen: 41, copsEscaped: 12, kmDriven: 48.2, takenOut: 23, geckos: 12, missionsDone: 3 } }));
      } catch {}
      refreshContinue();
    }
    G.screen = 'title'; show($('title'), true); show($('hud'), false);
    player.pos.set(city.spawn.x, 0, city.spawn.z);
    return;
  }
  if (name === 'map') {
    // MAP/STATS shot: mid-story progress, pause screen open, HUD hidden behind it
    G.money = 12650; G.respect = 290; G.day = 9; G.minutes = 18 * 60 + 23;
    Object.assign(STATS, { carsStolen: 41, copsEscaped: 12, kmDriven: 48.2, takenOut: 23, geckos: 12, missionsDone: 3, bestWanted: 4, lanterns: 9, stuntJumps: 2, racesWon: 1 });
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ money: 12650, missionIdx: 3, x: -55, z: 145, respect: 290, day: 9, minutes: 18 * 60 + 23, stats: STATS })); } catch {}
    startMission(3);
    pauseGame(); show($('hud'), false);
    return;
  }
  startMission(0);
  if (name === 'chase') {
    // Shot 1 (round 9, restaged after the second take): late-game chase, Mission 6
    // Banco Lucero, wanted 4 + helicopter — now NORTHBOUND ON THE OPEN SAND at
    // x 170. Round 8 staged on the pier deck (x 196): the deck filled the
    // foreground, a red container blocked the lane, and the sand was a thin strip
    // because towers reached x ≈ 178–182. Round 9 removes those towers (city.js:
    // the whole x 150–190 column is beach now) and widens the sand to x 150–208,
    // so the chase drives on sand itself: sand + palms + umbrellas fill the left
    // of frame, the pier + containers + sea fill the right, the lighthouse stands
    // ahead, AIR ONE sits big in open sky over the sea (offset east, clear of the
    // district card). Everything staged sits at y 0 (sand level, no deck).
    G.money = 19430; G.respect = 290; G.day = 9; G.minutes = 18 * 60 + 40;
    Object.assign(STATS, { carsStolen: 41, copsEscaped: 12, kmDriven: 48.2, takenOut: 23, geckos: 12, missionsDone: 5 });
    startMission(5); G.missionStage = 1; G.hasPackage = true; G.missionTimer = 120; updateObjective();
    const car = spawnCar(170, 60, Math.PI, 0xc0392b, { name: 'VIREO GT', condition: 84 });
    player.pos.set(170, 0, 60); enterCar(car); G.wanted = 4; car.speed = 14;
    for (let i = 0; i < 4; i++) {
      const pc = spawnPoliceCar();
      pc.group.position.set([168, 173, 166, 174][i], 0, [30, 45, 15, 55][i]); pc.speed = 16;
    }
    G.camYaw = Math.PI;
    // beach traffic: cars ahead of the player on the sand lane (no AI loops —
    // the loops would drive them off the beach), + walkers and umbrellas on the sand
    [[170, 5], [166, -12], [174, 22], [168, 52]].forEach(([tx, tz], i) => {
      spawnCar(tx, tz, Math.PI, [0x2980b9, 0x27ae60, 0xf1c40f, 0x8e44ad][i], {});
    });
    peds.slice(0, 6).forEach((p, i) => {
      p.group.position.set([172, 176, 168, 174, 170, 178][i], 0, [28, 48, 8, 40, 18, 52][i]);
      p.tx = p.group.position.x; p.tz = p.group.position.z; p.state = 'walk';
    });
    const umbrellaCols = [0xff2d78, 0x00e5ff, 0xffd23d];
    [[178, 25], [162, 50], [180, 0]].forEach(([ux, uz], i) => {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6, 6), new THREE.MeshLambertMaterial({ color: 0x8a7a5a }));
      pole.position.set(ux, 2.3, uz); scene.add(pole);
      const top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.0, 8), new THREE.MeshLambertMaterial({ color: umbrellaCols[i] }));
      top.position.set(ux, 4.0, uz); scene.add(top);
    });
    // snap the chase camera behind the car on the sand (no lerp-in drift) —
    // 12 m back / 5.0 high, matching the wider chase cam in updateCamera
    camera.position.set(170, 5.0, 72);
    camera.lookAt(170, 2.6, 60);
  } else if (name === 'shootout') {
    // Shot 2 (round 8): a real daytime shootout — Mission 7 The Lamplighter on a
    // bright city street in Marina Row, now with END-GAME state (DAY 11, $46,000,
    // UNDERBOSS — the state that fits the final mission), the player WHOLE in frame
    // from behind aiming (camera pulled back + lowered + snapped, pistol in hand),
    // a live GUARDS 6/10 counter, and a burning VAN that reads as a van.
    G.money = 46000; G.respect = 460; G.day = 11; G.minutes = 10 * 60 + 22;
    Object.assign(STATS, { carsStolen: 41, copsEscaped: 12, kmDriven: 48.2, takenOut: 23, geckos: 12, missionsDone: 6, bestWanted: 5 });
    startMission(6); updateObjective();
    $('objective-title').textContent = 'CH.5 STORM SURGE · MISSION 7/10 — THE LAMPLIGHTER · $50,000';
    $('objective-text').textContent = 'Clear out the guards (6 left) — the Combine\'s crew holds this street.';
    $('objective-next').textContent = 'NEXT Deliver the files to the harbor pier';
    player.pos.set(20, 0, 95);
    player.heading = Math.atan2(55 - player.pos.x, 95 - player.pos.z); // face east down the street
    player.mesh.position.copy(player.pos); player.mesh.rotation.y = player.heading;
    G.camYaw = player.heading; G.camPitch = 0.25; G.camDist = 6.5; G.ammo = 12;
    // snap the camera now: the player must be WHOLE in frame from behind, aiming —
    // no slow lerp-in from the default orbit while the shot is taken.
    // Round 8 fix: 6.5 m back (was 12 m — the player read as a speck at 12 m).
    camera.position.set(
      player.pos.x - Math.sin(G.camYaw) * Math.cos(G.camPitch) * G.camDist,
      2 + Math.sin(G.camPitch) * G.camDist,
      player.pos.z - Math.cos(G.camYaw) * Math.cos(G.camPitch) * G.camDist);
    camera.lookAt(player.pos.x, 1.6, player.pos.z);
    // 6 guards with red markers ahead of the player + 4 already down = 10 total,
    // so the live counter reads GUARDS 6/10
    const guardPos = [[38, 82], [48, 108], [55, 88], [70, 100], [44, 98], [78, 86]];
    for (const [gx, gz] of guardPos) spawnCop(gx, gz, true);
    for (const [gx, gz] of [[62, 108], [58, 95], [66, 90], [50, 112]]) {
      const downG = spawnCop(gx, gz, true); downG.down = true; downG.downT = 0; downG.group.rotation.x = Math.PI / 2;
    }
    // one tracer line in the air (frozen firefight), from the player's pistol
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(player.pos.x, 1.6, player.pos.z),
      new THREE.Vector3(38, 1.4, 82),
    ]);
    const tr = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a8 })); scene.add(tr);
    // burning van: a real van shape (tall cargo box on the car body) with flames
    // licking from the rear and a smoke column — not just a fire cone.
    // Round 8 fix: parked 16 m ahead of the player (was 28 m — too small and
    // hidden behind the GUARDS pill), so the van + flames read at a glance.
    const van = spawnCar(36, 93, Math.PI / 2, 0x14141a, { name: 'BURNING VAN' });
    const cargo = new THREE.Mesh(new THREE.BoxGeometry(2.3, 1.7, 2.8), new THREE.MeshLambertMaterial({ color: 0x2a2a30 }));
    cargo.position.set(0, 1.6, -0.7); van.group.add(cargo);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3.4, 8), new THREE.MeshBasicMaterial({ color: 0xff7a00 }));
    flame.position.set(0, 2.9, -1.6); van.group.add(flame);
    const flame2 = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 8), new THREE.MeshBasicMaterial({ color: 0xffd23d }));
    flame2.position.set(0, 2.5, -1.6); van.group.add(flame2);
    const smoke = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6), new THREE.MeshBasicMaterial({ color: 0x1c1c20, transparent: true, opacity: 0.75 }));
    smoke.position.set(0, 5.0, -1.2); van.group.add(smoke);
    const smoke2 = new THREE.Mesh(new THREE.SphereGeometry(1.6, 8, 6), new THREE.MeshBasicMaterial({ color: 0x2a2a30, transparent: true, opacity: 0.55 }));
    smoke2.position.set(0, 6.8, -1.2); van.group.add(smoke2);
    // peds fleeing the gunfire
    peds.slice(0, 8).forEach(p => { p.state = 'flee'; p.fleeT = 5; });
    clusterNear(20, 95);
    // keep the burning van readable: no other car may sit in the firing lane
    // between the player and the van — push lane cars EAST, past the van, so they
    // read as depth behind it instead of hiding it (first takes: a parked car sat
    // on top of the van, then moved cars still blocked the sightline)
    for (const c of cars) {
      if (c === van) continue;
      const cx = c.group.position.x, cz = c.group.position.z;
      if (cx > 12 && cx < 68 && Math.abs(cz - 93) < 8) c.group.position.x = cx + 45;
    }
    // keep the camera lane clear: no ped between the camera and the player
    peds.slice(0, 10).forEach((p, i) => {
      if (dist2d(p.group.position.x, p.group.position.z, camera.position.x, camera.position.z) < 6) {
        p.group.position.set(34 + i * 2, 0, 78 + (i % 3) * 8);
        p.tx = p.group.position.x; p.tz = p.group.position.z;
      }
    });
    peds.slice(0, 8).forEach(p => { p.state = 'flee'; p.fleeT = 5; });
  } else if (name === 'race') {
    // Shot 4 (round 9): night street race downtown — "neon night" now (city.js:
    // much brighter ambient/dir light + glowing windows + streetlights, so the
    // road, the bike and the rivals read instead of going near-black), the player
    // on the hot-pink PICUDA 900 bike mid-race: CHECKPOINT 3/5, POSITION 3/4,
    // ~290 m to the next gate. The title screen still exists in the game; it just
    // isn't one of the 4 screenshots any more.
    G.money = 54600; G.respect = 520; G.day = 11; G.minutes = 22 * 60 + 4;
    Object.assign(STATS, { carsStolen: 41, copsEscaped: 12, kmDriven: 48.2, takenOut: 23, geckos: 12, missionsDone: 7, bestWanted: 4, lanterns: 9, stuntJumps: 2, racesWon: 1 });
    player.pos.set(-105, 0, 45);
    player.heading = Math.atan2(145 - player.pos.x, -105 - player.pos.z); // toward the next gate
    player.mesh.position.copy(player.pos); player.mesh.rotation.y = player.heading;
    startMission(7); updateObjective();
    // stage the race state: 2 checkpoints done, rivals arranged so we sit 3rd
    G.race.cp = 2;
    G.race.rivals[0].cp = 3; G.race.rivals[0].dist = 120;
    G.race.rivals[1].cp = 2; G.race.rivals[1].dist = 80;
    G.race.rivals[2].cp = 1; G.race.rivals[2].dist = 200;
    const bike = G.race.bike;
    bike.group.position.set(-105, 0, 45);
    bike.heading = player.heading; bike.group.rotation.y = bike.heading; bike.speed = 40;
    player.pos.copy(bike.group.position);
    enterCar(bike); // mounts the bike without a wanted star (isBike)
    G.camYaw = player.heading;
    // rivals visible on the road, IN the lane ahead of us — round 8 parked the
    // leader ~110 m away (a yellow blob) and one rival behind the camera. Now
    // the pack surrounds the bike: leader 55 m ahead on the road, second 14 m
    // ahead left, third 12 m ahead right, each with a tall red rear bar + a roof
    // beacon in its own colour so the three cars read as three distinct rivals,
    // not blobs. (The first leader spot, 35 m out, sat inside a tower footprint —
    // probed: collider x −88…−63, z 19…31 — so the leader sits on the road instead.)
    G.race.rivals[0].car.group.position.set(-58, 0, 17);
    G.race.rivals[1].car.group.position.set(-91, 0, 41);
    G.race.rivals[2].car.group.position.set(-97, 0, 35);
    G.race.rivals.forEach(r => {
      r.car.heading = player.heading; r.car.group.rotation.y = r.car.heading;
      const rearBar = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.35, 0.12), new THREE.MeshBasicMaterial({ color: 0xff2d2d }));
      rearBar.position.set(0, 0.62, -2.14); r.car.group.add(rearBar);
      const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.22, 0.5), new THREE.MeshBasicMaterial({ color: r.car.color }));
      beacon.position.set(0, 1.5, -0.2); r.car.group.add(beacon);
    });
    // snap the chase camera behind the bike (same lerp problem as the shootout) —
    // 6 m back / 3.0 high, matching the bike cam in updateCamera
    camera.position.set(
      bike.group.position.x - Math.sin(bike.heading) * 6, 3.0,
      bike.group.position.z - Math.cos(bike.heading) * 6);
    camera.lookAt(bike.group.position.x, 1.6, bike.group.position.z);
    clusterNear(-105, 45);
  } else if (name === 'drive') {
    const car = spawnCar(-5, 45, 0, 0xc0392b, {});
    player.pos.set(-5, 0, 45); enterCar(car); G.wanted = 0; car.speed = 14;
    G.camYaw = Math.PI; clusterNear(-5, 45);
  } else if (name === 'wanted') {
    const car = spawnCar(0, 0, 0, 0x2980b9, {});
    player.pos.set(0, 0, 0); enterCar(car); G.wanted = 3; car.speed = 12;
    for (let i = 0; i < 3; i++) { const pc = spawnPoliceCar(); pc.group.position.set([-12, 14, -18][i], 0, [-14, 10, 16][i]); pc.speed = 16; }
    G.camYaw = Math.PI; clusterNear(0, 0);
  } else if (name === 'mission') {
    player.pos.set(city.pickup.x - 6, 0, city.pickup.z - 4);
    player.heading = Math.atan2(city.pickup.x - player.pos.x, city.pickup.z - player.pos.z);
    player.mesh.position.copy(player.pos);
    player.mesh.rotation.y = player.heading;
    G.camYaw = player.heading; clusterNear(city.pickup.x, city.pickup.z);
  }
  updateObjective();
  // the shootout shot overrides the objective text after updateObjective — restore it
  if (name === 'shootout') {
    $('objective-title').textContent = 'CH.5 STORM SURGE · MISSION 7/10 — THE LAMPLIGHTER · $50,000';
    $('objective-text').textContent = 'Clear out the guards (6 left) — the Combine\'s crew holds this street.';
    $('objective-next').textContent = 'NEXT Deliver the files to the harbor pier';
  }
  updateHUD(1);
  show($('toast'), false); // staging toasts (e.g. "Car stolen") must not leak into the shot
  show($('banner'), false);
}

// ---------- main loop ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  G.time += dt;
  if (tracer) { tracerT -= dt; if (tracerT <= 0) { scene.remove(tracer); tracer = null; } }
  if (!SHOT && G.screen === 'play') {
    updatePlayer(dt); updateTraffic(dt); updatePoliceCars(dt); updatePeds(dt); updateCops(dt); updatePolice(dt); updateMarker(dt); updateHeli(dt);
  } else if (SHOT) {
    // staged scene: gentle life (traffic + peds move) but no player input / wanted logic
    updateTraffic(dt); updatePeds(dt); updateMarker(dt); updateHeli(dt);
    if (SHOT === 'wanted') updatePoliceCars(dt); // the chase shot keeps police at
    // their staged positions (round 8: chasers converged onto the camera and one
    // filled the foreground cut off); the legacy wanted shot still runs them
    // drive shot: keep the staged car rolling slowly down the road
    if ((SHOT === 'drive' || SHOT === 'chase') && G.car) {
      G.car.speed = SHOT === 'chase' ? 14 : 12;
      const nx = G.car.group.position.x + Math.sin(G.car.heading) * G.car.speed * dt;
      const nz = G.car.group.position.z + Math.cos(G.car.heading) * G.car.speed * dt;
      if (!pointInCollider(nx, nz, 1.4)) { G.car.group.position.x = nx; G.car.group.position.z = nz; }
      player.pos.copy(G.car.group.position);
    }
  }
  updateCamera(dt);
  if (city.beacon) city.beacon.rotation.y = G.time * 0.7; // lighthouse beam sweep
  if (G.screen === 'play') { drawMinimap(); updateHUD(dt); }
  renderer.render(scene, camera);
}

if (SHOT) {
  stageShot(SHOT);
  // render a few frames, then flag ready for the screenshot tool
  let n = 0;
  const paint = () => { n += 1; if (n >= 4) { window.__shotReady = true; return; } requestAnimationFrame(paint); };
  requestAnimationFrame(frame);
  setTimeout(() => { window.__shotReady = true; }, 2500);
  requestAnimationFrame(paint);
} else {
  requestAnimationFrame(frame);
}

// debug handle for play-testing
window.__game = { G, STATS, MISSIONS, RACE_CPS, racePosition, city, player, cars, peds, cops, geckos, heli, audio, renderer, camera, scene, touch, IS_TOUCH, startGame, pauseGame, resumeGame, missionTarget, saveGame, loadSave, rankFor, districtAt };
