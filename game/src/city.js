// Neon Bay city: 8x8 blocks over ~400x400 m, roads between blocks, harbour on the east.
// Builds the Three.js scene and returns colliders + road data the gameplay uses.
// opts.night renders the same city at night (darker sky, dimmer sun, brighter windows).
// opts.day renders it in bright daylight (blue sky, strong sun) — used by the daytime
// shootout shot; the default is a brightened dusk so streets read clearly.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

export const CITY = {
  half: 200, block: 40, road: 10, pitch: 50, // block 40 + road 10 = 50 pitch, 8 blocks = 400
  waterX: 185, // east of this is harbour water
};

// Seven named districts, tiling the map (first match wins). Standing is the
// crew's reputation in that district, shown in the HUD and on the MAP screen.
export const DISTRICTS = [
  { name: 'KUMALA STRAND', sub: 'Strand Boulevard', minX: 100, maxX: 210, minZ: -200, maxZ: 200, standing: 58, mood: 'NEUTRAL' },
  { name: 'LANTERN MILE', sub: 'Lantern Row', minX: -50, maxX: 100, minZ: -200, maxZ: -50, standing: 74, mood: 'FRIENDLY' },
  { name: 'BANYAN GREEN', sub: 'Banyan Park', minX: -200, maxX: -50, minZ: -200, maxZ: -50, standing: 61, mood: 'NEUTRAL' },
  { name: 'OLD PASARU', sub: 'Night Market', minX: -200, maxX: -50, minZ: -50, maxZ: 100, standing: 66, mood: 'FRIENDLY' },
  { name: 'MARINA ROW', sub: 'Marina Parade', minX: -50, maxX: 100, minZ: -50, maxZ: 100, standing: 52, mood: 'NEUTRAL' },
  { name: 'VELA HEIGHTS', sub: 'Tranvia Ave', minX: -50, maxX: 100, minZ: 100, maxZ: 200, standing: 41, mood: 'COLD' },
  { name: 'SUNSET BOULEVARD', sub: 'Sunset Blvd', minX: -200, maxX: -50, minZ: 100, maxZ: 200, standing: 58, mood: 'NEUTRAL' },
];
export function districtAt(x, z) {
  for (const d of DISTRICTS) if (x >= d.minX && x < d.maxX && z >= d.minZ && z < d.maxZ) return d;
  return DISTRICTS[4];
}

// 20 Golden Gecko collectible spots, on road intersections and landmarks.
export const GECKO_SPOTS = [
  [-55, 145], [145, -105], [145, 95], [95, -155], [-155, -155], [-30, -30], [95, -5],
  [-5, 95], [95, 45], [-55, -55], [190, -40], [198, -150], [-155, 95], [45, 145],
  [-155, 45], [95, 145], [-105, -105], [45, -155], [-5, -155], [145, -5],
];

export function buildCity(scene, seed, opts = {}) {
  const night = !!opts.night;
  const day = !!opts.day;
  const rand = mulberry32(seed);
  const colliders = []; // {minX,maxX,minZ,maxZ}
  const roadLines = []; // x or z coords of road centrelines
  for (let i = 0; i <= 8; i++) roadLines.push(-200 + i * 50 + 45); // roads at block edges: -200+... compute below
  // Recompute cleanly: block i spans [-200+i*50, -200+i*50+40]; road centre between blocks at -200+i*50-5
  roadLines.length = 0;
  for (let i = 0; i <= 8; i++) roadLines.push(-200 + i * 50 - 5);

  // --- sky: gradient dome + fog ---
  scene.background = new THREE.Color(day ? 0x8fd0f0 : night ? 0x0b1026 : 0x2a1548);
  scene.fog = new THREE.Fog(day ? 0xa8d8ea : night ? 0x141a3a : 0x4a2a6e, 120, 520);
  const skyGeo = new THREE.SphereGeometry(600, 16, 12);
  const skyMat = new THREE.MeshBasicMaterial({ color: day ? 0x6ec1f2 : night ? 0x1a2a55 : 0xff7a3d, side: THREE.BackSide, fog: false });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);
  // sun disc low on the horizon (west) — at night a pale moon in the same place,
  // in daylight a high bright sun
  const sun = new THREE.Mesh(new THREE.CircleGeometry(day ? 24 : night ? 18 : 28, 24), new THREE.MeshBasicMaterial({ color: day ? 0xfff3a0 : night ? 0xe8ecff : 0xffd23d, fog: false }));
  sun.position.set(day ? -150 : -420, day ? 300 : 55, day ? -100 : -120); sun.lookAt(0, 40, 0); scene.add(sun);

  // --- lights ---
  // Dusk is deliberately brighter than round 5 (ambient 0.85 -> 1.0, sun 1.4 -> 1.7,
  // hemi 0.5 -> 0.65) so asphalt and facades read instead of going near-black.
  scene.add(new THREE.AmbientLight(day ? 0xffffff : night ? 0x4a5a9a : 0xa08ad0, day ? 1.1 : night ? 0.55 : 1.0));
  const dir = new THREE.DirectionalLight(day ? 0xfff2cc : night ? 0x9ab4ff : 0xff9a5c, day ? 2.2 : night ? 0.55 : 1.7);
  dir.position.set(day ? 120 : -180, day ? 220 : 140, day ? 80 : 60); scene.add(dir);
  const hemi = new THREE.HemisphereLight(day ? 0xbfd9ff : 0x7a5cff, day ? 0x8a7a5a : 0x2a1a3a, day ? 0.9 : night ? 0.3 : 0.65); scene.add(hemi);

  // --- ground ---
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), new THREE.MeshLambertMaterial({ color: day ? 0x6a6258 : 0x3a3540 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0; scene.add(ground);
  // sidewalks: lighter slabs per block
  const walkMat = new THREE.MeshLambertMaterial({ color: day ? 0x8a8494 : 0x5a5468 });
  const walkGeo = new THREE.BoxGeometry(44, 0.15, 44);
  // roads: dark strips (round 6: much lighter than the near-black 0x1c1a20, so the
  // street surface stays visible at dusk and reads clearly in daylight)
  const roadMat = new THREE.MeshLambertMaterial({ color: day ? 0x4a4550 : 0x3a3540 });
  const roadGeoH = new THREE.PlaneGeometry(400, 10);
  const roadGeoV = new THREE.PlaneGeometry(10, 400);
  for (const c of roadLines) {
    const rh = new THREE.Mesh(roadGeoH, roadMat); rh.rotation.x = -Math.PI / 2; rh.position.set(0, 0.06, c); scene.add(rh);
    const rv = new THREE.Mesh(roadGeoV, roadMat); rv.rotation.x = -Math.PI / 2; rv.position.set(c, 0.06, 0); scene.add(rv);
  }
  // --- road dashes: one InstancedMesh per orientation (was ~500 meshes) ---
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xd8c95a });
  const dashGeoH = new THREE.PlaneGeometry(3, 0.5);
  const dashGeoV = new THREE.PlaneGeometry(0.5, 3);
  const dashH = [], dashV = [];
  for (const c of roadLines) for (let d = -190; d < 200; d += 14) { dashH.push([d, c]); dashV.push([c, d]); }
  const m4 = new THREE.Matrix4();
  const dashMeshH = new THREE.InstancedMesh(dashGeoH, dashMat, dashH.length);
  dashH.forEach(([x, z], i) => { m4.makeRotationX(-Math.PI / 2); m4.setPosition(x, 0.08, z); dashMeshH.setMatrixAt(i, m4); });
  scene.add(dashMeshH);
  const dashMeshV = new THREE.InstancedMesh(dashGeoV, dashMat, dashV.length);
  dashV.forEach(([x, z], i) => { m4.makeRotationX(-Math.PI / 2); m4.setPosition(x, 0.08, z); dashMeshV.setMatrixAt(i, m4); });
  scene.add(dashMeshV);

  // --- buildings: shared geometries/materials, emissive windows via textures ---
  // Four window-pattern variants (different grid, lit ratio, palette) so the
  // towers don't all repeat the same facade; 12 materials = 6 body colours x textures.
  function makeWinTex(v) {
    const r = mulberry32(seed * 131 + v * 17 + 5);
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
    const c = cv.getContext('2d');
    c.fillStyle = '#241d33'; c.fillRect(0, 0, 64, 128);
    const stepX = [10, 8, 12, 10][v], stepY = [12, 10, 14, 12][v];
    const wW = [6, 5, 7, 4][v], wH = [8, 6, 9, 7][v];
    const lit = day ? [0.25, 0.15, 0.3, 0.2][v] : night ? [0.8, 0.6, 0.9, 0.7][v] : [0.55, 0.35, 0.7, 0.45][v];
    const palettes = [['#ffd23d', '#ff9a5c', '#7de3ff', '#ff7ad9'], ['#ffd23d', '#ff9a5c'],
      ['#7de3ff', '#ff7ad9', '#ffd23d'], ['#ff9a5c', '#ffd23d']];
    const pal = palettes[v];
    for (let y = 6; y < 122; y += stepY) for (let x = 6; x < 58; x += stepX) {
      c.fillStyle = r() < lit ? pal[Math.floor(r() * pal.length)] : '#14101e';
      c.fillRect(x, y, wW, wH);
    }
    return new THREE.CanvasTexture(cv);
  }
  const winTexes = [0, 1, 2, 3].map(makeWinTex);
  const bldgCols = [0x3a3450, 0x4a2f4d, 0x2f3d5c, 0x503a2e, 0x37304a, 0x5c2f3d];
  const bldgMats = [];
  for (let i = 0; i < 12; i++) bldgMats.push(new THREE.MeshLambertMaterial({
    color: bldgCols[i % bldgCols.length], emissive: 0xffffff, emissiveMap: winTexes[i % winTexes.length], emissiveIntensity: day ? 0.25 : night ? 0.9 : 0.55 }));
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x1a1622 });

  const buildings = [];
  for (let bx = 0; bx < 8; bx++) for (let bz = 0; bz < 8; bz++) {
    const x0 = -200 + bx * 50, z0 = -200 + bz * 50;
    const isHarbourBlock = x0 > 160; // east edge blocks are the harbour strip
    if (isHarbourBlock) continue;
    // block (3,3) is the plaza of the Neon Spire landmark — no random buildings
    const isPlazaBlock = bx === 3 && bz === 3;
    if (!isPlazaBlock) {
    // 1-3 buildings per block, placed on a sub-grid
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) {
      const w = 12 + rand() * 14, d = 12 + rand() * 14, h = 8 + rand() * 34;
      const cx = x0 + 8 + rand() * (40 - 8 - w), cz = z0 + 8 + rand() * (40 - 8 - d);
      const m = new THREE.Mesh(boxGeo, bldgMats[Math.floor(rand() * bldgMats.length)]);
      m.scale.set(w, h, d); m.position.set(cx + w / 2 - 20 + 20, h / 2, cz + d / 2 - 20 + 20);
      // position fix: cx is offset within block; use absolute:
      m.position.set(x0 + (cx - x0) + w / 2, h / 2, z0 + (cz - z0) + d / 2);
      scene.add(m);
      const roof = new THREE.Mesh(boxGeo, roofMat);
      roof.scale.set(w + 0.6, 0.5, d + 0.6); roof.position.set(m.position.x, h + 0.25, m.position.z); scene.add(roof);
      colliders.push({ minX: m.position.x - w / 2, maxX: m.position.x + w / 2, minZ: m.position.z - d / 2, maxZ: m.position.z + d / 2 });
      buildings.push(m);
      // rooftop neon sign on tall towers
      if (h > 30 && rand() < 0.5) {
        const sign = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 1.2, 0.3),
          new THREE.MeshBasicMaterial({ color: [0xff2d78, 0x00e5ff, 0xffd23d][Math.floor(rand() * 3)] }));
        sign.position.set(m.position.x, h + 1.2, m.position.z); scene.add(sign);
      }
    }
    } // end plaza-block skip
    // sidewalk slab
    const walk = new THREE.Mesh(walkGeo, walkMat); walk.position.set(x0 + 20, 0.02, z0 + 20); scene.add(walk);
  }

  // --- landmarks: Neon Spire tower (plaza block 3,3, centre -30,-30) ---
  const spireBase = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x2f2a3d }));
  spireBase.scale.set(16, 8, 16); spireBase.position.set(-30, 4, -30); scene.add(spireBase);
  const spireShaft = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x4a2f4d, emissive: 0xffffff, emissiveMap: winTexes[2], emissiveIntensity: day ? 0.25 : night ? 0.7 : 0.4 }));
  spireShaft.scale.set(9, 34, 9); spireShaft.position.set(-30, 25, -30); scene.add(spireShaft);
  const spireCrown = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x2f2a3d }));
  spireCrown.scale.set(11, 4, 11); spireCrown.position.set(-30, 44, -30); scene.add(spireCrown);
  const spireAntenna = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 8, 6), new THREE.MeshLambertMaterial({ color: 0x222226 }));
  spireAntenna.position.set(-30, 50, -30); scene.add(spireAntenna);
  const spireBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2d2d }));
  spireBeacon.position.set(-30, 54.4, -30); scene.add(spireBeacon);
  const ringCols = [0xff2d78, 0x00e5ff, 0xffd23d];
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6.8, 0.35, 8, 32), new THREE.MeshBasicMaterial({ color: ringCols[i] }));
    ring.rotation.x = Math.PI / 2; ring.position.set(-30, 12 + i * 12, -30); scene.add(ring);
  }
  colliders.push({ minX: -38, maxX: -22, minZ: -38, maxZ: -22 });

  // --- harbour: water plane + pier + containers + crane ---
  const water = new THREE.Mesh(new THREE.PlaneGeometry(120, 420), new THREE.MeshLambertMaterial({ color: day ? 0x1e7fa8 : 0x0e4a6e }));
  water.rotation.x = -Math.PI / 2; water.position.set(245, 0.05, 0); scene.add(water);
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x5c4a33 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(24, 1, 380), pierMat);
  pier.position.set(196, 0.5, 0); scene.add(pier);
  // No collider on the pier: cars are clamped to x < 182, and the player must be able to
  // walk the pier to deliver the Harbor Run package.
  const contCols = [0xd83d2e, 0x2e7dd8, 0x3dd86e, 0xd8a32e];
  const contGeo = new THREE.BoxGeometry(10, 3.4, 3.4);
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Mesh(contGeo, new THREE.MeshLambertMaterial({ color: contCols[i % 4] }));
    const px = 192 + (i % 2) * 8, pz = -160 + Math.floor(i / 2) * 48 + rand() * 8;
    c.position.set(px, 1.7 + (i % 3 === 0 ? 3.4 : 0), pz); scene.add(c);
    colliders.push({ minX: px - 5, maxX: px + 5, minZ: pz - 1.7, maxZ: pz + 1.7 });
  }

  // --- lighthouse at the north end of the pier (rotating beam) ---
  const lhBase = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, 2, 10), new THREE.MeshLambertMaterial({ color: 0x3a3a40 }));
  lhBase.position.set(198, 1, -178); scene.add(lhBase);
  const lhStripeCols = [0xe8e4da, 0xd83d2e, 0xe8e4da];
  for (let i = 0; i < 3; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 5, 10), new THREE.MeshLambertMaterial({ color: lhStripeCols[i] }));
    seg.position.set(198, 4.5 + i * 5, -178); scene.add(seg);
  }
  const lhGallery = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 1, 10), new THREE.MeshLambertMaterial({ color: 0x222226 }));
  lhGallery.position.set(198, 17.5, -178); scene.add(lhGallery);
  const lhLamp = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2, 10), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
  lhLamp.position.set(198, 19, -178); scene.add(lhLamp);
  const beacon = new THREE.Group();
  beacon.position.set(198, 19, -178);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false });
  const beamGeo = new THREE.BoxGeometry(30, 1.4, 1.4);
  const beam1 = new THREE.Mesh(beamGeo, beamMat); beam1.position.x = 15; beacon.add(beam1);
  const beam2 = new THREE.Mesh(beamGeo, beamMat); beam2.position.x = -15; beacon.add(beam2);
  scene.add(beacon);
  colliders.push({ minX: 195, maxX: 201, minZ: -181, maxZ: -175 });

  // --- street lamps along roads (slim: thin pole, small bulb) ---
  // --- street lamps: 3 InstancedMeshes (was ~430 meshes) ---
  const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 5.2, 6);
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x222226 });
  const lampGeo = new THREE.SphereGeometry(0.3, 8, 6);
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
  const glowGeo = new THREE.SphereGeometry(0.38, 8, 6);
  const lampLightMat = new THREE.MeshBasicMaterial({ color: 0xffd23d, transparent: true, opacity: day ? 0.08 : night ? 0.35 : 0.15 });
  const lampSpots = [];
  for (const c of roadLines) for (let d = -180; d <= 180; d += 50) {
    for (const [lx, lz] of [[c + 6, d], [c - 6, d + 25]]) {
      if (Math.abs(lx) > 195 || Math.abs(lz) > 195) continue;
      lampSpots.push([lx, lz]);
    }
  }
  const poleMesh = new THREE.InstancedMesh(poleGeo, poleMat, lampSpots.length);
  const lampMesh = new THREE.InstancedMesh(lampGeo, lampMat, lampSpots.length);
  const glowMesh = new THREE.InstancedMesh(glowGeo, lampLightMat, lampSpots.length);
  lampSpots.forEach(([lx, lz], i) => {
    m4.identity(); m4.setPosition(lx, 2.6, lz); poleMesh.setMatrixAt(i, m4);
    m4.identity(); m4.setPosition(lx, 5.4, lz); lampMesh.setMatrixAt(i, m4);
    m4.identity(); m4.setPosition(lx, 5.4, lz); glowMesh.setMatrixAt(i, m4);
  });
  scene.add(poleMesh); scene.add(lampMesh); scene.add(glowMesh);

  // --- traffic lights (decorative) at a few intersections ---
  const tlPole = new THREE.CylinderGeometry(0.1, 0.1, 4.5, 6);
  const tlBox = new THREE.BoxGeometry(0.7, 1.6, 0.7);
  for (const [ix, iz] of [[-55, -55], [45, -5], [-5, 95], [95, 45]]) {
    const p = new THREE.Mesh(tlPole, poleMat); p.position.set(ix + 6, 2.25, iz + 6); scene.add(p);
    const b = new THREE.Mesh(tlBox, new THREE.MeshLambertMaterial({ color: 0x111114 }));
    b.position.set(ix + 6, 4.8, iz + 6); scene.add(b);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: (ix + iz) % 2 ? 0xff3b30 : 0x35d83d }));
    dot.position.set(ix + 6, 5.1, iz + 6.35); scene.add(dot);
  }

  // --- props: trees, hydrants, benches ---
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.35, 2.4, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a2f1d });
  const leafGeo = new THREE.ConeGeometry(1.8, 4, 7);
  const leafMat = new THREE.MeshLambertMaterial({ color: day ? 0x3a8a4a : 0x2e6e3a });
  const hydGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.9, 8);
  const hydMat = new THREE.MeshLambertMaterial({ color: 0xd83d2e });
  const benchGeo = new THREE.BoxGeometry(2.4, 0.5, 0.8);
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x6e4a2a });
  for (let i = 0; i < 60; i++) {
    const bx = Math.floor(rand() * 8), bz = Math.floor(rand() * 8);
    const x0 = -200 + bx * 50, z0 = -200 + bz * 50;
    const px = x0 + 2 + rand() * 36, pz = z0 + 2 + rand() * 36;
    if (px > 175) continue;
    const kind = rand();
    if (kind < 0.5) {
      const t = new THREE.Mesh(trunkGeo, trunkMat); t.position.set(px, 1.2, pz); scene.add(t);
      const l = new THREE.Mesh(leafGeo, leafMat); l.position.set(px, 4, pz); scene.add(l);
    } else if (kind < 0.75) {
      const h = new THREE.Mesh(hydGeo, hydMat); h.position.set(px, 0.45, pz); scene.add(h);
    } else {
      const b = new THREE.Mesh(benchGeo, benchMat); b.position.set(px, 0.5, pz); b.rotation.y = rand() * Math.PI; scene.add(b);
    }
  }

  // --- road loops for AI traffic: rectangles along road centrelines ---
  const loops = [];
  for (const c of [-155, -105, -55, -5, 45, 95, 145]) {
    loops.push([{ x: c, z: -175 }, { x: c, z: 175 }, { x: c + 0, z: 175 }]); // vertical runs handled by rect loop below
  }
  const rectLoops = [];
  for (const [x0, z0, x1, z1] of [[-155, -155, 145, 145], [-105, -105, 95, 95], [-55, -55, 45, 45], [-155, -5, 145, 95]]) {
    rectLoops.push([{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }]);
  }

  return {
    colliders, roadLines, rectLoops, beacon, districts: DISTRICTS, geckoSpots: GECKO_SPOTS, night, day,
    // All key points sit on road intersections (road centrelines), never inside a block,
    // so the player is never pushed out of a building footprint on spawn or delivery.
    spawn: { x: -55, z: 145 },           // Mara's garage (south-west intersection)
    garage: { x: -55, z: 145 },
    hospital: { x: -155, z: -155 },
    police: { x: 95, z: -155 }, // Bay PD precinct (road intersection, north-east)
    pickup: { x: 145, z: -105 },
    chopShop: { x: 145, z: 95 },
    harbour: { x: 190, z: -40 },
    market: { x: -105, z: 45 }, // Old Pasaru night market (road intersection)
  };
}
