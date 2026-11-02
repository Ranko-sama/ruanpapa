import * as T from './assets/three.module.min.js';
import { makeStage, updateStage } from './assets/stages.js';
import { makeFighter, poseFighter } from './assets/fighters.js';
import { placeFighter } from './fighter-rig.js';
import { blockTilt, shotRadius, updateCollider } from './colliders.js';
import { ARENA, BLOCK, layoutFor, hasFloorAt } from './arena-geometry.js';
import { MAPS, FIGHTERS, KINDS, EMOTES } from './data.js';
import { ArenaCamera } from './camera.js';
import { drawPerspectiveArena, drawFlatGlass } from './canvas-tps.js';
import { jellyShape } from './jelly.js';
import { createJellyMaterial } from './assets/fruit-jelly.js';

const TEAM = ['#32dfec', '#ff739c'];
const V = new T.Vector3();
const ball = new T.SphereGeometry(1, 12, 9),
  cube = new T.BoxGeometry(),
  disc = new T.CylinderGeometry(1, 1, 1, 40);
const paints = new Map();
function toy(geo, color, x, y, z, sx, sy = sx, sz = sx) {
  if (!paints.has(color))
    paints.set(color, new T.MeshStandardMaterial({ color, roughness: 0.48, metalness: 0.04 }));
  const o = new T.Mesh(geo, paints.get(color));
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}
function hoop(color, rad, thickness) {
  const mesh = toy(new T.TorusGeometry(rad, thickness, 8, 56), color, 0, 0.035, 0, 1);
  mesh.rotation.x = Math.PI / 2;
  mesh.castShadow = false;
  return mesh;
}
function softBlock(i) {
  const g = new T.Group(),
    c = ['#ffbd49', '#e58afb', '#75e2b3'][i % 3];
  g.add(toy(cube, c, 0, BLOCK.height / 2, 0, BLOCK.width, BLOCK.height, BLOCK.depth));
  for (const z of [-0.48, 0.48]) {
    const x = toy(cube, '#fff3c2', 0, 0.47, z, 0.48, 0.14, 0.025);
    x.rotation.z = 0.78;
    g.add(x);
    const y = x.clone();
    y.rotation.z = -0.78;
    g.add(y);
  }
  g.add(toy(cube, '#fff3c2', 0, 0.925, 0, 0.49, 0.02, 0.14));
  return g;
}
function flag(i) {
  const g = new T.Group();
  g.add(toy(disc, '#f9f2d9', 0, 0.86, 0, 0.047, 1.72, 0.047), toy(ball, '#ffd844', 0, 1.79, 0, 0.105));
  const pennant = new T.Shape();
  pennant.moveTo(0, 0);
  pennant.lineTo(0.88, -0.14);
  pennant.lineTo(0.64, -0.34);
  pennant.lineTo(0.87, -0.55);
  pennant.lineTo(0, -0.47);
  g.add(toy(new T.ExtrudeGeometry(pennant, { depth: 0.04, bevelEnabled: false }), TEAM[i], 0, 1.6, 0, 1));
  return g;
}
function crown() {
  const g = new T.Group();
  g.add(toy(disc, '#ffd343', 0, 0.1, 0, 0.46, 0.2, 0.46));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2,
      x = Math.cos(a) * 0.36,
      z = Math.sin(a) * 0.36;
    g.add(
      toy(new T.ConeGeometry(0.18, 0.47, 5), '#ffd343', x, 0.34, z, 1),
      toy(ball, '#ff8880', x, 0.59, z, 0.068),
    );
  }
  return g;
}
function cart() {
  const g = new T.Group();
  g.add(
    toy(cube, '#ffbd4e', 0, 0.65, 0, 1.65, 0.65, 1.15),
    toy(cube, '#ff67a0', 0, 0.98, 0, 1.78, 0.15, 1.24),
  );
  for (const x of [-0.56, 0.56])
    for (const z of [-0.57, 0.57]) {
      const wheel = toy(disc, '#383c5d', x, 0.27, z, 0.24, 0.15, 0.24);
      wheel.rotation.x = Math.PI / 2;
      g.add(wheel);
    }
  for (let i = 0; i < 3; i++)
    g.add(toy(ball, ['#78e6df', '#ba9cff', '#ff8ba5'][i], (i - 1) * 0.45, 1.13, 0.07, 0.35));
  return g;
}
function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const d = c.getContext('2d'),
    g = d.createRadialGradient(32, 32, 1, 32, 32, 32);
  g.addColorStop(0, 'rgba(52,43,89,.38)');
  g.addColorStop(0.5, 'rgba(52,43,89,.23)');
  g.addColorStop(1, 'rgba(52,43,89,0)');
  d.fillStyle = g;
  d.fillRect(0, 0, 64, 64);
  return new T.CanvasTexture(c);
}
let portraitStudio;
const portraitCache = new Map();
export async function loadoutPortrait(kind, skin, outfit) {
  const key = [kind, skin, outfit].join('-');
  if (portraitCache.has(key)) return portraitCache.get(key);
  if (portraitStudio === undefined) {
    try {
      const renderer = new T.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(320, 240);
      renderer.setClearColor(0, 0);
      const scene = new T.Scene(),
        camera = new T.OrthographicCamera(-1.82, 1.82, 1.365, -1.365, 0.1, 30);
      camera.position.set(1.9, 2, 9);
      camera.lookAt(0.17, 1.16, 0);
      scene.add(new T.HemisphereLight(0xfff3db, 0xc5b5eb, 2));
      const keyLight = new T.DirectionalLight(0xfff0de, 2.5);
      keyLight.position.set(-3, 6, 6);
      scene.add(keyLight);
      const rim = new T.DirectionalLight(0xc6ecff, 1.5);
      rim.position.set(4, 3, -5);
      scene.add(rim);
      portraitStudio = { renderer, scene, camera };
    } catch {
      portraitStudio = null;
    }
  }
  let url;
  if (portraitStudio) {
    const { renderer, scene, camera } = portraitStudio,
      model = makeFighter(kind, skin, outfit);
    poseFighter(model, { time: 0.4 });
    scene.add(model);
    renderer.render(scene, camera);
    url = renderer.domElement.toDataURL('image/png');
    scene.remove(model);
  } else {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 240;
    const d = c.getContext('2d'),
      im = new Image();
    im.src = './assets/portrait-' + kind + '.png';
    await im.decode();
    d.filter = skin === 1 ? 'hue-rotate(92deg)' : skin === 2 ? 'hue-rotate(206deg)' : 'none';
    d.drawImage(im, 0, 0, 320, 240);
    d.filter = 'none';
    if (outfit) {
      d.font = 'bold 30px sans-serif';
      d.fillStyle = outfit === 1 ? '#ffe553' : '#71f1c7';
      d.fillText(outfit === 1 ? '★' : '⋈', 123, 73);
    }
    url = c.toDataURL('image/png');
  }
  portraitCache.set(key, url);
  return url;
}
export class ArenaView {
  constructor(mount) {
    this.mount = mount;
    this.canvas = document.createElement('canvas');
    mount.append(this.canvas);
    this.layer = document.createElement('div');
    this.layer.className = 'world-labels';
    mount.append(this.layer);
    this.actors = [];
    this.labels = [];
    this.effects = [];
    this.stageCache = new Map();
    this.kick = 0;
    this.rig = new ArenaCamera();
    try {
      this.renderer = new T.WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance',
      });
    } catch {
      this.canvas.remove();
      this.canvas = document.createElement('canvas');
      mount.prepend(this.canvas);
      this.fallback = new FlatArena(this.canvas);
    }
    if (this.renderer) {
      this.renderer.setClearColor(0, 0);
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.65));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = T.PCFSoftShadowMap;
      this.scene = new T.Scene();
      this.fighterGroup = new T.Group();
      this.scene.add(this.fighterGroup);
      this.gelSky = new T.Color();
      this.gelBackdrop = new T.WebGLRenderTarget(1, 1, {
        minFilter: T.LinearMipmapLinearFilter,
        magFilter: T.LinearFilter,
        generateMipmaps: true,
        colorSpace: T.LinearSRGBColorSpace,
        depthBuffer: true,
        stencilBuffer: false,
        depthTexture: new T.DepthTexture(1, 1, T.UnsignedIntType),
      });
      this.gelMaterial = createJellyMaterial(this.gelBackdrop, this.gelSky);
      this.scene.add(new T.HemisphereLight(0xfff7ed, 0xc1b9ed, 2.02));
      const key = new T.DirectionalLight(0xffedcc, 2.55);
      key.position.set(-7, 16, 9);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      Object.assign(key.shadow.camera, { left: -13, right: 13, top: 14, bottom: -14, near: 0.5, far: 45 });
      key.shadow.bias = -0.00045;
      key.shadow.normalBias = 0.025;
      this.scene.add(key);
      this.keyLight = key;
      const rim = new T.DirectionalLight(0xbbecff, 1.4);
      rim.position.set(6, 7, -9);
      this.scene.add(rim);
      this.props = [0, 1, 2].map(softBlock);
      this.scene.add(...this.props);
      this.bubbles = Array.from({ length: 12 }, () => toy(ball, '#fff590', 0, 0, 0, 0.22));
      this.scene.add(...this.bubbles);
      this.stamp = new T.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false });
      this.shadows = [];
      this.flags = [flag(0), flag(1)];
      this.crown = crown();
      this.cart = cart();
      this.zone = hoop('#fff390', 2.7, 0.075);
      this.zone.position.y = 0.06;
      this.bases = TEAM.map((c) => hoop(c, 1.12, 0.095));
      this.track = toy(cube, '#fff0a1', 0, 0.03, 1, 10.5, 0.045, 0.16);
      this.scene.add(...this.flags, this.crown, this.cart, this.zone, ...this.bases, this.track);
      this.rings = ['#f8ff5a', '#ff9dce'].map((c) => hoop(c, 0.82, 0.055));
      this.scene.add(...this.rings);
      this.bursts = Array.from({ length: 48 }, () => toy(cube, '#fff6a6', 0, 0, 0, 0.1));
      this.scene.add(...this.bursts);
    }
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(mount);
  }
  set(config, localId = 0, replay = false, mode = 'shoulder') {
    this.config = config;
    this.layout = layoutFor(config);
    this.localId = localId;
    this.replay = replay;
    this.rig.reset(mode);
    this.effects = [];
    this.kick = 0;
    this.layer.replaceChildren();
    this.labels = [];
    this.mount.style.setProperty('--sky', MAPS[config.map].sky);
    if (this.renderer) {
      this.gelSky.set(MAPS[config.map].sky);
      if (this.stage) this.scene.remove(this.stage);
      const layout = this.layout,
        cacheKey = config.map + '-' + layout.version;
      if (!this.stageCache.has(cacheKey)) this.stageCache.set(cacheKey, makeStage(config.map, layout));
      this.stage = this.stageCache.get(cacheKey);
      this.scene.add(this.stage);
      this.fighterGroup.clear();
      this.actors = [];
      for (const item of [...this.flags, ...this.bases]) item.visible = config.mode === 'flag';
      this.crown.visible = config.mode === 'king';
      this.cart.visible = this.track.visible = config.mode === 'cart';
      this.zone.visible = config.mode === 'zone';
      this.bases.forEach((b, i) => (b.position.x = i ? layout.flagX : -layout.flagX));
      this.track.scale.x = layout.cartEnd * 2 + 0.5;
      this.zone.scale.setScalar(layout.zoneRadius / 2.7);
      const span = Math.max(13, layout.radius + 2.5);
      this.keyLight.position.set(-7, 16, 9).multiplyScalar(Math.sqrt(layout.scale));
      Object.assign(this.keyLight.shadow.camera, {
        left: -span,
        right: span,
        top: span + 1,
        bottom: -span - 1,
        far: 45 * Math.sqrt(layout.scale),
      });
      this.keyLight.shadow.camera.updateProjectionMatrix();
      this.keyLight.shadow.needsUpdate = true;
    }
    this.resize();
  }
  resize() {
    this.w = this.mount.clientWidth;
    this.h = this.mount.clientHeight;
    if (!this.w || !this.h) return;
    this.rig.resize(this.w, this.h, this.layout);
    if (!this.renderer) {
      this.fallback.resize(this.w, this.h, this.layout);
      return;
    }
    this.renderer.setSize(this.w, this.h, false);
    const scale = Math.min(this.renderer.getPixelRatio() * 0.6, 896 / Math.max(this.w, this.h));
    this.gelBackdrop.setSize(
      Math.max(1, Math.round(this.w * scale)),
      Math.max(1, Math.round(this.h * scale)),
    );
  }
  drawScene() {
    const renderer = this.renderer,
      camera = this.rig.camera,
      shadows = renderer.shadowMap;
    const target = renderer.getRenderTarget(),
      auto = shadows.autoUpdate,
      pending = shadows.needsUpdate;
    const fightersVisible = this.fighterGroup.visible;
    // Capture the moving arena once. A fighter cannot refract its own equipment,
    // and the main pass alone updates the full set of character shadows.
    this.fighterGroup.visible = false;
    shadows.autoUpdate = false;
    shadows.needsUpdate = false;
    try {
      renderer.setRenderTarget(this.gelBackdrop);
      renderer.render(this.scene, camera);
    } finally {
      renderer.setRenderTarget(target);
      shadows.autoUpdate = auto;
      shadows.needsUpdate = pending;
      this.fighterGroup.visible = fightersVisible;
    }
    renderer.render(this.scene, camera);
  }
  project(x, y, z) {
    if (this.fallback && this.rig.mode === 'overview' && !this.layout.decks)
      return this.fallback.project(x, y, z);
    V.set(x, y, z).project(this.rig.camera);
    if (V.z < -1 || V.z > 1 || Math.abs(V.x) > 1.03 || Math.abs(V.y) > 1.05) return null;
    return [(V.x * 0.5 + 0.5) * this.w, (-V.y * 0.5 + 0.5) * this.h];
  }
  effect(e) {
    if (!this.config) return;
    const words = {
      ko: '飞啦！',
      skill: '✦',
      block: '格挡！',
      score: '+1',
      crack: '玻璃要碎了！',
      glass: '咔嚓！',
      crown: '♛',
      flag: '夺旗！',
      chain: '连锁！',
      bumper: '弹射！',
    };
    const location = words[e.type] && Number.isFinite(e.x) && this.project(e.x, (e.y ?? 0.55) + 0.7, e.z);
    if (location) {
      const el = document.createElement('b');
      el.className = 'fx-word fx-' + e.type;
      el.textContent = words[e.type];
      const [x, y] = location;
      el.style.left = Math.max(35, Math.min(this.w - 35, x)) + 'px';
      el.style.top = Math.max(50, Math.min(this.h - 30, y)) + 'px';
      this.layer.append(el);
      setTimeout(() => el.remove(), 820);
    }
    if (['hit', 'ko', 'skill', 'glass', 'respawn', 'chain', 'bumper'].includes(e.type)) {
      const n = e.type === 'ko' ? 11 : e.type === 'skill' ? 8 : 4;
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2 + Math.random() * 0.45;
        this.effects.push({
          x: e.x || 0,
          y: Math.max(0.15, e.y || 0.6),
          z: e.z || 0,
          dx: Math.cos(angle) * (2 + Math.random() * 3),
          dz: Math.sin(angle) * (2 + Math.random() * 3),
          dy: 2 + Math.random() * 3,
          life: 0.52,
          max: 0.52,
          c: i % 3,
        });
      }
      if (e.type === 'hit' && (e.by === this.localId || e.who === this.localId))
        this.kick = Math.min(0.16, e.power * 0.008);
      if (this.effects.length > 48) this.effects.splice(0, this.effects.length - 48);
    }
  }
  draw(f, dt = 1 / 60) {
    if (!this.w || !this.config) return;
    this.kick *= Math.exp(-dt * 13);
    this.rig.update(f.actors[this.localId], dt, Math.sin(f.t * 63) * this.kick, this.replay);
    if (this.fallback && (this.rig.mode !== 'overview' || this.layout.decks)) {
      drawPerspectiveArena(this.fallback, this.rig.camera, f, this.config, this.effects);
    } else if (this.fallback) this.fallback.draw(f, this.config, this.effects);
    else {
      updateStage(this.stage, f);
      f.actors.forEach((a, i) => {
        let o = this.actors[i];
        if (!o) {
          o = makeFighter(a.kind, a.skin, a.outfit, this.gelMaterial);
          this.actors[i] = o;
          this.fighterGroup.add(o);
        }
        o.visible = a.dead <= 0;
        let sh = this.shadows[i];
        if (!sh) {
          sh = new T.Mesh(new T.PlaneGeometry(2.15, 2.15), this.stamp);
          sh.rotation.x = -Math.PI / 2;
          this.shadows[i] = sh;
          this.scene.add(sh);
        }
        sh.visible = o.visible && a.y >= -0.04 && hasFloorAt(this.layout, f.glass, a.x, a.z);
        sh.position.set(a.x, 0.027, a.z);
        sh.scale.setScalar(Math.max(0.5, 1 - a.y * 0.08));
        if (i < 2) {
          const ring = this.rings[i];
          ring.visible = a.human && o.visible && sh.visible;
          ring.position.set(a.x, 0.047, a.z);
        }
        if (!o.visible) return;
        placeFighter(o, a, f.t);
      });
      for (let i = f.actors.length; i < this.shadows.length; i++) this.shadows[i].visible = false;
      f.props.forEach((p, i) => {
        const o = this.props[i];
        o.visible = p.dead <= 0;
        o.position.set(p.x, p.y, p.z);
        o.rotation.set(0, p.rot, blockTilt(p));
      });
      this.bubbles.forEach((o, i) => {
        const p = f.shots[i];
        o.visible = !!p;
        if (p) {
          o.position.set(p.x, p.y, p.z);
          o.scale.setScalar(shotRadius(p.chain));
        }
      });
      if (this.crown.visible) {
        const c = f.obj.crown,
          a = f.actors[c.carrier];
        this.crown.position.set(c.x, a ? a.y + 2.32 : 0.4 + Math.sin(f.t * 4) * 0.15, c.z);
        this.crown.rotation.y = f.t;
      }
      if (this.cart.visible) this.cart.position.set(f.obj.cart, 0, 1);
      if (this.zone.visible)
        this.zone.material = paints.get(f.obj.zone < 0 ? '#fff390' : TEAM[f.obj.zone]) || this.zone.material;
      if (this.flags[0].visible)
        this.flags.forEach((v, i) => {
          const p = f.obj.flags[i],
            a = f.actors[p.carrier];
          v.position.set(p.x + (a?.id >= 0 ? 0.4 : 0), a ? a.y + 1 : 0, p.z);
        });
      this.bursts.forEach((o, i) => {
        const p = this.effects[i];
        o.visible = !!p;
        if (p) {
          o.position.set(p.x, p.y, p.z);
          o.scale.set(0.075, p.life * 0.52, 0.08);
          o.rotation.set(f.t * 8 + i, f.t * 3, p.life * 9 + i);
        }
      });
      this.drawScene();
    }
    for (const p of this.effects) {
      p.x += p.dx * dt;
      p.y += p.dy * dt;
      p.z += p.dz * dt;
      p.dy -= dt * 10;
      p.life -= dt;
    }
    this.effects = this.effects.filter((p) => p.life > 0);
    f.actors.forEach((a, i) => {
      let el = this.labels[i];
      if (!el) {
        el = document.createElement('span');
        el.className = 'fighter-label' + (a.human ? ' human' : '');
        el.innerHTML = '<b></b><i></i><em></em>';
        this.layer.append(el);
        this.labels[i] = el;
        el.firstChild.textContent = a.name;
        el.style.setProperty(
          '--team',
          a.human
            ? i === 0
              ? '#f5ff63'
              : '#ffade1'
            : a.team < 2 && this.config.mode !== 'brawl'
              ? TEAM[a.team]
              : '#fff',
        );
      }
      const labelPos = this.project(a.x, a.y + 2.55, a.z);
      el.hidden =
        !labelPos ||
        a.dead > 0 ||
        a.y < -0.8 ||
        (this.rig.mode !== 'overview' && i === this.localId && a.emote <= 0);
      if (el.hidden) return;
      const [x, y] = labelPos;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.children[1].textContent = a.load + '%';
      el.children[1].style.color = a.load >= 70 ? '#ff9d92' : '#fff';
      el.children[2].textContent = a.emote > 0 ? EMOTES[a.emoteId] : '';
    });
  }
}

// Canvas fallback uses the same simulation, camera axes and action indicators.
class FlatArena {
  constructor(canvas) {
    this.canvas = canvas;
    this.d = canvas.getContext('2d');
    this.lensSource = document.createElement('canvas');
    this.lensSource.width = this.lensSource.height = 128;
    this.lensWarp = this.lensSource.cloneNode();
    this.angles = new Image();
    this.blockShapes = [];
    this.angles.src = './assets/fighter-angles.webp';
  }
  resize(w, h, layout = ARENA) {
    this.w = w;
    this.h = h;
    this.layout = layout;
    this.u = Math.min(w / 21, h / 14.6) / layout.scale;
    const r = Math.min(devicePixelRatio || 1, 1.5);
    this.canvas.width = w * r;
    this.canvas.height = h * r;
    this.d.setTransform(r, 0, 0, r, 0, 0);
  }
  project(x, y, z) {
    return [this.w * 0.5 + x * this.u, this.h * 0.52 + (z * 0.62 - y * 0.82) * this.u];
  }
  drawBlock(prop, time, face, depth) {
    const c = updateCollider(prop, time, this.blockShapes[prop.id]);
    this.blockShapes[prop.id] = c;
    const points = c.parts[0].corners.map((p) => p.toArray()),
      id = prop.id % 3;
    const side = ['#e5a332', '#ac74c7', '#5bbb94'][id],
      top = ['#ffd871', '#dca0fa', '#8ae7b4'][id];
    const sides = [
      [0, 1, 5, 4],
      [0, 1, 3, 2],
      [4, 5, 7, 6],
      [0, 2, 6, 4],
      [1, 3, 7, 5],
      [2, 3, 7, 6],
    ];
    const quads = sides.map((indices, i) => {
      const pointsOnFace = indices.map((j) => points[j]);
      return {
        points: pointsOnFace,
        top: i === 5,
        color: i === 5 ? top : side,
        depth: pointsOnFace.reduce((sum, p) => sum + depth(p), 0),
      };
    });
    quads.sort((a, b) => b.depth - a.depth);
    for (const q of quads) {
      face(q.points, q.color);
      if (q.top) {
        const [a, b, , d] = q.points;
        const stripe = [
          [0.25, 0.43],
          [0.75, 0.43],
          [0.75, 0.57],
          [0.25, 0.57],
        ].map(([u, v]) => a.map((n, i) => n + (b[i] - n) * u + (d[i] - n) * v));
        face(stripe, '#fff8da');
      }
    }
  }
  drawFighter(actor, angle, u) {
    const d = this.d,
      atlas = this.angles;
    if (atlas.complete && atlas.naturalWidth) {
      const cell = atlas.naturalWidth / 8,
        size = 3.64 * u;
      const col = ((Math.round((angle * 4) / Math.PI) % 8) + 8) % 8;
      d.filter = actor.skin === 1 ? 'hue-rotate(92deg)' : actor.skin === 2 ? 'hue-rotate(206deg)' : 'none';
      d.drawImage(
        atlas,
        col * cell,
        KINDS.indexOf(actor.kind) * cell,
        cell,
        cell,
        -size / 2,
        -size / 2,
        size,
        size,
      );
      d.filter = 'none';
    } else {
      d.fillStyle = FIGHTERS[actor.kind].color;
      d.beginPath();
      d.ellipse(0, 0, 0.64 * u, u, 0, 0, Math.PI * 2);
      d.fill();
    }
    if (actor.outfit) {
      d.fillStyle = actor.outfit === 1 ? '#ffe553' : '#71f1c7';
      d.font = 'bold ' + 0.35 * u + 'px sans-serif';
      d.fillText(actor.outfit === 1 ? '★' : '⋈', 0.26 * u, -0.72 * u);
    }
  }
  bendBackground(x, y, rx, ry) {
    if (rx < 4 || ry < 4 || x + rx < 0 || y + ry < 0 || x - rx > this.w || y - ry > this.h) return;
    const d = this.d,
      source = this.lensSource,
      warp = this.lensWarp,
      size = source.width;
    const ratio = this.canvas.width / this.w;
    const copy = source.getContext('2d'),
      bend = warp.getContext('2d');
    copy.clearRect(0, 0, size, size);
    copy.drawImage(
      this.canvas,
      (x - rx) * ratio,
      (y - ry) * ratio,
      2 * rx * ratio,
      2 * ry * ratio,
      0,
      0,
      size,
      size,
    );
    // Two perpendicular curved scans bend both axes of the background grid.
    // All fighters reuse these tiles, with no pixel readback or per-frame allocations.
    const strips = 16,
      band = size / strips;
    bend.clearRect(0, 0, size, size);
    d.save();
    d.beginPath();
    d.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    d.clip();
    for (let i = 0; i < strips; i++) {
      const t = ((i + 0.5) * 2) / strips - 1,
        fraction = 0.52 + 0.46 * t * t;
      bend.drawImage(
        source,
        (1 - fraction) * size * 0.5,
        i * band,
        size * fraction,
        band,
        0,
        i * band,
        size,
        band,
      );
    }
    for (let i = 0; i < strips; i++) {
      const t = ((i + 0.5) * 2) / strips - 1,
        fraction = 0.62 + 0.36 * t * t;
      d.drawImage(
        warp,
        i * band,
        (1 - fraction) * size * 0.5,
        band,
        size * fraction,
        x - rx + (i * 2 * rx) / strips,
        y - ry,
        (2 * rx) / strips + 0.35,
        2 * ry,
      );
    }
    d.restore();
  }
  draw(f, c, effects) {
    const d = this.d,
      u = this.u,
      layout = this.layout;
    d.clearRect(0, 0, this.w, this.h);
    const oval = (x, y, rx, ry, col) => {
      d.fillStyle = col;
      d.beginPath();
      d.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      d.fill();
    };
    const line = (a, b, col, w) => {
      d.strokeStyle = col;
      d.lineWidth = w;
      d.lineCap = 'round';
      d.beginPath();
      d.moveTo(...a);
      d.lineTo(...b);
      d.stroke();
    };
    const [cx, cy] = this.project(0, 0, 0),
      r = layout.radius * u;
    const floorRing = (x, z, radius, color, width) => {
      const [px, py] = this.project(x, 0.02, z);
      d.strokeStyle = color;
      d.lineWidth = width * u;
      d.beginPath();
      d.ellipse(px, py, radius * u, 0.62 * radius * u, 0, 0, Math.PI * 2);
      d.stroke();
    };
    oval(cx, cy + u * 1.1, r, r * 0.62, '#62568e');
    oval(cx, cy + u * 0.75, r, r * 0.62, '#f874a6');
    oval(cx, cy, r, r * 0.62, '#ffde69');
    oval(
      cx,
      cy,
      r * 0.95,
      r * 0.59,
      c.map === 'cloud' ? '#52d8d6' : c.map === 'soda' ? '#ff9faa' : '#ada1ea',
    );
    floorRing(0, 0, 6.95 * layout.scale, '#f2ffde', 0.055);
    if (layout.scale > 1) {
      d.save();
      d.setLineDash([0.9 * u, 0.45 * u]);
      floorRing(0, 0, 5.96 * layout.scale, '#ffffff9e', 0.055);
      floorRing(0, 0, 4.96, '#ffffff9e', 0.055);
      d.restore();
    }
    for (let i = 0; i < 32; i++) {
      const a = (i * Math.PI) / 16;
      line(
        this.project(7.4 * layout.scale * Math.cos(a), 0.01, 7.4 * layout.scale * Math.sin(a)),
        this.project(7.8 * layout.scale * Math.cos(a), 0.01, 7.8 * layout.scale * Math.sin(a)),
        '#fff1cd',
        0.15 * u,
      );
    }
    const face = (points, color) => {
      d.fillStyle = color;
      d.beginPath();
      points.forEach((p, i) => {
        const [px, py] = this.project(...p);
        if (i) d.lineTo(px, py);
        else d.moveTo(px, py);
      });
      d.closePath();
      d.fill();
      return true;
    };
    const worldLine = (a, b, color, width) => line(this.project(...a), this.project(...b), color, width * u);
    layout.glass.forEach(([x, z], i) => drawFlatGlass(d, x, z, f.glass[i], face, worldLine));
    const bx = Math.cos(f.angle) * 4.55,
      bz = Math.sin(f.angle) * 4.55;
    line(this.project(-bx, 0.49, -bz), this.project(bx, 0.49, bz), '#e55a90', u * 0.48);
    oval(cx, cy - 0.55 * u, 0.53 * u, 0.42 * u, '#ffde59');
    const token = (x, y, z, emoji) => {
      const [px, py] = this.project(x, y, z);
      d.textAlign = 'center';
      d.font = u * 0.85 + 'px sans-serif';
      d.fillText(emoji, px, py);
    };
    if (c.mode === 'zone')
      floorRing(0, 0, layout.zoneRadius, f.obj.zone < 0 ? '#ffef91' : TEAM[f.obj.zone], 0.11);
    if (c.mode === 'cart') {
      worldLine([-layout.cartEnd, 0.035, 1], [layout.cartEnd, 0.035, 1], '#fff3ad', 0.14);
      token(f.obj.cart, 0.3, 1, '🛒');
    }
    if (c.mode === 'flag') {
      for (const side of [0, 1]) floorRing(side ? layout.flagX : -layout.flagX, 0, 1.12, TEAM[side], 0.14);
      for (const p of f.obj.flags) token(p.x, p.carrier >= 0 ? 2 : 0, p.z, p.team ? '🚩' : '🏳️');
    }
    const objects = [...f.actors.filter((a) => a.dead <= 0), ...f.props.filter((p) => p.dead <= 0)].sort(
      (a, b) => a.z - b.z,
    );
    for (const o of objects) {
      const [x, y] = this.project(o.x, o.y, o.z),
        s = this.project(o.x, 0, o.z);
      if (o.y >= 0 && hasFloorAt(layout, f.glass, o.x, o.z)) oval(...s, 0.72 * u, 0.29 * u, '#685c7140');
      if (!o.kind) {
        this.drawBlock(
          o,
          f.t,
          (points, color) => {
            d.fillStyle = color;
            d.beginPath();
            points.forEach((p, i) => {
              const [px, py] = this.project(...p);
              if (i) d.lineTo(px, py);
              else d.moveTo(px, py);
            });
            d.closePath();
            d.fill();
          },
          (p) => -0.62 * p[1] - 0.82 * p[2],
        );
        continue;
      }
      const shape = jellyShape(o, f.t + o.id * 0.6),
        pivot = y - 0.25 * u,
        footOffset = (1.16 - 0.25) * u;
      this.bendBackground(
        x + shape.leanX * footOffset,
        pivot - shape.height * footOffset,
        0.59 * shape.width * u,
        0.73 * shape.height * u,
      );
      d.save();
      d.translate(x, pivot);
      d.transform(shape.width, 0, -shape.leanX, shape.height, 0, 0);
      d.translate(0, -footOffset);
      this.drawFighter(o, -o.yaw, u);
      d.restore();
    }
    if (c.mode === 'king') {
      const p = f.obj.crown;
      token(p.x, p.carrier >= 0 ? 2.6 : 0.4, p.z, '👑');
    }
    for (const p of [...f.shots, ...effects]) {
      const [x, y] = this.project(p.x, p.y, p.z);
      oval(x, y, 0.12 * u, 0.12 * u, '#ffef8b');
    }
  }
}
