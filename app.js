import {
  FIGHTERS,
  MAPS,
  MODES,
  MAP_IDS,
  KINDS,
  ACHIEVEMENTS,
  SKINS,
  OUTFITS,
  EMOTES,
  unlocked,
  skinOpen,
  outfitOpen,
  emoteOpen,
  loadProfile,
  freshProfile,
} from './data.js';
import { createAudio } from './assets/audio.js';
import { Party } from './party.js';
import { Game, icon, validFrame } from './match.js';

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
let profile;
try {
  profile = loadProfile(localStorage);
} catch {
  profile = freshProfile();
}
const audio = createAudio();
audio.setEnabled(profile.sound);
const settings = { mode: 'brawl', map: 'cloud', players: 1, p2: 'knight', level: 0 };
let panel = '',
  pairTab = 'host',
  pairBusy = false,
  pairStatus = '',
  guestPick = { kind: 'knight' },
  lastResult = null,
  stash = null;
const party = new Party(packet, partyState);
const game = new Game({
  audio,
  send: (t, p) => party.send(t, p),
  finish: finishMatch,
  pauseMenu: pauseMatch,
});
let toastTimer;
function toast(msg) {
  const n = $('toast');
  if ($('dialog').open) $('dialog').append(n);
  else document.body.append(n);
  n.textContent = msg;
  n.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (n.hidden = true), 2700);
}
function save() {
  try {
    localStorage.setItem('jelly-rumble-v1', JSON.stringify(profile));
  } catch {
    try {
      profile.clips = profile.clips.slice(0, 1);
      localStorage.setItem('jelly-rumble-v1', JSON.stringify(profile));
    } catch {
      toast('浏览器存储空间不足，本次进度仅保留在当前页面。');
    }
  }
}
function pick() {
  return { kind: profile.kind, skin: profile.skin, outfit: profile.outfit, emote: profile.emote };
}
function safePick(v = {}) {
  return {
    kind: KINDS.includes(v.kind) ? v.kind : 'knight',
    skin: [0, 1, 2].includes(v.skin) ? v.skin : 0,
    outfit: [0, 1, 2].includes(v.outfit) ? v.outfit : 0,
    emote: [0, 1, 2].includes(v.emote) ? v.emote : 0,
  };
}
function paintSelected(image) {
  const { kind, skin, outfit } = profile;
  if (!image || (!skin && !outfit)) return;
  import('./view.js')
    .then((v) => v.loadoutPortrait(kind, skin, outfit))
    .then((url) => {
      if (image.isConnected) image.src = url;
    })
    .catch(() => {});
}
function prepare() {
  audio.unlock();
}
window.addEventListener('pointerdown', prepare, { once: true });
window.addEventListener('keydown', prepare, { once: true });
function sounds() {
  for (const b of document.querySelectorAll('.sound')) {
    b.innerHTML = icon(profile.sound ? 'sound' : 'mute');
    b.title = b.ariaLabel = profile.sound ? '关闭声音' : '开启声音';
    b.setAttribute('aria-pressed', String(profile.sound));
  }
}
function refresh() {
  const active = settings.mode === 'adventure' ? MAP_IDS[settings.level] : settings.map,
    m = MAPS[active],
    j = MAP_IDS.indexOf(active);
  $('heroImage').src = './assets/hero-' + active + '.png';
  $('heroImage').alt = '巨锤力士、骑士和牛仔在' + m.name + '上交战';
  $('heroMap').textContent = $('stripMap').textContent = m.name;
  $('mapSymbol').innerHTML = icon(m.icon);
  $('mapSerial').textContent = 'STAGE 0' + (j + 1) + ' / ' + String(MAP_IDS.length).padStart(2, '0');
  for (const [name, value] of [
    ['--sky1', ['#a6ebea', '#ffe1bc', '#d8cffb', '#d3f4e8', '#e5cefb'][j]],
    ['--sky2', ['#71d5e9', '#ffb3ad', '#afa6e7', '#82cdd9', '#a39bdf'][j]],
    ['--sky3', ['#aee8f3', '#ffd1be', '#c6c8ee', '#b1e8e7', '#b6cef4'][j]],
  ])
    $('hero').style.setProperty(name, value);
  $('stripMode').textContent = MODES[settings.mode].name;
  $('stripParty').textContent = party.ready
    ? '好友联机 · 2 人'
    : settings.players === 2
      ? '本地双人'
      : '单人 + 机器人';
  $('mapSymbol').setAttribute('aria-label', m.name);
  $('stripMap').parentElement.previousElementSibling.innerHTML = icon(m.icon);
  $('stripMode').parentElement.previousElementSibling.innerHTML = icon(MODES[settings.mode].icon);
  $('rosterCount').innerHTML =
    icon('lock') + ' <b>' + KINDS.filter((k) => unlocked(k, profile)).length + ' / 4</b> 已解锁';
  const background = [
    ['#ffbfd1', '#fb95b6'],
    ['#b9e3ff', '#8dc3f5'],
    ['#ffe3a4', '#ffca7a'],
    ['#e3dafa', '#bdafdd'],
  ];
  $('roster').innerHTML = KINDS.map((k, i) => {
    const a = FIGHTERS[k],
      sel = profile.kind === k,
      locked = !unlocked(k, profile),
      badge = locked
        ? icon('lock') + (3 - profile.games) + ' 场后解锁'
        : sel
          ? icon('check') + '已出战'
          : icon(a.icon) + a.skill;
    return (
      '<button data-fighter="' +
      k +
      '" aria-label="' +
      a.name +
      '，' +
      (locked ? '查看解锁条件' : a.type) +
      '" aria-pressed="' +
      sel +
      '" class="fighter-card ' +
      (sel ? 'selected ' : '') +
      (locked ? 'locked' : '') +
      '" style="--card:' +
      background[i][0] +
      ';--card2:' +
      background[i][1] +
      '"><img src="./assets/portrait-' +
      k +
      '.png" alt=""><span class="card-text"><small class="card-number">NO.0' +
      (i + 1) +
      ' / ' +
      a.en +
      '</small><h3>' +
      a.name +
      '</h3><span class="role">' +
      a.type +
      '</span><span class="badge">' +
      badge +
      '</span></span></button>'
    );
  }).join('');
  paintSelected($('roster').querySelector('.selected img'));
  $('play').disabled = party.ready && party.role === 'guest';
  $('play').lastElementChild.textContent = $('play').disabled
    ? '等待房主'
    : settings.mode === 'adventure'
      ? '开始闯关'
      : '开始乱斗';
  document.querySelector('.player-chip b').textContent = party.ready ? '已联机' : '本地玩家';
  document.querySelector('.friend-link span').textContent = party.ready
    ? '联机房间'
    : party.pc
      ? '配对房间'
      : '好友联机';
  sounds();
}
function nav(name) {
  for (const el of document.querySelectorAll('.nav-btn'))
    el.classList.toggle('current', el.dataset.nav === name);
}
function dialog(name, title, en, html) {
  const was = panel;
  panel = name;
  nav(['collection', 'clips'].includes(name) ? name : 'home');
  $('dialogEyebrow').textContent = en;
  $('dialogTitle').textContent = title;
  $('dialogBody').innerHTML = html;
  if (!$('dialog').open) {
    $('dialog').showModal();
    $('dialog').scrollTop = 0;
  } else if (was !== name) $('dialog').scrollTop = 0;
}
function closePanel(effects = true) {
  const previous = panel;
  panel = '';
  if ($('dialog').open) $('dialog').close();
  nav('home');
  if ($('toast').parentElement === $('dialog')) document.body.append($('toast'));
  if (!effects) return;
  if (previous === 'pause') game.pause(false);
  if (previous === 'results') {
    game.leave();
    refresh();
  }
}
$('dialog').addEventListener('cancel', (e) => {
  e.preventDefault();
  closePanel();
});
$('dialog').addEventListener('click', (e) => {
  if (e.target === $('dialog')) {
    const r = $('dialog').getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closePanel();
  }
});
$('dialogClose').onclick = () => closePanel();
const btn = (label, act, ico, primary = false) =>
  '<button class="btn ' +
  (primary ? 'primary' : 'secondary') +
  '" data-act="' +
  act +
  '">' +
  (ico ? icon(ico) : '') +
  label +
  '</button>';
const option = (label, group, key, sel, ico, more = '') =>
  '<button class="opt ' +
  (sel ? 'chosen' : '') +
  '" data-group="' +
  group +
  '" data-value="' +
  key +
  '" aria-pressed="' +
  !!sel +
  '" ' +
  more +
  '>' +
  (ico ? icon(ico) : '') +
  label +
  '</button>';
const section = (title, ico, extra = '') =>
  '<h3 class="subhead">' + icon(ico) + title + (extra ? '<small>' + extra + '</small>' : '') + '</h3>';
function setupPanel() {
  const adventure = settings.mode === 'adventure',
    map = adventure ? MAP_IDS[settings.level] : settings.map;
  dialog(
    'setup',
    '对局设置',
    'MATCH SETUP',
    section('玩家配置', 'users') +
      '<div class="options ' +
      (party.ready ? 'two' : 'three') +
      '">' +
      (party.ready
        ? '<div class="opt chosen">' +
          icon('link') +
          '好友联机 · 2 人</div>' +
          btn('房间详情', 'party', 'users')
        : option('单人 + 机器人', 'players', 1, settings.players === 1, 'gamepad') +
          option('本地双人', 'players', 2, settings.players === 2, 'users') +
          btn('好友联机', 'party', 'link')) +
      '</div>' +
      (settings.players === 2 && !party.ready
        ? '<label class="p2-picker"><b>2P 出战战士</b><select id="p2Select">' +
          KINDS.filter((k) => unlocked(k, profile))
            .map(
              (k) =>
                '<option value="' +
                k +
                '" ' +
                (settings.p2 === k ? 'selected' : '') +
                '>' +
                FIGHTERS[k].name +
                '</option>',
            )
            .join('') +
          '</select></label>'
        : '') +
      section('游戏模式', 'gamepad') +
      '<div class="options three">' +
      Object.entries(MODES)
        .map(([k, m]) => option(m.name, 'mode', k, k === settings.mode, m.icon))
        .join('') +
      '</div>' +
      '<p class="description desc-panel">' +
      MODES[settings.mode].rule +
      '</p>' +
      section(
        adventure ? '挑战关卡' : '选择舞台',
        adventure ? 'flag' : 'cloud',
        adventure ? '通关后开启下一关' : MAP_IDS.length + ' 座物理擂台',
      ) +
      '<div class="options three">' +
      MAP_IDS.map((k, i) =>
        option(
          adventure ? '0' + (i + 1) + ' ' + MAPS[k].name : MAPS[k].name,
          adventure ? 'level' : 'map',
          adventure ? i : k,
          map === k,
          adventure && i > profile.cleared ? 'lock' : MAPS[k].icon,
          adventure && i > profile.cleared ? 'disabled' : '',
        ),
      ).join('') +
      '</div>' +
      '<p class="description">' +
      MAPS[map].detail +
      '</p><div class="dialog-actions">' +
      btn('完成设置', 'close', 'check', true) +
      '</div>',
  );
}
function helpPanel() {
  dialog(
    'help',
    '操作指南',
    'HOW TO RUMBLE',
    '<p class="description">朝对手移动并挥击。头顶的百分比越高，下一次受击就会飞得越远。掉出场地后会自动复活。</p>' +
      '<table class="kbd-table"><thead><tr><th>动作</th><th>1P / 联机玩家</th><th>同屏 2P</th></tr></thead><tbody>' +
      [
        ['移动', 'W A S D', '↑ ← ↓ →'],
        ['普通攻击', 'J', '， / 小键盘 1'],
        ['角色技能', 'K', '。 / 小键盘 2'],
        ['跳跃', '空格', 'Enter / 小键盘 0'],
        ['表情', 'L', '/ / 小键盘 3'],
        ['切换视角', 'V', '共用同一镜头'],
        ['转动镜头', '鼠标 / Q、E', '跟随 1P'],
        ['暂停', 'Esc', 'Esc'],
      ]
        .map(
          (row) =>
            '<tr><td>' +
            row[0] +
            '</td><td><kbd>' +
            row[1] +
            '</kbd></td><td><kbd>' +
            row[2] +
            '</kbd></td></tr>',
        )
        .join('') +
      '</tbody></table>' +
      '<div class="help-note">默认从右肩后方观察。V 依次切换越肩、正后方和全场视角。点击擂台后移动鼠标环视，左右键分别攻击和施放技能，也可以用 Q、E 转向。触屏可滑动空白处转镜头，点右上角镜头按钮切换。</div>' +
      section('击飞小窍门', 'spark') +
      '<p class="description">跳过中央扫杆，绕开闪烁的玻璃。对准弹力方块出手，它撞飞的对手也会为你得分。</p><div class="dialog-actions">' +
      btn('知道了', 'close', 'check', true) +
      '</div>',
  );
}
function fighterInfo(k) {
  const f = FIGHTERS[k],
    open = unlocked(k, profile);
  dialog(
    'fighter',
    f.name,
    f.en + ' / FIGHTER FILE',
    '<div class="collection-hero"><img src="./assets/portrait-' +
      k +
      '.png" alt="' +
      f.name +
      '"><div><h3>' +
      f.skill +
      '</h3><p>' +
      f.detail +
      '</p></div></div>' +
      (!open
        ? '<p class="notice">' +
          icon('lock') +
          ' 完成 3 场对局，或通关合作闯关，即可解锁。当前已完成 ' +
          profile.games +
          ' / 3 场。</p>'
        : '<p class="description">已选为 1P 战士，可以在收藏里搭配皮肤、表情和装扮。</p>') +
      '<div class="dialog-actions">' +
      (open ? btn('搭配装扮', 'collection', 'palette') : '') +
      btn('返回大厅', 'close', 'check', true) +
      '</div>',
  );
}
function collectionPanel() {
  const k = profile.kind;
  const row = (items, group, idx, check, lockedTips) =>
    '<div class="options three">' +
    items
      .map((v, i) =>
        option(
          v,
          group,
          i,
          i === idx,
          check(i, profile) ? (i === idx ? 'check' : null) : 'lock',
          'title="' + (check(i, profile) ? v : lockedTips[i]) + '"',
        ),
      )
      .join('') +
    '</div>';
  dialog(
    'collection',
    '我的收藏',
    'LOCKER ROOM',
    '<div class="collection-hero"><img src="./assets/portrait-' +
      k +
      '.png" alt=""><div><h3>' +
      FIGHTERS[k].name +
      '</h3><p>' +
      FIGHTERS[k].detail +
      '</p></div></div>' +
      '<div class="metrics"><span><b>' +
      profile.games +
      '</b>完成对局</span><span><b>' +
      profile.kos +
      '</b>累计击飞</span><span><b>' +
      profile.wins +
      '</b>派对胜场</span></div>' +
      section('战士皮肤', 'palette') +
      row(SKINS, 'skin', profile.skin, skinOpen, ['', '累计击飞 3 次解锁', '完成 5 场对局解锁']) +
      section('随身装扮', 'star') +
      row(OUTFITS, 'outfit', profile.outfit, outfitOpen, ['', '赢下 1 场对局解锁', '累计击飞 10 次解锁']) +
      section('出场表情', 'smile', '对局中按 L 使用') +
      row(
        EMOTES.map((x, i) => x + ' ' + ['闪亮登场', '软糖爱心', '欢乐音符'][i]),
        'emote',
        profile.emote,
        emoteOpen,
        ['', '完成 1 场对局解锁', '完成 3 场对局解锁'],
      ) +
      section('派对成就', 'medal') +
      '<div class="achievements">' +
      ACHIEVEMENTS.map(
        (a) =>
          '<div class="achievement ' +
          (a.test(profile) ? 'done' : '') +
          '">' +
          icon(a.icon) +
          '<span><strong>' +
          a.name +
          '</strong><small>' +
          a.desc +
          (a.test(profile) ? ' · 已达成' : '') +
          '</small></span></div>',
      ).join('') +
      '</div><div class="dialog-actions">' +
      btn('完成搭配', 'close', 'check', true) +
      '</div>',
  );
  paintSelected($('dialogBody').querySelector('.collection-hero img'));
}
function clipsPanel() {
  const rows = profile.clips
    .map(
      (c, i) =>
        '<button class="clip-row" data-clip="' +
        i +
        '"><img src="./assets/hero-' +
        c.config.map +
        '.png" alt=""><span><b>' +
        esc(c.title) +
        '</b><small>' +
        MAPS[c.config.map].name +
        ' · ' +
        MODES[c.config.mode].name +
        ' · ' +
        (c.frames.at(-1).t - c.frames[0].t).toFixed(1) +
        ' 秒</small></span>' +
        icon('play') +
        '</button>',
    )
    .join('');
  dialog(
    'clips',
    '精彩回放',
    'HIGHLIGHT REEL',
    rows
      ? '<p class="description">最近三场完整对局的精彩瞬间会保存在这台设备上。</p>' + rows
      : '<div class="empty-panel">' +
          icon('film') +
          '<h3>你的首支精彩片段还在擂台上</h3><p>完成一场对局，击飞和连锁碰撞会自动剪成慢动作回放。</p></div>' +
          '<div class="dialog-actions">' +
          btn('回到大厅', 'close', 'gamepad', true) +
          '</div>',
  );
}
async function copyText(value) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    const a = document.createElement('textarea');
    a.value = value;
    a.style.cssText = 'position:fixed;opacity:0;left:0;top:0';
    const parent = $('dialog').open ? $('dialog') : document.body;
    parent.append(a);
    a.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {}
    a.remove();
    return ok;
  }
}
function partyPanel() {
  let html = '';
  if (party.ready)
    html =
      '<div class="collection-hero"><span class="section-icon">' +
      icon('link') +
      '</span><div><h3>好友已入场</h3><p>' +
      (party.role === 'host'
        ? '你是房主。回到大厅选择玩法，按「开始乱斗」带好友一起入场。'
        : '你是 2P。可以回大厅选择自己的战士，房主开局后将自动入场。') +
      '</p></div></div><div class="dialog-actions">' +
      btn('断开联机', 'disconnect', 'close') +
      btn('返回大厅', 'close', 'check', true) +
      '</div>';
  else {
    html =
      '<div class="tabs">' +
      option('我是房主', 'pairtab', 'host', pairTab === 'host', 'crown', pairBusy ? 'disabled' : '') +
      option('加入好友', 'pairtab', 'guest', pairTab === 'guest', 'users', pairBusy ? 'disabled' : '') +
      '</div>';
    if (pairTab === 'host') {
      html +=
        '<p class="description">' +
        (party.direct
          ? '两台设备连接同一个 Wi-Fi，好友打开启动窗口显示的局域网地址，输入六位房间码即可加入。'
          : '创建邀请，将邀请链接交给好友。好友打开链接后会生成回执码，将回执码粘贴到这里完成配对。') +
        '</p>';
      if (party.role === 'host' && (party.roomCode || party.manualCode)) {
        if (party.roomCode)
          html +=
            '<div class="pairbox"><label>房间码 · 五分钟内有效</label><b class="room-code">' +
            esc(party.roomCode) +
            '</b></div><div class="dialog-actions">' +
            btn('重新创建', 'makeRoom', 'refresh') +
            btn('复制房间码', 'copyRoom', 'copy', true) +
            '</div>';
        else
          html +=
            '<div class="pairbox"><label for="offerOut">① 把邀请链接交给好友</label><textarea id="offerOut" readonly></textarea>' +
            btn('复制邀请链接', 'copyInvite', 'copy') +
            '<label for="answerIn">② 粘贴好友的回执码</label><textarea id="answerIn" placeholder="粘贴回执码"></textarea></div><div class="dialog-actions">' +
            btn('连接好友', 'acceptAnswer', 'link', true) +
            '</div>';
      } else
        html +=
          '<div class="dialog-actions">' +
          btn(pairBusy ? '正在创建…' : '创建房间', 'makeRoom', 'link', true) +
          '</div>';
    } else {
      html +=
        '<p class="description">' +
        (party.direct
          ? '输入房主提供的六位房间码，或粘贴完整邀请链接。'
          : '粘贴房主的邀请链接或邀请码，生成回执码。两台设备需要能建立 WebRTC 直连。') +
        '</p>';
      if (party.role === 'guest' && party.manualCode) {
        html +=
          '<div class="pairbox"><label for="answerOut">将回执码交给房主</label><textarea id="answerOut" readonly></textarea></div><div class="dialog-actions">' +
          btn('复制回执码', 'copyAnswer', 'copy', true) +
          '</div>';
      } else
        html +=
          '<div class="pairbox"><label for="offerIn">' +
          (party.direct ? '房间码或邀请链接' : '好友的邀请链接') +
          '</label><textarea id="offerIn" placeholder="' +
          (party.direct ? '例如 123456' : '粘贴好友的邀请链接') +
          '"></textarea></div><div class="dialog-actions">' +
          btn(pairBusy ? '正在配对…' : '加入房间', 'joinRoom', 'link', true) +
          '</div>';
    }
    html += '<p class="description" id="pairStatus" role="status">' + esc(pairStatus) + '</p>';
  }
  dialog('party', '好友联机', 'FRIEND LOBBY', html);
  if ($('offerOut')) $('offerOut').value = location.href.split('#')[0] + '#invite=' + party.manualCode;
  if ($('answerOut')) $('answerOut').value = party.manualCode;
  if ($('offerIn') && stash) {
    $('offerIn').value = stash;
    stash = null;
  }
}
async function openParty() {
  pairStatus = '';
  await party.discover();
  partyPanel();
}
function partyState(state) {
  if (state === 'connected') {
    pairBusy = false;
    pairStatus = '好友已连接';
    party.send('pick', { pick: pick() });
    if (panel === 'party') partyPanel();
    audio.play('score', 0.6);
    toast('好友已连接，可以开局了。');
  } else if (state === 'expired') {
    pairStatus = '房间已过期，请重新创建房间。';
    if (panel === 'party') partyPanel();
  } else {
    if (game.phase === 'game' && game.role === 'guest') {
      closePanel(false);
      game.leave();
      toast('房主已断开，已返回大厅。');
    } else if (game.phase === 'game' && game.role === 'host') {
      game.role = 'solo';
      const a = game.sim?.actors[1];
      if (a) {
        a.human = false;
        a.name = '替补';
      }
      toast('好友已离开，机器人接替 2P。');
    }
    pairBusy = false;
    pairStatus = state === 'failed' ? '两台设备未能建立直连。可连到同一 Wi-Fi 后重新配对。' : '已断开房间';
    if (panel === 'party') partyPanel();
  }
  refresh();
}
function packet(m) {
  if (m.type === 'pick') {
    guestPick = safePick(m.pick);
    return;
  }
  if (
    m.type === 'start' &&
    party.role === 'guest' &&
    validFrame(m.frame) &&
    Object.hasOwn(MODES, m.config?.mode) &&
    Object.hasOwn(MAPS, m.config?.map)
  ) {
    closePanel(false);
    lastResult = null;
    game.start({ ...m.config, players: 2 }, 'guest', m.frame).catch(startError);
    return;
  }
  if (m.type === 'abort' && party.role === 'guest') {
    closePanel(false);
    game.leave();
    refresh();
    toast('房主已返回大厅。');
    return;
  }
  if (m.type === 'pause' && game.phase === 'game') {
    game.pause(!!m.on, false);
    if (m.on) showPause();
    else if (panel === 'pause') closePanel(false);
    return;
  }
  game.receive(m);
}
function startError(e) {
  game.leave();
  refresh();
  toast('擂台加载失败，请刷新重试。');
  console.error(e);
}
function startGame() {
  if (game.phase === 'loading' || (party.ready && party.role === 'guest')) return;
  prepare();
  audio.play('click', 0.65);
  closePanel(false);
  lastResult = null;
  const picks = [pick(), party.ready ? guestPick : { kind: settings.p2 }];
  game
    .start({ ...settings, players: party.ready ? 2 : settings.players, picks }, party.ready ? 'host' : 'solo')
    .catch(startError);
}
function pauseMatch() {
  if (game.phase !== 'game') return;
  game.pause(true);
  showPause();
}
function showPause() {
  dialog(
    'pause',
    '派对暂停',
    'TIME OUT',
    '<p class="description">' +
      MODES[game.config.mode].rule +
      '</p><div class="help-note"><b>1P</b>　WASD 移动　J 攻击　K 技能　空格跳跃　L 表情<br><b>2P</b>　方向键移动　，攻击　。技能　Enter 跳跃　/ 表情<br><b>镜头</b>　V 切换视角　鼠标环视　Q / E 转向</div>' +
      '<div class="dialog-actions">' +
      btn('退出本局', 'abort', 'home') +
      btn('继续乱斗', 'close', 'play', true) +
      '</div>',
  );
}
function finishMatch(result) {
  const { config, frame, end, localId, role } = result,
    player = frame.actors[localId];
  const old = { ...profile },
    counted = role === 'solo' && config.players === 2 ? frame.actors.filter((a) => a.human) : [player];
  const drew = end.winners.length > 1;
  const won = !drew && counted.some((a) => end.winners.includes(end.team ? a.team : a.id));
  profile.games++;
  profile.kos += counted.reduce((sum, a) => sum + a.kos, 0);
  if (won) profile.wins++;
  if (config.mode === 'adventure' && won) profile.cleared = Math.max(profile.cleared, config.level + 1);
  if (result.clip) profile.clips = [result.clip, ...profile.clips].slice(0, 3);
  const rewards = ACHIEVEMENTS.filter((a) => a.test(profile) && !a.test(old)).map((a) => a.name);
  if (!unlocked('spark', old) && unlocked('spark', profile)) rewards.push('新战士 · 闪电兔兔');
  if (!skinOpen(1, old) && skinOpen(1, profile)) rewards.push('蓝莓苏打皮肤');
  if (!skinOpen(2, old) && skinOpen(2, profile)) rewards.push('蜜瓜派对皮肤');
  lastResult = { ...result, drew, won, rewards };
  save();
  refresh();
  audio.play(won ? 'win' : 'lose', 0.8);
  if (result.clip) game.watch(result.clip, resultsPanel).catch(() => resultsPanel());
  else resultsPanel();
}
function resultsPanel() {
  if (!lastResult) {
    game.leave();
    return;
  }
  const { config, frame, won, drew, rewards, localId } = lastResult,
    m = MODES[config.mode],
    adv = config.mode === 'adventure';
  const order = [...frame.actors].sort((a, b) =>
    m.team
      ? (m.team && lastResult.end.winners.includes(b.team)) -
          (m.team && lastResult.end.winners.includes(a.team)) || b.kos - a.kos
      : b.score - a.score || b.kos - a.kos,
  );
  const title = drew
    ? '势均力敌！'
    : adv
      ? won
        ? config.level === MAP_IDS.length - 1
          ? '闯关成功！'
          : '挑战过关！'
        : '再来挑战！'
      : won
        ? '派对胜利！'
        : '对局结束';
  dialog(
    'results',
    title,
    'ROUND RESULTS',
    '<p class="results-title"><b>' +
      m.name +
      '</b>　·　' +
      MAPS[config.map].name +
      '</p><div class="results-list">' +
      order
        .map(
          (a, i) =>
            '<div class="result-row ' +
            (a.id === localId ? 'you' : '') +
            '"><b>' +
            String(i + 1).padStart(2, '0') +
            '</b><img src="./assets/portrait-' +
            a.kind +
            '.png" alt=""><strong>' +
            esc(a.name) +
            ' · ' +
            FIGHTERS[a.kind].name +
            '</strong><em>' +
            a.kos +
            ' 击飞</em><span>' +
            (m.team ? (a.team === 0 ? '蓝队' : '红队') : Math.floor(a.score) + ' 分') +
            '</span></div>',
        )
        .join('') +
      '</div>' +
      (m.team
        ? '<p class="description">队伍成绩　蓝队 ' +
          Math.floor(frame.obj.teams[0]) +
          '　·　红队 ' +
          Math.floor(frame.obj.teams[1]) +
          '</p>'
        : '') +
      (rewards.length
        ? '<p class="notice">' + icon('trophy') + ' 新解锁　' + rewards.map(esc).join('　·　') + '</p>'
        : '') +
      '<div class="dialog-actions">' +
      btn('返回大厅', 'resultHome', 'home') +
      (lastResult.clip ? btn('再看回放', 'resultClip', 'film') : '') +
      (party.ready && party.role === 'guest'
        ? ''
        : btn(
            adv && won && config.level < MAP_IDS.length - 1 ? '进入下一关' : '再来一局',
            adv && won && config.level < MAP_IDS.length - 1 ? 'nextLevel' : 'again',
            'play',
            true,
          )) +
      '</div>',
  );
}
function selectGroup(group, key, el) {
  audio.play('click', 0.6);
  if (group === 'pairtab') {
    if (pairBusy) return;
    pairTab = key;
    pairStatus = '';
    partyPanel();
    return;
  }
  if (['skin', 'outfit', 'emote'].includes(group)) {
    const id = Number(key),
      test = { skin: skinOpen, outfit: outfitOpen, emote: emoteOpen }[group];
    if (!test(id, profile)) {
      toast(el.title);
      return;
    }
    profile[group] = id;
    save();
    refresh();
    if (party.ready) party.send('pick', { pick: pick() });
    collectionPanel();
    return;
  }
  if (group === 'mode') settings.mode = key;
  if (group === 'map') settings.map = key;
  if (group === 'players') settings.players = Number(key);
  if (group === 'level') settings.level = Number(key);
  refresh();
  setupPanel();
}
async function action(key) {
  switch (key) {
    case 'help':
      helpPanel();
      break;
    case 'setup':
      setupPanel();
      break;
    case 'collection':
      collectionPanel();
      break;
    case 'clips':
      clipsPanel();
      break;
    case 'close':
      closePanel();
      break;
    case 'mapNext':
      if (settings.mode === 'adventure') {
        setupPanel();
        break;
      }
      settings.map = MAP_IDS[(MAP_IDS.indexOf(settings.map) + 1) % MAP_IDS.length];
      refresh();
      break;
    case 'party':
      await openParty();
      break;
    case 'makeRoom':
    case 'joinRoom':
    case 'acceptAnswer': {
      if (pairBusy) return;
      pairBusy = true;
      const raw = $('offerIn')?.value || $('answerIn')?.value || '';
      pairStatus = '正在建立连接，请稍候…';
      if ($('pairStatus')) $('pairStatus').textContent = pairStatus;
      try {
        if (key === 'makeRoom') {
          await party.host();
          pairStatus = party.roomCode ? '等待好友输入房间码…' : '等待好友返回回执码…';
        }
        if (key === 'joinRoom') {
          const back = await party.join(raw);
          pairStatus = back ? '请将生成的回执码交给房主。' : '正在与房主连接…';
        }
        if (key === 'acceptAnswer') {
          await party.accept(raw);
          pairStatus = '已收到回执，正在建立直连…';
        }
      } catch (e) {
        pairStatus = e.message || '连接失败，请重新创建房间。';
      } finally {
        pairBusy = false;
        if (panel === 'party') partyPanel();
        refresh();
      }
      break;
    }
    case 'copyRoom':
    case 'copyInvite':
    case 'copyAnswer': {
      const value =
        key === 'copyRoom' ? party.roomCode : key === 'copyInvite' ? $('offerOut').value : $('answerOut').value;
      if (await copyText(value)) toast('已复制，可交给好友。');
      else toast('请选中文字并手动复制。');
      break;
    }
    case 'disconnect':
      party.close();
      closePanel(false);
      break;
    case 'abort': {
      if (party.ready) {
        if (game.role === 'guest') party.close();
        else party.send('abort');
      }
      closePanel(false);
      game.leave();
      refresh();
      break;
    }
    case 'resultHome':
      closePanel(false);
      game.leave();
      refresh();
      break;
    case 'again':
      startGame();
      break;
    case 'nextLevel':
      settings.level = Math.min(MAP_IDS.length - 1, lastResult.config.level + 1);
      settings.mode = 'adventure';
      startGame();
      break;
    case 'resultClip':
      closePanel(false);
      await game.watch(lastResult.clip, resultsPanel);
      break;
  }
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.classList.contains('sound')) {
    profile.sound = !profile.sound;
    audio.setEnabled(profile.sound);
    prepare();
    sounds();
    if (profile.sound) audio.play('pop', 0.65);
    save();
    return;
  }
  if (b.dataset.act) {
    if (!['copyInvite', 'copyAnswer', 'copyRoom'].includes(b.dataset.act)) audio.play('click', 0.5);
    action(b.dataset.act).catch((err) => toast(err.message));
    return;
  }
  if (b.dataset.group) {
    selectGroup(b.dataset.group, b.dataset.value, b);
    return;
  }
  if (b.dataset.nav) {
    audio.play('click', 0.5);
    if (b.dataset.nav === 'home') closePanel();
    else action(b.dataset.nav);
    return;
  }
  if (b.dataset.fighter) {
    const k = b.dataset.fighter;
    audio.play('pop', 0.75);
    if (!unlocked(k, profile) || profile.kind === k) {
      fighterInfo(k);
      return;
    }
    profile.kind = k;
    save();
    refresh();
    if (party.ready) party.send('pick', { pick: pick() });
    toast('已出战　' + FIGHTERS[k].name + ' · ' + FIGHTERS[k].skill);
    return;
  }
  if (b.hasAttribute('data-clip')) {
    const clip = profile.clips[Number(b.dataset.clip)];
    closePanel(false);
    game
      .watch(clip, () => {
        game.leave();
        clipsPanel();
      })
      .catch(startError);
  }
});
document.addEventListener('change', (e) => {
  if (e.target.id === 'p2Select') settings.p2 = e.target.value;
});
$('play').onclick = startGame;
$('brand').onclick = () => {
  closePanel();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
refresh();
if (location.hash.startsWith('#invite=')) {
  stash = location.hash.slice(8);
  pairTab = 'guest';
  history.replaceState(null, '', location.href.split('#')[0]);
  openParty();
}
