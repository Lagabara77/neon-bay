// Neon Bay — open-world crime game. Original fiction: Jax Marlowe, wheelman for Mara Voss.
// Three.js low-poly dusk city. Keyboard + mouse. ?shot=start|drive|wanted|mission&seed=N stages a scene.
import * as THREE from 'three';
import { buildCity } from './city.js';
import { createAudio } from './audio.js';
import { clamp, lerp, angleLerp, dist2d, mulberry32 } from './util.js';

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

const city = buildCity(scene, seed);
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
  money: 250, health: 100, wanted: 0, ammo: 12,
  inCar: false, car: null, speed: 0,
  missionIdx: 0, missionStage: 0, missionTimer: 0, hasPackage: false,
  bustedTimer: 0, wantedDecay: 0, time: 0, muted: false,
  camYaw: Math.PI, camPitch: 0.32, camDist: 9,
  targetCar: null,
};
const player = { pos: new THREE.Vector3(city.spawn.x, 0, city.spawn.z), heading: 0, mesh: null, speed: 0 };
const cars = [];   // {group, heading, speed, ai, loop, wp, color, isPolice, isTarget, lights:[m1,m2]}
const peds = [];   // {group, heading, speed, state, tx, tz, down, downT, hp}
const cops = [];   // foot police {group, heading, speed, hp, hitCd}

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
  const car = { group, heading, speed: 0, ai: !!opts.ai, loop: opts.loop || null, wp: 0, color, isPolice: !!opts.police, isTarget: !!opts.target, lights, targetSpeed: opts.speed || 9 };
  cars.push(car); return car;
}
function spawnPed(x, z) {
  const cols = [0xff5c5c, 0x5cff8a, 0x5c8aff, 0xffd23d, 0xff8ad9, 0x8affea, 0xffffff];
  const g = makePersonMesh(cols[Math.floor(rand() * cols.length)], 0x2a2a33);
  g.position.set(x, 0, z); scene.add(g);
  const p = { group: g, heading: rand() * Math.PI * 2, speed: 1.4 + rand(), state: 'walk', tx: x, tz: z, down: false, downT: 0, hp: 1, fleeT: 0 };
  peds.push(p); return p;
}
function spawnCop(x, z) {
  const g = makePersonMesh(0x1e3a8a, 0x14181f);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.4), new THREE.MeshLambertMaterial({ color: 0x0f1e4a }));
  cap.position.y = 1.92; g.add(cap);
  g.position.set(x, 0, z); scene.add(g);
  const c = { group: g, heading: 0, speed: 0, hp: 3, hitCd: 0, down: false, downT: 0 };
  cops.push(c); return c;
}

// player mesh (Jax: teal jacket)
player.mesh = makePersonMesh(0x14b8a6, 0x1f2937);
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

// ---------- missions ----------
const MISSIONS = [
  { title: 'Mission 1 — The Pickup', reward: 150,
    stages: [
      { text: 'Go to the yellow marker and pick up the package (E).', target: () => city.pickup },
      { text: 'Package secured. Bring it back to Mara\'s garage (E).', target: () => city.garage },
    ] },
  { title: 'Mission 2 — Hot Wheels', reward: 300,
    stages: [
      { text: 'Steal the marked car (E) — the law will notice. Wanted will rise.', target: () => G.targetCar ? { x: G.targetCar.group.position.x, z: G.targetCar.group.position.z } : { x: 45, z: 95 } },
      { text: 'Deliver the car to the chop shop. Keep wanted at 2+ stars.', target: () => city.chopShop },
    ] },
  { title: 'Mission 3 — Harbor Run', reward: 500,
    stages: [
      { text: 'Grab the package at Mara\'s garage (E), then run it to the harbor.', target: () => city.garage },
      { text: 'Deliver to the harbor pier before time runs out!', target: () => city.harbour, timed: 90 },
    ] },
];
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
function startMission(i) {
  G.missionIdx = i; G.missionStage = 0; G.hasPackage = false; G.missionTimer = 0;
  if (i === 1 && !G.targetCar) {
    G.targetCar = spawnCar(45, 95, Math.PI / 2, 0xffd23d, {});
    // gold beacon ring on the target car
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.18, 8, 24), new THREE.MeshBasicMaterial({ color: 0xffd23d }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.4; G.targetCar.group.add(ring); G.targetCar.ring = ring;
  }
  updateObjective();
  banner(MISSIONS[i].title);
}
function completeMission() {
  const m = MISSIONS[G.missionIdx];
  G.money += m.reward; audio.cash();
  show($('mission-done'), true); G.screen = 'missionDone';
  $('md-title').textContent = 'MISSION COMPLETE';
  $('md-text').textContent = `${m.title} — you earned $${m.reward}. Total: $${G.money}.`;
  saveGame();
  G.missionIdx += 1; G.missionStage = 0; G.hasPackage = false;
}
function updateObjective() {
  if (G.missionIdx >= MISSIONS.length) { $('objective-title').textContent = 'FREE ROAM'; }
  else $('objective-title').textContent = MISSIONS[G.missionIdx].title;
  $('objective-text').textContent = missionText();
}

// ---------- wanted / police ----------
function addWanted(n) {
  G.wanted = clamp(G.wanted + n, 0, 5);
  G.wantedDecay = 0;
  if (G.wanted > 0) toast(`Wanted level ${G.wanted} — the Bay PD is on you!`);
}
function desiredPoliceCars() { return G.wanted >= 1 ? Math.min(G.wanted, 3) : 0; }
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
  if (G.wanted > 0 && nearest > 45) { G.wantedDecay += dt; if (G.wantedDecay > 18) { G.wanted -= 1; G.wantedDecay = 0; toast('Heat cooling off… wanted down to ' + G.wanted); } }
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
    ? `The Bay PD caught you. You lost $${lost} in fines and cooled off at the precinct.`
    : `You got wasted. Medics patched you up at the hospital — $${lost} in bills.`;
  show($('hud'), false); show($('busted'), true);
  saveGame();
}

// ---------- car enter/exit ----------
function enterCar(car) {
  G.inCar = true; G.car = car; car.ai = false;
  player.mesh.visible = false;
  if (!car.isPolice) addWanted(1); // stealing a car
  if (G.targetCar === car) { G.missionStage = 1; if (G.wanted < 2) G.wanted = 2; updateObjective(); toast('Hot car secured — get it to the chop shop!'); }
  audio.unlock();
  toast(car.isPolice ? 'You jacked a police cruiser!' : 'Car stolen — +1 wanted star');
}
function exitCar(silent) {
  if (!G.car) return;
  const c = G.car;
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
    if (best.isCop) { best.p.hp -= 1; if (best.p.hp <= 0) { best.p.down = true; best.p.downT = 0; addWanted(1); } }
    else { best.p.down = true; best.p.downT = 0; best.p.state = 'down'; addWanted(1); toast('You shot a pedestrian — +1 wanted'); }
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
    if (best.isCop) { best.p.hp -= 1; if (best.p.hp <= 0) { best.p.down = true; best.p.downT = 0; } addWanted(1); toast('You punched a cop — +1 wanted'); }
    else { best.p.down = true; best.p.downT = 0; best.p.state = 'down'; addWanted(1); toast('You punched a pedestrian — +1 wanted'); }
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
  // mission pickup / delivery points
  const t = missionTarget();
  if (t && dist2d(player.pos.x, player.pos.z, t.x, t.z) < 5) {
    const m = MISSIONS[G.missionIdx];
    if (G.missionIdx === 0 && G.missionStage === 0) { G.hasPackage = true; G.missionStage = 1; audio.pickup(); updateObjective(); toast('Package picked up — take it to Mara\'s garage'); return; }
    if (G.missionIdx === 0 && G.missionStage === 1) { completeMission(); return; }
    if (G.missionIdx === 2 && G.missionStage === 0) { G.hasPackage = true; G.missionStage = 1; G.missionTimer = 90; audio.pickup(); updateObjective(); toast('Package grabbed — 90 seconds to the harbor!'); return; }
    if (G.missionIdx === 2 && G.missionStage === 1) { completeMission(); return; }
  }
  if (G.missionIdx === 1 && G.missionStage === 1 && G.inCar && G.car === G.targetCar &&
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
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ money: G.money, missionIdx: G.missionIdx, x: player.pos.x, z: player.pos.z })); } catch {}
}
function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); return s; } catch { return null; }
}

// ---------- screens ----------
function startGame(fresh) {
  audio.unlock();
  if (fresh) { G.money = 250; G.missionIdx = 0; player.pos.set(city.spawn.x, 0, city.spawn.z); }
  else {
    const s = loadSave();
    if (s) { G.money = s.money; G.missionIdx = Math.min(s.missionIdx, 2); player.pos.set(s.x, 0, s.z); }
  }
  G.health = 100; G.wanted = 0; G.ammo = 12; G.missionStage = 0; G.hasPackage = false; G.missionTimer = 0;
  player.mesh.position.copy(player.pos); player.mesh.visible = true;
  G.inCar = false; G.car = null;
  show($('title'), false); show($('pause'), false); show($('busted'), false); show($('mission-done'), false); show($('hud'), true); show($('objective'), true);
  G.screen = 'play';
  startMission(G.missionIdx);
  updateObjective();
}
function pauseGame() { G.screen = 'pause'; show($('pause'), true); saveGame(); }
function resumeGame() { G.screen = 'play'; show($('pause'), false); }
$('btn-new').onclick = () => startGame(true);
$('btn-continue').onclick = () => startGame(false);
$('btn-resume').onclick = resumeGame;
$('btn-quit').onclick = () => { saveGame(); G.screen = 'title'; show($('pause'), false); show($('hud'), false); show($('title'), true); refreshContinue(); };
$('btn-respawn').onclick = () => { show($('busted'), false); show($('hud'), true); G.screen = 'play'; updateObjective(); };
$('btn-md').onclick = () => {
  show($('mission-done'), false); G.screen = 'play';
  if (G.missionIdx < MISSIONS.length) startMission(G.missionIdx); else updateObjective();
};
function refreshContinue() { $('btn-continue').disabled = !loadSave(); }
refreshContinue();

// ---------- per-frame updates ----------
function updatePlayer(dt) {
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight');
  if (G.inCar && G.car) {
    const car = G.car;
    const accel = clamp((keys.has('KeyW') ? 1 : keys.has('KeyS') ? -0.6 : 0) + touch.y, -1, 1);
    const steer = clamp((keys.has('KeyA') ? 1 : 0) - (keys.has('KeyD') ? 1 : 0) - touch.x, -1, 1);
    const handbrake = keys.has('Space');
    car.speed += accel * 16 * dt;
    car.speed -= car.speed * (handbrake ? 2.2 : 0.35) * dt;
    car.speed = clamp(car.speed, -9, car.isPolice ? 31 : 28);
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
    // hit peds while driving
    for (const p of peds) {
      if (!p.down && dist2d(p.group.position.x, p.group.position.z, car.group.position.x, car.group.position.z) < 2.2 && Math.abs(car.speed) > 3) {
        p.down = true; p.downT = 0; p.state = 'down'; addWanted(1); car.speed *= 0.7; audio.punch();
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
  // mission 2 drive-in delivery: rolling the target car into the chop shop
  // completes it (no E press needed — a fast car would otherwise overshoot
  // the 8 m radius before the player can press E)
  if (G.missionIdx === 1 && G.missionStage === 1 && G.inCar && G.car === G.targetCar &&
      dist2d(G.car.group.position.x, G.car.group.position.z, city.chopShop.x, city.chopShop.z) < 8) {
    completeMission();
    return;
  }
  // mission timer
  if (G.missionIdx === 2 && G.missionStage === 1 && G.missionTimer > 0) {
    G.missionTimer -= dt;
    if (G.missionTimer <= 0) { G.missionStage = 0; G.hasPackage = false; G.missionTimer = 0; updateObjective(); banner('TOO SLOW — run it again'); toast('Harbor Run failed — back to the garage to retry'); }
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
}

// ---------- camera ----------
function updateCamera(dt) {
  let focus, back;
  if (SHOT === 'start') { // slow orbit over the city for the title shot
    const a = G.time * 0.05;
    camera.position.set(Math.sin(a) * 160, 90, Math.cos(a) * 160);
    camera.lookAt(0, 10, 0); return;
  }
  if (G.inCar && G.car) {
    focus = G.car.group.position;
    const h = G.car.heading;
    back = new THREE.Vector3(focus.x - Math.sin(h) * 10, 4.2, focus.z - Math.cos(h) * 10);
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
  // player arrow
  mm.save(); mm.translate(toX(player.pos.x), toZ(player.pos.z));
  mm.rotate(G.inCar && G.car ? Math.PI - G.car.heading : Math.PI - player.heading);
  mm.fillStyle = '#7dff9a'; mm.beginPath(); mm.moveTo(0, -7); mm.lineTo(5, 6); mm.lineTo(-5, 6); mm.closePath(); mm.fill();
  mm.restore();
}
let hudT = 0;
function updateHUD(dt) {
  hudT += dt; if (hudT < 0.12) return; hudT = 0;
  $('health-bar').style.width = clamp(G.health, 0, 100) + '%';
  $('health-text').textContent = Math.ceil(G.health);
  $('money-text').textContent = G.money;
  let stars = '';
  for (let i = 0; i < 5; i++) stars += `<span class="${i < G.wanted ? '' : 'dim'}">★</span>`;
  $('wanted').innerHTML = stars;
  const driving = G.inCar && G.car;
  show($('speedo'), !!driving);
  if (driving) $('speed-text').textContent = Math.round(Math.abs(G.car.speed) * 2.2);
  if (G.missionIdx === 2 && G.missionStage === 1 && G.missionTimer > 0) {
    $('objective-text').textContent = missionText() + ` (${Math.ceil(G.missionTimer)}s left)`;
  }
}

// ---------- shot staging ----------
function stageShot(name) {
  G.screen = 'play';
  show($('title'), false); show($('hud'), true); show($('objective'), true);
  if (name === 'start') {
    G.screen = 'title'; show($('title'), true); show($('hud'), false);
    player.pos.set(city.spawn.x, 0, city.spawn.z);
    return;
  }
  startMission(0);
  if (name === 'drive') {
    const car = spawnCar(-5, 45, 0, 0xc0392b, {});
    player.pos.set(-5, 0, 45); enterCar(car); G.wanted = 0; car.speed = 14;
    G.camYaw = Math.PI;
  } else if (name === 'wanted') {
    const car = spawnCar(0, 0, 0, 0x2980b9, {});
    player.pos.set(0, 0, 0); enterCar(car); G.wanted = 3; car.speed = 12;
    for (let i = 0; i < 3; i++) { const pc = spawnPoliceCar(); pc.group.position.set([-12, 14, -18][i], 0, [-14, 10, 16][i]); pc.speed = 16; }
    G.camYaw = Math.PI;
  } else if (name === 'mission') {
    player.pos.set(city.pickup.x - 6, 0, city.pickup.z - 4);
    player.heading = Math.atan2(city.pickup.x - player.pos.x, city.pickup.z - player.pos.z);
    player.mesh.position.copy(player.pos);
    player.mesh.rotation.y = player.heading;
    G.camYaw = player.heading;
  }
  updateObjective();
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
    updatePlayer(dt); updateTraffic(dt); updatePoliceCars(dt); updatePeds(dt); updateCops(dt); updatePolice(dt); updateMarker(dt);
  } else if (SHOT) {
    // staged scene: gentle life (traffic + peds move) but no player input / wanted logic
    updateTraffic(dt); updatePeds(dt); updateMarker(dt);
    if (SHOT === 'wanted') updatePoliceCars(dt);
    // drive shot: keep the staged car rolling slowly down the road
    if (SHOT === 'drive' && G.car) {
      G.car.speed = 12;
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
window.__game = { G, player, cars, peds, cops, audio, renderer, touch, IS_TOUCH, startGame, missionTarget, saveGame, loadSave };
