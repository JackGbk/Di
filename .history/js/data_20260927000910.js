'use strict';

/* =====================================================================
 * 森林战纪 · 数据层（重制版）
 * 设计要点：
 *  1. 全程 15 关；每关 1 个小 Boss（各有特色），第 5/10/15 关额外出现大 Boss。
 *  2. 小数值起步：英雄生命 145~255、攻击 10~24；敌人基础生命 100、攻击 14。
 *  3. 借鉴《怪物火车》：护甲（每段伤害直接减免）、狂怒（层数叠攻击）、
 *     尖刺（受击反伤）、多重打击 / 横扫 / 迅捷 / 碾压（强化槽位改造）。
 *  4. 神器（ARTIFACTS）替代祝福；每关通关后三选一。
 *  5. 每关开战前可选难度（休闲 / 标准 / 挑战），挑战有额外通关奖励。
 *  6. 养大哥路线：升星 + 装备 + 强化槽改造 + 神器，围绕 1~2 个核心英雄。
 *  7. 祝福（blessing.js）与奇遇（encounter.js）停用，仅保留文件不再进入流程。
 * ===================================================================== */

/* ================= 基础配置 ================= */
const GRID_ROWS = 4;                 // 阵营纵向格子数（深度方向）
const GRID_COLS = 5;                 // 阵营横向格子数
const FORMATION_CAP = 12;            // 玩家阵容上限
const ATTACK_INTERVAL = 1.0;         // 即时制：普攻间隔 = 1.0 秒 ÷ 攻击速度
const MANA_ON_ATTACK = 8;            // 攻击时增加的魔法值
const MANA_ON_HIT = 8;               // 被攻击时增加的魔法值

const POS_NAMES = { front:'前排', mid:'中排', back:'后排' };
const POS_SHORT = { front:'前', mid:'中', back:'后' };

/* ================= 《怪物火车》关键词（重制数值） =================
 * 护甲：每次受到伤害先减免等额数值（可为负 → 增伤），战斗中不衰减。
 * 狂怒：每层 +RAGE_ATK 点攻击，每 RAGE_DECAY_SEC 秒衰减 1 层（神器可阻止）。
 * 尖刺：每次被攻击反弹等额真实伤害（不可闪避、不计算暴击）。 */
const RAGE_ATK = 2;          // 每层狂怒提供的攻击力
const RAGE_MAX = 30;         // 狂怒层数上限
const RAGE_DECAY_SEC = 4;    // 每 N 秒衰减 1 层狂怒
const ARMOR_MIN = -90;       // 护甲下限（腐蚀可为负）

/* ================= 装备档位配色（1~5 档一眼区分） ================= */
const TIER_COLORS = { 1:'#9fb4d8', 2:'#5fd67a', 3:'#4d9bff', 4:'#c07bff', 5:'#ffb02e' };
const TIER_NAMES  = { 1:'普通', 2:'精良', 3:'稀有', 4:'史诗', 5:'传说' };

/* ================= 升星配置（最多 5 星） =================
 * 每升一星：基础属性 +35%，攻击速度 +7%；技能按星级解锁：1 星 1 个、3 星 2 个、5 星 3 个。 */
const STAR_MAX = 5;
const STAR_COST = { 1:10, 2:20, 3:30, 4:40 };
const STAR_ATTR_PER = 0.35;    // 每星全属性加成
const STAR_SPD_PER  = 0.07;    // 每星攻击速度加成
function starAttrMul(star){ return 1 + STAR_ATTR_PER * ((star || 1) - 1); }
function starSpdMul(star){ return 1 + STAR_SPD_PER * ((star || 1) - 1); }
/* 当前星级解锁的技能数：1/2 星 → 1，3/4 星 → 2，5 星 → 3 */
function starSkillCount(star){
  star = star || 1;
  return star >= 5 ? 3 : star >= 3 ? 2 : 1;
}
/* 第 index 个技能（0 起）需要的星级 */
function skillNeedStar(index){ return index === 0 ? 1 : index === 1 ? 3 : 5; }

/* ================= 强化槽位（借鉴 MT 升级槽） =================
 * 每个英雄初始 1 个强化槽；神器【薪火石外壳】+1。槽内装改造（UPGRADES）。 */
const HERO_SLOTS_BASE = 1;

/* 属性键（基础属性），atkSpd = 攻击速度（1.0 表示每 1 秒普攻一次） */
const ZERO_KEYS = ['hp','maxMana','atk','atkSpd','ap','armor','dodge','crit','critMult',
  'hpRegen','manaRegen','lifesteal','mlifesteal','spikes'];

/* 属性显示格式：[键, 标签, 是否百分比] —— 两列布局，白字基础 + 绿字加成 */
const STAT_ROWS = [
  ['hp',        '❤ 生命值',      0],
  ['maxMana',   '✦ 魔法值',      0],
  ['atk',       '⚔ 攻击',        0],
  ['atkSpd',    '⚡ 攻击速度',    0],
  ['ap',        '✨ 法强',        0],
  ['armor',     '🛡 护甲',        0],
  ['spikes',    '🌵 尖刺',        0],
  ['dodge',     '💨 闪避',        1],
  ['crit',      '🎯 暴击率',      1],
  ['critMult',  '💥 暴击倍数',    1],
  ['hpRegen',   '🌱 生命恢复速度', 0],
  ['manaRegen', '💧 魔法恢复速度', 0],
  ['lifesteal', '🩸 物理吸血',    1],
  ['mlifesteal','🔮 魔法吸血',    1],
];

/* ================= 难度选择（每关开战前） =================
 * 0 休闲：敌人更弱、奖励缩水；1 标准；2 挑战：敌人更强、数量 +1、
 * 通关金币 ×1.6、装备三选一升为四选一（额外通关奖励）。 */
const DIFFICULTIES = [
  { id:0, name:'休闲', icon:'🌿', enemyMul:0.8, goldMul:0.8, lootN:2, countAdd:0,
    desc:'敌人属性 -20%，通关金币 ×0.8，战利品 2 选 1。适合稳扎稳打。' },
  { id:1, name:'标准', icon:'⚔️', enemyMul:1.0, goldMul:1.0, lootN:3, countAdd:0,
    desc:'标准强度与奖励，战利品 3 选 1。' },
  { id:2, name:'挑战', icon:'🔥', enemyMul:1.25, goldMul:1.6, lootN:4, countAdd:1,
    desc:'敌人属性 +25%、数量 +1；通关金币 ×1.6、战利品 4 选 1（额外通关奖励）。' },
];
function difficultyDef(id){ return DIFFICULTIES[id] || DIFFICULTIES[1]; }

/* ================= 神器（每关通关后三选一，可叠加） ================= */
const ARTIFACTS = [
  { id:'shackles',  name:'灼热枷锁',   icon:'🔥',
    desc:'战斗开始时，全体友军获得 3 层狂怒。' },
  { id:'steel',     name:'灼热锻钢',   icon:'🛡️',
    desc:'战斗开始时，全体友军获得 6 点护甲（每场战斗重置）。' },
  { id:'echo',      name:'回响碎片',   icon:'💠',
    desc:'狂怒每层额外 +1 攻击力。' },
  { id:'tail',      name:'尾巴收藏品', icon:'🦎',
    desc:'狂怒不再随时间衰减。' },
  { id:'crown',     name:'胜者桂冠',   icon:'👑',
    desc:'友军每次击杀敌人，攻击力永久 +3（本场战斗）。' },
  { id:'hammer',    name:'铁道锻锤',   icon:'🔨',
    desc:'友军每次释放技能，施法者获得 4 点护甲。' },
  { id:'shell',     name:'薪火石外壳', icon:'🥚',
    desc:'所有英雄的强化槽位 +1。' },
  { id:'barb',      name:'格鲁格的刺棍', icon:'🪄',
    desc:'星级最高的英雄获得【多重打击】：每次普攻额外攻击 1 次（每次 60% 伤害）。' },
  { id:'spikeBadge',name:'尖刺徽记',   icon:'🌵',
    desc:'全体友军获得 6 点尖刺。' },
  { id:'bloodGem',  name:'血色宝石',   icon:'🩸',
    desc:'友军击杀敌人时，回复 20% 最大生命。' },
  { id:'manaCrystal',name:'魔力水晶',  icon:'🔮',
    desc:'战斗开始时，所有技能蓝量全满。' },
  { id:'giantBelt', name:'巨人腰带',   icon:'🥋',
    desc:'全体友军最大生命 +20%。' },
  { id:'windFeather',name:'疾风之羽',  icon:'🪶',
    desc:'全体友军攻击速度 +15%。' },
  { id:'coagStone', name:'凝血石',     icon:'🪨',
    desc:'生命低于 50% 时，获得 10 点护甲（每场一次）。' },
  { id:'pierceCone',name:'破甲锥',     icon:'🎯',
    desc:'友军攻击无视目标 30% 的护甲。' },
  { id:'hunterMark',name:'猎手印记',   icon:'🧿',
    desc:'友军对精英与首领的伤害 +25%。' },
  { id:'vengeBadge',name:'复仇者徽章', icon:'⚔️',
    desc:'友军单位死亡时，其余全体友军获得 3 层狂怒。' },
  { id:'thornSeed', name:'荆棘之种',   icon:'🌿',
    desc:'全体友军尖刺 +4。' },
];
function artifactById(id){ for(let i=0;i<ARTIFACTS.length;i++) if(ARTIFACTS[i].id===id) return ARTIFACTS[i]; return null; }

/* ================= 强化槽改造（单位升级槽位） =================
 * 每个英雄槽内可装 1~2 个改造；数值类改造在 calcTotals 结算，
 * 机制类改造（多重打击/横扫/迅捷/碾压）在普攻流程结算。 */
const UPGRADES = [
  { id:'multistrike', name:'多重打击', icon:'⚔️',
    desc:'每次普攻额外攻击 1 次（每次造成 60% 伤害）。' },
  { id:'sweep',       name:'横扫',     icon:'🌊',
    desc:'普攻额外命中目标同排的所有其他敌人（各 50% 伤害）。' },
  { id:'quick',       name:'迅捷',     icon:'💨',
    desc:'战斗开始立即出手，且首次攻击必定暴击。' },
  { id:'trample',     name:'碾压',     icon:'🦏',
    desc:'普攻击杀目标后，对同排另一名敌人追加 60% 伤害。' },
  { id:'fortify',     name:'坚甲',     icon:'🛡️', stats:{ armor:6 },
    desc:'护甲 +6（每次受击额外减免 6 点伤害）。' },
  { id:'wrath',       name:'狂怒之刃', icon:'🔥', startRage:4,
    desc:'战斗开始时获得 4 层狂怒（每层 +2 攻击）。' },
  { id:'spikeShell',  name:'荆棘之壳', icon:'🌵', stats:{ spikes:6 },
    desc:'尖刺 +6：被攻击时反弹 6 点伤害。' },
  { id:'vampiric',    name:'汲血',     icon:'🩸', stats:{ lifesteal:15 },
    desc:'物理吸血 +15%。' },
  { id:'tough',       name:'坚韧',     icon:'❤️', stats:{ hp:60 },
    desc:'最大生命 +60。' },
  { id:'heavy',       name:'强击',     icon:'🗡️', stats:{ atk:8 },
    desc:'攻击 +8。' },
  { id:'charge',      name:'蓄能',     icon:'💧', stats:{ manaRegen:5 },
    desc:'魔法恢复速度 +5（技能更频繁）。' },
  { id:'critSight',   name:'会心',     icon:'🎯', stats:{ crit:10, critMult:20 },
    desc:'暴击率 +10%，暴击倍数 +20%。' },
];
function upgradeById(id){ for(let i=0;i<UPGRADES.length;i++) if(UPGRADES[i].id===id) return UPGRADES[i]; return null; }

/* ================= 技能定义 =================
 * 被动技能由 behavior 字段驱动；主动技能由 targeting + effect 声明式驱动。
 * effect 支持：damage / missingHp / heal / shield / stun / silence / disarm /
 *              cleanse / dot / buff / summon
 */
const SKILLS = {
  /* ========== 幻影刺客：暴闪收割 ========== */
  blur: {
    id:'blur', name:'模糊', type:'passive', behavior:'statBuff',
    stats:{ dodge:18, crit:10 },
    desc:'【被动】身形如雾：闪避 +18%，暴击率 +10%。'
  },
  stifling: {
    id:'stifling', name:'窒息之刃', type:'active', cost:50, cd:5,
    icon:'🗡️', color:'#c99bff', fx:'burst', targeting:'enemyLowestHp',
    effect:{ damage:{ type:'physical', stat:'atk', mult:2.2 } },
    desc:'【主动】飞刀直取要害：对生命最低的敌人造成 攻击×2.2 物理伤害。耗蓝 50，蓝满即放。'
  },
  phantomStrike: {
    id:'phantomStrike', name:'幻影突袭', type:'active', cost:55, cd:9,
    icon:'🌀', color:'#b06bff', fx:'ring', targeting:'self',
    effect:{ buffs:[ { stat:'atkSpd', mult:0.6, dur:4, name:'幻影突袭·攻速+60%' },
                     { stat:'crit', add:20, dur:4, name:'幻影突袭·暴击+20%' } ] },
    desc:'【主动】瞬移切入：自己攻速 +60%、暴击 +20%，持续 4 秒。耗蓝 55，蓝满即放。'
  },

  /* ========== 死灵法师：百分比磨血 + 亦攻亦疗 ========== */
  corrosionAura: {
    id:'corrosionAura', name:'腐蚀光环', type:'passive', behavior:'corrosion',
    color:'#7bd97b', fx:'ring', pct:0.02,
    desc:'【被动】敌方全体每秒损失 2% 最大生命（无视护甲）。'
  },
  deathPulse: {
    id:'deathPulse', name:'死亡脉冲', type:'active', cost:70, cd:8,
    icon:'💀', color:'#a06be0', fx:'ring', targeting:'allEnemies',
    effect:{ damage:{ type:'magic', stat:'ap', mult:0.9 } },
    allyEffect:{ heal:{ stat:'ap', mult:0.9 } },
    desc:'【主动】生死轮转：对敌全体造成 法强×0.9 伤害，同时治疗自己与全体友军（等量）。耗蓝 70，蓝满即放。'
  },
  lifeReap: {
    id:'lifeReap', name:'生命收割', type:'active', cost:75, cd:8,
    icon:'☠️', color:'#d05bff', fx:'burst', targeting:'enemyLowestHp',
    effect:{ missingHp:0.6 },
    desc:'【主动】死光收割：对生命最低的敌人造成（缺失生命）×0.6 真实伤害。耗蓝 75，蓝满即放。'
  },

  /* ========== 影魔：法术炮台，击杀刷新 ========== */
  soulPresence: {
    id:'soulPresence', name:'灵魂存在', type:'passive', behavior:'statBuff',
    stats:{ mlifesteal:12 }, pct:{ ap:0.15 },
    desc:'【被动】灵魂环身：法强 +15%，魔法吸血 +12%。'
  },
  shadowraze: {
    id:'shadowraze', name:'影压', type:'active', cost:55, cd:5,
    icon:'💥', color:'#ff5a5a', fx:'burst', targeting:'enemyHighestHp',
    effect:{ damage:{ type:'magic', stat:'ap', mult:2.5 } },
    desc:'【主动】灵魂冲击：对生命最高的敌人造成 法强×2.5 魔法伤害。耗蓝 55，蓝满即放。'
  },
  requiem: {
    id:'requiem', name:'魂之挽歌', type:'active', cost:80, cd:10,
    icon:'👻', color:'#c05bff', fx:'ring', targeting:'allEnemies',
    effect:{ damage:{ type:'magic', stat:'ap', mult:1.5 }, silence:1.5 },
    killMana:40,
    desc:'【主动】怨魂撕裂敌全体：各造成 法强×1.5 伤害并沉默 1.5 秒；击杀敌人立即回 40 蓝。耗蓝 80，蓝满即放。'
  },

  /* ========== 血魔：越残血越狂，割裂处决 ========== */
  bloodRage: {
    id:'bloodRage', name:'血怒', type:'passive', behavior:'bloodRage',
    desc:'【被动】每损失 10% 最大生命，攻击 +4%（最多 +40%）。'
  },
  bloodRite: {
    id:'bloodRite', name:'血之祭祀', type:'active', cost:60, cd:8,
    icon:'🩸', color:'#ff4d6d', fx:'ring', targeting:'allEnemies',
    effect:{ damage:{ type:'physical', stat:'atk', mult:1.2 }, silence:1.5 },
    desc:'【主动】血阵降临：对敌全体造成 攻击×1.2 伤害并沉默 1.5 秒。耗蓝 60，蓝满即放。'
  },
  rupture: {
    id:'rupture', name:'割裂', type:'active', cost:70, cd:9,
    icon:'🔪', color:'#ff2e4d', fx:'burst', targeting:'enemyHighestHp',
    effect:{ missingHp:0.5,
             dot:{ name:'割裂', stat:'atk', mult:0.25, dur:4, color:'#ff5a5a' } },
    desc:'【主动】撕裂生命最高的敌人：（缺失生命）×0.5 真伤 + 每秒流血 攻击×25%，持续 4 秒。耗蓝 70，蓝满即放。'
  },

  /* ========== 卓尔游侠：减速点杀 ========== */
  marksmanship: {
    id:'marksmanship', name:'射手天赋', type:'passive', behavior:'auraStat',
    pct:{ atk:0.08 },
    desc:'【被动】光环：全体友军 攻击 +8%。'
  },
  frostArrow: {
    id:'frostArrow', name:'霜冻之箭', type:'active', cost:50, cd:6,
    icon:'❄️', color:'#8fd8ff', fx:'burst', targeting:'enemyLowestHpRatio',
    effect:{ damage:{ type:'physical', stat:'atk', mult:1.9 },
             buffs:[ { stat:'atkSpd', mult:-0.4, dur:3, name:'冰缓·攻速-40%' } ] },
    desc:'【主动】霜箭点杀：对生命比例最低的敌人造成 攻击×1.9 伤害，并使其攻速 -40%，持续 3 秒。耗蓝 50，蓝满即放。'
  },
  multishot: {
    id:'multishot', name:'多重射击', type:'active', cost:65, cd:7,
    icon:'🏹', color:'#b8f36b', fx:'burst', targeting:'enemyRandom3',
    effect:{ damage:{ type:'physical', stat:'atk', mult:1.7 } },
    desc:'【主动】箭雨覆盖：对随机 3 个敌人各造成 攻击×1.7 物理伤害。耗蓝 65，蓝满即放。'
  },

  /* ========== 痛苦女王：缴械吸血，单点废人 ========== */
  darkPatronage: {
    id:'darkPatronage', name:'暗影契约', type:'passive', behavior:'statBuff',
    stats:{ lifesteal:12, dodge:6 },
    desc:'【被动】与暗影契约：物理吸血 +12%，闪避 +6%。'
  },
  shadowStrike: {
    id:'shadowStrike', name:'暗影突袭', type:'active', cost:55, cd:6,
    icon:'🥷', color:'#b06bff', fx:'burst', targeting:'enemyLowestHp',
    effect:{ damage:{ type:'physical', stat:'atk', mult:2.2 }, disarm:1.5 },
    desc:'【主动】毒镖废人：对生命最低的敌人造成 攻击×2.2 伤害并缴械 1.5 秒。耗蓝 55，蓝满即放。'
  },
  screamOfPain: {
    id:'screamOfPain', name:'痛苦尖叫', type:'active', cost:65, cd:7,
    icon:'📢', color:'#ff6bd6', fx:'ring', targeting:'allEnemies',
    effect:{ damage:{ type:'magic', stat:'ap', mult:1.6 } },
    desc:'【主动】灵魂尖啸：对敌全体造成 法强×1.6 魔法伤害。耗蓝 65，蓝满即放。'
  },

  /* ========== 宙斯：高频施法，技能附加灼烧 ========== */
  staticField: {
    id:'staticField', name:'静电场', type:'passive', behavior:'skillDot',
    dot:{ name:'电击', stat:'ap', mult:0.2, dur:3, color:'#9fd0ff' },
    desc:'【被动】技能命中附加电击：每秒 法强×20%，持续 3 秒。'
  },
  arcLightning: {
    id:'arcLightning', name:'弧形闪电', type:'active', cost:45, cd:4,
    icon:'⚡', color:'#6cc8ff', fx:'lightning', targeting:'enemyRandom3',
    effect:{ damage:{ type:'magic', stat:'ap', mult:1.3 } },
    desc:'【主动】闪电链：雷电劈向随机 3 个敌人，并在目标间跳跃传递，依次造成 法强×1.3 伤害。低耗高频率：耗蓝 45，蓝满即放。'
  },
  thundergod: {
    id:'thundergod', name:'雷神之怒', type:'active', cost:90, cd:9,
    icon:'🌩️', color:'#ffe066', fx:'lightning', targeting:'allEnemies',
    effect:{ damage:{ type:'magic', stat:'ap', mult:2.3 } },
    desc:'【主动】万雷天罚：天雷从天顶直击一名敌人后，向全体敌人连锁跳跃传递，各造成 法强×2.3 魔法伤害。耗蓝 90，蓝满即放。'
  },

  /* ========== 剑圣：每 3 刀必暴，风暴带盾 ========== */
  bladeDance: {
    id:'bladeDance', name:'剑舞', type:'passive', behavior:'assureCrit',
    every:3, stats:{ critMult:30 },
    desc:'【被动】每第 3 次攻击必定暴击，暴击倍数 +30%。'
  },
  bladeFury: {
    id:'bladeFury', name:'剑刃风暴', type:'active', cost:65, cd:9,
    icon:'⚔️', color:'#ffd35c', fx:'burst', targeting:'allEnemies',
    effect:{ damage:{ type:'physical', stat:'atk', mult:1.2 } },
    selfEffect:{ shield:{ pctMaxHp:0.12 } },
    desc:'【主动】剑刃风暴席卷敌全体：各造成 攻击×1.2 伤害；自己获得 12% 最大生命护盾。耗蓝 65，蓝满即放。'
  },
  healingWard: {
    id:'healingWard', name:'治疗守卫', type:'active', cost:65, cd:10,
    icon:'💚', color:'#6bff9b', fx:'ring', targeting:'allAllies',
    effect:{ heal:{ pctMaxHp:0.12 } },
    desc:'【主动】守卫结界：全体友军恢复 12% 最大生命。耗蓝 65，蓝满即放。'
  },

  /* ========== 斧王：受击反击，低血处决 ========== */
  counterHelix: {
    id:'counterHelix', name:'反击螺旋', type:'passive', behavior:'counterHelix',
    chance:0.35, mult:0.5,
    desc:'【被动】受击有 35% 几率旋转反击，对敌全体各造成 攻击×50% 伤害。'
  },
  berserkerCall: {
    id:'berserkerCall', name:'战斗咆哮', type:'active', cost:65, cd:8,
    icon:'😤', color:'#ffb02e', fx:'ring', targeting:'self',
    effect:{ shield:{ pctMaxHp:0.2 },
             buff:{ stat:'atk', mult:0.25, dur:4, name:'战斗咆哮·攻击+25%' } },
    desc:'【主动】怒吼：自己获得 20% 最大生命护盾，攻击 +25%，持续 4 秒。耗蓝 65，蓝满即放。'
  },
  cullingBlade: {
    id:'cullingBlade', name:'斩杀', type:'active', cost:70, cd:9,
    icon:'🪓', color:'#ff3b3b', fx:'burst', targeting:'enemyLowestHpRatio',
    effect:{ missingHp:0.7, execute:0.12 },
    desc:'【主动】巨斧斩下：对生命比例最低的敌人造成（缺失生命）×0.7 真伤；低于 12% 生命直接处决。耗蓝 70，蓝满即放。'
  },

  /* ========== 船长：溅射 + 团队朗姆酒 ========== */
  tidebringer: {
    id:'tidebringer', name:'潮汐使者', type:'passive', behavior:'cleave',
    mult:0.6,
    desc:'【被动】潮汐附刃：普攻向其他敌人溅射 60% 伤害。'
  },
  torrent: {
    id:'torrent', name:'洪流', type:'active', cost:60, cd:7,
    icon:'🌊', color:'#6bc5ff', fx:'burst', targeting:'enemyHighestHp',
    effect:{ damage:{ type:'physical', stat:'atk', mult:1.8 }, stun:1.5 },
    desc:'【主动】喷涌洪流：对生命最高的敌人造成 攻击×1.8 伤害并眩晕 1.5 秒。耗蓝 60，蓝满即放。'
  },
  ghostShip: {
    id:'ghostShip', name:'幽灵船', type:'active', cost:85, cd:11,
    icon:'⛵', color:'#8fe3ff', fx:'burst', targeting:'allEnemies',
    effect:{ damage:{ type:'physical', stat:'atk', mult:1.3 }, stun:1 },
    allyBuff:{ stat:'armor', mult:0.2, dur:5, name:'朗姆酒·护甲+20%' },
    desc:'【主动】幽灵船撞向敌全体：各造成 攻击×1.3 伤害并眩晕 1 秒；全队护甲 +20%，持续 5 秒。耗蓝 85，蓝满即放。'
  },

  /* ========== 地狱领主：濒死反转 ========== */
  mistCoil: {
    id:'mistCoil', name:'迷雾之咒', type:'active', cost:55, cd:6,
    icon:'🌫️', color:'#a06be0', fx:'burst', targeting:'enemyLowestHp',
    effect:{ damage:{ type:'magic', stat:'atk', mult:1.9 } },
    desc:'【主动】迷雾能量：对生命最低的敌人造成 攻击×1.9 魔法伤害。耗蓝 55，蓝满即放。'
  },
  borrowedTime: {
    id:'borrowedTime', name:'回光返照', type:'passive', behavior:'lastStand',
    pct:0.3, heal:0.25, shield:0.15,
    desc:'【被动】生命首次低于 30% 时：回复 25% 最大生命、解除全部负面，并获得 15% 最大生命护盾（每场一次）。'
  },
  borrowedTimeActive: {
    id:'borrowedTimeActive', name:'不灭契印', type:'active', cost:80, cd:10,
    icon:'⏳', color:'#6bffc8', fx:'ring', targeting:'self',
    effect:{ heal:{ pctMaxHp:0.35 }, cleanse:true, shield:{ pctMaxHp:0.15 } },
    desc:'【主动】激活不灭契印：恢复 35% 最大生命、解除全部负面，并获得 15% 护盾。耗蓝 80，蓝满即放。'
  },

  /* ========== 龙骑士：破甲震慑，前排控制坦 ========== */
  dragonBlood: {
    id:'dragonBlood', name:'龙血', type:'passive', behavior:'statBuff',
    stats:{ armor:4, hpRegen:2 },
    desc:'【被动】巨龙之血：护甲 +4，生命恢复 +2。'
  },
  dragonTail: {
    id:'dragonTail', name:'神龙摆尾', type:'active', cost:60, cd:7,
    icon:'🐉', color:'#ffb02e', fx:'burst', targeting:'enemyHighestHp',
    effect:{ damage:{ type:'physical', stat:'atk', mult:1.9 },
             buffs:[ { stat:'atk', mult:-0.3, dur:4, name:'龙威·攻击-30%' } ] },
    desc:'【主动】龙尾震慑：对生命最高的敌人造成 攻击×1.9 伤害，使其攻击 -30%，持续 4 秒。耗蓝 60，蓝满即放。'
  },
  breatheFire: {
    id:'breatheFire', name:'火焰气息', type:'active', cost:65, cd:8,
    icon:'🔥', color:'#ff8a3c', fx:'burst', targeting:'allEnemies',
    effect:{ damage:{ type:'physical', stat:'atk', mult:1.2 },
             buffs:[ { stat:'armor', mult:-0.25, dur:4, name:'龙息破甲·护甲-25%' } ] },
    desc:'【主动】龙息破甲：对敌全体造成 攻击×1.2 伤害，使其护甲 -25%，持续 4 秒。耗蓝 65，蓝满即放。'
  },

  /* ========== 敌方技能 ========== */
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
    desc:'【主动】砸地横扫：对敌全体造成 攻击×0.5 物理伤害。耗蓝 60，蓝满即放。'
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
    desc:'【主动】深渊之触：对生命最低的敌人造成 攻击×1.6 伤害并眩晕 1.2 秒。耗蓝 60，蓝满即放。'
  },

  /* ---- 大 Boss 专属 ---- */
  magmaEruption: {
    id:'magmaEruption', name:'熔岩喷发', type:'active', cost:60, cd:8,
    icon:'🌋', color:'#ff6b3c', fx:'burst', targeting:'allEnemies',
    effect:{ damage:{ type:'magic', stat:'atk', mult:1.1 },
             dot:{ name:'灼烧', stat:'atk', mult:0.3, dur:3, color:'#ff8a3c' } },
    desc:'【主动】熔岩喷发：对敌全体造成 攻击×1.1 伤害并附加灼烧（每秒 攻击×30%，3 秒）。'
  },
  summonAbyss: {
    id:'summonAbyss', name:'深渊召唤', type:'active', cost:50, cd:12,
    icon:'🌀', color:'#a06bff', fx:'ring', targeting:'self',
    effect:{ summon:{ count:2, template:'abyss', cap:4 } },
    desc:'【主动】深渊召唤：从裂隙召唤至多 2 只深渊小卒（场上满 4 只不再召唤）。'
  },
  summonGuard: {
    id:'summonGuard', name:'古树卫士', type:'active', cost:60, cd:14,
    icon:'🌳', color:'#7bd97b', fx:'ring', targeting:'self',
    effect:{ summon:{ count:1, template:'guard', cap:2 } },
    desc:'【主动】古树卫士：召唤 1 名树卫为自己抵挡伤害（场上满 2 名不再召唤）。'
  },

  /* ---- 小 Boss 特色技能 ---- */
  manaBurnBlade: {
    id:'manaBurnBlade', name:'噬魔之刃', type:'passive', behavior:'manaBurn',
    mana:15,
    desc:'【被动】普攻额外燃烧目标 15 点魔法值。'
  },
  frostTouch: {
    id:'frostTouch', name:'霜噬', type:'passive', behavior:'attackStun',
    chance:0.3, dur:0.8,
    desc:'【被动】普攻有 30% 几率冻结目标 0.8 秒。'
  },
  deathBloom: {
    id:'deathBloom', name:'凋零绽放', type:'passive', behavior:'deathBloom',
    mult:0.9,
    desc:'【被动】死亡时凋零爆炸：对敌方全体造成 攻击×90% 的真实伤害。'
  },
  teamBloom: {
    id:'teamBloom', name:'腐化花粉', type:'passive', behavior:'healTeamPerSec',
    pct:0.02,
    desc:'【被动】每秒为生命比例最低的友军恢复其 2% 最大生命。'
  },
  plagueSpray: {
    id:'plagueSpray', name:'瘟疫蔓延', type:'passive', behavior:'corrosion',
    pct:0.02, color:'#9fe07b',
    desc:'【被动】敌方全体每秒损失 2% 最大生命（无视护甲）。'
  },
  phaseTwo: {
    id:'phaseTwo', name:'古树之心', type:'passive', behavior:'phaseTwo',
    hpPct:0.5, rage:10, spikes:12,
    desc:'【被动】生命首次低于 50% 时觉醒：获得 10 层狂怒与 12 点尖刺。'
  },

  /* ========== 敌方词缀（第 6 关起精英随机携带） ========== */
  affixFrenzy: {
    id:'affixFrenzy', name:'词缀·狂暴', type:'passive', behavior:'bloodRage', per:0.5,
    desc:'【词缀】每损失 10% 最大生命，攻击 +5%。'
  },
  affixLifesteal: {
    id:'affixLifesteal', name:'词缀·嗜血', type:'passive', behavior:'statBuff',
    stats:{ lifesteal:20 },
    desc:'【词缀】物理吸血 +20%。'
  },
  affixThorns: {
    id:'affixThorns', name:'词缀·荆棘', type:'passive', behavior:'thorns',
    mult:0.15,
    desc:'【词缀】受到攻击时反弹 攻击×15% 的真实伤害。'
  },
  affixIron: {
    id:'affixIron', name:'词缀·铁肤', type:'passive', behavior:'takenReduce',
    pct:0.08,
    desc:'【词缀】受到的所有伤害降低 8%。'
  },
  affixArcane: {
    id:'affixArcane', name:'词缀·奥术亲和', type:'passive', behavior:'statBuff',
    stats:{ mlifesteal:15 }, pct:{ ap:0.1 },
    desc:'【词缀】魔法吸血 +15%，法强 +10%。'
  },
  affixSwift: {
    id:'affixSwift', name:'词缀·迅捷', type:'passive', behavior:'statBuff',
    stats:{ atkSpd:0.15 },
    desc:'【词缀】攻击速度 +0.15。'
  },
};

/* ================= 12 个英雄（小数值重写） =================
 * pos：生成位置类型（前/中/后）；tier：商店售价档位（20 / 40 / 60）
 * 养大哥路线：升星 + 装备 + 强化槽改造 + 神器全灌给 1~2 个核心。 */
const HEROES = [
  { id:'pa', name:'幻影刺客', tier:60, pos:'mid', emoji:'🗡️',
    base:{ hp:175, maxMana:100, atk:24, atkSpd:1.15, ap:5, armor:3, dodge:14, crit:20, critMult:160,
           hpRegen:2, manaRegen:4, lifesteal:8, mlifesteal:0 },
    skills:['stifling','blur','phantomStrike'],
    bio:'出手即致命的幻影刺客，窒息之刃起手收割，幻影突袭让她瞬间攻速暴涨。' },

  { id:'necro', name:'死灵法师', tier:60, pos:'back', emoji:'☠️',
    base:{ hp:160, maxMana:100, atk:11, atkSpd:0.95, ap:32, armor:3, dodge:4, crit:8, critMult:150,
           hpRegen:3, manaRegen:5, lifesteal:0, mlifesteal:12 },
    skills:['corrosionAura','deathPulse','lifeReap'],
    bio:'操纵死亡脉冲与腐蚀之力的黑暗法师，敌人会在腐蚀中慢慢死去。' },

  { id:'sf', name:'影魔', tier:60, pos:'back', emoji:'👻',
    base:{ hp:150, maxMana:100, atk:12, atkSpd:1.0, ap:36, armor:2, dodge:5, crit:10, critMult:155,
           hpRegen:2, manaRegen:5, lifesteal:0, mlifesteal:15 },
    skills:['shadowraze','soulPresence','requiem'],
    bio:'吞噬灵魂的黑暗魔王，影压点杀起手，魂之挽歌收割全场。' },

  { id:'bs', name:'血魔', tier:40, pos:'mid', emoji:'🩸',
    base:{ hp:190, maxMana:100, atk:20, atkSpd:1.1, ap:6, armor:4, dodge:8, crit:12, critMult:155,
           hpRegen:3, manaRegen:4, lifesteal:12, mlifesteal:0 },
    skills:['bloodRage','bloodRite','rupture'],
    bio:'越受伤越狂暴的嗜血猎手，割裂让残血的敌人无处可逃。' },

  { id:'drow', name:'卓尔游侠', tier:40, pos:'back', emoji:'🏹',
    base:{ hp:165, maxMana:100, atk:19, atkSpd:1.1, ap:8, armor:3, dodge:9, crit:18, critMult:160,
           hpRegen:2, manaRegen:4, lifesteal:5, mlifesteal:0 },
    skills:['frostArrow','marksmanship','multishot'],
    bio:'冰冷精准的游侠，霜冻之箭起手减速，让最虚弱的猎物无处遁逃。' },

  { id:'qop', name:'痛苦女王', tier:60, pos:'mid', emoji:'💜',
    base:{ hp:170, maxMana:100, atk:16, atkSpd:1.05, ap:30, armor:3, dodge:10, crit:12, critMult:155,
           hpRegen:2, manaRegen:5, lifesteal:12, mlifesteal:6 },
    skills:['darkPatronage','shadowStrike','screamOfPain'],
    bio:'以他人痛苦为食的女王，尖叫与暗影匕首都致命。' },

  { id:'zeus', name:'宙斯', tier:60, pos:'back', emoji:'⚡',
    base:{ hp:145, maxMana:100, atk:10, atkSpd:0.95, ap:38, armor:2, dodge:4, crit:8, critMult:150,
           hpRegen:2, manaRegen:6, lifesteal:0, mlifesteal:8 },
    skills:['arcLightning','staticField','thundergod'],
    bio:'执掌雷霆的众神之王，弧形闪电连环出手，每一次施法都引来静电轰击。' },

  { id:'jugg', name:'剑圣', tier:40, pos:'mid', emoji:'⚔️',
    base:{ hp:185, maxMana:100, atk:21, atkSpd:1.2, ap:6, armor:4, dodge:8, crit:15, critMult:170,
           hpRegen:3, manaRegen:4, lifesteal:8, mlifesteal:0 },
    skills:['bladeDance','bladeFury','healingWard'],
    bio:'剑舞无双的流浪剑客，剑刃风暴席卷一切，治疗守卫守护队友。' },

  { id:'axe', name:'斧王', tier:20, pos:'front', emoji:'🪓',
    base:{ hp:240, maxMana:100, atk:17, atkSpd:1.0, ap:3, armor:7, dodge:4, crit:8, critMult:150,
           hpRegen:4, manaRegen:4, lifesteal:6, mlifesteal:0 },
    skills:['counterHelix','berserkerCall','cullingBlade'],
    bio:'越挨打越疯狂的狂战士，残血敌人在他斧下难逃一斩。' },

  { id:'kunkka', name:'船长', tier:60, pos:'front', emoji:'⛵',
    base:{ hp:230, maxMana:100, atk:19, atkSpd:1.0, ap:8, armor:6, dodge:5, crit:10, critMult:155,
           hpRegen:3, manaRegen:4, lifesteal:5, mlifesteal:0 },
    skills:['torrent','tidebringer','ghostShip'],
    bio:'潮汐之力附体的海军统帅，洪流先手眩晕，幽灵船掌控整个战场。' },

  { id:'abaddon', name:'地狱领主', tier:60, pos:'front', emoji:'🛡️',
    base:{ hp:255, maxMana:100, atk:15, atkSpd:0.95, ap:12, armor:8, dodge:4, crit:8, critMult:150,
           hpRegen:5, manaRegen:5, lifesteal:5, mlifesteal:8 },
    skills:['borrowedTime','mistCoil','borrowedTimeActive'],
    bio:'迷雾缠绕的不朽领主，濒死时回光返照，一次战斗可逆转生死。' },

  { id:'dk', name:'龙骑士', tier:20, pos:'front', emoji:'🐉',
    base:{ hp:235, maxMana:100, atk:16, atkSpd:1.0, ap:6, armor:7, dodge:4, crit:8, critMult:150,
           hpRegen:4, manaRegen:4, lifesteal:5, mlifesteal:0 },
    skills:['dragonTail','dragonBlood','breatheFire'],
    bio:'龙血淬体的前排控制坦：神龙摆尾先手震慑废掉强敌攻击，龙息吐息剥掉整队护甲。' },
];

/* 商店英雄档位池 */
const HERO_TIERS = { 20:'普通', 40:'稀有', 60:'史诗' };

/* ================= 装备：5 档 × 12 件 = 60 件（小数值重写） =================
 * tier 1~5 价格 10 / 20 / 30 / 40 / 50；档位解锁：按关卡 ceil(关卡/3)
 * 英雄 6 个装备格子；同 id 技能唯一。 */
const EQUIPS = [
  /* ---------- 1 档（10 金） ---------- */
  { id:'eq_t1_1', tier:1, name:'铁树枝干', price:10, icon:'🌿',
    stats:{ hp:16, hpRegen:1 }, desc:'生命值 +16，生命恢复 +1。',
    skill:{ id:'eqsk_t1_1', name:'根须愈合', type:'passive', behavior:'healLowestPerSec',
      stat:'hp', mult:0.01,
      desc:'每秒为生命比例最低的友军恢复自身最大生命 1% 的生命值。' } },
  { id:'eq_t1_2', tier:1, name:'力量手套', price:10, icon:'🧤',
    stats:{ hp:24 }, desc:'生命值 +24。',
    skill:{ id:'eqsk_t1_2', name:'横扫重拳', type:'passive', behavior:'cleave', mult:0.3,
      desc:'普攻命中后，向敌方其他单位溅射 30% 的伤害。' } },
  { id:'eq_t1_3', tier:1, name:'敏捷便鞋', price:10, icon:'👟',
    stats:{ atkSpd:0.12 }, desc:'攻击速度 +0.12。',
    skill:{ id:'eqsk_t1_3', name:'连环刺击', type:'passive', behavior:'attackDot',
      dot:{ name:'撕裂', stat:'atk', mult:0.2, dur:2, color:'#ff7d7d' },
      desc:'普攻附带流血：目标每秒受到 攻击×20% 的伤害，持续 2 秒。' } },
  { id:'eq_t1_4', tier:1, name:'智慧斗篷', price:10, icon:'🧣',
    stats:{ ap:4, manaRegen:2 }, desc:'法强 +4，魔法恢复 +2。',
    skill:{ id:'eqsk_t1_4', name:'奥术灼烧', type:'passive', behavior:'skillDot',
      dot:{ name:'奥术灼烧', stat:'ap', mult:0.15, dur:2, color:'#c99bff' },
      desc:'技能命中引燃奥术之火：目标每秒受到 法强×15% 的伤害，持续 2 秒。' } },
  { id:'eq_t1_5', tier:1, name:'攻击之爪', price:10, icon:'🐾',
    stats:{ atk:4 }, desc:'攻击 +4。',
    skill:{ id:'eqsk_t1_5', name:'裂伤攻击', type:'passive', behavior:'attackStun',
      chance:0.1, dur:0.5,
      desc:'普攻有 10% 几率撕裂目标，使其眩晕 0.5 秒。' } },
  { id:'eq_t1_6', tier:1, name:'守卫盾牌', price:10, icon:'🛡️',
    stats:{ armor:2 }, desc:'护甲 +2（每次受击减免 2 点）。',
    skill:{ id:'eqsk_t1_6', name:'格挡护盾', type:'passive', behavior:'shieldOnHit',
      pct:0.05, internalCd:1,
      desc:'受到伤害后，获得相当于该次伤害 5% 的护盾（内置冷却 1 秒）。' } },
  { id:'eq_t1_7', tier:1, name:'疾行之靴', price:10, icon:'👢',
    stats:{ dodge:4 }, desc:'闪避 +4%。',
    skill:{ id:'eqsk_t1_7', name:'灵巧身形', type:'passive', behavior:'takenReduce', pct:0.03,
      desc:'受到的所有伤害降低 3%。' } },
  { id:'eq_t1_8', tier:1, name:'治疗指环', price:10, icon:'💍',
    stats:{ hpRegen:2 }, desc:'生命恢复 +2。',
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

  /* ---------- 2 档（20 金） ---------- */
  { id:'eq_t2_1', tier:2, name:'速度之靴', price:20, icon:'👞',
    stats:{ dodge:6, atkSpd:0.1 }, desc:'闪避 +6%，攻击速度 +0.10。',
    skill:{ id:'eqsk_t2_1', name:'绊摔', type:'passive', behavior:'attackStun',
      chance:0.12, dur:0.6,
      desc:'普攻有 12% 几率绊摔目标，使其眩晕 0.6 秒。' } },
  { id:'eq_t2_2', tier:2, name:'圆盾', price:20, icon:'🛡️',
    stats:{ armor:3, hp:30 }, desc:'护甲 +3，生命值 +30。',
    skill:{ id:'eqsk_t2_2', name:'铁壁', type:'passive', behavior:'takenReduce', pct:0.05,
      desc:'受到的所有伤害降低 5%。' } },
  { id:'eq_t2_3', tier:2, name:'魔棒', price:20, icon:'✨',
    stats:{ manaRegen:4, hpRegen:1 }, desc:'魔法恢复 +4，生命恢复 +1。',
    skill:{ id:'eqsk_t2_3', name:'能量迸发', type:'passive', behavior:'allyHealOnHit',
      chance:0.25, stat:'hp', mult:0.05,
      desc:'受到伤害时，有 25% 几率为生命比例最低的友军恢复自身最大生命 5% 的生命值。' } },
  { id:'eq_t2_4', tier:2, name:'铁板盔甲', price:20, icon:'⛓️',
    stats:{ armor:4 }, desc:'护甲 +4。',
    skill:{ id:'eqsk_t2_4', name:'反震护体', type:'passive', behavior:'shieldOnHit',
      pct:0.08, internalCd:1,
      desc:'受到伤害后，获得相当于该次伤害 8% 的护盾（内置冷却 1 秒）。' } },
  { id:'eq_t2_5', tier:2, name:'秘银锤', price:20, icon:'🔨',
    stats:{ atk:6 }, desc:'攻击 +6。',
    skill:{ id:'eqsk_t2_5', name:'旋风锤击', type:'passive', behavior:'counterHelix',
      chance:0.2, mult:0.4,
      desc:'受到伤害后，有 20% 几率旋身反击，对敌方全体各造成 攻击×40% 的伤害。' } },
  { id:'eq_t2_6', tier:2, name:'狂战士面具', price:20, icon:'😷',
    stats:{ atkSpd:0.15, crit:5 }, desc:'攻击速度 +0.15，暴击率 +5%。',
    skill:{ id:'eqsk_t2_6', name:'血怒', type:'passive', behavior:'bloodRage',
      desc:'每损失 10% 最大生命值，攻击 +4%（最多 +40%）。' } },
  { id:'eq_t2_7', tier:2, name:'流浪指环', price:20, icon:'💠',
    stats:{ hp:40, hpRegen:2 }, desc:'生命值 +40，生命恢复 +2。',
    skill:{ id:'eqsk_t2_7', name:'生命之环', type:'passive', behavior:'healLowestPerSec',
      stat:'hp', mult:0.015,
      desc:'每秒为生命比例最低的友军恢复自身最大生命 1.5% 的生命值。' } },
  { id:'eq_t2_8', tier:2, name:'风灵之杖', price:20, icon:'🪄',
    stats:{ ap:6, manaRegen:3 }, desc:'法强 +6，魔法恢复 +3。',
    skill:{ id:'eqsk_t2_8', name:'风蚀', type:'passive', behavior:'skillDot',
      dot:{ name:'风蚀', stat:'ap', mult:0.2, dur:2, color:'#8fffe0' },
      desc:'技能命中附加风蚀：目标每秒受到 法强×20% 的伤害，持续 2 秒。' } },
  { id:'eq_t2_9', tier:2, name:'吸血虹吸', price:20, icon:'🩸',
    stats:{ lifesteal:10, mlifesteal:6 }, desc:'物理吸血 +10%，魔法吸血 +6%。',
    skill:{ id:'eqsk_t2_9', name:'鲜血契约', type:'passive', behavior:'allyHealOnHit',
      chance:0.25, stat:'hp', mult:0.04,
      desc:'受到伤害时，有 25% 几率为生命比例最低的友军恢复自身最大生命 4% 的生命值。' } },
  { id:'eq_t2_10', tier:2, name:'精灵长弓', price:20, icon:'🏹',
    stats:{ atk:5, crit:6 }, desc:'攻击 +5，暴击率 +6%。',
    skill:{ id:'eqsk_t2_10', name:'射手光环', type:'passive', behavior:'auraStat',
      pct:{ atk:0.06 },
      desc:'光环：全体友军 攻击 +6%。' } },

  /* ---------- 3 档（30 金） ---------- */
  { id:'eq_t3_1', tier:3, name:'相位鞋', price:30, icon:'👟',
    stats:{ dodge:8, atkSpd:0.18, atk:3 }, desc:'闪避 +8%，攻击速度 +0.18，攻击 +3。',
    skill:{ id:'eqsk_t3_1', name:'相位猛击', type:'passive', behavior:'cleave', mult:0.45,
      desc:'普攻命中后，向敌方其他单位溅射 45% 的伤害。' } },
  { id:'eq_t3_2', tier:3, name:'阿托斯之棍', price:30, icon:'🪄',
    stats:{ ap:10, manaRegen:5 }, desc:'法强 +10，魔法恢复 +5。',
    skill:{ id:'eqsk_t3_2', name:'禁锢射线', type:'active', cost:55, cd:10,
      icon:'🌀', color:'#9fd0ff', fx:'burst', targeting:'enemyLowestHp',
      effect:{ damage:{ type:'magic', stat:'ap', mult:1.6 }, stun:1.5 },
      desc:'向敌方现有生命值最低的单位射出禁锢射线，造成 法强×1.6 的魔法伤害并眩晕 1.5 秒。消耗 55 魔法值，蓝满即放。' } },
  { id:'eq_t3_3', tier:3, name:'洛萨之锋', price:30, icon:'🗡️',
    stats:{ atk:9, crit:8, critMult:15 }, desc:'攻击 +9，暴击率 +8%，暴击倍数 +15%。',
    skill:{ id:'eqsk_t3_3', name:'破隐身痕', type:'passive', behavior:'attackDot',
      dot:{ name:'破隐身痕', stat:'atk', mult:0.35, dur:3, color:'#b06bff' },
      desc:'普攻撕开伤口：目标每秒受到 攻击×35% 的伤害，持续 3 秒。' } },
  { id:'eq_t3_4', tier:3, name:'挑战头巾', price:30, icon:'🧢',
    stats:{ hp:70, armor:3, hpRegen:3 }, desc:'生命值 +70，护甲 +3，生命恢复 +3。',
    skill:{ id:'eqsk_t3_4', name:'魔法屏障', type:'passive', behavior:'takenReduce', pct:0.05,
      desc:'受到的所有伤害降低 5%。' } },
  { id:'eq_t3_5', tier:3, name:'振魂石', price:30, icon:'💎',
    stats:{ hp:80, manaRegen:6 }, desc:'生命值 +80，魔法恢复 +6。',
    skill:{ id:'eqsk_t3_5', name:'灵魂复苏', type:'passive', behavior:'healLowestPerSec',
      stat:'hp', mult:0.02,
      desc:'每秒为生命比例最低的友军恢复自身最大生命 2% 的生命值。' } },
  { id:'eq_t3_6', tier:3, name:'散失之刃', price:30, icon:'⚔️',
    stats:{ atk:7, atkSpd:0.2, dodge:5 }, desc:'攻击 +7，攻击速度 +0.20，闪避 +5%。',
    skill:{ id:'eqsk_t3_6', name:'净化冻结', type:'passive', behavior:'attackStun',
      chance:0.15, dur:0.7,
      desc:'普攻有 15% 几率将目标冻结在原地 0.7 秒。' } },
  { id:'eq_t3_7', tier:3, name:'狂战斧', price:30, icon:'🪓',
    stats:{ atk:10, crit:8 }, desc:'攻击 +10，暴击率 +8%。',
    skill:{ id:'eqsk_t3_7', name:'狂战横扫', type:'passive', behavior:'cleave', mult:0.65,
      desc:'普攻命中后，向敌方其他单位溅射 65% 的伤害。' } },
  { id:'eq_t3_8', tier:3, name:'死亡面具', price:30, icon:'💀',
    stats:{ crit:12, critMult:25, lifesteal:8 }, desc:'暴击率 +12%，暴击倍数 +25%，物理吸血 +8%。',
    skill:{ id:'eqsk_t3_8', name:'死神凝视', type:'passive', behavior:'attackStun',
      chance:0.18, dur:0.8,
      desc:'普攻有 18% 几率以死神之威慑晕目标 0.8 秒。' } },
  { id:'eq_t3_9', tier:3, name:'魂之灵钟', price:30, icon:'🔔',
    stats:{ armor:5, hp:50 }, desc:'护甲 +5，生命值 +50。',
    skill:{ id:'eqsk_t3_9', name:'灵魂庇护', type:'passive', behavior:'shieldOnHit',
      pct:0.1, internalCd:1.5,
      desc:'受到伤害后，获得相当于该次伤害 10% 的护盾（内置冷却 1.5 秒）。' } },
  { id:'eq_t3_10', tier:3, name:'巫师之冠', price:30, icon:'👑',
    stats:{ ap:8, mlifesteal:8 }, desc:'法强 +8，魔法吸血 +8%。',
    skill:{ id:'eqsk_t3_10', name:'奥术腐蚀', type:'passive', behavior:'corrosion', pct:0.015,
      desc:'敌方全体每秒损失 1.5% 最大生命值的生命（无视护甲的真实伤害）。' } },

  /* ---------- 4 档（40 金） ---------- */
  { id:'eq_t4_1', tier:4, name:'黑皇杖', price:40, icon:'🦯',
    stats:{ atk:10, ap:10, hp:60 }, desc:'攻击 +10，法强 +10，生命值 +60。',
    skill:{ id:'eqsk_t4_1', name:'天神下凡', type:'passive', behavior:'takenReduce', pct:0.08,
      desc:'受到的所有伤害降低 8%。' } },
  { id:'eq_t4_2', tier:4, name:'散夜对剑', price:40, icon:'⚔️',
    stats:{ atk:12, atkSpd:0.25, dodge:8 }, desc:'攻击 +12，攻击速度 +0.25，闪避 +8%。',
    skill:{ id:'eqsk_t4_2', name:'双重斩击', type:'passive', behavior:'attackDot',
      dot:{ name:'双斩', stat:'atk', mult:0.4, dur:3, color:'#ffd35c' },
      desc:'普攻造成双重撕裂：目标每秒受到 攻击×40% 的伤害，持续 3 秒。' } },
  { id:'eq_t4_3', tier:4, name:'强袭胸甲', price:40, icon:'🏰',
    stats:{ armor:6, hp:80, atkSpd:0.1 }, desc:'护甲 +6，生命值 +80，攻击速度 +0.10。',
    skill:{ id:'eqsk_t4_3', name:'强袭光环', type:'passive', behavior:'auraStat',
      pct:{ armor:0.12 },
      desc:'光环：全体友军 护甲 +12%。' } },
  { id:'eq_t4_4', tier:4, name:'林肯法球', price:40, icon:'🔮',
    stats:{ ap:13, manaRegen:8, hp:60 }, desc:'法强 +13，魔法恢复 +8，生命值 +60。',
    skill:{ id:'eqsk_t4_4', name:'法术抵挡', type:'passive', behavior:'shieldOnHit',
      pct:0.12, internalCd:2,
      desc:'受到伤害后，获得相当于该次伤害 12% 的护盾（内置冷却 2 秒）。' } },
  { id:'eq_t4_5', tier:4, name:'蝴蝶', price:40, icon:'🦋',
    stats:{ atkSpd:0.3, dodge:14, crit:10 }, desc:'攻击速度 +0.30，闪避 +14%，暴击率 +10%。',
    skill:{ id:'eqsk_t4_5', name:'振翅反击', type:'passive', behavior:'counterHelix',
      chance:0.25, mult:0.5,
      desc:'受到伤害后，有 25% 几率振翅反击，对敌方全体各造成 攻击×50% 的伤害。' } },
  { id:'eq_t4_6', tier:4, name:'碎骨锤', price:40, icon:'🔨',
    stats:{ atk:13, crit:10, critMult:25 }, desc:'攻击 +13，暴击率 +10%，暴击倍数 +25%。',
    skill:{ id:'eqsk_t4_6', name:'碎骨一击', type:'passive', behavior:'attackStun',
      chance:0.2, dur:1,
      desc:'普攻有 20% 几率碎裂目标骨骼，使其眩晕 1 秒。' } },
  { id:'eq_t4_7', tier:4, name:'阿哈利姆神杖', price:40, icon:'🎩',
    stats:{ ap:17, manaRegen:6 }, desc:'法强 +17，魔法恢复 +6。',
    skill:{ id:'eqsk_t4_7', name:'神杖轰击', type:'active', cost:70, cd:12,
      icon:'🎩', color:'#c99bff', fx:'ring', targeting:'allEnemies',
      effect:{ damage:{ type:'magic', stat:'ap', mult:1.8 }, silence:1 },
      desc:'神杖之力轰击敌方全体，各造成 法强×1.8 的魔法伤害并沉默 1 秒。消耗 70 魔法值，蓝满即放。' } },
  { id:'eq_t4_8', tier:4, name:'血棘', price:40, icon:'🌹',
    stats:{ atk:12, crit:12, mlifesteal:10 }, desc:'攻击 +12，暴击率 +12%，魔法吸血 +10%。',
    skill:{ id:'eqsk_t4_8', name:'血棘穿刺', type:'passive', behavior:'attackDot',
      dot:{ name:'血棘', stat:'atk', mult:0.5, dur:3, color:'#ff4d6d' },
      desc:'普攻钉入血棘：目标每秒受到 攻击×50% 的伤害，持续 3 秒。' } },
  { id:'eq_t4_9', tier:4, name:'深海重锤', price:40, icon:'🌊',
    stats:{ atk:13, armor:3, hp:50 }, desc:'攻击 +13，护甲 +3，生命值 +50。',
    skill:{ id:'eqsk_t4_9', name:'潮汐重压', type:'passive', behavior:'cleave', mult:0.55,
      desc:'普攻命中后，向敌方其他单位溅射 55% 的伤害。' } },
  { id:'eq_t4_10', tier:4, name:'守护天使', price:40, icon:'🪽',
    stats:{ armor:5, hp:70, hpRegen:3 }, desc:'护甲 +5，生命值 +70，生命恢复 +3。',
    skill:{ id:'eqsk_t4_10', name:'天使之翼', type:'active', cost:65, cd:12,
      icon:'🪽', color:'#fff2c9', fx:'ring', targeting:'allAllies',
      effect:{ heal:{ pctMaxHp:0.15 }, shield:{ pctMaxHp:0.1 } },
      desc:'守护天使降临：全体友军立即恢复 最大生命值×15% 的生命，并获得 最大生命值×10% 的护盾。消耗 65 魔法值，蓝满即放。' } },

  /* ---------- 5 档（50 金） ---------- */
  { id:'eq_t5_1', tier:5, name:'圣剑', price:50, icon:'⚔️',
    stats:{ atk:26, crit:15, critMult:40 }, desc:'攻击 +26，暴击率 +15%，暴击倍数 +40%。',
    skill:{ id:'eqsk_t5_1', name:'圣剑之魂', type:'passive', behavior:'bloodRage',
      desc:'每损失 10% 最大生命值，攻击 +4%（最多 +40%）。' } },
  { id:'eq_t5_2', tier:5, name:'代达罗斯之殇', price:50, icon:'💀',
    stats:{ atk:20, crit:20, critMult:50 }, desc:'攻击 +20，暴击率 +20%，暴击倍数 +50%。',
    skill:{ id:'eqsk_t5_2', name:'致命一击', type:'passive', behavior:'statBuff',
      stats:{ crit:10, critMult:30 },
      desc:'暴击率 +10%，暴击倍数 +30%。' } },
  { id:'eq_t5_3', tier:5, name:'龙之心', price:50, icon:'❤️',
    stats:{ hp:200, hpRegen:10 }, desc:'生命值 +200，生命恢复 +10。',
    skill:{ id:'eqsk_t5_3', name:'龙血再生', type:'passive', behavior:'healLowestPerSec',
      stat:'hp', mult:0.03,
      desc:'每秒为生命比例最低的友军恢复自身最大生命 3% 的生命值。' } },
  { id:'eq_t5_4', tier:5, name:'银月之晶', price:50, icon:'🌙',
    stats:{ atk:18, atkSpd:0.35 }, desc:'攻击 +18，攻击速度 +0.35。',
    skill:{ id:'eqsk_t5_4', name:'月华光环', type:'passive', behavior:'auraStat',
      pct:{ atkSpd:0.15 },
      desc:'光环：全体友军 攻击速度 +15%。' } },
  { id:'eq_t5_5', tier:5, name:'深渊之刃', price:50, icon:'🪓',
    stats:{ atk:23, armor:4 }, desc:'攻击 +23，护甲 +4。',
    skill:{ id:'eqsk_t5_5', name:'深渊重击', type:'passive', behavior:'attackStun',
      chance:0.25, dur:1.2,
      desc:'普攻有 25% 几率将目标拖入深渊，使其眩晕 1.2 秒。' } },
  { id:'eq_t5_6', tier:5, name:'虚灵之刃', price:50, icon:'👻',
    stats:{ ap:26, mlifesteal:15 }, desc:'法强 +26，魔法吸血 +15%。',
    skill:{ id:'eqsk_t5_6', name:'虚灵形态', type:'active', cost:60, cd:12,
      icon:'👻', color:'#8fffe0', fx:'ring', targeting:'self',
      effect:{ buff:{ stat:'ap', mult:0.6, dur:5, name:'虚灵形态' } },
      desc:'化身虚灵：自己的法强 +60%，持续 5 秒。消耗 60 魔法值，蓝满即放。' } },
  { id:'eq_t5_7', tier:5, name:'灭世魔铠', price:50, icon:'🏯',
    stats:{ armor:8, hp:120 }, desc:'护甲 +8，生命值 +120。',
    skill:{ id:'eqsk_t5_7', name:'灭世壁垒', type:'passive', behavior:'takenReduce', pct:0.1,
      desc:'受到的所有伤害降低 10%。' } },
  { id:'eq_t5_8', tier:5, name:'灵魂收割者', price:50, icon:'☠️',
    stats:{ lifesteal:20, mlifesteal:15, ap:17 }, desc:'物理吸血 +20%，魔法吸血 +15%，法强 +17。',
    skill:{ id:'eqsk_t5_8', name:'收割之触', type:'passive', behavior:'corrosion', pct:0.02,
      desc:'敌方全体每秒损失 2% 最大生命值的生命（无视护甲的真实伤害）。' } },
  { id:'eq_t5_9', tier:5, name:'水晶剑', price:50, icon:'🗡️',
    stats:{ atk:17, crit:18 }, desc:'攻击 +17，暴击率 +18%。',
    skill:{ id:'eqsk_t5_9', name:'寒晶碎裂', type:'passive', behavior:'attackDot',
      dot:{ name:'寒晶', stat:'atk', mult:0.5, dur:3, color:'#8fd8ff' },
      desc:'普攻碎裂寒晶：目标每秒受到 攻击×50% 的伤害，持续 3 秒。' } },
  { id:'eq_t5_10', tier:5, name:'诸神黄昏', price:50, icon:'🌋',
    stats:{ atk:17, ap:17, hp:100 }, desc:'攻击 +17，法强 +17，生命值 +100。',
    skill:{ id:'eqsk_t5_10', name:'诸神黄昏', type:'active', cost:90, cd:15,
      icon:'🌋', color:'#ff6b4d', fx:'burst', targeting:'allEnemies',
      effect:{ damage:{ type:'magic', stat:'ap', mult:2.0 },
               dot:{ name:'末日', stat:'ap', mult:0.3, dur:3, color:'#ff6b4d' } },
      desc:'末日烈焰焚烧敌方全体，各造成 法强×2.0 的魔法伤害，并使其每秒受到 法强×30% 的伤害，持续 3 秒。消耗 90 魔法值，蓝满即放。' } },

  /* ---------- 纯属性装备（每档 2 件） ---------- */
  { id:'eq_p1_1', tier:1, pure:true, name:'巨人力量带', price:10, icon:'🧱',
    stats:{ hp:36 }, desc:'纯属性装备：生命值 +36，不带任何技能。' },
  { id:'eq_p1_2', tier:1, pure:true, name:'精准护腕', price:10, icon:'🎯',
    stats:{ atk:5 }, desc:'纯属性装备：攻击 +5，不带任何技能。' },
  { id:'eq_p2_1', tier:2, pure:true, name:'守护者板甲', price:20, icon:'🔰',
    stats:{ armor:5 }, desc:'纯属性装备：护甲 +5，不带任何技能。' },
  { id:'eq_p2_2', tier:2, pure:true, name:'秘法头环', price:20, icon:'💍',
    stats:{ ap:10, manaRegen:5 }, desc:'纯属性装备：法强 +10，魔法恢复 +5，不带任何技能。' },
  { id:'eq_p3_1', tier:3, pure:true, name:'战争徽记', price:30, icon:'📯',
    stats:{ atk:13, crit:8 }, desc:'纯属性装备：攻击 +13，暴击率 +8%，不带任何技能。' },
  { id:'eq_p3_2', tier:3, pure:true, name:'不朽之证', price:30, icon:'🧿',
    stats:{ hp:100, hpRegen:4 }, desc:'纯属性装备：生命值 +100，生命恢复 +4，不带任何技能。' },
  { id:'eq_p4_1', tier:4, pure:true, name:'灭世肩铠', price:40, icon:'🛡️',
    stats:{ armor:7, hp:100 }, desc:'纯属性装备：护甲 +7，生命值 +100，不带任何技能。' },
  { id:'eq_p4_2', tier:4, pure:true, name:'星辰坠饰', price:40, icon:'🌟',
    stats:{ ap:22, manaRegen:12, mlifesteal:8 }, desc:'纯属性装备：法强 +22，魔法恢复 +12，魔法吸血 +8%，不带任何技能。' },
  { id:'eq_p5_1', tier:5, pure:true, name:'传说之刃', price:50, icon:'🗡️',
    stats:{ atk:32, atkSpd:0.4, crit:12 }, desc:'纯属性装备：攻击 +32，攻击速度 +0.40，暴击率 +12%，不带任何技能。' },
  { id:'eq_p5_2', tier:5, pure:true, name:'永恒壁垒', price:50, icon:'🏰',
    stats:{ armor:10, hp:180, dodge:8 }, desc:'纯属性装备：护甲 +10，生命值 +180，闪避 +8%，不带任何技能。' },
];

/* ================= 敌人数值（小数值重写） =================
 * 每关成长：生命 ×(1+0.28×(关卡-1))，攻击 ×(1+0.16×(关卡-1))，护甲 ×(1+0.08×(关卡-1))
 * 难度系数（DIFFICULTIES.enemyMul）在生成时统一相乘。 */
const ENEMY_BASE = {
  hp:100, maxMana:100, atk:14, atkSpd:1.0, ap:6, armor:2, dodge:2, crit:5, critMult:150,
  hpRegen:1, manaRegen:4, lifesteal:0, mlifesteal:0
};

const ENEMY_SCALING = { hp:0.28, atk:0.16, armor:0.08 };

const ENEMY_TYPES = {
  minion:   { name:'小兵',     gold:5,  emoji:'👺', mult:{ hp:1,   atk:1,   armor:1   },
              skills:[],                                pos:['front','mid','back'] },
  elite:    { name:'精英',     gold:10, emoji:'😈', mult:{ hp:1.9, atk:1.5, armor:1.5 },
              skills:['elitePower'],                    pos:['front','mid','back'] },
  miniBoss: { name:'小Boss',   gold:15, emoji:'👹', mult:{ hp:1,   atk:1,   armor:1   },
              skills:[],                                pos:['front'] },
  bigBoss:  { name:'大Boss',   gold:40, emoji:'👿', mult:{ hp:1,   atk:1,   armor:1   },
              skills:[],                                pos:['front'] },
};

/* ================= 15 关结构 =================
 * 每关固定 1 个小 Boss（MINI_BOSSES[关卡]），第 5/10/15 关额外出现大 Boss。
 * 每个小 Boss 都有独一无二的特色机制（关键词/行为）。 */
const MAX_LEVEL = 15;

function isBossLevel(level){ return true; }          // 每关都有小 Boss
function isBigBossLevel(level){ return level % 5 === 0; }  // 每 5 关一个大 Boss

/* 小 Boss 图鉴：mods 为对“关卡成长后基础值”的倍率；skills 附加被动/主动技能；
 * spikes / rage / quick / stats / multistrike 为直接写入单位的特色字段。 */
const MINI_BOSSES = {
  1: { name:'荆棘幼龙', emoji:'🐲', trait:'尖刺 8：受击时反弹 8 点伤害。',
       mods:{ hp:2.6, atk:1.2, armor:1.2 }, spikes:8 },
  2: { name:'狂怒斗士', emoji:'😡', trait:'战斗开始拥有 5 层狂怒，攻击越打越疼（狂怒每 4 秒衰减 1 层）。',
       mods:{ hp:2.4, atk:1.5, armor:1.0 }, rage:5 },
  3: { name:'铁甲卫士', emoji:'🛡️', trait:'高额护甲 14：每次受击额外减免 14 点伤害。',
       mods:{ hp:3.0, atk:1.0, armor:1.0 }, stats:{ armor:12 } },
  4: { name:'吞噬兽', emoji:'🦈', trait:'物理吸血 60%：攻击回复造成伤害 60% 的生命。',
       mods:{ hp:2.6, atk:1.4, armor:1.1 }, stats:{ lifesteal:60 } },
  5: { name:'剧毒史莱姆', emoji:'☠️', trait:'瘟疫蔓延：我方全体每秒损失 2% 最大生命。',
       mods:{ hp:2.4, atk:1.1, armor:1.0 }, skills:['plagueSpray'] },
  6: { name:'影舞者', emoji:'🥷', trait:'闪避 40% 且迅捷：开局立刻出手。',
       mods:{ hp:2.0, atk:1.6, armor:1.0 }, stats:{ dodge:40 }, quick:true },
  7: { name:'石肤巨人', emoji:'🗿', trait:'坚不可摧：受到的所有伤害降低 30%。',
       mods:{ hp:3.4, atk:1.1, armor:1.4 }, skills:['stoneSkin'] },
  8: { name:'复仇之魂', emoji:'👻', trait:'凋零绽放：死亡时爆炸，对我方全体造成 攻击×90% 真实伤害。',
       mods:{ hp:2.2, atk:1.3, armor:1.0 }, skills:['deathBloom'] },
  9: { name:'血肉傀儡', emoji:'🧟', trait:'越伤越狂：每损失 10% 生命，攻击 +6%。',
       mods:{ hp:3.0, atk:1.4, armor:1.2 }, skills:['fleshGrowth'] },
  10:{ name:'寒霜女巫', emoji:'🧙', trait:'霜噬：普攻 30% 几率冻结目标 0.8 秒。',
       mods:{ hp:2.2, atk:1.3, armor:1.1 }, skills:['frostTouch'] },
  11:{ name:'疾风刺客', emoji:'⚡', trait:'迅捷且攻速 1.8：开局立刻出手，刀刀连斩。',
       mods:{ hp:1.7, atk:1.7, armor:0.9 }, stats:{ atkSpd:0.8 }, quick:true },
  12:{ name:'嗜血伯爵', emoji:'🧛', trait:'物理吸血 40% + 尖刺 5：越战越勇。',
       mods:{ hp:2.6, atk:1.5, armor:1.1 }, stats:{ lifesteal:40 }, spikes:5 },
  13:{ name:'暗影祭司', emoji:'🌑', trait:'噬魔之刃：普攻额外燃烧我方 15 点魔法值。',
       mods:{ hp:2.4, atk:1.3, armor:1.0 }, skills:['manaBurnBlade'] },
  14:{ name:'狂暴狮王', emoji:'🦁', trait:'多重打击：每次攻击连击 2 次。',
       mods:{ hp:2.6, atk:1.4, armor:1.1 }, multistrike:1 },
  15:{ name:'腐化树妖', emoji:'🌳', trait:'腐化花粉：每秒为生命最低的友军恢复 2% 最大生命。',
       mods:{ hp:2.6, atk:1.4, armor:1.2 }, skills:['teamBloom'] },
};

/* 大 Boss（第 5 / 10 / 15 关），与小 Boss 同场出现，占前排中央 */
const BIG_BOSSES = {
  5: { name:'熔岩巨兽', emoji:'🌋', class:'eboss',
       trait:'尖刺 10；每 8 秒熔岩喷发，灼烧我方全体并附加灼烧。',
       mods:{ hp:6.5, atk:1.8, armor:1.8 }, spikes:10,
       skills:['magmaEruption','bossSweep'] },
  10:{ name:'深渊领主', emoji:'👿', class:'eboss',
       trait:'周期召唤深渊小卒；深渊之触眩晕，鲜血渴望吸血。',
       mods:{ hp:8, atk:2.0, armor:1.8 },
       skills:['summonAbyss','abyssTouch','bloodThirst'] },
  15:{ name:'森林主宰·古树之心', emoji:'👑', class:'boss',
       trait:'最终 Boss：古树之心——半血觉醒（+10 层狂怒、+12 尖刺），召唤树卫，震地横扫。',
       mods:{ hp:10, atk:2.3, armor:2.2 }, armorFlat:18,
       skills:['phaseTwo','summonGuard','bossSweep'] },
};

/* 召唤物模板：数值基于“关卡成长后的 ENEMY_BASE”倍率 */
const SUMMON_TEMPLATES = {
  abyss: { name:'深渊小卒', emoji:'🦑', mult:{ hp:0.9, atk:0.9, armor:1.0 }, gold:0, skills:[] },
  guard: { name:'树卫',     emoji:'🌿', mult:{ hp:2.0, atk:0.7, armor:2.0 }, gold:0, skills:['bossPassive'] },
};

/* 每关杂兵数量（不含 Boss） */
function rollEnemyCount(level){
  if(level <= 3) return 2;
  if(level <= 6) return 3;
  return 4;
}

/* 每关敌人构成：小 Boss 必有，5/10/15 关加大 Boss；挑战难度 +1 杂兵；总数上限 6 */
function rollEnemyTypes(level, difficulty){
  const list = [];
  if(isBigBossLevel(level)) list.push('bigBoss');
  list.push('miniBoss');
  const bossN = list.length;
  const add = Math.min(rollEnemyCount(level) + ((difficulty === 2) ? 1 : 0), 6 - bossN);
  let eliteN = level >= 9 ? 2 : level >= 4 ? 1 : 0;
  eliteN = Math.min(eliteN, add);
  for(let i = 0; i < eliteN; i++) list.push('elite');
  while(list.length < bossN + add) list.push('minion');
  return list;
}
