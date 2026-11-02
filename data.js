import { ARENA } from './arena-geometry.js';

export const FIGHTERS = {
  hammer: {
    name: '巨锤力士',
    en: 'HAMMER',
    type: '重装强攻',
    icon: 'hammer',
    color: '#ff89a9',
    ink: '#632f51',
    skill: '地动波',
    detail: '大锤打出上抛弧线。地动波向四周扩散，能把对手和弹力方块一并掀飞。',
  },
  knight: {
    name: '棉糖骑士',
    en: 'KNIGHT',
    type: '反击防守',
    icon: 'shield',
    color: '#8dd7ff',
    ink: '#234c73',
    skill: '盾牌突进',
    detail: '挥剑抢占身位，举盾向前冲锋。护盾持续期间能弹开近身攻击者。',
  },
  cowboy: {
    name: '汽水牛仔',
    en: 'COWBOY',
    type: '远程连锁',
    icon: 'gun',
    color: '#ffd378',
    ink: '#714829',
    skill: '连锁弹',
    detail: '泡泡枪能从远处打乱节奏。连锁弹命中目标后会跳向附近的战士或方块。',
  },
  spark: {
    name: '闪电兔兔',
    en: 'SPARK',
    type: '机动控场',
    icon: 'bolt',
    color: '#bcaaff',
    ink: '#493b72',
    skill: '电磁脉冲',
    detail: '弹跳拳让对手横着飞出去。发出电磁脉冲，先把附近物体吸过来，再一起震开。',
  },
};
export const MAPS = {
  cloud: {
    name: '云顶弹弹台',
    en: 'CLOUD BOUNCE',
    icon: 'cloud',
    color: '#8ce6ec',
    sky: '#81d9e9',
    gravity: 19,
    friction: 1,
    spin: 0.63,
    detail: '宽阔的充气跑道绕过中央软杆。黄黑框标出易碎玻璃，出现裂纹后请移开。',
  },
  soda: {
    name: '汽水工厂',
    en: 'SODA WORKS',
    icon: 'soda',
    color: '#ffaf9c',
    sky: '#ffc4af',
    gravity: 18,
    friction: 0.68,
    spin: 0.93,
    detail: '宽跑道上的糖浆让台面更滑。沿外圈留出刹车距离，避开闪烁的玻璃。',
  },
  orbit: {
    name: '轨道乐园',
    en: 'ORBIT PARK',
    icon: 'orbit',
    color: '#bba8ff',
    sky: '#b9b1f1',
    gravity: 13.5,
    friction: 0.92,
    spin: -0.82,
    detail: '较弱的重力带来更高的抛物线，反向转杆改变进攻路线。',
  },
  dock: {
    name: '潮汐船坞',
    en: 'TIDAL DOCKS',
    icon: 'anchor',
    color: '#ffd196',
    sky: '#9edfe4',
    gravity: 19,
    friction: 1,
    spin: 0,
    detail: '三座桥连接两岸。守中央宽桥，也可以走两端的木桥绕后。码头上的传送带会沿箭头运走战士和箱子。',
  },
  pinball: {
    name: '霓虹弹珠台',
    en: 'NEON PINBALL',
    icon: 'pinball',
    color: '#9fe7ff',
    sky: '#a79fd9',
    gravity: 18.5,
    friction: 0.93,
    spin: 0,
    detail: '五根弹簧柱会把撞上的战士和箱子弹开。从侧面撞柱可以改变飞行方向，小心两条侧翼之间的 V 形落口。',
  },
};
export const MODES = {
  brawl: {
    name: '经典乱斗',
    en: 'FREE FOR ALL',
    icon: 'bolt',
    rule: '把对手打出擂台，率先拿到 7 次击飞。',
    short: '先得 7 分获胜',
    target: 7,
    time: 90,
  },
  adventure: {
    name: '合作闯关',
    en: 'TOGETHER',
    icon: 'gamepad',
    rule: '单人或双人组队，在限时内完成击飞目标，连续挑战五座擂台。',
    short: '联手完成击飞目标',
    target: 3,
    time: 100,
    team: true,
  },
  flag: {
    name: '护旗大战',
    en: 'CAPTURE THE FLAG',
    icon: 'flag',
    rule: '夺走对方旗帜，带回己方旗座。己方旗帜归位时才能得分，先夺 3 旗获胜。',
    short: '夺旗并带回己方旗座',
    target: 3,
    time: 100,
    team: true,
  },
  zone: {
    name: '区域争夺',
    en: 'HOLD THE ZONE',
    icon: 'target',
    rule: '站进中央圆环，只有己方在场时持续得分。先占领 20 秒获胜。',
    short: '独占中央区域 20 秒',
    target: 20,
    time: 90,
    team: true,
  },
  cart: {
    name: '推车派对',
    en: 'PUSH THE CART',
    icon: 'cart',
    rule: '护送糖果车到对手一侧。靠近车的人数越多，推进越快。',
    short: '将糖果车推到终点',
    target: ARENA.cartEnd,
    time: 100,
    team: true,
  },
  king: {
    name: '软糖国王',
    en: 'JELLY ROYAL',
    icon: 'crown',
    rule: '拾起中央王冠，持有时持续得分。重击能震掉王冠，先戴满 20 秒获胜。',
    short: '持有王冠累计 20 秒',
    target: 20,
    time: 90,
  },
};
export const KINDS = Object.keys(FIGHTERS);
export const MAP_IDS = Object.keys(MAPS);
export const BOT_NAMES = ['布丁', '泡芙', '跳跳豆', '奶盖', '果冻', '团团'];
export const SKINS = ['原味软糖', '蓝莓苏打', '蜜瓜派对'];
export const OUTFITS = ['轻装上阵', '幸运星夹', '薄荷蝴蝶结'];
export const EMOTES = ['✦', '♥', '♪'];
export const ACHIEVEMENTS = [
  { key: 'first', name: '初次起飞', icon: 'spark', desc: '亲手完成 1 次击飞', test: (p) => p.kos >= 1 },
  { key: 'win', name: '派对主角', icon: 'trophy', desc: '赢下 1 场对局', test: (p) => p.wins >= 1 },
  { key: 'pilot', name: '天空常客', icon: 'bolt', desc: '累计击飞 10 次', test: (p) => p.kos >= 10 },
  { key: 'tour', name: '云端毕业生', icon: 'medal', desc: '通关合作闯关第三关', test: (p) => p.cleared >= 3 },
];
export const unlocked = (kind, p) => kind !== 'spark' || p.games >= 3 || p.cleared >= 3;
export const skinOpen = (id, p) => id === 0 || (id === 1 ? p.kos >= 3 : p.games >= 5);
export const outfitOpen = (id, p) => id === 0 || (id === 1 ? p.wins >= 1 : p.kos >= 10);
export const emoteOpen = (id, p) => id === 0 || (id === 1 ? p.games >= 1 : p.games >= 3);
export const freshProfile = () => ({
  version: 1,
  games: 0,
  wins: 0,
  kos: 0,
  cleared: 0,
  kind: 'hammer',
  skin: 0,
  outfit: 0,
  emote: 0,
  sound: true,
  clips: [],
});
export function loadProfile(storage) {
  const p = freshProfile();
  try {
    const old = JSON.parse(storage.getItem('jelly-rumble-v1') || 'null');
    if (!old || old.version !== 1) return p;
    for (const k of ['games', 'wins', 'kos', 'cleared']) p[k] = Math.max(0, Math.trunc(Number(old[k]) || 0));
    if (KINDS.includes(old.kind) && unlocked(old.kind, p)) p.kind = old.kind;
    for (const [k, check] of [
      ['skin', skinOpen],
      ['outfit', outfitOpen],
      ['emote', emoteOpen],
    ]) {
      if ([0, 1, 2].includes(old[k]) && check(old[k], p)) p[k] = old[k];
    }
    p.sound = old.sound !== false;
    if (Array.isArray(old.clips))
      p.clips = old.clips
        .filter((c) => c?.v === 1 && MAPS[c.config?.map] && MODES[c.config?.mode] && c.frames?.length > 1)
        .slice(0, 3);
  } catch {}
  return p;
}
