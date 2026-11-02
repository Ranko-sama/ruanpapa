import { FIGHTERS, MAPS, MODES } from './data.js';
import { GLASS_HALF, layoutFor } from './arena-geometry.js';
import { createMatch, stepMatch, frameOf, betweenFrames, STEP } from './sim.js';

const $ = (id) => document.getElementById(id);
export const icon = (id) => '<svg aria-hidden="true"><use href="./assets/icons.svg#' + id + '"/></svg>';
const fmt = (sec) =>
  Math.floor(sec / 60)
    .toString()
    .padStart(2, '0') +
  ':' +
  Math.floor(sec % 60)
    .toString()
    .padStart(2, '0');
const eventNames = {
  float: '失重派对 · 重力归零',
  wind: '云端侧风 · 空中向右漂移',
  bounce: '弹力狂欢 · 落地再弹跳',
};
const soundFor = {
  hit: 'hit',
  block: 'pop',
  skill: 'skill',
  jump: 'jump',
  land: 'land',
  crack: 'pop',
  ko: 'ko',
  respawn: 'respawn',
  event: 'event',
  score: 'score',
  glass: 'glass',
  bumper: 'jump',
  emote: 'emote',
  crown: 'score',
  flag: 'pop',
  shot: 'pop',
  chain: 'hit',
};
const keyCodes = new Set(
  'KeyW KeyA KeyS KeyD KeyQ KeyE ArrowUp ArrowDown ArrowLeft ArrowRight Space KeyJ KeyK KeyL Comma Period Slash Enter Numpad0 Numpad1 Numpad2 Numpad3'.split(
    ' ',
  ),
);
const empty = () => ({ x: 0, z: 0, hit: false, skill: false, jump: false, emote: false });
export function cleanInput(i = {}) {
  return {
    x: Math.max(-1, Math.min(1, Number(i.x) || 0)),
    z: Math.max(-1, Math.min(1, Number(i.z) || 0)),
    hit: i.hit === true,
    skill: i.skill === true,
    jump: i.jump === true,
    emote: i.emote === true,
    ...(Number.isFinite(i.aimYaw)
      ? {
          aimYaw: Math.atan2(Math.sin(i.aimYaw), Math.cos(i.aimYaw)),
          aimPitch: Number.isFinite(i.aimPitch) ? Math.max(-1.1, Math.min(1.1, i.aimPitch)) : 0,
        }
      : {}),
  };
}
export function validFrame(f) {
  return (
    f &&
    Number.isFinite(f.t) &&
    Number.isFinite(f.angle) &&
    Array.isArray(f.actors) &&
    f.actors.length >= 2 &&
    f.actors.length <= 6 &&
    f.actors.every(
      (a, i) =>
        a?.id === i &&
        Object.hasOwn(FIGHTERS, a.kind) &&
        (a.jelly === undefined ||
          (Array.isArray(a.jelly) && a.jelly.length === 3 && a.jelly.every(Number.isFinite))) &&
        [a.x, a.y, a.z, a.yaw, a.load, a.score].every(Number.isFinite),
    ) &&
    Array.isArray(f.props) &&
    f.props.length === 3 &&
    Array.isArray(f.shots) &&
    f.shots.length <= 60 &&
    f.glass?.length === 2 &&
    f.obj?.flags?.length === 2 &&
    f.obj?.teams?.length === 2 &&
    f.obj?.crown
  );
}
export class Highlights {
  constructor(config, localId = 0) {
    this.config = config;
    this.localId = localId;
    this.frames = [];
    this.events = [];
    this.best = null;
    this.pending = null;
    this.last = -2;
  }
  record(f, events = []) {
    this.events.push(...events);
    for (const e of events) {
      const mine = e.by === this.localId || e.who === this.localId;
      const weight =
        e.type === 'ko'
          ? 30 +
            (e.by === this.localId ? 45 : e.who === this.localId ? 8 : 0) +
            Math.min(16, (e.load || 0) * 0.1)
          : e.type === 'score'
            ? 40 + (mine ? 30 : 0)
            : e.type === 'chain'
              ? 20
              : e.type === 'skill' && mine
                ? 9
                : 0;
      if (weight && weight > (this.pending?.weight || this.best?.weight || 0)) {
        this.pending = {
          weight,
          at: e.t,
          until: e.t + 1.05,
          title:
            e.type === 'ko'
              ? e.by === this.localId
                ? '漂亮的击飞！'
                : '擂台飞行现场'
              : e.type === 'score'
                ? '关键得分'
                : e.type === 'chain'
                  ? '泡泡连锁'
                  : '技能大爆发',
        };
      }
    }
    if (f.t - this.last >= 0.096 || !this.frames.length) {
      this.frames.push(f);
      this.last = f.t;
    }
    if (this.pending && f.t >= this.pending.until) this.take();
    while (this.frames.length > 2 && this.frames[1].t < f.t - 6.5) this.frames.shift();
    while (this.events.length && this.events[0].t < f.t - 6.8) this.events.shift();
  }
  take() {
    const p = this.pending;
    if (!p) return;
    const frames = this.frames.filter((f) => f.t >= p.at - 3.35 && f.t <= p.until + 0.15);
    if (frames.length >= 3) {
      this.best = {
        v: 1,
        weight: p.weight,
        title: p.title,
        date: Date.now(),
        config: { ...this.config },
        focusId: this.localId,
        frames,
        events: this.events.filter((e) => e.t >= frames[0].t && e.t <= frames.at(-1).t),
      };
    }
    this.pending = null;
  }
  finish() {
    if (this.pending) this.take();
    if (!this.best && this.frames.length >= 4) {
      this.pending = {
        at: this.frames.at(-1).t,
        until: this.frames.at(-1).t,
        weight: 1,
        title: '派对决胜时刻',
      };
      this.take();
    }
    return this.best;
  }
}
export class Game {
  constructor({ audio, send, finish, pauseMenu }) {
    Object.assign(this, { audio, send, finish, pauseMenu });
    this.phase = 'idle';
    this.keys = new Set();
    this.taps = new Set();
    this.touch = empty();
    this.touchTaps = {};
    this.epoch = 0;
    this.installInput();
    this.clock = 0;
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }
  clearInput() {
    this.keys.clear();
    this.taps.clear();
    this.touch = empty();
    this.touchTaps = {};
    this.remoteInput = empty();
    this.lookDrag = null;
    $('stick').firstElementChild.style.transform = '';
  }
  installInput() {
    window.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch' || e.pointerType === 'mouse') {
          const touch = e.pointerType === 'touch';
          if (this.touchControls !== touch) {
            this.touchControls = touch;
            if (this.phase === 'game') this.controlUI();
          }
        }
      },
      { capture: true },
    );
    window.addEventListener('keydown', (e) => {
      if (this.phase === 'idle' || $('dialog').open) return;
      if (e.code === 'KeyV' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        if (!e.repeat) this.switchCamera();
        return;
      }
      if (e.code === 'Escape') {
        e.preventDefault();
        if (this.phase === 'replay') this.stopClip();
        else if (this.phase === 'game') this.pauseMenu();
        return;
      }
      if (!keyCodes.has(e.code)) return;
      e.preventDefault();
      if (!e.repeat && !this.keys.has(e.code)) this.taps.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clearInput());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.clearInput();
        if (this.phase === 'game' && !this.paused && this.role === 'solo') this.pauseMenu();
      }
    });
    const mount = $('arenaMount');
    mount.addEventListener('pointerdown', (e) => {
      if (this.phase !== 'game' || this.paused) return;
      if (this.view.rig.mode !== 'overview' && !document.pointerLockElement) {
        this.lookDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
        mount.setPointerCapture(e.pointerId);
        if (e.pointerType === 'mouse' && e.button === 0) {
          try {
            mount.requestPointerLock?.()?.catch(() => {});
          } catch {}
        }
      }
      if (e.pointerType === 'mouse' && (e.button === 0 || e.button === 2)) {
        const k = e.button === 2 ? 'skill' : 'hit';
        this.touch[k] = true;
        this.touchTaps[k] = true;
      }
    });
    mount.addEventListener('contextmenu', (e) => e.preventDefault());
    mount.addEventListener('pointermove', (e) => {
      const drag = this.lookDrag;
      if (drag?.id !== e.pointerId || document.pointerLockElement || this.phase !== 'game' || this.paused)
        return;
      const sensitivity = e.pointerType === 'touch' ? 0.005 : 0.0033;
      this.view.rig.turn((e.clientX - drag.x) * sensitivity, (e.clientY - drag.y) * sensitivity);
      drag.x = e.clientX;
      drag.y = e.clientY;
    });
    mount.addEventListener('lostpointercapture', () => {
      this.lookDrag = null;
    });
    document.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === mount && this.phase === 'game' && !this.paused)
        this.view.rig.turn(e.movementX * 0.0027, e.movementY * 0.0027);
    });
    let wasLocked = false;
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === mount;
      if ($('mouseTip')) $('mouseTip').textContent = locked ? '移动鼠标环视' : '点击擂台启用鼠标环视';
      const playingTPS = this.phase === 'game' && !this.paused && this.view?.rig.mode !== 'overview';
      if (locked && !playingTPS) this.releaseMouse();
      if (wasLocked && !locked && playingTPS && !this.releasingMouse) this.pauseMenu();
      if (!locked) this.releasingMouse = false;
      wasLocked = locked;
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse') {
        this.touch.hit = false;
        this.touch.skill = false;
      }
    });
    const stick = $('stick');
    let pointer = null;
    const move = (e) => {
      if (pointer !== e.pointerId) return;
      const r = stick.getBoundingClientRect(),
        x = (e.clientX - r.x - r.width / 2) / (r.width * 0.35),
        z = (e.clientY - r.y - r.height / 2) / (r.height * 0.35),
        n = Math.max(1, Math.hypot(x, z));
      this.touch.x = x / n;
      this.touch.z = z / n;
      stick.firstElementChild.style.transform = 'translate(' + (x / n) * 25 + 'px,' + (z / n) * 25 + 'px)';
    };
    stick.onpointerdown = (e) => {
      pointer = e.pointerId;
      stick.setPointerCapture(pointer);
      move(e);
    };
    stick.onpointermove = move;
    stick.onlostpointercapture = () => {
      pointer = null;
      this.touch.x = this.touch.z = 0;
      stick.firstElementChild.style.transform = '';
    };
    for (const button of document.querySelectorAll('.touch-actions button')) {
      const k = button.dataset.key;
      button.onpointerdown = (e) => {
        button.setPointerCapture(e.pointerId);
        this.touch[k] = true;
        this.touchTaps[k] = true;
      };
      button.onlostpointercapture = () => {
        this.touch[k] = false;
      };
    }
    $('pauseBtn').onclick = () => (this.phase === 'replay' ? this.stopClip() : this.pauseMenu());
    $('skipReplay').onclick = () => this.stopClip();
    $('cameraBtn').onclick = () => this.switchCamera();
  }
  releaseMouse() {
    this.lookDrag = null;
    if (document.pointerLockElement === $('arenaMount')) {
      this.releasingMouse = true;
      document.exitPointerLock();
    }
  }
  cameraUI() {
    const mode = this.view.rig.mode;
    const label = this.view.rig.label;
    $('arena').dataset.camera = mode;
    $('cameraName').textContent = label;
    $('cameraBtn').title = $('cameraBtn').ariaLabel = '切换视角（V），当前为' + label + '视角';
    $('reticle').hidden = mode === 'overview' || this.phase !== 'game';
    $('lookHint').hidden = mode === 'overview';
  }
  controlUI() {
    const touch = this.touchControls ?? matchMedia('(pointer: coarse)').matches;
    $('touchPad').hidden = this.phase !== 'game' || !touch;
    $('actionHint').hidden = this.phase !== 'game' || touch;
    $('arena').classList.toggle('touch-controls', !$('touchPad').hidden);
  }
  switchCamera() {
    if (!['game', 'replay'].includes(this.phase) || $('dialog').open) return;
    this.view.rig.cycle(this.frame.actors[this.localId]);
    if (this.view.rig.mode === 'overview') this.releaseMouse();
    this.view.draw(this.frame, 0);
    this.cameraUI();
  }
  inputs(player = 0) {
    const held = (...codes) => codes.some((c) => this.keys.has(c)),
      fire = (...codes) => codes.some((c) => this.taps.has(c) || this.keys.has(c));
    const arrows = player === 1 || this.config.players === 1 || this.role === 'guest';
    const rig = this.view.rig;
    if (player === 1)
      return {
        ...rig.move(+held('ArrowRight') - +held('ArrowLeft'), +held('ArrowDown') - +held('ArrowUp')),
        hit: fire('Comma', 'Numpad1'),
        skill: fire('Period', 'Numpad2'),
        jump: fire('Enter', 'Numpad0'),
        emote: fire('Slash', 'Numpad3'),
      };
    const x =
      this.touch.x || +held('KeyD') - +held('KeyA') + (arrows ? +held('ArrowRight') - +held('ArrowLeft') : 0);
    const z =
      this.touch.z || +held('KeyS') - +held('KeyW') + (arrows ? +held('ArrowDown') - +held('ArrowUp') : 0);
    return {
      ...rig.move(x, z),
      ...rig.aim(this.frame.actors[this.localId], this.frame, MODES[this.config.mode].team),
      hit: fire('KeyJ') || this.touch.hit || !!this.touchTaps.hit,
      skill: fire('KeyK') || this.touch.skill || !!this.touchTaps.skill,
      jump: fire('Space') || this.touch.jump || !!this.touchTaps.jump,
      emote: fire('KeyL') || this.touch.emote || !!this.touchTaps.emote,
    };
  }
  async viewReady() {
    if (!this.viewPromise)
      this.viewPromise = import('./view.js').then(({ ArenaView }) => new ArenaView($('arenaMount')));
    this.view = await this.viewPromise;
    return this.view;
  }
  showArena() {
    document.activeElement?.blur();
    $('lobby').hidden = true;
    $('arena').hidden = false;
    window.scrollTo(0, 0);
  }
  async start(settings, role = 'solo', initial = null) {
    const epoch = ++this.epoch;
    this.showArena();
    this.phase = 'loading';
    this.big('准备擂台…');
    this.paused = false;
    await this.viewReady();
    if (this.epoch !== epoch) return;
    this.role = role;
    this.localId = role === 'guest' ? 1 : 0;
    this.sim = role === 'guest' ? null : createMatch(settings);
    this.config = this.sim?.config || settings;
    this.frame = this.sim ? frameOf(this.sim) : initial;
    this.rec = new Highlights(this.config, this.localId);
    this.rec.record(this.frame);
    this.phase = 'game';
    this.count = 2.65;
    this.countMark = null;
    this.inputClock = 0;
    this.snapClock = 0;
    this.hudClock = 0;
    this.acc = 0;
    this.clock = performance.now();
    this.remoteEvents = [];
    this.minorUntil = 0;
    this.prevNet = this.nextNet = this.frame;
    this.netAt = performance.now();
    this.netInterval = 0.065;
    this.clearInput();
    this.view.set(this.config, this.localId);
    this.gameUI();
    this.view.draw(this.frame);
    this.hud(this.frame);
    if (role === 'host') this.send('start', { config: this.config, frame: this.frame });
  }
  gameUI() {
    $('gameMap').textContent = MAPS[this.config.map].en + ' / ' + MAPS[this.config.map].name;
    $('gameMode').textContent =
      MODES[this.config.mode].name +
      (this.config.mode === 'adventure' ? ' · 第 ' + (this.config.level + 1) + ' 关' : '');
    $('timeTitle').textContent = this.phase === 'replay' ? '精彩瞬间' : '剩余时间';
    $('replayHud').hidden = this.phase !== 'replay';
    $('playersHud').hidden = this.phase === 'replay';
    this.controlUI();
    $('actionHint').innerHTML =
      '<span><kbd>WASD</kbd>移动</span><span><kbd>J</kbd>攻击</span><span><kbd>K</kbd>技能</span><span><kbd>空格</kbd>跳跃</span><span id="lookHint"><kbd>Q/E</kbd>转向 · <span id="mouseTip">点击擂台启用鼠标环视</span></span>';
    this.cameraUI();
    $('playersHud').replaceChildren();
    if (this.phase !== 'replay')
      for (const a of this.frame.actors.filter(
        (v) => v.human && (this.role === 'solo' || v.id === this.localId),
      )) {
        const el = document.createElement('div');
        el.id = 'hud-' + a.id;
        el.className = 'hud-player';
        el.innerHTML =
          '<img alt="" src="./assets/portrait-' +
          a.kind +
          '.png"><span><small></small><strong></strong><em></em></span>';
        el.querySelector('small').textContent = a.id + 1 + 'P · ' + FIGHTERS[a.kind].name;
        $('playersHud').append(el);
      }
  }
  big(text, minor = false) {
    $('announce').textContent = text;
    $('announce').className = 'announce' + (minor ? ' minor' : '');
  }
  notice(text) {
    this.big(text, true);
    this.minorUntil = performance.now() + 1350;
  }
  feedback(events) {
    for (const e of events) {
      this.view.effect(e);
      const sound = soundFor[e.type];
      if (sound) {
        const gain = e.by === this.localId || e.who === this.localId ? 0.95 : 0.46;
        this.audio.play(sound, e.type === 'land' ? gain * Math.min(1, e.impact / 9) : gain);
      }
      if (this.phase === 'game' && e.type === 'ko') {
        if (e.by === this.localId) this.notice('漂亮的击飞！');
        else if (e.who === this.localId)
          this.notice(e.cause === 'glass' ? '落入玻璃洞！马上归队' : '飞出擂台！马上归队');
      }
    }
  }
  hud(f) {
    $('timer').textContent = fmt(Math.ceil(f.remain));
    const m = this.config.mode,
      o = f.obj,
      scores = o.teams.map(Math.floor),
      local = f.actors[this.localId] || f.actors[0];
    let text = MODES[m].short;
    if (m === 'adventure') text = '合作击飞  ' + scores[0] + ' / ' + f.target;
    else if (m === 'flag' || m === 'zone')
      text =
        (m === 'flag' ? '护旗' : '占领') + '　蓝 ' + scores[0] + '  ·  ' + scores[1] + ' 红　/ ' + f.target;
    else if (m === 'cart')
      text =
        '护送糖果车　' +
        (o.cart >= 0 ? '蓝队 → ' : '← 红队 ') +
        Math.round((Math.abs(o.cart) / f.target) * 100) +
        '%';
    else if (m === 'king') text = '持冠时间　' + Math.floor(local.score) + ' / ' + f.target + ' 秒';
    else
      text =
        '击飞得分　' +
        Math.floor(local.score) +
        ' / ' +
        f.target +
        '　·　领先 ' +
        Math.max(...f.actors.map((a) => a.kos));
    $('goalHud').textContent = text;
    const layout = layoutFor(this.config);
    const shared = this.role === 'solo' && this.config.players === 2;
    const players = shared ? f.actors.filter((a) => a.human) : [local];
    const atRisk = players.find(
      (a) =>
        a.dead <= 0 &&
        a.y >= -0.1 &&
        a.y < 2.5 &&
        layout.glass.some(
          ([x, z], i) =>
            f.glass[i].warn > 0 &&
            Math.abs(a.x - x) < GLASS_HALF + 0.55 &&
            Math.abs(a.z - z) < GLASS_HALF + 0.55,
        ),
    );
    const status = $('eventHud');
    status.hidden = !atRisk && !f.event;
    status.classList.toggle('glass-warning', !!atRisk);
    status.textContent = atRisk
      ? (shared ? atRisk.id + 1 + 'P · ' : '') + '脚下玻璃开裂，快离开！'
      : eventNames[f.event] || '';
    for (const a of f.actors) {
      const el = $('hud-' + a.id);
      if (!el) continue;
      const n = el.querySelector('strong');
      n.textContent = a.load + '%';
      n.style.color = a.load > 65 ? '#c43252' : '#3b3445';
      el.querySelector('em').textContent =
        a.dead > 0
          ? '复活 ' + a.dead.toFixed(1) + 's'
          : a.sc > 0
            ? '技能 ' + a.sc.toFixed(1) + 's'
            : FIGHTERS[a.kind].skill + ' 就绪';
    }
  }
  pause(on, sync = true) {
    if (this.phase !== 'game') return;
    this.paused = on;
    if (on) this.releaseMouse();
    this.clearInput();
    this.acc = 0;
    this.clock = performance.now();
    if (sync && this.role !== 'solo') this.send('pause', { on });
    if (on) this.big('已暂停', true);
    else this.big('');
  }
  receive(m) {
    if (this.phase !== 'game') return;
    if (m.type === 'input' && this.role === 'host') {
      this.remoteInput = cleanInput(m.input);
      this.remoteAt = performance.now();
    }
    if (m.type === 'frame' && this.role === 'guest' && validFrame(m.frame)) {
      this.prevNet = this.nextNet;
      this.nextNet = m.frame;
      this.netAt = performance.now();
      this.netInterval = Math.max(0.025, Math.min(0.18, this.nextNet.t - this.prevNet.t));
      this.count = 0;
      const events = Array.isArray(m.events) ? m.events.slice(0, 96) : [];
      this.feedback(events);
      this.rec.record(m.frame, events);
    }
    if (m.type === 'end' && this.role === 'guest' && validFrame(m.frame) && Array.isArray(m.end?.winners)) {
      this.frame = m.frame;
      this.rec.record(m.frame);
      this.completed(m.end);
    }
  }
  completed(end) {
    if (this.phase !== 'game') return;
    this.phase = 'finish';
    this.releaseMouse();
    this.big('');
    this.view.draw(this.frame);
    this.hud(this.frame);
    this.finish({
      config: this.config,
      frame: this.frame,
      end,
      clip: this.rec.finish(),
      localId: this.localId,
      role: this.role,
    });
  }
  loop(now) {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.15, Math.max(0, (now - (this.clock || now)) / 1000));
    this.clock = now;
    if (this.phase === 'replay') {
      this.tickClip(dt);
      return;
    }
    if (this.phase !== 'game' || this.paused) return;
    const turn = Number(this.keys.has('KeyE')) - Number(this.keys.has('KeyQ'));
    if (turn) this.view.rig.turn(turn * dt * 2.35);
    if (this.count > 0) {
      this.count -= dt;
      const n = Math.ceil(this.count);
      if (n !== this.countMark) {
        this.countMark = n;
        this.big(n > 0 ? String(n) : '开飞！');
        this.audio.play(n > 0 ? 'tick' : 'start', 0.66);
      }
      if (this.count <= 0) {
        this.minorUntil = now + 580;
        this.count = 0;
      }
      this.view.draw(this.frame, dt);
      return;
    }
    if (this.minorUntil && now > this.minorUntil) {
      this.big('');
      this.minorUntil = 0;
    }
    if (this.role === 'guest') {
      if (!this.minorUntil && $('announce').textContent && !$('announce').classList.contains('minor'))
        this.big('');
      this.inputClock += dt;
      if (this.inputClock >= 1 / 30) {
        this.inputClock = 0;
        this.send('input', { input: cleanInput(this.inputs(0)) });
        this.taps.clear();
        this.touchTaps = {};
      }
      this.frame = betweenFrames(
        this.prevNet,
        this.nextNet,
        Math.min(1, (now - this.netAt) / (this.netInterval * 1000)),
      );
    } else {
      this.acc += dt;
      let moving = false;
      while (this.acc >= STEP && !this.sim.end) {
        const input = {
          0: this.inputs(0),
          1:
            this.role === 'host'
              ? now - (this.remoteAt || 0) < 600
                ? this.remoteInput
                : empty()
              : this.inputs(1),
        };
        stepMatch(this.sim, input, STEP);
        this.acc -= STEP;
        moving = true;
        this.taps.clear();
        this.touchTaps = {};
      }
      if (moving) {
        this.frame = frameOf(this.sim);
        const events = this.sim.events.splice(0);
        this.feedback(events);
        this.rec.record(this.frame, events);
        if (this.role === 'host') {
          this.snapClock += dt;
          this.remoteEvents.push(...events);
          if (this.snapClock >= 0.055 || this.sim.end) {
            this.send('frame', { frame: this.frame, events: this.remoteEvents });
            this.snapClock = 0;
            this.remoteEvents = [];
          }
        }
      }
      if (this.sim.end) {
        if (this.role === 'host') this.send('end', { end: this.sim.end, frame: this.frame });
        this.completed(this.sim.end);
        return;
      }
    }
    this.view.draw(this.frame, dt);
    this.hudClock += dt;
    if (this.hudClock > 0.095) {
      this.hud(this.frame);
      this.hudClock = 0;
    }
  }
  async watch(clip, after) {
    if (!clip?.frames?.every(validFrame) || clip.frames.length < 2) {
      after?.();
      return;
    }
    const epoch = ++this.epoch;
    this.showArena();
    await this.viewReady();
    if (this.epoch !== epoch) return;
    const mode = this.phase === 'finish' ? this.view.rig.mode : 'shoulder';
    this.phase = 'replay';
    this.releaseMouse();
    this.clip = clip;
    this.clipAfter = after;
    this.config = clip.config;
    this.localId = clip.frames[0].actors[clip.focusId]?.human ? clip.focusId : 0;
    this.frame = clip.frames[0];
    this.clipT = this.frame.t;
    this.clipIdx = 0;
    this.clipEvent = 0;
    this.hudClock = 0;
    this.clock = performance.now();
    this.clearInput();
    this.big('');
    this.view.set(this.config, this.localId, true, mode);
    this.gameUI();
    this.hud(this.frame);
    $('replayBar').value = 0;
  }
  tickClip(dt) {
    const frames = this.clip.frames;
    this.clipT += dt * 0.8;
    while (this.clipIdx < frames.length - 2 && frames[this.clipIdx + 1].t <= this.clipT) this.clipIdx++;
    const a = frames[this.clipIdx],
      b = frames[this.clipIdx + 1];
    this.frame = betweenFrames(a, b, Math.min(1, Math.max(0, (this.clipT - a.t) / (b.t - a.t || 1))));
    const events = this.clip.events || [];
    while (this.clipEvent < events.length && events[this.clipEvent].t <= this.clipT)
      this.feedback([events[this.clipEvent++]]);
    this.view.draw(this.frame, dt);
    this.hudClock += dt;
    if (this.hudClock > 0.1) {
      this.hud(this.frame);
      this.hudClock = 0;
    }
    $('replayBar').value = (this.clipT - frames[0].t) / (frames.at(-1).t - frames[0].t || 1);
    if (this.clipT >= frames.at(-1).t + 0.25) this.stopClip();
  }
  stopClip() {
    if (this.phase !== 'replay') return;
    this.phase = 'finish';
    const done = this.clipAfter;
    this.clipAfter = null;
    done?.();
  }
  leave() {
    this.epoch++;
    this.phase = 'idle';
    this.releaseMouse();
    this.paused = false;
    this.clearInput();
    this.big('');
    $('arena').hidden = true;
    $('lobby').hidden = false;
    $('replayHud').hidden = true;
  }
}
