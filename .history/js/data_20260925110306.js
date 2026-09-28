'use strict';

/* ================= 基础配置 ================= */
const GRID_ROWS = 4;                 // 阵营纵向格子数（深度方向）
const GRID_COLS = 5;                 // 阵营横向格子数
const FORMATION_CAP = 12;            // 玩家阵容上限
const ATTACK_INTERVAL = 0.42;        // 每个单位行动间隔（秒），阵营切换无额外间隔
const MANA_ON_ATTACK = 8;            // 攻击时增加的魔法值
const MANA_ON_HIT = 8;               // 被攻击时增加的魔法值

const POS_NAMES = { front:'前排', mid:'中排', back:'后排' };
const POS_SHORT = { front:'前', mid:'中', back:'后' };

/* 属性键（基础属性） */
const ZERO_KEYS = ['hp','maxMana','atk','ap','armor','dodge','crit','critMult',
  'hpRegen','manaRegen','lifesteal','mlifesteal'];

/* 属性显示格式：[键, 标签, 是否百分比] —— 两列布局，白字基础 + 绿字加成 */
const STAT_ROWS = [
  ['hp',        '❤ 生命值',      0],
  ['maxMana',   '✦ 魔法值',      0],
  ['atk',       '⚔ 攻击',        0],
  ['ap',        '✨ 法强',        0],
  ['armor',     '🛡 护甲',        0],
  ['dodge',     '💨 闪避',        1],
  ['crit',      '🎯 暴击率',      1],
  ['critMult',  '💥 暴击倍数',    1],
  ['hpRegen',   '🌱 生命恢复速度', 0],
  ['manaRegen', '💧 魔法恢复速度', 0],
  ['lifesteal', '🩸 物理吸血',    1],
  ['mlifesteal','🔮 魔法吸血',    1],
];

/* ================= 技能定义 =================
 * 被动技能由 behavior 字段驱动；主动技能由 targeting + effect 声明式驱动，
 * 所有主动技能都会发射抛物线技能子弹，子弹到达后结算。
 * effect 支持：damage / missingHp / heal / shield / stun / silence / disarm / cleanse / dot
 */
const SKILLS = {
  /* ---------- 死灵法师 ---------- */
  deathPulse: {
    id:'deathPulse', name:'死亡脉冲', type:'passive', behavior:'pulse',
    color:'#a06be0', fx:'ring',
    dmgStat:'ap', dmgMult:1, healStat:'ap', healMult:1,
    desc:'【被动】普攻时释放一道死亡脉冲，向所有其他单位发射特殊子弹：对敌方单位造成 法强×1.0 的魔法伤害，对友方单位恢复等量生命值（自身立即恢复）。'
  },
  corrosionAura: {
    id:'corrosionAura', name:'腐蚀光环', type:'passive', behavior:'corrosion',
    color:'#7bd97b', fx:'ring', pct:0.05,
    desc:'【被动】敌方全体单位每秒受到 5%×最大生命值 的伤害。'
  },
  lifeReap: {
    id:'lifeReap', name:'生命收割', type:'active', cost:80, cd:7,
    color:'#d05bff', fx:'burst', targeting:'enemyLowestHp',
    effect:{ missingHp:0.6 },
    desc:'【主动】向敌方现有生命值最低的单位发射死光，造成（最大生命值 - 当前生命值）×0.6 的伤害。消耗 80 魔法值，冷却 7 秒。'
  },

  /* ---------- 森林游侠 ---------- */
  eagleEye: {
    id:'eagleEye', name:'鹰眼', type:'passive', behavior:'statBuff',
    stats:{ crit:12 },
    desc:'【被动】暴击率 +12%。'
  },
  piercingArrow: {
    id:'piercingArrow', name:'穿云箭', type:'active', cost:60, cd:6,
    color:'#8fe3ff', fx:'burst', targeting:'enemyLowestHpRatio',
    effect:{ damage:{ type:'physical', stat:'atk', mult:3 } },
    desc:'【主动】向敌方生命百分比最低的单位发射穿云箭，造成 攻击×3 的物理伤害。消耗 60 魔法值，冷却 6 秒。'
  },

  /* ---------- 德鲁伊 ---------- */
  natureRegen: {
    id:'natureRegen', name:'自然再生', type:'passive', behavior:'healLowestPerSec',
    stat:'ap', mult:0.3,
    desc:'【被动】每秒为生命比例最低的友方单位恢复 法强×0.3 的生命值。'
  },
  wildRejuv: {
    id:'wildRejuv', name:'野性复苏', type:'active', cost:70, cd:8,
    color:'#6bff9b', fx:'ring', targeting:'allyLowestHp',
    effect:{ heal:{ stat:'ap', mult:3 }, shield:{ stat:'ap', mult:1.5 } },
    desc:'【主动】向生命比例最低的友军发射藤蔓种子：恢复 法强×3 的生命值，并获得 法强×1.5 的护盾。消耗 70 魔法值，冷却 8 秒。'
  },

  /* ---------- 石像守卫 ---------- */
  rockWall: {
    id:'rockWall', name:'坚岩', type:'passive', behavior:'shieldOnHit',
    pct:0.10, internalCd:1,
    desc:'【被动】受到伤害后，获得相当于该次伤害 10% 的护盾（内置冷却 1 秒）。'
  },
  thornBarrier: {
    id:'thornBarrier', name:'荆棘壁垒', type:'active', cost:65, cd:8,
    color:'#ffd35c', fx:'ring', targeting:'self',
    effect:{ shield:{ pctMaxHp:0.25 } },
    desc:'【主动】在原地张开荆棘壁垒，使自己获得 最大生命值×25% 的护盾。消耗 65 魔法值，冷却 8 秒。'
  },

  /* ---------- 影刃 ---------- */
  poisonBlade: {
    id:'poisonBlade', name:'淬毒', type:'passive', behavior:'attackDot',
    dot:{ name:'剧毒', stat:'atk', mult:0.15, dur:3, color:'#63d471' },
    desc:'【被动】普攻附加剧毒：目标每秒受到 攻击×15% 的伤害，持续 3 秒。'
  },
  shadowStrike: {
    id:'shadowStrike', name:'暗影突袭', type:'active', cost:55, cd:6,
    color:'#b06bff', fx:'burst', targeting:'enemyLowestHp',
    effect:{ damage:{ type:'physical', stat:'atk', mult:2.2 }, disarm:1.5 },
    desc:'【主动】向敌方现有生命值最低的单位投掷暗影匕首，造成 攻击×2.2 的伤害并缴械 1.5 秒。消耗 55 魔法值，冷却 6 秒。'
  },

  /* ---------- 炎火术士 ---------- */
  ignite: {
    id:'ignite', name:'引燃', type:'passive', behavior:'skillDot',
    dot:{ name:'燃烧', stat:'ap', mult:0.2, dur:3, color:'#ff9a3c' },
    desc:'【被动】技能命中会点燃目标：每秒受到 法强×20% 的伤害，持续 3 秒。'
  },
  flameNova: {
    id:'flameNova', name:'烈焰新星', type:'active', cost:75, cd:7,
    color:'#ff8a3c', fx:'burst', targeting:'enemyRandom3',
    effect:{ damage:{ type:'magic', stat:'ap', mult:1.6 } },
    desc:'【主动】向敌方随机 3 个单位发射火球，各造成 法强×1.6 的魔法伤害。消耗 75 魔法值，冷却 7 秒。'
  },

  /* ---------- 狂兽战士 ---------- */
  bloodRage: {
    id:'bloodRage', name:'血怒', type:'passive', behavior:'bloodRage',
    desc:'【被动】每损失 10% 最大生命值，攻击 +4%（最大 +40%）。'
  },
  earthSplit: {
    id:'earthSplit', name:'裂地猛击', type:'active', cost:60, cd:7,
    color:'#ffb02e', fx:'burst', targeting:'enemyHighestHp',
    effect:{ damage:{ type:'physical', stat:'atk', mult:2.5 }, stun:1.2 },
    desc:'【主动】向敌方当前生命最高的单位砸出巨斧，造成 攻击×2.5 的物理伤害并眩晕 1.2 秒。消耗 60 魔法值，冷却 7 秒。'
  },

  /* ---------- 冰霜女巫 ---------- */
  frostTouch: {
    id:'frostTouch', name:'寒冰触碰', type:'passive', behavior:'attackStun',
    chance:0.2, dur:1,
    desc:'【被动】普攻有 20% 几率使目标眩晕 1 秒。'
  },
  blizzard: {
    id:'blizzard', name:'暴风雪', type:'active', cost:85, cd:9,
    color:'#8fd8ff', fx:'burst', targeting:'allEnemies',
    effect:{ damage:{ type:'magic', stat:'ap', mult:0.9 } },
    desc:'【主动】向敌方全体单位召唤冰锥，各造成 法强×0.9 的魔法伤害。消耗 85 魔法值，冷却 9 秒。'
  },

  /* ---------- 圣泉骑士 ---------- */
  shelter: {
    id:'shelter', name:'庇护', type:'passive', behavior:'allyHealOnHit',
    chance:0.2, stat:'atk', mult:0.8,
    desc:'【被动】受到伤害时，有 20% 几率为生命比例最低的友军恢复 攻击×0.8 的生命值。'
  },
  holyLight: {
    id:'holyLight', name:'圣光洗礼', type:'active', cost:70, cd:8,
    color:'#fff2a8', fx:'ring', targeting:'allAllies',
    effect:{ heal:{ stat:'ap', mult:1.2 }, cleanse:true },
    desc:'【主动】向全体友军发射圣光，各恢复 法强×1.2 的生命值，并解除眩晕、沉默、缴械状态。消耗 70 魔法值，冷却 8 秒。'
  },

  /* ---------- 林间诗人 ---------- */
  inspire: {
    id:'inspire', name:'鼓舞', type:'passive', behavior:'auraStat',
    pct:{ atk:0.08, ap:0.08 },
    desc:'【被动】光环：全体友军 攻击 +8%、法强 +8%。'
  },
  battleSong: {
    id:'battleSong', name:'战歌', type:'active', cost:65, cd:8,
    color:'#8fffe0', fx:'ring', targeting:'allAllies',
    effect:{ shield:{ pctMaxHp:0.12 } },
    desc:'【主动】向全体友军弹奏战歌，使每位友军获得 最大生命值×12% 的护盾。消耗 65 魔法值，冷却 8 秒。'
  },

  /* ---------- 敌方技能 ---------- */
  elitePower: {
    id:'elitePower', name:'强化', type:'passive', behavior:'statBuff',
    pct:{ atk:0.15 },
    desc:'【被动】攻击 +15%。'
  },
  bossPassive: {
    id:'bossPassive', name:'巨躯', type:'passive', behavior:'takenReduce',
    pct:0.10,
    desc:'【被动】受到的所有伤害降低 10%。'
  },
  bossSweep: {
    id:'bossSweep', name:'震地横扫', type:'active', cost:60, cd:6,
    color:'#ff6b4d', fx:'burst', targeting:'allEnemies',
    effect:{ damage:{ type:'physical', stat:'atk', mult:0.5 } },
    desc:'【主动】向敌方全体砸地横扫，各造成 攻击×0.5 的物理伤害。消耗 60 魔法值，冷却 6 秒。'
  },
  bloodThirst: {
    id:'bloodThirst', name:'鲜血渴望', type:'passive', behavior:'statBuff',
    stats:{ lifesteal:15 },
    desc:'【被动】物理吸血 +15%。'
  },
  abyssTouch: {
    id:'abyssTouch', name:'深渊之触', type:'active', cost:60, cd:6,
    color:'#c05bff', fx:'burst', targeting:'enemyLowestHp',
    effect:{ damage:{ type:'magic', stat:'atk', mult:1.6 }, stun:1.2 },
    desc:'【主动】向敌方现有生命值最低的单位释放深渊之触，造成 攻击×1.6 的伤害并眩晕 1.2 秒。消耗 60 魔法值，冷却 6 秒。'
  },
};

/* ================= 10 个英雄 =================
 * pos：生成位置类型（前/中/后），决定横向行位置（前排离对面更近）
 * tier：商店售价档位（20 / 40 / 60）
 */
const HEROES = [
  { id:'necro', name:'死灵法师', tier:60, pos:'back', emoji:'☠️',
    base:{ hp:700, maxMana:100, atk:32, ap:62, armor:6, dodge:4, crit:8, critMult:150,
           hpRegen:4, manaRegen:5, lifesteal:0, mlifesteal:10 },
    skills:['deathPulse','corrosionAura','lifeReap'],
    bio:'操纵死亡脉冲与腐蚀之力的黑暗法师，敌人会在腐蚀中慢慢死去。' },

  { id:'ranger', name:'森林游侠', tier:20, pos:'mid', emoji:'🏹',
    base:{ hp:780, maxMana:100, atk:52, ap:20, armor:8, dodge:8, crit:15, critMult:160,
           hpRegen:5, manaRegen:4, lifesteal:5, mlifesteal:0 },
    skills:['eagleEye','piercingArrow'],
    bio:'百步穿杨的游侠，一箭带走最虚弱的猎物。' },

  { id:'druid', name:'德鲁伊', tier:40, pos:'back', emoji:'🌿',
    base:{ hp:820, maxMana:100, atk:36, ap:55, armor:10, dodge:5, crit:8, critMult:150,
           hpRegen:6, manaRegen:5, lifesteal:0, mlifesteal:5 },
    skills:['natureRegen','wildRejuv'],
    bio:'森林的守护者，持续治愈并用藤蔓种子守护队友。' },

  { id:'golem', name:'石像守卫', tier:40, pos:'front', emoji:'🪨',
    base:{ hp:1250, maxMana:100, atk:40, ap:15, armor:22, dodge:3, crit:6, critMult:150,
           hpRegen:8, manaRegen:3, lifesteal:0, mlifesteal:0 },
    skills:['rockWall','thornBarrier'],
    bio:'坚不可摧的前排壁垒，受伤越多护盾越厚。' },

  { id:'shadow', name:'影刃', tier:40, pos:'mid', emoji:'🗡️',
    base:{ hp:760, maxMana:100, atk:58, ap:25, armor:7, dodge:14, crit:20, critMult:170,
           hpRegen:5, manaRegen:4, lifesteal:8, mlifesteal:0 },
    skills:['poisonBlade','shadowStrike'],
    bio:'淬毒的暗影刺客，擅长让残血的敌人彻底沉默。' },

  { id:'pyro', name:'炎火术士', tier:20, pos:'back', emoji:'🔥',
    base:{ hp:720, maxMana:100, atk:34, ap:58, armor:6, dodge:5, crit:10, critMult:155,
           hpRegen:4, manaRegen:4, lifesteal:0, mlifesteal:6 },
    skills:['ignite','flameNova'],
    bio:'玩火的法师，技能命中之处烈焰持续燃烧。' },

  { id:'berserker', name:'狂兽战士', tier:20, pos:'front', emoji:'🪓',
    base:{ hp:1050, maxMana:100, atk:50, ap:10, armor:14, dodge:5, crit:12, critMult:165,
           hpRegen:7, manaRegen:3, lifesteal:10, mlifesteal:0 },
    skills:['bloodRage','earthSplit'],
    bio:'越受伤越狂暴的战士，一斧劈晕最强的敌人。' },

  { id:'frost', name:'冰霜女巫', tier:40, pos:'back', emoji:'❄️',
    base:{ hp:740, maxMana:100, atk:30, ap:60, armor:7, dodge:6, crit:10, critMult:150,
           hpRegen:4, manaRegen:5, lifesteal:0, mlifesteal:8 },
    skills:['frostTouch','blizzard'],
    bio:'寒冰的化身，普攻可能冻结敌人，暴风雪覆盖全场。' },

  { id:'paladin', name:'圣泉骑士', tier:60, pos:'front', emoji:'🛡️',
    base:{ hp:1150, maxMana:100, atk:44, ap:40, armor:20, dodge:4, crit:8, critMult:150,
           hpRegen:8, manaRegen:4, lifesteal:5, mlifesteal:5 },
    skills:['shelter','holyLight'],
    bio:'圣光庇护的前排骑士，为全队疗伤并驱散控制。' },

  { id:'bard', name:'林间诗人', tier:60, pos:'mid', emoji:'🎵',
    base:{ hp:850, maxMana:100, atk:38, ap:48, armor:10, dodge:7, crit:10, critMult:150,
           hpRegen:6, manaRegen:5, lifesteal:0, mlifesteal:10 },
    skills:['inspire','battleSong'],
    bio:'歌声让全队更强，战歌为所有人披上护盾。' },
];

/* 商店英雄档位池 */
const HERO_TIERS = { 20:'普通', 40:'稀有', 60:'史诗' };

/* ================= 道具（10 / 15 / 20 金币，3 档） ================= */
const ITEMS = [
  { id:'potion1', name:'森林药剂', price:10, icon:'🧪',
    stats:{ hp:150, hpRegen:3 },
    desc:'小型药剂：使用后生命值 +150，生命恢复速度 +3。' },
  { id:'potion2', name:'猎手药剂', price:15, icon:'🏹',
    stats:{ atk:12, crit:5 },
    desc:'中型药剂：使用后攻击 +12，暴击率 +5%。' },
  { id:'potion3', name:'贤者药剂', price:20, icon:'📖',
    stats:{ ap:18, manaRegen:3, mlifesteal:5 },
    desc:'大型药剂：使用后法强 +18，魔法恢复速度 +3，魔法吸血 +5%。' },
];

/* ================= 装备（10 / 20 / 30 金币，3 档，英雄 6 个装备格子） ================= */
const EQUIPS = [
  { id:'eq1', name:'铁木圆盾', price:10, icon:'🛡️',
    stats:{ armor:8, hp:120 },
    desc:'护甲 +8，生命值 +120。' },
  { id:'eq2', name:'精灵短弓', price:20, icon:'🗡️',
    stats:{ atk:16, crit:6, critMult:20 },
    desc:'攻击 +16，暴击率 +6%，暴击倍数 +20%。' },
  { id:'eq3', name:'森林圣典', price:30, icon:'📗',
    stats:{ ap:26, manaRegen:4, mlifesteal:8 },
    desc:'法强 +26，魔法恢复速度 +4，魔法吸血 +8%。' },
];

/* ================= 敌人类型 =================
 * gold：击杀获得金币（普通敌人+5，精英+10，boss+20，精英boss+50）
 */
const ENEMY_BASE = {
  hp:340, maxMana:100, atk:26, ap:18, armor:4, dodge:4, crit:5, critMult:150,
  hpRegen:2, manaRegen:3, lifesteal:0, mlifesteal:0
};

const ENEMY_TYPES = {
  minion:   { name:'小兵',     gold:5,  emoji:'👺', mult:{ hp:1,   atk:1,   armor:1   },
              skills:[],                                pos:['front','mid','back'] },
  elite:    { name:'精英',     gold:10, emoji:'😈', mult:{ hp:1.9, atk:1.5, armor:1.5 },
              skills:['elitePower'],                    pos:['front','mid','back'] },
  boss:     { name:'boss',     gold:20, emoji:'👹', mult:{ hp:4.2, atk:2.1, armor:2.6 },
              skills:['bossPassive','bossSweep'],       pos:['front'] },
  eliteBoss:{ name:'精英boss', gold:50, emoji:'👿', mult:{ hp:7,   atk:2.8, armor:3.2 },
              skills:['bloodThirst','abyssTouch'],      pos:['front'] },
};

/* 每关敌人数量：初始 2 个，随关数每关递增 0.5，不超过 5 个（小数关卡交替进位） */
function rollEnemyCount(level){
  const raw = Math.min(5, 2 + (level - 1) * 0.5);
  let n = Math.floor(raw);
  if(raw % 1 !== 0 && level % 2 === 0) n++;
  return Math.min(5, n);
}

/* 每关敌人类型构成 */
function rollEnemyTypes(level){
  const n = rollEnemyCount(level);
  const list = [];
  if(level >= 7) list.push('eliteBoss');
  if(level >= 4) list.push('boss');
  if(level >= 9) list.push('boss');
  if(level >= 2) list.push('elite');
  if(level >= 5) list.push('elite');
  while(list.length < n) list.push('minion');
  list.length = n;
  return list;
}
