'use strict';

/* ================= 基础配置 ================= */
const GRID_ROWS = 4;                 // 阵营纵向格子数（深度方向）
const GRID_COLS = 5;                 // 阵营横向格子数
const FORMATION_CAP = 12;            // 玩家阵容上限
const ATTACK_INTERVAL = 1.0;         // 即时制：普攻间隔 = 1.0 秒 ÷ 攻击速度
const MANA_ON_ATTACK = 8;            // 攻击时增加的魔法值
const MANA_ON_HIT = 8;               // 被攻击时增加的魔法值

const POS_NAMES = { front:'前排', mid:'中排', back:'后排' };
const POS_SHORT = { front:'前', mid:'中', back:'后' };

/* 属性键（基础属性），atkSpd = 攻击速度（1.0 表示每 1 秒普攻一次） */
const ZERO_KEYS = ['hp','maxMana','atk','atkSpd','ap','armor','dodge','crit','critMult',
  'hpRegen','manaRegen','lifesteal','mlifesteal'];

/* 属性显示格式：[键, 标签, 是否百分比] —— 两列布局，白字基础 + 绿字加成 */
const STAT_ROWS = [
  ['hp',        '❤ 生命值',      0],
  ['maxMana',   '✦ 魔法值',      0],
  ['atk',       '⚔ 攻击',        0],
  ['atkSpd',    '⚡ 攻击速度',    0],
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
 * effect 支持：damage / missingHp / heal / shield / stun / silence / disarm /
 *              cleanse / dot / buff（临时属性增益，带持续时间）
 */
const SKILLS = {
  /* ---------- 幻影刺客 ---------- */
  blur: {
    id:'blur', name:'模糊', type:'passive', behavior:'statBuff',
    stats:{ dodge:12, crit:15 },
    desc:'【被动】身形如雾，难以捉摸：闪避 +12%，暴击率 +15%。'
  },
  stifling: {
    id:'stifling', name:'窒息之刃', type:'active', cost:60, cd:6,
    icon:'🗡️', color:'#c99bff', fx:'burst', targeting:'enemyRandom3',
    effect:{ damage:{ type:'physical', stat:'atk', mult:1.5 } },
    desc:'【主动】向敌方随机 3 个单位掷出淬毒匕首，各造成 攻击×1.5 的物理伤害。消耗 60 魔法值，冷却 6 秒。'
  },
  phantomStrike: {
    id:'phantomStrike', name:'幻影突袭', type:'active', cost:55, cd:8,
    icon:'🌀', color:'#b06bff', fx:'ring', targeting:'self',
    effect:{ buff:{ stat:'atkSpd', mult:0.6, dur:4, name:'幻影突袭' } },
    desc:'【主动】瞬移切入战场：自己的攻击速度 +60%，持续 4 秒。消耗 55 魔法值，冷却 8 秒。'
  },

  /* ---------- 死灵法师 ---------- */
  corrosionAura: {
    id:'corrosionAura', name:'腐蚀光环', type:'passive', behavior:'corrosion',
    color:'#7bd97b', fx:'ring', pct:0.05,
    desc:'【被动】敌方全体单位每秒受到 5%×最大生命值 的伤害。'
  },
  deathPulse: {
    id:'deathPulse', name:'死亡脉冲', type:'active', cost:75, cd:8,
    icon:'💀', color:'#a06be0', fx:'ring', targeting:'allEnemies',
    effect:{ damage:{ type:'magic', stat:'ap', mult:1 } },
    allyEffect:{ heal:{ stat:'ap', mult:1 } },
    desc:'【主动】释放死亡脉冲：向敌方全体各造成 法强×1.0 的魔法伤害；自身立即恢复 法强×1.0 的生命值，并向其他友军发射恢复子弹（等量治疗）。消耗 75 魔法值，冷却 8 秒。'
  },
  lifeReap: {
    id:'lifeReap', name:'生命收割', type:'active', cost:80, cd:7,
    icon:'☠️', color:'#d05bff', fx:'burst', targeting:'enemyLowestHp',
    effect:{ missingHp:0.6 },
    desc:'【主动】向敌方现有生命值最低的单位发射死光，造成（最大生命值 - 当前生命值）×0.6 的伤害。消耗 80 魔法值，冷却 7 秒。'
  },

  /* ---------- 影魔 ---------- */
  soulPresence: {
    id:'soulPresence', name:'灵魂存在', type:'passive', behavior:'statBuff',
    stats:{ mlifesteal:15, ap:10 },
    desc:'【被动】吞噬的灵魂环绕周身：魔法吸血 +15%，法强 +10。'
  },
  shadowraze: {
    id:'shadowraze', name:'影压', type:'active', cost:60, cd:5,
    icon:'💥', color:'#ff5a5a', fx:'burst', targeting:'enemyHighestHp',
    effect:{ damage:{ type:'magic', stat:'ap', mult:2.2 } },
    desc:'【主动】在敌方生命最高的单位脚下引爆灵魂冲击，造成 法强×2.2 的魔法伤害。消耗 60 魔法值，冷却 5 秒。'
  },
  requiem: {
    id:'requiem', name:'魂之挽歌', type:'active', cost:85, cd:10,
    icon:'👻', color:'#c05bff', fx:'ring', targeting:'allEnemies',
    effect:{ damage:{ type:'magic', stat:'ap', mult:1.4 }, silence:1.5 },
    desc:'【主动】释放万千怨魂撕裂敌方全体：各造成 法强×1.4 的魔法伤害并沉默 1.5 秒。消耗 85 魔法值，冷却 10 秒。'
  },

  /* ---------- 血魔 ---------- */
  bloodRage: {
    id:'bloodRage', name:'血怒', type:'passive', behavior:'bloodRage',
    desc:'【被动】每损失 10% 最大生命值，攻击 +4%（最大 +40%）。'
  },
  bloodRite: {
    id:'bloodRite', name:'血之祭祀', type:'active', cost:60, cd:8,
    icon:'🩸', color:'#ff4d6d', fx:'ring', targeting:'allEnemies',
    effect:{ damage:{ type:'physical', stat:'atk', mult:1.0 }, silence:1.5 },
    desc:'【主动】血阵降临敌方全体：各造成 攻击×1.0 的物理伤害并沉默 1.5 秒。消耗 60 魔法值，冷却 8 秒。'
  },
  rupture: {
    id:'rupture', name:'割裂', type:'active', cost:70, cd:9,
    icon:'🔪', color:'#ff2e4d', fx:'burst', targeting:'enemyHighestHp',
    effect:{ missingHp:0.5,
             dot:{ name:'割裂', stat:'atk', mult:0.2, dur:3, color:'#ff5a5a' } },
    desc:'【主动】撕裂敌方生命最高的单位：立即造成（最大生命值 - 当前生命值）×0.5 的伤害，并使其每秒流血 攻击×20%，持续 3 秒。消耗 70 魔法值，冷却 9 秒。'
  },

  /* ---------- 卓尔游侠 ---------- */
  marksmanship: {
    id:'marksmanship', name:'射手天赋', type:'passive', behavior:'auraStat',
    pct:{ atk:0.08 },
    desc:'【被动】光环：全体友军 攻击 +8%。'
  },
  frostArrow: {
    id:'frostArrow', name:'霜冻之箭', type:'active', cost:55, cd:6,
    icon:'❄️', color:'#8fd8ff', fx:'burst', targeting:'enemyLowestHpRatio',
    effect:{ damage:{ type:'physical', stat:'atk', mult:2.0 },
             dot:{ name:'冰缓', stat:'atk', mult:0.15, dur:3, color:'#8fd8ff' } },
    desc:'【主动】向敌方生命百分比最低的单位射出寒霜箭，造成 攻击×2.0 的物理伤害，并使其每秒受到 攻击×15% 的伤害，持续 3 秒。消耗 55 魔法值，冷却 6 秒。'
  },
  multishot: {
    id:'multishot', name:'多重射击', type:'active', cost:65, cd:7,
    icon:'🏹', color:'#b8f36b', fx:'burst', targeting:'enemyRandom3',
    effect:{ damage:{ type:'physical', stat:'atk', mult:1.6 } },
    desc:'【主动】向敌方随机 3 个单位射出箭雨，各造成 攻击×1.6 的物理伤害。消耗 65 魔法值，冷却 7 秒。'
  },

  /* ---------- 痛苦女王 ---------- */
  darkPatronage: {
    id:'darkPatronage', name:'暗影契约', type:'passive', behavior:'statBuff',
    stats:{ lifesteal:12 },
    desc:'【被动】与暗影签订契约：物理吸血 +12%。'
  },
  shadowStrike: {
    id:'shadowStrike', name:'暗影突袭', type:'active', cost:55, cd:6,
    icon:'🥷', color:'#b06bff', fx:'burst', targeting:'enemyLowestHp',
    effect:{ damage:{ type:'physical', stat:'atk', mult:2.2 }, disarm:1.5 },
    desc:'【主动】向敌方现有生命值最低的单位投掷暗影匕首，造成 攻击×2.2 的伤害并缴械 1.5 秒。消耗 55 魔法值，冷却 6 秒。'
  },
  screamOfPain: {
    id:'screamOfPain', name:'痛苦尖叫', type:'active', cost:65, cd:7,
    icon:'📢', color:'#ff6bd6', fx:'ring', targeting:'allEnemies',
    effect:{ damage:{ type:'magic', stat:'ap', mult:1.5 } },
    desc:'【主动】发出撕裂灵魂的尖叫，对敌方全体各造成 法强×1.5 的魔法伤害。消耗 65 魔法值，冷却 7 秒。'
  },

  /* ---------- 宙斯 ---------- */
  staticField: {
    id:'staticField', name:'静电场', type:'passive', behavior:'skillDot',
    dot:{ name:'电击', stat:'ap', mult:0.2, dur:3, color:'#9fd0ff' },
    desc:'【被动】技能命中会引发电击：目标每秒受到 法强×20% 的伤害，持续 3 秒。'
  },
  arcLightning: {
    id:'arcLightning', name:'弧形闪电', type:'active', cost:55, cd:5,
    icon:'⚡', color:'#9fd0ff', fx:'burst', targeting:'enemyRandom3',
    effect:{ damage:{ type:'magic', stat:'ap', mult:1.2 } },
    desc:'【主动】闪电在敌方随机 3 个单位间跳跃，各造成 法强×1.2 的魔法伤害。消耗 55 魔法值，冷却 5 秒。'
  },
  thundergod: {
    id:'thundergod', name:'雷神之怒', type:'active', cost:85, cd:9,
    icon:'🌩️', color:'#ffe066', fx:'burst', targeting:'allEnemies',
    effect:{ damage:{ type:'magic', stat:'ap', mult:2.0 } },
    desc:'【主动】呼唤雷霆轰击敌方全体，各造成 法强×2.0 的魔法伤害。消耗 85 魔法值，冷却 9 秒。'
  },

  /* ---------- 剑圣 ---------- */
  bladeDance: {
    id:'bladeDance', name:'剑舞', type:'passive', behavior:'statBuff',
    stats:{ crit:25, critMult:25 },
    desc:'【被动】华丽的剑舞：暴击率 +25%，暴击倍数 +25%。'
  },
  bladeFury: {
    id:'bladeFury', name:'剑刃风暴', type:'active', cost:65, cd:8,
    icon:'⚔️', color:'#ffd35c', fx:'burst', targeting:'allEnemies',
    effect:{ damage:{ type:'physical', stat:'atk', mult:1.0 } },
    desc:'【主动】旋身化作剑刃风暴席卷敌方全体，各造成 攻击×1.0 的物理伤害。消耗 65 魔法值，冷却 8 秒。'
  },
  healingWard: {
    id:'healingWard', name:'治疗守卫', type:'active', cost:60, cd:9,
    icon:'💚', color:'#6bff9b', fx:'ring', targeting:'allAllies',
    effect:{ heal:{ stat:'ap', mult:1.5 } },
    desc:'【主动】召唤治疗守卫，全体友军各恢复 法强×1.5 的生命值。消耗 60 魔法值，冷却 9 秒。'
  },

  /* ---------- 斧王 ---------- */
  counterHelix: {
    id:'counterHelix', name:'反击螺旋', type:'passive', behavior:'counterHelix',
    chance:0.35, mult:0.5,
    desc:'【被动】受到伤害后，有 35% 几率旋转反击，对敌方全体各造成 攻击×50% 的伤害。'
  },
  berserkerCall: {
    id:'berserkerCall', name:'战斗咆哮', type:'active', cost:65, cd:8,
    icon:'😤', color:'#ffb02e', fx:'ring', targeting:'self',
    effect:{ shield:{ pctMaxHp:0.2 },
             buff:{ stat:'atk', mult:0.25, dur:4, name:'战斗咆哮' } },
    desc:'【主动】怒吼震慑战场：自己获得 最大生命值×20% 的护盾，且攻击 +25%，持续 4 秒。消耗 65 魔法值，冷却 8 秒。'
  },
  cullingBlade: {
    id:'cullingBlade', name:'斩杀', type:'active', cost:70, cd:9,
    icon:'🪓', color:'#ff3b3b', fx:'burst', targeting:'enemyLowestHpRatio',
    effect:{ missingHp:0.7 },
    desc:'【主动】巨斧劈向敌方生命百分比最低的单位，造成（最大生命值 - 当前生命值）×0.7 的伤害，越残血越致命。消耗 70 魔法值，冷却 9 秒。'
  },

  /* ---------- 船长 ---------- */
  tidebringer: {
    id:'tidebringer', name:'潮汐使者', type:'passive', behavior:'cleave',
    mult:0.6,
    desc:'【被动】潮汐之力附着兵刃：普攻会向敌方其他单位溅射 60% 的伤害。'
  },
  torrent: {
    id:'torrent', name:'洪流', type:'active', cost:60, cd:7,
    icon:'🌊', color:'#6bc5ff', fx:'burst', targeting:'enemyHighestHp',
    effect:{ damage:{ type:'physical', stat:'atk', mult:1.8 }, stun:1.5 },
    desc:'【主动】在敌方生命最高的单位脚下召唤喷涌洪流，造成 攻击×1.8 的物理伤害并眩晕 1.5 秒。消耗 60 魔法值，冷却 7 秒。'
  },
  ghostShip: {
    id:'ghostShip', name:'幽灵船', type:'active', cost:85, cd:10,
    icon:'⛵', color:'#8fe3ff', fx:'burst', targeting:'allEnemies',
    effect:{ damage:{ type:'physical', stat:'atk', mult:1.2 }, stun:1 },
    desc:'【主动】幽灵船撞向敌方全体：各造成 攻击×1.2 的物理伤害并眩晕 1 秒。消耗 85 魔法值，冷却 10 秒。'
  },

  /* ---------- 地狱领主 ---------- */
  rockWall: {
    id:'rockWall', name:'回光', type:'passive', behavior:'shieldOnHit',
    pct:0.10, internalCd:1,
    desc:'【被动】迷雾之力庇护自身：受到伤害后，获得相当于该次伤害 10% 的护盾（内置冷却 1 秒）。'
  },
  mistCoil: {
    id:'mistCoil', name:'迷雾之咒', type:'active', cost:55, cd:6,
    icon:'🌫️', color:'#a06be0', fx:'burst', targeting:'enemyLowestHp',
    effect:{ damage:{ type:'magic', stat:'atk', mult:1.8 } },
    desc:'【主动】向敌方现有生命值最低的单位掷出迷雾能量，造成 攻击×1.8 的魔法伤害。消耗 55 魔法值，冷却 6 秒。'
  },
  borrowedTime: {
    id:'borrowedTime', name:'回光返照', type:'active', cost:80, cd:10,
    icon:'⏳', color:'#6bffc8', fx:'ring', targeting:'self',
    effect:{ heal:{ pctMaxHp:0.4 }, cleanse:true, shield:{ pctMaxHp:0.15 } },
    desc:'【主动】激活回光返照：立即恢复 最大生命值×40% 的生命，解除全部负面状态，并获得 最大生命值×15% 的护盾。消耗 80 魔法值，冷却 10 秒。'
  },

  /* ---------- 龙骑士 ---------- */
  dragonBlood: {
    id:'dragonBlood', name:'龙血', type:'passive', behavior:'statBuff',
    stats:{ armor:10, hpRegen:6 },
    desc:'【被动】巨龙之血：护甲 +10，生命恢复速度 +6。'
  },
  dragonTail: {
    id:'dragonTail', name:'神龙摆尾', type:'active', cost:60, cd:7,
    icon:'🐉', color:'#ffb02e', fx:'burst', targeting:'enemyHighestHp',
    effect:{ damage:{ type:'physical', stat:'atk', mult:1.8 }, stun:1.2 },
    desc:'【主动】龙尾重击敌方生命最高的单位，造成 攻击×1.8 的物理伤害并眩晕 1.2 秒。消耗 60 魔法值，冷却 7 秒。'
  },
  breatheFire: {
    id:'breatheFire', name:'火焰气息', type:'active', cost:60, cd:6,
    icon:'🔥', color:'#ff8a3c', fx:'burst', targeting:'allEnemies',
    effect:{ damage:{ type:'physical', stat:'atk', mult:1.1 } },
    desc:'【主动】喷吐灼热龙息横扫敌方全体，各造成 攻击×1.1 的物理伤害。消耗 60 魔法值，冷却 6 秒。'
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
    icon:'🪨', color:'#ff6b4d', fx:'burst', targeting:'allEnemies',
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
    icon:'👁️', color:'#c05bff', fx:'burst', targeting:'enemyLowestHp',
    effect:{ damage:{ type:'magic', stat:'atk', mult:1.6 }, stun:1.2 },
    desc:'【主动】向敌方现有生命值最低的单位释放深渊之触，造成 攻击×1.6 的伤害并眩晕 1.2 秒。消耗 60 魔法值，冷却 6 秒。'
  },
};

/* ================= 12 个 Dota 英雄 =================
 * pos：生成位置类型（前/中/后），决定横向行位置（前排离对面更近）
 * tier：商店售价档位（20 / 40 / 60）
 * atkSpd：攻击速度（1.0 = 每 1 秒普攻一次，即时制）
 */
const HEROES = [
  { id:'pa', name:'幻影刺客', tier:60, pos:'mid', emoji:'🗡️',
    base:{ hp:850, maxMana:100, atk:68, atkSpd:1.15, ap:15, armor:6, dodge:14, crit:20, critMult:160,
           hpRegen:5, manaRegen:4, lifesteal:8, mlifesteal:0 },
    skills:['blur','stifling','phantomStrike'],
    bio:'出手即致命的幻影刺客，幻影突袭让她瞬间攻速暴涨。' },

  { id:'necro', name:'死灵法师', tier:60, pos:'back', emoji:'☠️',
    base:{ hp:750, maxMana:100, atk:30, atkSpd:0.95, ap:65, armor:7, dodge:4, crit:8, critMult:150,
           hpRegen:6, manaRegen:6, lifesteal:0, mlifesteal:12 },
    skills:['corrosionAura','deathPulse','lifeReap'],
    bio:'操纵死亡脉冲与腐蚀之力的黑暗法师，敌人会在腐蚀中慢慢死去。' },

  { id:'sf', name:'影魔', tier:60, pos:'back', emoji:'👻',
    base:{ hp:720, maxMana:100, atk:34, atkSpd:1.0, ap:70, armor:5, dodge:5, crit:10, critMult:155,
           hpRegen:4, manaRegen:6, lifesteal:0, mlifesteal:15 },
    skills:['soulPresence','shadowraze','requiem'],
    bio:'吞噬灵魂的黑暗魔王，影压点杀，魂之挽歌收割全场。' },

  { id:'bs', name:'血魔', tier:40, pos:'mid', emoji:'🩸',
    base:{ hp:900, maxMana:100, atk:58, atkSpd:1.1, ap:20, armor:9, dodge:8, crit:12, critMult:155,
           hpRegen:7, manaRegen:5, lifesteal:12, mlifesteal:0 },
    skills:['bloodRage','bloodRite','rupture'],
    bio:'越受伤越狂暴的嗜血猎手，割裂让残血的敌人无处可逃。' },

  { id:'drow', name:'卓尔游侠', tier:40, pos:'back', emoji:'🏹',
    base:{ hp:780, maxMana:100, atk:56, atkSpd:1.1, ap:25, armor:7, dodge:9, crit:18, critMult:160,
           hpRegen:5, manaRegen:4, lifesteal:5, mlifesteal:0 },
    skills:['marksmanship','frostArrow','multishot'],
    bio:'冰冷精准的游侠，霜冻之箭让最虚弱的猎物无处遁逃。' },

  { id:'qop', name:'痛苦女王', tier:60, pos:'mid', emoji:'💜',
    base:{ hp:790, maxMana:100, atk:44, atkSpd:1.05, ap:60, armor:6, dodge:10, crit:12, critMult:155,
           hpRegen:5, manaRegen:5, lifesteal:12, mlifesteal:6 },
    skills:['darkPatronage','shadowStrike','screamOfPain'],
    bio:'以他人痛苦为食的女王，尖叫与暗影匕首都致命。' },

  { id:'zeus', name:'宙斯', tier:60, pos:'back', emoji:'⚡',
    base:{ hp:700, maxMana:100, atk:28, atkSpd:0.95, ap:72, armor:4, dodge:4, crit:8, critMult:150,
           hpRegen:4, manaRegen:7, lifesteal:0, mlifesteal:8 },
    skills:['staticField','arcLightning','thundergod'],
    bio:'执掌雷霆的众神之王，每一次施法都引来静电轰击。' },

  { id:'jugg', name:'剑圣', tier:40, pos:'mid', emoji:'⚔️',
    base:{ hp:880, maxMana:100, atk:60, atkSpd:1.2, ap:20, armor:8, dodge:8, crit:15, critMult:170,
           hpRegen:6, manaRegen:4, lifesteal:8, mlifesteal:0 },
    skills:['bladeDance','bladeFury','healingWard'],
    bio:'剑舞无双的流浪剑客，剑刃风暴席卷一切，治疗守卫守护队友。' },

  { id:'axe', name:'斧王', tier:20, pos:'front', emoji:'🪓',
    base:{ hp:1150, maxMana:100, atk:52, atkSpd:1.0, ap:8, armor:16, dodge:4, crit:8, critMult:150,
           hpRegen:8, manaRegen:4, lifesteal:6, mlifesteal:0 },
    skills:['counterHelix','berserkerCall','cullingBlade'],
    bio:'越挨打越疯狂的狂战士，残血敌人在他斧下难逃一斩。' },

  { id:'kunkka', name:'船长', tier:60, pos:'front', emoji:'⛵',
    base:{ hp:1100, maxMana:100, atk:56, atkSpd:1.0, ap:25, armor:14, dodge:5, crit:10, critMult:155,
           hpRegen:7, manaRegen:4, lifesteal:5, mlifesteal:0 },
    skills:['tidebringer','torrent','ghostShip'],
    bio:'潮汐之力附体的海军统帅，洪流与幽灵船掌控整个战场。' },

  { id:'abaddon', name:'地狱领主', tier:60, pos:'front', emoji:'🛡️',
    base:{ hp:1200, maxMana:100, atk:44, atkSpd:0.95, ap:35, armor:18, dodge:4, crit:8, critMult:150,
           hpRegen:9, manaRegen:5, lifesteal:5, mlifesteal:8 },
    skills:['rockWall','mistCoil','borrowedTime'],
    bio:'迷雾缠绕的不朽领主，回光返照让他屹立不倒。' },

  { id:'dk', name:'龙骑士', tier:20, pos:'front', emoji:'🐉',
    base:{ hp:1150, maxMana:100, atk:50, atkSpd:1.0, ap:18, armor:15, dodge:4, crit:8, critMult:150,
           hpRegen:8, manaRegen:4, lifesteal:5, mlifesteal:0 },
    skills:['dragonBlood','dragonTail','breatheFire'],
    bio:'龙血淬体的坚固骑士，神龙摆尾先手晕眩，龙息灼烧成排敌人。' },
];

/* 商店英雄档位池 */
const HERO_TIERS = { 20:'普通', 40:'稀有', 60:'史诗' };

/* ================= 道具（10 / 15 / 20 金币，3 档） ================= */
const ITEMS = [
  { id:'potion1', name:'森林药剂', price:10, icon:'🧪',
    stats:{ hp:150, hpRegen:3 },
    desc:'小型药剂：使用后生命值 +150，生命恢复速度 +3。' },
  { id:'potion2', name:'猎手药剂', price:15, icon:'🏹',
    stats:{ atk:12, crit:5, atkSpd:0.1 },
    desc:'中型药剂：使用后攻击 +12，暴击率 +5%，攻击速度 +0.10。' },
  { id:'potion3', name:'贤者药剂', price:20, icon:'📖',
    stats:{ ap:18, manaRegen:3, mlifesteal:5 },
    desc:'大型药剂：使用后法强 +18，魔法恢复速度 +3，魔法吸血 +5%。' },
];

/* ================= Dota 装备：5 个梯度 × 每档 10 件 = 50 件 =================
 * tier 1~5 对应价格 10 / 20 / 30 / 40 / 50 金币
 * 商店中出现的档位随关卡解锁：第 1~4 关 1 档，5~8 关 2 档，9~12 关 3 档，
 * 13~16 关 4 档，17~20 关 5 档（每 4 关一个 Boss 关）
 * 英雄 6 个装备格子
 *
 * 每件装备都带 skill（装备技能行），件件有个性、档档有区别：
 *  - 被动：behavior 驱动，经 skillsOf 接入普攻 / 受击 / 每秒 / 光环 / 减伤等钩子
 *  - 主动：targeting + effect 声明式，装上后获得独立蓝条与冷却（3 档起出现）
 * 同 id 的装备技能重复装备只生效一次（对齐 Dota 唯一被动语义）
 */
const EQUIPS = [
  /* ---------- 1 档（10 金）：基础散件，技能轻巧入门 ---------- */
  { id:'eq_t1_1', tier:1, name:'铁树枝干', price:10, icon:'🌿',
    stats:{ hp:80, hpRegen:2 }, desc:'生命值 +80，生命恢复 +2。',
    skill:{ id:'eqsk_t1_1', name:'根须愈合', type:'passive', behavior:'healLowestPerSec',
      stat:'hp', mult:0.01,
      desc:'每秒为生命比例最低的友军恢复自身最大生命 1% 的生命值。' } },
  { id:'eq_t1_2', tier:1, name:'力量手套', price:10, icon:'🧤',
    stats:{ hp:120 }, desc:'生命值 +120。',
    skill:{ id:'eqsk_t1_2', name:'横扫重拳', type:'passive', behavior:'cleave', mult:0.3,
      desc:'普攻命中后，向敌方其他单位溅射 30% 的伤害。' } },
  { id:'eq_t1_3', tier:1, name:'敏捷便鞋', price:10, icon:'👟',
    stats:{ atkSpd:0.12 }, desc:'攻击速度 +0.12。',
    skill:{ id:'eqsk_t1_3', name:'连环刺击', type:'passive', behavior:'attackDot',
      dot:{ name:'撕裂', stat:'atk', mult:0.2, dur:2, color:'#ff7d7d' },
      desc:'普攻附带流血：目标每秒受到 攻击×20% 的伤害，持续 2 秒。' } },
  { id:'eq_t1_4', tier:1, name:'智慧斗篷', price:10, icon:'🧣',
    stats:{ ap:10, manaRegen:2 }, desc:'法强 +10，魔法恢复 +2。',
    skill:{ id:'eqsk_t1_4', name:'奥术灼烧', type:'passive', behavior:'skillDot',
      dot:{ name:'奥术灼烧', stat:'ap', mult:0.15, dur:2, color:'#c99bff' },
      desc:'技能命中引燃奥术之火：目标每秒受到 法强×15% 的伤害，持续 2 秒。' } },
  { id:'eq_t1_5', tier:1, name:'攻击之爪', price:10, icon:'🐾',
    stats:{ atk:10 }, desc:'攻击 +10。',
    skill:{ id:'eqsk_t1_5', name:'裂伤攻击', type:'passive', behavior:'attackStun',
      chance:0.1, dur:0.5,
      desc:'普攻有 10% 几率撕裂目标，使其眩晕 0.5 秒。' } },
  { id:'eq_t1_6', tier:1, name:'守卫盾牌', price:10, icon:'🛡️',
    stats:{ armor:6 }, desc:'护甲 +6。',
    skill:{ id:'eqsk_t1_6', name:'格挡护盾', type:'passive', behavior:'shieldOnHit',
      pct:0.05, internalCd:1,
      desc:'受到伤害后，获得相当于该次伤害 5% 的护盾（内置冷却 1 秒）。' } },
  { id:'eq_t1_7', tier:1, name:'疾行之靴', price:10, icon:'👢',
    stats:{ dodge:4 }, desc:'闪避 +4%。',
    skill:{ id:'eqsk_t1_7', name:'灵巧身形', type:'passive', behavior:'takenReduce', pct:0.03,
      desc:'受到的所有伤害降低 3%。' } },
  { id:'eq_t1_8', tier:1, name:'治疗指环', price:10, icon:'💍',
    stats:{ hpRegen:5 }, desc:'生命恢复 +5。',
    skill:{ id:'eqsk_t1_8', name:'悬壶济世', type:'passive', behavior:'healLowestPerSec',
      stat:'hpRegen', mult:1,
      desc:'每秒为生命比例最低的友军恢复等同自身生命恢复速度的生命值。' } },
  { id:'eq_t1_9', tier:1, name:'贤者面具', price:10, icon:'🎭',
    stats:{ lifesteal:6 }, desc:'物理吸血 +6%。',
    skill:{ id:'eqsk_t1_9', name:'唤醒', type:'passive', behavior:'allyHealOnHit',
      chance:0.2, stat:'atk', mult:0.3,
      desc:'受到伤害时，有 20% 几率为生命比例最低的友军恢复 攻击×30% 的生命值。' } },
  { id:'eq_t1_10', tier:1, name:'秘法垂饰', price:10, icon:'📿',
    stats:{ manaRegen:4 }, desc:'魔法恢复 +4。',
    skill:{ id:'eqsk_t1_10', name:'法力腐蚀', type:'passive', behavior:'corrosion', pct:0.01,
      desc:'敌方全体每秒损失 1% 最大生命值的生命（无视护甲的真实伤害）。' } },

  /* ---------- 2 档（20 金）：进阶散件，技能成规模 ---------- */
  { id:'eq_t2_1', tier:2, name:'速度之靴', price:20, icon:'👞',
    stats:{ dodge:6, atkSpd:0.1 }, desc:'闪避 +6%，攻击速度 +0.10。',
    skill:{ id:'eqsk_t2_1', name:'绊摔', type:'passive', behavior:'attackStun',
      chance:0.12, dur:0.6,
      desc:'普攻有 12% 几率绊摔目标，使其眩晕 0.6 秒。' } },
  { id:'eq_t2_2', tier:2, name:'圆盾', price:20, icon:'🛡️',
    stats:{ armor:10, hp:150 }, desc:'护甲 +10，生命值 +150。',
    skill:{ id:'eqsk_t2_2', name:'铁壁', type:'passive', behavior:'takenReduce', pct:0.05,
      desc:'受到的所有伤害降低 5%。' } },
  { id:'eq_t2_3', tier:2, name:'魔棒', price:20, icon:'✨',
    stats:{ manaRegen:4, hpRegen:4 }, desc:'魔法恢复 +4，生命恢复 +4。',
    skill:{ id:'eqsk_t2_3', name:'能量迸发', type:'passive', behavior:'allyHealOnHit',
      chance:0.25, stat:'hp', mult:0.05,
      desc:'受到伤害时，有 25% 几率为生命比例最低的友军恢复自身最大生命 5% 的生命值。' } },
  { id:'eq_t2_4', tier:2, name:'铁板盔甲', price:20, icon:'⛓️',
    stats:{ armor:14 }, desc:'护甲 +14。',
    skill:{ id:'eqsk_t2_4', name:'反震护体', type:'passive', behavior:'shieldOnHit',
      pct:0.08, internalCd:1,
      desc:'受到伤害后，获得相当于该次伤害 8% 的护盾（内置冷却 1 秒）。' } },
  { id:'eq_t2_5', tier:2, name:'秘银锤', price:20, icon:'🔨',
    stats:{ atk:18 }, desc:'攻击 +18。',
    skill:{ id:'eqsk_t2_5', name:'旋风锤击', type:'passive', behavior:'counterHelix',
      chance:0.2, mult:0.4,
      desc:'受到伤害后，有 20% 几率旋身反击，对敌方全体各造成 攻击×40% 的伤害。' } },
  { id:'eq_t2_6', tier:2, name:'狂战士面具', price:20, icon:'😷',
    stats:{ atkSpd:0.15, crit:5 }, desc:'攻击速度 +0.15，暴击率 +5%。',
    skill:{ id:'eqsk_t2_6', name:'血怒', type:'passive', behavior:'bloodRage',
      desc:'每损失 10% 最大生命值，攻击 +4%（最多 +40%）。' } },
  { id:'eq_t2_7', tier:2, name:'流浪指环', price:20, icon:'💠',
    stats:{ hp:200, hpRegen:5 }, desc:'生命值 +200，生命恢复 +5。',
    skill:{ id:'eqsk_t2_7', name:'生命之环', type:'passive', behavior:'healLowestPerSec',
      stat:'hp', mult:0.015,
      desc:'每秒为生命比例最低的友军恢复自身最大生命 1.5% 的生命值。' } },
  { id:'eq_t2_8', tier:2, name:'风灵之杖', price:20, icon:'🪄',
    stats:{ ap:18, manaRegen:3 }, desc:'法强 +18，魔法恢复 +3。',
    skill:{ id:'eqsk_t2_8', name:'风蚀', type:'passive', behavior:'skillDot',
      dot:{ name:'风蚀', stat:'ap', mult:0.2, dur:2, color:'#8fffe0' },
      desc:'技能命中附加风蚀：目标每秒受到 法强×20% 的伤害，持续 2 秒。' } },
  { id:'eq_t2_9', tier:2, name:'吸血虹吸', price:20, icon:'🩸',
    stats:{ lifesteal:10, mlifesteal:6 }, desc:'物理吸血 +10%，魔法吸血 +6%。',
    skill:{ id:'eqsk_t2_9', name:'鲜血契约', type:'passive', behavior:'allyHealOnHit',
      chance:0.25, stat:'hp', mult:0.04,
      desc:'受到伤害时，有 25% 几率为生命比例最低的友军恢复自身最大生命 4% 的生命值。' } },
  { id:'eq_t2_10', tier:2, name:'精灵长弓', price:20, icon:'🏹',
    stats:{ atk:14, crit:6 }, desc:'攻击 +14，暴击率 +6%。',
    skill:{ id:'eqsk_t2_10', name:'射手光环', type:'passive', behavior:'auraStat',
      pct:{ atk:0.06 },
      desc:'光环：全体友军 攻击 +6%。' } },

  /* ---------- 3 档（30 金）：中级成品 ---------- */
  { id:'eq_t3_1', tier:3, name:'相位鞋', price:30, icon:'👟',
    stats:{ dodge:8, atkSpd:0.18, atk:10 }, desc:'闪避 +8%，攻击速度 +0.18，攻击 +10。' },
  { id:'eq_t3_2', tier:3, name:'阿托斯之棍', price:30, icon:'🪄',
    stats:{ ap:30, manaRegen:5 }, desc:'法强 +30，魔法恢复 +5。' },
  { id:'eq_t3_3', tier:3, name:'洛萨之锋', price:30, icon:'🗡️',
    stats:{ atk:26, crit:8, critMult:15 }, desc:'攻击 +26，暴击率 +8%，暴击倍数 +15%。' },
  { id:'eq_t3_4', tier:3, name:'挑战头巾', price:30, icon:'🧢',
    stats:{ hp:350, armor:8, hpRegen:8 }, desc:'生命值 +350，护甲 +8，生命恢复 +8。' },
  { id:'eq_t3_5', tier:3, name:'振魂石', price:30, icon:'💎',
    stats:{ hp:400, manaRegen:6 }, desc:'生命值 +400，魔法恢复 +6。' },
  { id:'eq_t3_6', tier:3, name:'散失之刃', price:30, icon:'⚔️',
    stats:{ atk:22, atkSpd:0.2, dodge:5 }, desc:'攻击 +22，攻击速度 +0.20，闪避 +5%。' },
  { id:'eq_t3_7', tier:3, name:'狂战斧', price:30, icon:'🪓',
    stats:{ atk:30, crit:8 }, desc:'攻击 +30，暴击率 +8%。' },
  { id:'eq_t3_8', tier:3, name:'死亡面具', price:30, icon:'💀',
    stats:{ crit:12, critMult:25, lifesteal:8 }, desc:'暴击率 +12%，暴击倍数 +25%，物理吸血 +8%。' },
  { id:'eq_t3_9', tier:3, name:'魂之灵钟', price:30, icon:'🔔',
    stats:{ armor:18, hp:250 }, desc:'护甲 +18，生命值 +250。' },
  { id:'eq_t3_10', tier:3, name:'巫师之冠', price:30, icon:'👑',
    stats:{ ap:24, mlifesteal:8 }, desc:'法强 +24，魔法吸血 +8%。' },

  /* ---------- 4 档（40 金）：高级成品 ---------- */
  { id:'eq_t4_1', tier:4, name:'黑皇杖', price:40, icon:'🦯',
    stats:{ atk:30, ap:30, hp:300 }, desc:'攻击 +30，法强 +30，生命值 +300。' },
  { id:'eq_t4_2', tier:4, name:'散夜对剑', price:40, icon:'⚔️',
    stats:{ atk:35, atkSpd:0.25, dodge:8 }, desc:'攻击 +35，攻击速度 +0.25，闪避 +8%。' },
  { id:'eq_t4_3', tier:4, name:'强袭胸甲', price:40, icon:'🏰',
    stats:{ armor:25, hp:400, atkSpd:0.1 }, desc:'护甲 +25，生命值 +400，攻击速度 +0.10。' },
  { id:'eq_t4_4', tier:4, name:'林肯法球', price:40, icon:'🔮',
    stats:{ ap:40, manaRegen:8, hp:300 }, desc:'法强 +40，魔法恢复 +8，生命值 +300。' },
  { id:'eq_t4_5', tier:4, name:'蝴蝶', price:40, icon:'🦋',
    stats:{ atkSpd:0.3, dodge:14, crit:10 }, desc:'攻击速度 +0.30，闪避 +14%，暴击率 +10%。' },
  { id:'eq_t4_6', tier:4, name:'碎骨锤', price:40, icon:'🔨',
    stats:{ atk:40, crit:10, critMult:25 }, desc:'攻击 +40，暴击率 +10%，暴击倍数 +25%。' },
  { id:'eq_t4_7', tier:4, name:'阿哈利姆神杖', price:40, icon:'🎩',
    stats:{ ap:50, manaRegen:6 }, desc:'法强 +50，魔法恢复 +6。' },
  { id:'eq_t4_8', tier:4, name:'血棘', price:40, icon:'🌹',
    stats:{ atk:35, crit:12, mlifesteal:10 }, desc:'攻击 +35，暴击率 +12%，魔法吸血 +10%。' },
  { id:'eq_t4_9', tier:4, name:'深海重锤', price:40, icon:'🌊',
    stats:{ atk:38, armor:10, hp:250 }, desc:'攻击 +38，护甲 +10，生命值 +250。' },
  { id:'eq_t4_10', tier:4, name:'守护天使', price:40, icon:'🪽',
    stats:{ armor:20, hp:350, hpRegen:10 }, desc:'护甲 +20，生命值 +350，生命恢复 +10。' },

  /* ---------- 5 档（50 金）：传说成品 ---------- */
  { id:'eq_t5_1', tier:5, name:'圣剑', price:50, icon:'⚔️',
    stats:{ atk:80, crit:15, critMult:40 }, desc:'攻击 +80，暴击率 +15%，暴击倍数 +40%。' },
  { id:'eq_t5_2', tier:5, name:'代达罗斯之殇', price:50, icon:'💀',
    stats:{ atk:60, crit:20, critMult:50 }, desc:'攻击 +60，暴击率 +20%，暴击倍数 +50%。' },
  { id:'eq_t5_3', tier:5, name:'龙之心', price:50, icon:'❤️',
    stats:{ hp:1000, hpRegen:30 }, desc:'生命值 +1000，生命恢复 +30。' },
  { id:'eq_t5_4', tier:5, name:'银月之晶', price:50, icon:'🌙',
    stats:{ atk:55, atkSpd:0.35 }, desc:'攻击 +55，攻击速度 +0.35。' },
  { id:'eq_t5_5', tier:5, name:'深渊之刃', price:50, icon:'🪓',
    stats:{ atk:70, armor:15 }, desc:'攻击 +70，护甲 +15。' },
  { id:'eq_t5_6', tier:5, name:'虚灵之刃', price:50, icon:'👻',
    stats:{ ap:80, mlifesteal:15 }, desc:'法强 +80，魔法吸血 +15%。' },
  { id:'eq_t5_7', tier:5, name:'灭世魔铠', price:50, icon:'🏯',
    stats:{ armor:35, hp:600 }, desc:'护甲 +35，生命值 +600。' },
  { id:'eq_t5_8', tier:5, name:'灵魂收割者', price:50, icon:'☠️',
    stats:{ lifesteal:20, mlifesteal:15, ap:50 }, desc:'物理吸血 +20%，魔法吸血 +15%，法强 +50。' },
  { id:'eq_t5_9', tier:5, name:'水晶剑', price:50, icon:'🗡️',
    stats:{ atk:50, crit:18 }, desc:'攻击 +50，暴击率 +18%。' },
  { id:'eq_t5_10', tier:5, name:'诸神黄昏', price:50, icon:'🌋',
    stats:{ atk:50, ap:50, hp:500 }, desc:'攻击 +50，法强 +50，生命值 +500。' },
];

/* ================= 敌人类型 =================
 * gold：击杀获得金币（普通敌人+5，精英+10，boss+20，精英boss+50）
 */
const ENEMY_BASE = {
  hp:340, maxMana:100, atk:26, atkSpd:1.0, ap:18, armor:4, dodge:4, crit:5, critMult:150,
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

/* 全流程共 20 关 */
const MAX_LEVEL = 20;

/* 每关敌人数量：初始 2 个，随关数每关递增 0.5，不超过 5 个（小数关卡交替进位） */
function rollEnemyCount(level){
  const raw = Math.min(5, 2 + (level - 1) * 0.5);
  let n = Math.floor(raw);
  if(raw % 1 !== 0 && level % 2 === 0) n++;
  return Math.min(5, n);
}

/* 每 4 关一个 Boss 关（第 4 / 8 / 12 / 16 / 20 关） */
function isBossLevel(level){ return level % 4 === 0; }

/* 每关敌人类型构成 */
function rollEnemyTypes(level){
  const n = rollEnemyCount(level);
  const list = [];
  if(isBossLevel(level)){
    // Boss 关：boss 固定在前，不会被截断
    if(level >= 20) list.push('eliteBoss');   // 最终关：精英 boss 压阵
    list.push('boss');
    if(level >= 12) list.push('boss');        // 12 关起双 boss
    if(level >= 16) list.push('elite');
    while(list.length < n) list.push(level >= 6 ? 'elite' : 'minion');
  } else {
    // 普通关：精英随关数增多，其余为小兵
    if(level >= 6) list.push('elite');
    if(level >= 3) list.push('elite');
    while(list.length < n) list.push('minion');
  }
  if(list.length > n) list.length = n;
  return list;
}
