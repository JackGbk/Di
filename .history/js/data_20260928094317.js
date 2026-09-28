'use strict';

/* =====================================================================
 * 森林战纪 · 数据层（小数值重制版）
 * 设计要点：
 *  1. 全程 15 关；每关 1 个小 Boss（各有特色），第 5/10/15 关额外出现大 Boss。
 *  2. 数值全面回缩：英雄生命 96~180（≈伤害的 4 倍，单关战斗约 10 秒）、攻击 6~14；敌人基础生命 96、攻击 6；
 *     装备生命 +10~70、攻击 +2~13。一切从个位 / 十几 / 二十几起步。
 *  3. 借鉴《怪物火车》：护甲（每段伤害直接减免）、狂怒（层数叠攻击）、
 *     尖刺（受击反伤）、多重打击 / 横扫 / 迅捷 / 碾压（强化槽位改造）。
 *  4. 神器（ARTIFACTS）替代祝福；每关通关后三选一。
 *  5. 难度只有 2 级（DIFFICULTIES）：⚔️ 标准 / 🔥 挑战。
 *     挑战的额外通关奖励很简单：通关金币 +50%。
 *  6. 装备（EQUIPS）向 Dota2 看齐：一半纯属性过渡装、一半各带 1 个特色被动
 *     （格挡 / 溅射 / 晕眩 / 反伤 / 光环……），单件有性格；技能悬停查看。
 *  7. 养大哥路线：升星 + 装备 + 强化槽改造 + 神器，围绕 1~2 个核心英雄。
 *  8. 祝福（blessing.js）随机穿插进每关战后流程（按概率触发、每关最多一次）；
 *     奇遇（encounter.js）已停用，文件与代码保留但不再进入流程。
 * ===================================================================== */

/* ================= 基础配置 ================= */
const GRID_ROWS = 4;                 // 阵营纵向格子数（深度方向）
const GRID_COLS = 5;                 // 阵营横向格子数
const FORMATION_CAP = 12;            // 玩家阵容上限
const ATTACK_INTERVAL = 1.0;         // 即时制：普攻间隔 = 1.0 秒 ÷ 攻击速度
const MANA_ON_ATTACK = 2;            // 攻击时增加的魔法值（大幅减慢：原 5 → 2）
const MANA_ON_HIT = 2;               // 被攻击时增加的魔法值（大幅减慢：原 5 → 2）

const POS_NAMES = { front:'前排', mid:'中排', back:'后排' };
const POS_SHORT = { front:'前', mid:'中', back:'后' };

/* ================= 《怪物火车》关键词（小数值） =================
 * 护甲：每次受到伤害先减免等额数值（可为负 → 增伤），战斗中不衰减。
 * 狂怒：每层 +RAGE_ATK 点攻击，每 RAGE_DECAY_SEC 秒衰减 1 层（神器可阻止）。
 * 尖刺：每次被攻击反弹等额真实伤害（不可闪避、不计算暴击）。 */
const RAGE_ATK = 1;          // 每层狂怒提供的攻击力
const RAGE_MAX = 15;         // 狂怒层数上限
const RAGE_DECAY_SEC = 4;    // 每 N 秒衰减 1 层狂怒
const ARMOR_MIN = -30;       // 护甲下限（腐蚀可为负）

/* ================= 装备档位配色（1~5 档一眼区分） ================= */
const TIER_COLORS = { 1:'#9fb4d8', 2:'#5fd67a', 3:'#4d9bff', 4:'#c07bff', 5:'#ffb02e' };
const TIER_NAMES  = { 1:'普通', 2:'精良', 3:'稀有', 4:'史诗', 5:'传说' };

/* ================= 装备分类（选择框按坦克/物理/魔法套高辨识度外观） ================= */
const EQ_CATS = {
  tank : { name:'坦克', icon:'🛡️', color:'#ff9f43' },
  phys : { name:'物理', icon:'⚔️', color:'#ff5d5d' },
  magic: { name:'魔法', icon:'🔮', color:'#9b6bff' },
};

/* ================= 升星配置（最多 5 星） =================
 * 每升一星：基础属性 +35%，攻击速度 +7%；技能按星级解锁：1 星 1 个、3 星 2 个、5 星 3 个。
 * 升星一律花金币，且星级越高越贵（15/30/45/60），战后第②屏也不再免费。 */
const STAR_MAX = 5;
const STAR_COST = { 1:15, 2:30, 3:45, 4:60 };
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

/* ================= 难度选择（每关开战前，只有 2 级） =================
 * ⚔️ 标准：正常强度与奖励。
 * 🔥 挑战：敌人属性 +30%、数量 +1；额外通关奖励很简单——通关金币 +50%。
 * 注：战后流程固定为三屏（装备购买 / 升星 / 神器），再随机穿插祝福/奇遇，不发额外装备。 */
const DIFFICULTIES = [
  { id:0, name:'标准', icon:'⚔️', enemyMul:1.0, goldMul:1.0, lootN:3, countAdd:0,
    reward:'标准强度与奖励', extra:false,
    desc:'正常难度：敌人与奖励都是标准强度。' },
  { id:1, name:'挑战', icon:'🔥', enemyMul:1.3, goldMul:1.5, lootN:3, countAdd:1,
    reward:'通关金币 +50%', extra:true,
    desc:'敌人属性 +30%、数量 +1；通关金币 +50%。' },
];
function difficultyDef(id){ return DIFFICULTIES[id] || DIFFICULTIES[0]; }

/* ================= 神器（每关通关后三选一，可叠加） ================= */
const ARTIFACTS = [
  { id:'shackles',  name:'灼热枷锁',   icon:'🔥',
    desc:'战斗开始时，全体友军获得 3 层狂怒。' },
  { id:'steel',     name:'灼热锻钢',   icon:'🛡️',
    desc:'战斗开始时，全体友军获得 3 点护甲（每场战斗重置）。' },
  { id:'echo',      name:'回响碎片',   icon:'💠',
    desc:'狂怒每层额外 +1 攻击力。' },
  { id:'tail',      name:'尾巴收藏品', icon:'🦎',
    desc:'狂怒不再随时间衰减。' },
  { id:'crown',     name:'胜者桂冠',   icon:'👑',
    desc:'友军每次击杀敌人，攻击力永久 +2（本场战斗）。' },
  { id:'hammer',    name:'铁道锻锤',   icon:'🔨',
    desc:'友军每次释放技能，施法者获得 2 点护甲。' },
  { id:'shell',     name:'薪火石外壳', icon:'🥚',
    desc:'所有英雄的强化槽位 +1。' },
  { id:'barb',      name:'格鲁格的刺棍', icon:'🪄',
    desc:'星级最高的英雄获得【多重打击】：每次普攻额外攻击 1 次（每次 60% 伤害）。' },
  { id:'spikeBadge',name:'尖刺徽记',   icon:'🌵',
    desc:'全体友军获得 4 点尖刺。' },
  { id:'bloodGem',  name:'血色宝石',   icon:'🩸',
    desc:'友军击杀敌人时，回复 20% 最大生命。' },
  { id:'manaCrystal',name:'魔力水晶',  icon:'🔮',
    desc:'战斗开始时，所有技能蓝量全满。' },
  { id:'giantBelt', name:'巨人腰带',   icon:'🥋',
    desc:'全体友军最大生命 +20%。' },
  { id:'windFeather',name:'疾风之羽',  icon:'🪶',
    desc:'全体友军攻击速度 +15%。' },
  { id:'coagStone', name:'凝血石',     icon:'🪨',
    desc:'生命低于 50% 时，获得 5 点护甲（每场一次）。' },
  { id:'pierceCone',name:'破甲锥',     icon:'🎯',
    desc:'友军攻击无视目标 30% 的护甲。' },
  { id:'hunterMark',name:'猎手印记',   icon:'🧿',
    desc:'友军对精英与首领的伤害 +25%。' },
  { id:'vengeBadge',name:'复仇者徽章', icon:'⚔️',
    desc:'友军单位死亡时，其余全体友军获得 2 层狂怒。' },
  { id:'thornSeed', name:'荆棘之种',   icon:'🌿',
    desc:'全体友军尖刺 +3。' },
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
  { id:'fortify',     name:'坚甲',     icon:'🛡️', stats:{ armor:3 },
    desc:'护甲 +3（每次受击额外减免 3 点伤害）。' },
  { id:'wrath',       name:'狂怒之刃', icon:'🔥', startRage:4,
    desc:'战斗开始时获得 4 层狂怒（每层 +1 攻击）。' },
  { id:'spikeShell',  name:'荆棘之壳', icon:'🌵', stats:{ spikes:4 },
    desc:'尖刺 +4：被攻击时反弹 4 点伤害。' },
  { id:'vampiric',    name:'汲血',     icon:'🩸', stats:{ lifesteal:15 },
    desc:'物理吸血 +15%。' },
  { id:'tough',       name:'坚韧',     icon:'❤️', stats:{ hp:15 },
    desc:'最大生命 +15。' },
  { id:'heavy',       name:'强击',     icon:'🗡️', stats:{ atk:4 },
    desc:'攻击 +4。' },
  { id:'charge',      name:'蓄能',     icon:'💧', stats:{ manaRegen:2 },
    desc:'魔法恢复速度 +2（技能更频繁）。' },
  { id:'critSight',   name:'会心',     icon:'🎯', stats:{ crit:10, critMult:20 },
    desc:'暴击率 +10%，暴击倍数 +20%。' },
];
function upgradeById(id){ for(let i=0;i<UPGRADES.length;i++) if(UPGRADES[i].id===id) return UPGRADES[i]; return null; }

/* ================= 技能定义 =================
 * 被动技能由 behavior 字段驱动；主动技能由 targeting + effect 声明式驱动。
 * effect 支持：damage / missingHp / heal / shield / stun / silence / disarm /
 *              cleanse / dot / buff / summon
 * 蓝条上限 50：耗蓝一律 20~45 的小数值。
 * 冷却（CD）：主动技能释放后进入独立冷却，冷却中蓝条照常充能但无法再次释放；
 *             所有技能冷却一律 ≤ SKILL_CD_MAX 秒（保持短节奏）。
 */
const SKILL_CD_MAX = 5;   // 技能冷却上限（秒）：任何技能的 CD 都不超过它
const SKILLS = {
  /* ========== 幻影刺客：暴闪收割 ========== */
  blur: {
    id:'blur', name:'模糊', type:'passive', behavior:'statBuff',
    stats:{ dodge:18, crit:10 },
    desc:'【被动】身形如雾：闪避 +18%，暴击率 +10%。'
  },
  stifling: {
    id:'stifling', name:'窒息之刃', type:'active', cost:24, cd:2,
    icon:'🗡️', color:'#c99bff', fx:'burst', targeting:'enemyLowestHp',
    effect:{ damage:{ type:'physical', stat:'atk', mult:2.2 } },
    desc:'【主动】飞刀直取要害：对生命最低的敌人造成 攻击×2.2 物理伤害。耗蓝 24，蓝满且冷却就绪即放。'
  },
  phantomStrike: {
    id:'phantomStrike', name:'幻影突袭', type:'active', cost:26, cd:4,
    icon:'🌀', color:'#b06bff', fx:'ring', targeting:'self',
    effect:{ buffs:[ { stat:'atkSpd', mult:0.6, dur:4, name:'幻影突袭·攻速+60%' },
                     { stat:'crit', add:20, dur:4, name:'幻影突袭·暴击+20%' } ] },
    desc:'【主动】瞬移切入：自己攻速 +60%、暴击 +20%，持续 4 秒。耗蓝 26，蓝满且冷却就绪即放。'
  },

  /* ========== 死灵法师：百分比磨血 + 亦攻亦疗 ========== */
  corrosionAura: {
    id:'corrosionAura', name:'腐蚀光环', type:'passive', behavior:'corrosion',
    color:'#7bd97b', fx:'ring', pct:0.02,
    desc:'【被动】敌方全体每秒损失 2% 最大生命（无视护甲）。'
  },
  deathPulse: {
    id:'deathPulse', name:'死亡脉冲', type:'active', cost:32, cd:3,
    icon:'💀', color:'#a06be0', fx:'ring', targeting:'allEnemies',
    effect:{ damage:{ type:'magic', stat:'ap', mult:1.0 } },
    allyEffect:{ heal:{ pctMaxHp:0.12 } },
    desc:'【主动】生死轮转（团队医疗核心）：对敌全体造成 法强×1.0 伤害，同时全体友军恢复 12% 最大生命。耗蓝 32，蓝满且冷却就绪即放。'
  },
  deathGrace: {
    id:'deathGrace', name:'死亡恩泽', type:'passive', behavior:'healTeamPerSec',
    pct:0.03, color:'#9fe07b',
    desc:'【被动】每秒为生命比例最低的友军恢复其 3% 最大生命。'
  },
  lifeReap: {
    id:'lifeReap', name:'生命收割', type:'active', cost:36, cd:3,
    icon:'☠️', color:'#d05bff', fx:'burst', targeting:'enemyLowestHp',
    effect:{ missingHp:0.6 },
    desc:'【主动】死光收割：对生命最低的敌人造成（缺失生命）×0.6 真实伤害。耗蓝 36，蓝满且冷却就绪即放。'
  },

  /* ========== 影魔：后期法术炮台，击杀成长 ========== */
  soulHarvest: {
    id:'soulHarvest', name:'灵魂收割', type:'passive', behavior:'killGrow',
    atkPer:1, apPer:2, stats:{ mlifesteal:10 },
    desc:'【被动】击杀成长：每击杀一名敌人，攻击 +1、法强 +2（跨关累积，越杀越强），魔法吸血 +10%。'
  },
  shadowraze: {
    id:'shadowraze', name:'影压', type:'active', cost:26, cd:2,
    icon:'💥', color:'#ff5a5a', fx:'burst', targeting:'enemyHighestHp',
    effect:{ damage:{ type:'magic', stat:'ap', mult:2.5 } },
    desc:'【主动】灵魂冲击：对生命最高的敌人造成 法强×2.5 魔法伤害。耗蓝 26，蓝满且冷却就绪即放。'
  },
  requiem: {
    id:'requiem', name:'魂之挽歌', type:'active', cost:38, cd:4,
    icon:'👻', color:'#c05bff', fx:'ring', targeting:'allEnemies',
    effect:{ damage:{ type:'magic', stat:'ap', mult:1.5 }, silence:1.5 },
    killMana:20,
    desc:'【主动】怨魂撕裂敌全体：各造成 法强×1.5 伤害并沉默 1.5 秒；击杀敌人立即回 20 蓝。耗蓝 38，蓝满且冷却就绪即放。'
  },

  /* ========== 血魔：敌人越残血攻击越高，割裂处决 ========== */
  enemyBleed: {
    id:'enemyBleed', name:'鲜血契约', type:'passive', behavior:'enemyBleed',
    per:0.6,
    desc:'【被动】全场敌人平均每损失 1% 生命，攻击 +0.6%（敌人越残血攻击越高，最多 +60%）。'
  },
  bloodRite: {
    id:'bloodRite', name:'血之祭祀', type:'active', cost:28, cd:3,
    icon:'🩸', color:'#ff4d6d', fx:'ring', targeting:'allEnemies',
    effect:{ damage:{ type:'physical', stat:'atk', mult:1.2 }, silence:1.5 },
    desc:'【主动】血阵降临：对敌全体造成 攻击×1.2 伤害并沉默 1.5 秒。耗蓝 28，蓝满且冷却就绪即放。'
  },
  rupture: {
    id:'rupture', name:'割裂', type:'active', cost:34, cd:4,
    icon:'🔪', color:'#ff2e4d', fx:'burst', targeting:'enemyHighestHp',
    effect:{ missingHp:0.5,
             dot:{ name:'割裂', stat:'atk', mult:0.25, dur:4, color:'#ff5a5a' } },
    desc:'【主动】撕裂生命最高的敌人：（缺失生命）×0.5 真伤 + 每秒流血 攻击×25%，持续 4 秒。耗蓝 34，蓝满且冷却就绪即放。'
  },

  /* ========== 卓尔游侠：减速点杀 ========== */
  marksmanship: {
    id:'marksmanship', name:'射手天赋', type:'passive', behavior:'auraStat',
    pct:{ atk:0.08 },
    desc:'【被动】光环：全体友军 攻击 +8%。'
  },
  frostArrow: {
    id:'frostArrow', name:'霜冻之箭', type:'active', cost:24, cd:3,
    icon:'❄️', color:'#8fd8ff', fx:'burst', targeting:'enemyLowestHpRatio',
    effect:{ damage:{ type:'physical', stat:'atk', mult:1.9 },
             buffs:[ { stat:'atkSpd', mult:-0.4, dur:3, name:'冰缓·攻速-40%' } ] },
    desc:'【主动】霜箭点杀：对生命比例最低的敌人造成 攻击×1.9 伤害，并使其攻速 -40%，持续 3 秒。耗蓝 24，蓝满且冷却就绪即放。'
  },
  multishot: {
    id:'multishot', name:'多重射击', type:'active', cost:34, cd:4,
    icon:'🏹', color:'#b8f36b', fx:'burst', targeting:'allEnemies',
    effect:{ damage:{ type:'physical', stat:'atk', mult:1.5 } },
    desc:'【主动】箭雨覆盖（多人物理核心）：对全体敌人各造成 攻击×1.5 物理伤害。耗蓝 34，蓝满且冷却就绪即放。'
  },

  /* ========== 痛苦女王：毒镖点杀 → 尖叫爆发 → 超声波冲击波 ========== */
  sonicWave: {
    id:'sonicWave', name:'超声波', type:'active', cost:42, cd:4,
    icon:'🔊', color:'#8fe0ff', fx:'wave', targeting:'allEnemies',
    effect:{ damage:{ type:'magic', stat:'ap', mult:2.8 } },
    desc:'【主动】超声波冲击（招牌大招）：朝敌阵释放一道向前扩散的声波，波面扫到的每个敌人各受 法强×2.8 魔法伤害——人越多亏得越多。耗蓝 42，蓝满且冷却就绪即放。'
  },
  shadowStrike: {
    id:'shadowStrike', name:'暗影突袭', type:'active', cost:26, cd:3,
    icon:'🥷', color:'#b06bff', fx:'burst', targeting:'enemyLowestHp',
    effect:{ damage:{ type:'magic', stat:'ap', mult:1.8 }, disarm:1.5,
             dot:{ name:'毒镖', stat:'ap', mult:0.4, dur:3, color:'#b06bff' } },
    desc:'【主动】毒镖废人：对生命最低的敌人造成 法强×1.8 魔法伤害、持续中毒 3 秒，并缴械 1.5 秒。耗蓝 26，蓝满且冷却就绪即放。'
  },
  screamOfPain: {
    id:'screamOfPain', name:'痛苦尖叫', type:'active', cost:34, cd:3,
    icon:'📢', color:'#ff6bd6', fx:'ring', targeting:'allEnemies',
    effect:{ damage:{ type:'magic', stat:'ap', mult:2.2 } },
    desc:'【主动】灵魂尖啸（招牌爆发）：对敌全体造成 法强×2.2 魔法伤害。耗蓝 34，蓝满且冷却就绪即放。'
  },

  /* ========== 宙斯：高频施法，技能附加灼烧 ========== */
  staticField: {
    id:'staticField', name:'静电场', type:'passive', behavior:'skillDot',
    dot:{ name:'电击', stat:'ap', mult:0.2, dur:3, color:'#9fd0ff' },
    desc:'【被动】技能命中附加电击：每秒 法强×20%，持续 3 秒。'
  },
  arcLightning: {
    id:'arcLightning', name:'弧形闪电', type:'active', cost:20, cd:2,
    icon:'⚡', color:'#6cc8ff', fx:'lightning', targeting:'enemyRandom3',
    effect:{ damage:{ type:'magic', stat:'ap', mult:1.3 } },
    desc:'【主动】闪电链：雷电劈向随机 3 个敌人，并在目标间跳跃传递，依次造成 法强×1.3 伤害。低耗高频率：耗蓝 20，蓝满且冷却就绪即放。'
  },
  thundergod: {
    id:'thundergod', name:'雷神之怒', type:'active', cost:45, cd:4,
    icon:'🌩️', color:'#ffe066', fx:'lightning', targeting:'allEnemies',
    effect:{ damage:{ type:'magic', stat:'ap', mult:2.3 } },
    desc:'【主动】万雷天罚：天雷从天顶直击一名敌人后，向全体敌人连锁跳跃传递，各造成 法强×2.3 魔法伤害。耗蓝 45，蓝满且冷却就绪即放。'
  },

  /* ========== 剑圣：每 3 刀必暴，风暴带盾 ========== */
  bladeDance: {
    id:'bladeDance', name:'剑舞', type:'passive', behavior:'assureCrit',
    every:3, stats:{ critMult:30 },
    desc:'【被动】每第 3 次攻击必定暴击，暴击倍数 +30%。'
  },
  bladeFury: {
    id:'bladeFury', name:'剑刃风暴', type:'active', cost:30, cd:4,
    icon:'⚔️', color:'#ffd35c', fx:'burst', targeting:'allEnemies',
    effect:{ damage:{ type:'physical', stat:'atk', mult:1.2 } },
    selfEffect:{ shield:{ pctMaxHp:0.12 } },
    desc:'【主动】剑刃风暴席卷敌全体：各造成 攻击×1.2 伤害；自己获得 12% 最大生命护盾。耗蓝 30，蓝满且冷却就绪即放。'
  },
  omnislash: {
    id:'omnislash', name:'无敌斩', type:'active', cost:45, cd:5,
    icon:'🗡️', color:'#ffe9a3', fx:'burst', targeting:'allEnemies',
    omni:{ slashes:5, window:0.7, invuln:1.0 },
    effect:{ damage:{ type:'physical', stat:'atk', mult:0.9 } },
    desc:'【主动】无敌斩（招牌大招）：化身残影对随机存活敌人连续斩击 5 刀，每刀 攻击×90% 且可暴击；连斩期间自身无敌，别人打不动你。耗蓝 45，蓝满且冷却就绪即放。'
  },

  /* ========== 斧王：受击反击，低血处决 ========== */
  counterHelix: {
    id:'counterHelix', name:'反击螺旋', type:'passive', behavior:'counterHelix',
    chance:0.35, mult:0.7,
    desc:'【被动】受击有 35% 几率旋转反击，对敌全体各造成 攻击×70% 伤害。'
  },
  berserkerCall: {
    id:'berserkerCall', name:'战斗咆哮', type:'active', cost:30, cd:3,
    icon:'😤', color:'#ffb02e', fx:'ring', targeting:'self',
    effect:{ shield:{ pctMaxHp:0.2 },
             buff:{ stat:'atk', mult:0.25, dur:4, name:'战斗咆哮·攻击+25%' } },
    desc:'【主动】怒吼：自己获得 20% 最大生命护盾，攻击 +25%，持续 4 秒。耗蓝 30，蓝满且冷却就绪即放。'
  },
  cullingBlade: {
    id:'cullingBlade', name:'斩杀', type:'active', cost:34, cd:4,
    icon:'🪓', color:'#ff3b3b', fx:'burst', targeting:'enemyLowestHpRatio',
    effect:{ missingHp:0.7, execute:0.12 },
    desc:'【主动】巨斧斩下：对生命比例最低的敌人造成（缺失生命）×0.7 真伤；低于 12% 生命直接处决。耗蓝 34，蓝满且冷却就绪即放。'
  },

  /* ========== 船长：溅射 + 团队朗姆酒 ========== */
  tidebringer: {
    id:'tidebringer', name:'潮汐使者', type:'passive', behavior:'cleave',
    mult:0.6,
    desc:'【被动】潮汐附刃：普攻向其他敌人溅射 60% 伤害。'
  },
  torrent: {
    id:'torrent', name:'洪流', type:'active', cost:28, cd:3,
    icon:'🌊', color:'#6bc5ff', fx:'burst', targeting:'enemyHighestHp',
    effect:{ damage:{ type:'physical', stat:'atk', mult:1.8 }, stun:2.0 },
    desc:'【主动】喷涌洪流（单体控制核心）：对生命最高的敌人造成 攻击×1.8 伤害并眩晕 2 秒。耗蓝 28，蓝满且冷却就绪即放。'
  },
  ghostShip: {
    id:'ghostShip', name:'幽灵船', type:'active', cost:42, cd:4,
    icon:'⛵', color:'#8fe3ff', fx:'burst', targeting:'allEnemies',
    effect:{ damage:{ type:'physical', stat:'atk', mult:1.3 }, stun:1 },
    allyBuff:{ stat:'armor', mult:0.2, dur:5, name:'朗姆酒·护甲+20%' },
    desc:'【主动】幽灵船撞向敌全体：各造成 攻击×1.3 伤害并眩晕 1 秒；全队护甲 +20%，持续 5 秒。耗蓝 42，蓝满且冷却就绪即放。'
  },

  /* ========== 地狱领主：纯高血量 + 回光返照 ========== */
  mistCoil: {
    id:'mistCoil', name:'迷雾之咒', type:'active', cost:26, cd:3,
    icon:'🌫️', color:'#a06be0', fx:'burst', targeting:'enemyLowestHp',
    effect:{ damage:{ type:'magic', stat:'atk', mult:1.9 } },
    desc:'【主动】迷雾能量：对生命最低的敌人造成 攻击×1.9 魔法伤害。耗蓝 26，蓝满且冷却就绪即放。'
  },
  undyingBlood: {
    id:'undyingBlood', name:'不朽血躯', type:'passive', behavior:'statBuff',
    pct:{ hp:0.30, hpRegen:0.5 },
    desc:'【被动】不朽血躯：最大生命 +30%，生命恢复 +50%（全场最厚的血条）。'
  },
  borrowedTimeActive: {
    id:'borrowedTimeActive', name:'回光返照', type:'active', cost:40, cd:5,
    icon:'⏳', color:'#6bffc8', fx:'ring', targeting:'self',
    effect:{ cleanse:true, btWindow:4 },
    desc:'【主动】回光返照（大招）：解除全部负面，并在 4 秒内将受到的伤害转化为生命回复——敌人打你就是给你回血。耗蓝 40，蓝满且冷却就绪即放。'
  },

  /* ========== 龙骑士：破甲震慑，前排控制坦 ========== */
  dragonBlood: {
    id:'dragonBlood', name:'龙血', type:'passive', behavior:'statBuff',
    stats:{ armor:3, hpRegen:3 },
    desc:'【被动】巨龙之血：护甲 +3，生命恢复 +3（高护甲高回血的核心）。'
  },
  dragonTail: {
    id:'dragonTail', name:'神龙摆尾', type:'active', cost:28, cd:3,
    icon:'🐉', color:'#ffb02e', fx:'burst', targeting:'enemyHighestHp',
    effect:{ damage:{ type:'physical', stat:'atk', mult:1.9 },
             buffs:[ { stat:'atk', mult:-0.3, dur:4, name:'龙威·攻击-30%' } ] },
    desc:'【主动】龙尾震慑：对生命最高的敌人造成 攻击×1.9 伤害，使其攻击 -30%，持续 4 秒。耗蓝 28，蓝满且冷却就绪即放。'
  },
  breatheFire: {
    id:'breatheFire', name:'火焰气息', type:'active', cost:30, cd:3,
    icon:'🔥', color:'#ff8a3c', fx:'burst', targeting:'allEnemies',
    effect:{ damage:{ type:'physical', stat:'atk', mult:1.2 },
             buffs:[ { stat:'armor', mult:-0.25, dur:4, name:'龙息破甲·护甲-25%' } ] },
    desc:'【主动】龙息破甲：对敌全体造成 攻击×1.2 伤害，使其护甲 -25%，持续 4 秒。耗蓝 30，蓝满且冷却就绪即放。'
  },

  /* ========== 奈克斯：被动输出按敌人当前生命百分比扣血（主动撕裂伤口仍按最大生命） ========== */
  feast: {
    id:'feast', name:'嗜血盛宴', type:'passive', behavior:'maxHpStrike',
    pct:0.04,
    desc:'【被动】嗜血盛宴：普攻额外造成 目标当前生命×4% 的伤害（有视护甲：先扣除目标护甲，单次至少 1 点），并回复等量生命。'
  },
  rage: {
    id:'rage', name:'狂暴', type:'active', cost:26, cd:4,
    icon:'😤', color:'#ff5d5d', fx:'ring', targeting:'self',
    effect:{ buffs:[ { stat:'atkSpd', mult:0.5, dur:4, name:'狂暴·攻速+50%' },
                     { stat:'dodge', add:8, dur:4, name:'狂暴·闪避+8%' } ] },
    desc:'【主动】狂暴：自己攻速 +50%、闪避 +8%，持续 4 秒。耗蓝 26，蓝满且冷却就绪即放。'
  },
  openWounds: {
    id:'openWounds', name:'撕裂伤口', type:'active', cost:34, cd:4,
    icon:'🩸', color:'#ff3b3b', fx:'burst', targeting:'enemyHighestHp',
    effect:{ damage:{ type:'true', maxHpPct:0.15 } },
    desc:'【主动】撕裂伤口：对生命最高的敌人造成 其最大生命×15% 的真实伤害（专克高血量肉盾）。耗蓝 34，蓝满且冷却就绪即放。'
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
    id:'bossSweep', name:'震地横扫', type:'active', cost:28, cd:3,
    icon:'🪨', color:'#ff6b4d', fx:'burst', targeting:'allEnemies',
    effect:{ damage:{ type:'physical', stat:'atk', mult:0.5 } },
    desc:'【主动】砸地横扫：对敌全体造成 攻击×0.5 物理伤害。耗蓝 28，蓝满且冷却就绪即放。'
  },
  bloodThirst: {
    id:'bloodThirst', name:'鲜血渴望', type:'passive', behavior:'statBuff',
    stats:{ lifesteal:15 },
    desc:'【被动】物理吸血 +15%。'
  },
  abyssTouch: {
    id:'abyssTouch', name:'深渊之触', type:'active', cost:28, cd:3,
    icon:'👁️', color:'#c05bff', fx:'burst', targeting:'enemyLowestHp',
    effect:{ damage:{ type:'magic', stat:'atk', mult:1.6 }, stun:1.2 },
    desc:'【主动】深渊之触：对生命最低的敌人造成 攻击×1.6 伤害并眩晕 1.2 秒。耗蓝 28，蓝满且冷却就绪即放。'
  },
  snipeShot: {
    id:'snipeShot', name:'精准狙杀', type:'active', cost:30, cd:4,
    icon:'🎯', color:'#ff8f8f', fx:'burst', targeting:'enemyLowestHp',
    effect:{ damage:{ type:'physical', stat:'atk', mult:2.4 } },
    desc:'【主动】精准狙杀：对我方生命最低的单位造成 攻击×2.4 物理伤害（狙杀残血）。耗蓝 30。'
  },
  chaosBolt: {
    id:'chaosBolt', name:'混沌箭雨', type:'active', cost:28, cd:4,
    icon:'🔮', color:'#c05bff', fx:'ring', targeting:'allEnemies',
    effect:{ damage:{ type:'magic', stat:'atk', mult:1.0 },
             dot:{ name:'腐蚀', stat:'atk', mult:0.2, dur:3, color:'#b06bff' } },
    desc:'【主动】混沌箭雨：对我方全体造成 攻击×1.0 伤害并附加腐蚀（每秒 攻击×20%，3 秒）。耗蓝 28。'
  },
  bloodSickle: {
    id:'bloodSickle', name:'血镰', type:'passive', behavior:'attackDot',
    dot:{ name:'血刃', stat:'atk', mult:0.3, dur:3, color:'#ff5a5a' },
    desc:'【被动】攻击附加血刃：目标每秒受到 攻击×30% 伤害，持续 3 秒。'
  },

  /* ---- 大 Boss 专属 ---- */
  magmaEruption: {
    id:'magmaEruption', name:'熔岩喷发', type:'active', cost:28, cd:3,
    icon:'🌋', color:'#ff6b3c', fx:'burst', targeting:'allEnemies',
    effect:{ damage:{ type:'magic', stat:'atk', mult:1.1 },
             dot:{ name:'灼烧', stat:'atk', mult:0.3, dur:3, color:'#ff8a3c' } },
    desc:'【主动】熔岩喷发：对敌全体造成 攻击×1.1 伤害并附加灼烧（每秒 攻击×30%，3 秒）。耗蓝 28，蓝满且冷却就绪即放。'
  },
  summonAbyss: {
    id:'summonAbyss', name:'深渊召唤', type:'active', cost:24, cd:5,
    icon:'🌀', color:'#a06bff', fx:'ring', targeting:'self',
    effect:{ summon:{ count:2, template:'abyss', cap:4 } },
    desc:'【主动】深渊召唤：从裂隙召唤至多 2 只深渊小卒（场上满 4 只不再召唤）。'
  },
  summonGuard: {
    id:'summonGuard', name:'古树卫士', type:'active', cost:28, cd:5,
    icon:'🌳', color:'#7bd97b', fx:'ring', targeting:'self',
    effect:{ summon:{ count:1, template:'guard', cap:2 } },
    desc:'【主动】古树卫士：召唤 1 名树卫为自己抵挡伤害（场上满 2 名不再召唤）。'
  },

  /* ---- 小 Boss 特色技能 ---- */
  manaBurnBlade: {
    id:'manaBurnBlade', name:'噬魔之刃', type:'passive', behavior:'manaBurn',
    mana:8,
    desc:'【被动】普攻额外燃烧目标 8 点魔法值。'
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
    hpPct:0.5, rage:8, spikes:6,
    desc:'【被动】生命首次低于 50% 时觉醒：获得 8 层狂怒与 6 点尖刺。'
  },
  stoneSkin: {
    id:'stoneSkin', name:'石肤', type:'passive', behavior:'takenReduce',
    pct:0.3,
    desc:'【被动】受到的所有伤害降低 30%。'
  },
  fleshGrowth: {
    id:'fleshGrowth', name:'血肉生长', type:'passive', behavior:'bloodRage', per:0.6,
    desc:'【被动】每损失 10% 最大生命，攻击 +6%（最多 +60%）。'
  },

  /* ========== 敌方词缀（第 4 关起精英随机携带） ========== */
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

/* ================= 13 个英雄（小数值） =================
 * pos：生成位置类型（前/中/后）；tier：商店售价档位（20 / 40 / 60）
 * 生命 96~180（约等于伤害的 4 倍，保证单关战斗 10 秒左右）、攻击 6~14、护甲 1~6。
 * 养大哥路线：升星 + 装备 + 强化槽改造 + 神器全灌给 1~2 个核心。 */
const HEROES = [
  { id:'pa', name:'幻影刺客', tier:60, pos:'mid', role:'单体物理爆发', emoji:'🗡️',
    base:{ hp:112, maxMana:50, atk:14, atkSpd:1.15, ap:5, armor:1, dodge:14, crit:20, critMult:160,
           hpRegen:1, manaRegen:3, lifesteal:8, mlifesteal:0 },
    skills:['stifling','blur','phantomStrike'],
    bio:'出手即致命的幻影刺客，窒息之刃起手收割，幻影突袭让她瞬间攻速暴涨。' },

  { id:'necro', name:'死灵法师', tier:60, pos:'back', role:'高医疗', emoji:'☠️',
    base:{ hp:104, maxMana:50, atk:6, atkSpd:0.95, ap:16, armor:1, dodge:4, crit:8, critMult:150,
           hpRegen:1, manaRegen:3, lifesteal:0, mlifesteal:12 },
    skills:['corrosionAura','deathPulse','deathGrace'],
    bio:'团队医疗核心：死亡脉冲瞬间抬升全队血线，死亡恩泽每秒为最虚弱的队友回血，腐蚀光环慢慢磨死敌人。' },

  { id:'sf', name:'影魔', tier:60, pos:'back', role:'后期击杀成长', emoji:'👻',
    base:{ hp:96, maxMana:50, atk:7, atkSpd:1.0, ap:18, armor:1, dodge:5, crit:10, critMult:155,
           hpRegen:1, manaRegen:3, lifesteal:0, mlifesteal:15 },
    skills:['soulHarvest','shadowraze','requiem'],
    bio:'后期法术炮台：灵魂收割让每次击杀永久 +1 攻击 +2 法强（跨关累积），越往后杀得越多越恐怖。' },

  { id:'bs', name:'血魔', tier:40, pos:'mid', role:'残血增幅', emoji:'🩸',
    base:{ hp:128, maxMana:50, atk:12, atkSpd:1.1, ap:6, armor:2, dodge:8, crit:12, critMult:155,
           hpRegen:1, manaRegen:2, lifesteal:12, mlifesteal:0 },
    skills:['enemyBleed','bloodRite','rupture'],
    bio:'敌人失血越多他攻击越高：鲜血契约按全场敌人平均缺失生命加攻，割裂让残血猎物无处可逃。' },

  { id:'drow', name:'卓尔游侠', tier:40, pos:'back', role:'多人物理', emoji:'🏹',
    base:{ hp:112, maxMana:50, atk:11, atkSpd:1.1, ap:8, armor:1, dodge:9, crit:18, critMult:160,
           hpRegen:1, manaRegen:2, lifesteal:5, mlifesteal:0 },
    skills:['frostArrow','marksmanship','multishot'],
    bio:'多人物理核心：多重射击一箭扫过全体敌人，霜冻之箭起手减速，让最虚弱的猎物无处遁逃。' },

  { id:'qop', name:'痛苦女王', tier:60, pos:'mid', role:'多人魔法AOE', emoji:'💜',
    base:{ hp:108, maxMana:50, atk:9, atkSpd:1.05, ap:15, armor:1, dodge:10, crit:12, critMult:155,
           hpRegen:1, manaRegen:3, lifesteal:12, mlifesteal:6 },
    skills:['shadowStrike','screamOfPain','sonicWave'],
    bio:'高魔法 AOE 爆发：毒镖点杀放血，痛苦尖叫轰穿整条战线，大招超声波一道冲击波扫过去、打到谁谁扣血。' },

  { id:'zeus', name:'宙斯', tier:60, pos:'back', role:'多频魔法', emoji:'⚡',
    base:{ hp:96, maxMana:50, atk:6, atkSpd:0.95, ap:19, armor:1, dodge:4, crit:8, critMult:150,
           hpRegen:1, manaRegen:4, lifesteal:0, mlifesteal:8 },
    skills:['arcLightning','staticField','thundergod'],
    bio:'执掌雷霆的众神之王，弧形闪电连环出手，每一次施法都引来静电轰击。' },

  { id:'jugg', name:'剑圣', tier:40, pos:'mid', role:'近战物理', emoji:'⚔️',
    base:{ hp:124, maxMana:50, atk:12, atkSpd:1.2, ap:6, armor:2, dodge:8, crit:15, critMult:170,
           hpRegen:1, manaRegen:2, lifesteal:8, mlifesteal:0 },
    skills:['bladeDance','bladeFury','omnislash'],
    bio:'高物理输出：剑舞刀刀见血，剑刃风暴贴身绞杀群敌，大招无敌斩连斩 5 刀、斩击期间自身无敌。' },

  { id:'axe', name:'斧王', tier:20, pos:'front', role:'半肉输出', emoji:'🪓',
    base:{ hp:156, maxMana:50, atk:11, atkSpd:1.05, ap:3, armor:3, dodge:4, crit:10, critMult:155,
           hpRegen:2, manaRegen:2, lifesteal:8, mlifesteal:0 },
    skills:['counterHelix','berserkerCall','cullingBlade'],
    bio:'半肉半输出的狂战士：挨打必喷反击螺旋，狂吼聚敌强拆，残血敌人一斧收头。' },

  { id:'kunkka', name:'船长', tier:60, pos:'front', role:'单体控制', emoji:'⛵',
    base:{ hp:152, maxMana:50, atk:11, atkSpd:1.0, ap:8, armor:3, dodge:5, crit:10, critMult:155,
           hpRegen:1, manaRegen:2, lifesteal:5, mlifesteal:0 },
    skills:['torrent','tidebringer','ghostShip'],
    bio:'潮汐之力附体的海军统帅，洪流先手眩晕，幽灵船掌控整个战场。' },

  { id:'abaddon', name:'地狱领主', tier:60, pos:'front', role:'纯高血量', emoji:'🛡️',
    base:{ hp:180, maxMana:50, atk:8, atkSpd:0.95, ap:12, armor:4, dodge:4, crit:8, critMult:150,
           hpRegen:2, manaRegen:3, lifesteal:5, mlifesteal:8 },
    skills:['undyingBlood','mistCoil','borrowedTimeActive'],
    bio:'纯高血量前排：不朽血躯再撑 30% 生命上限，大招回光返照期间敌人打他只会给他回血。' },

  { id:'dk', name:'龙骑士', tier:20, pos:'front', role:'高甲高恢复', emoji:'🐉',
    base:{ hp:160, maxMana:50, atk:9, atkSpd:1.0, ap:6, armor:5, dodge:4, crit:8, critMult:150,
           hpRegen:4, manaRegen:2, lifesteal:5, mlifesteal:0 },
    skills:['dragonTail','dragonBlood','breatheFire'],
    bio:'高护甲高回血的钢铁前排：龙血每秒再生，神龙摆尾先手震慑，龙息剥掉整队护甲。' },

  { id:'naix', name:'奈克斯', tier:40, pos:'front', role:'生命%输出', emoji:'🦠',
    base:{ hp:150, maxMana:50, atk:12, atkSpd:1.1, ap:4, armor:3, dodge:5, crit:12, critMult:155,
           hpRegen:2, manaRegen:2, lifesteal:10, mlifesteal:0 },
    skills:['feast','rage','openWounds'],
    bio:'特殊机制·按生命百分比扣血：嗜血盛宴普攻附带目标当前生命 4% 伤害（受护甲减免）并回血（目标血越少伤害越低，收割残血更快），撕裂伤口直接按 15% 最大生命结算，专克高血量 Boss。' },
];

/* 商店英雄档位池 */
const HERO_TIERS = { 20:'普通', 40:'稀有', 60:'史诗' };

/* ================= 装备：5 档 × 10 件 + 特化 10 件 = 60 件（向 Dota2 看齐） =================
 * 每件装备都有 cat 分类（tank 坦克 / phys 物理 / magic 魔法），选择框按分类
 * 套高辨识度配色与徽标（EQ_CATS，见文件头部）。同档装备的属性行互不重复，
 * 每件都要有自己的性格：招牌装备各带 1 个特色被动（写成行内对象，id 前缀
 * eqsk_、type:'passive'，技能栏只显示图标、悬停看完整说明），例如：
 * 穷鬼盾/圆盾/先锋盾·格挡、守护者板甲·反击螺旋、辉耀之尘·灼世腐蚀、
 * 燃魔头环·引燃、刃甲·反伤、碎骨锤·眩晕、黑皇杖·魔免、强袭胸甲·光环、
 * 守护天使·回光返照、代达罗斯·必杀、诸神黄昏·死亡绽放……
 * 其余为纯属性过渡装。只复用引擎已有 behavior，数值一律小数值。
 * 价格 10 / 20 / 30 / 40 / 50；档位解锁按关卡 ceil(关卡/3)；英雄 6 个装备格子。 */
const EQUIPS = [
  /* ---------- 1 档（10 金）：过渡装 + 小格挡 ---------- */
  { id:'eq_t1_1', tier:1, name:'铁树枝干', price:10, icon:'🌿', cat:'tank',
    stats:{ hp:10, hpRegen:1 }, desc:'生命 +10，生命恢复 +1。' },
  { id:'eq_t1_2', tier:1, name:'力量手套', price:10, icon:'🧤', cat:'tank',
    stats:{ hp:16, atk:2 }, desc:'生命 +16，攻击 +2。' },
  { id:'eq_t1_3', tier:1, name:'敏捷便鞋', price:10, icon:'👟', cat:'phys',
    stats:{ atkSpd:0.1 }, desc:'攻击速度 +0.10。' },
  { id:'eq_t1_4', tier:1, name:'智慧斗篷', price:10, icon:'🧣', cat:'magic',
    stats:{ ap:4, manaRegen:1 }, desc:'法强 +4，魔法恢复 +1。' },
  { id:'eq_t1_5', tier:1, name:'攻击之爪', price:10, icon:'🐾', cat:'phys',
    stats:{ atk:3 }, desc:'攻击 +3。' },
  { id:'eq_t1_6', tier:1, name:'穷鬼盾', price:10, icon:'🛡️', cat:'tank',
    stats:{ hp:10, armor:1 },
    skill:{ id:'eqsk_block1', type:'passive', name:'格挡', behavior:'takenReduce', pct:0.06,
            desc:'【被动】格挡：受到的所有伤害 -6%。' },
    desc:'残破的木盾，穷人的护身宝。' },
  { id:'eq_t1_7', tier:1, name:'疾行之靴', price:10, icon:'👢', cat:'phys',
    stats:{ dodge:4, atkSpd:0.05 }, desc:'闪避 +4%，攻击速度 +0.05。' },
  { id:'eq_t1_8', tier:1, name:'治疗指环', price:10, icon:'💍', cat:'magic',
    stats:{ hpRegen:3 },
    skill:{ id:'eqsk_ringheal', type:'passive', name:'仁心', behavior:'healLowestPerSec', stat:'hpRegen', mult:0.5,
            desc:'【被动】仁心：每秒为生命比例最低的友军恢复 生命恢复×50% 的生命。' },
    desc:'环上刻着古老的治愈符文，戴久了会替同伴分担伤痛。' },
  { id:'eq_t1_9', tier:1, name:'贤者面具', price:10, icon:'🎭', cat:'phys',
    stats:{ lifesteal:6 }, desc:'物理吸血 +6%。' },
  { id:'eq_t1_10', tier:1, name:'秘法垂饰', price:10, icon:'📿', cat:'magic',
    stats:{ manaRegen:3 }, desc:'魔法恢复 +3。' },

  /* ---------- 2 档（20 金）：圆盾格挡、狂战面具嗜血、风灵回复 ---------- */
  { id:'eq_t2_1', tier:2, name:'速度之靴', price:20, icon:'👞', cat:'phys',
    stats:{ dodge:5, atkSpd:0.08 }, desc:'闪避 +5%，攻击速度 +0.08。' },
  { id:'eq_t2_2', tier:2, name:'圆盾', price:20, icon:'🛡️', cat:'tank',
    stats:{ armor:1 },
    skill:{ id:'eqsk_block2', type:'passive', name:'格挡', behavior:'takenReduce', pct:0.10,
            desc:'【被动】格挡：受到的所有伤害 -10%。' },
    desc:'战士的标配小圆盾，结实耐用。' },
  { id:'eq_t2_3', tier:2, name:'魔棒', price:20, icon:'✨', cat:'magic',
    stats:{ hp:10, manaRegen:1 },
    skill:{ id:'eqsk_wandcharge', type:'passive', name:'充能', killMana:8,
            desc:'【被动】充能：击杀敌人立即回复 8 点魔法。' },
    desc:'攒满能量的小魔棒，杀敌就能回蓝。' },
  { id:'eq_t2_4', tier:2, name:'铁板盔甲', price:20, icon:'⛓️', cat:'tank',
    stats:{ armor:2, hp:12 },
    skill:{ id:'eqsk_ironaura', type:'passive', name:'铁壁光环', behavior:'auraStat', pct:{ armor:0.3 },
            desc:'【被动】铁壁光环：全队护甲提高 30%。' },
    desc:'甲叶铿锵，站在他身边的同伴都硬了几分。' },
  { id:'eq_t2_5', tier:2, name:'秘银锤', price:20, icon:'🔨', cat:'phys',
    stats:{ atk:5, hp:8 }, desc:'攻击 +5，生命 +8。' },
  { id:'eq_t2_6', tier:2, name:'狂战士面具', price:20, icon:'😷', cat:'phys',
    stats:{ atkSpd:0.08, hp:12 },
    skill:{ id:'eqsk_bloodrage', type:'passive', name:'嗜血', behavior:'bloodRage', per:0.25,
            desc:'【被动】嗜血：生命越低攻击越高，最多 +25% 攻击。' },
    desc:'戴上面具，伤痛都化作怒火。' },
  { id:'eq_t2_7', tier:2, name:'流浪指环', price:20, icon:'💠', cat:'tank',
    stats:{ hp:24, hpRegen:1 }, desc:'生命 +24，生命恢复 +1。' },
  { id:'eq_t2_8', tier:2, name:'风灵之杖', price:20, icon:'🎐', cat:'magic',
    stats:{ ap:5, manaRegen:2 },
    skill:{ id:'eqsk_windheal', type:'passive', name:'灵风', behavior:'healTeamPerSec', pct:0.015,
            desc:'【被动】灵风：每秒为生命最低的友军恢复 1.5% 最大生命。' },
    desc:'杖头的风铃声能抚平伤口。' },
  { id:'eq_t2_9', tier:2, name:'吸血虹吸', price:20, icon:'🩸', cat:'phys',
    stats:{ lifesteal:8, mlifesteal:5 }, desc:'物理吸血 +8%，魔法吸血 +5%。' },
  { id:'eq_t2_10', tier:2, name:'精灵长弓', price:20, icon:'🏹', cat:'phys',
    stats:{ atk:4, crit:6 }, desc:'攻击 +4，暴击率 +6%。' },

  /* ---------- 3 档（30 金）：先锋盾、狂战斧、散失、刃甲……招牌开始登场 ---------- */
  { id:'eq_t3_1', tier:3, name:'相位鞋', price:30, icon:'👟', cat:'phys',
    stats:{ dodge:6, atkSpd:0.12, atk:2 }, desc:'闪避 +6%，攻击速度 +0.12，攻击 +2。' },
  { id:'eq_t3_2', tier:3, name:'阿托斯之棍', price:30, icon:'🪄', cat:'magic',
    stats:{ ap:7, manaRegen:3 },
    skill:{ id:'eqsk_root', type:'passive', name:'束缚击', behavior:'attackStun', chance:0.15, dur:1.0,
            desc:'【被动】束缚击：普攻有 15% 概率束缚目标 1 秒（视为眩晕）。' },
    desc:'棍出如藤，缠住猎物的双腿。' },
  { id:'eq_t3_3', tier:3, name:'洛萨之锋', price:30, icon:'🗡️', cat:'phys',
    stats:{ atk:6, crit:6 },
    skill:{ id:'eqsk_invis', type:'passive', name:'破隐一击', behavior:'attackDot',
            dot:{ name:'撕裂', stat:'atk', mult:0.3, dur:3, color:'#ff6b6b' },
            desc:'【被动】破隐一击：攻击附加撕裂，目标每秒受到 攻击×0.3 伤害，持续 3 秒。' },
    desc:'披上斗篷消失，现身时对方已在流血。' },
  { id:'eq_t3_4', tier:3, name:'辉耀之尘', price:30, icon:'☀️', cat:'magic',
    stats:{ ap:5, hp:20 },
    skill:{ id:'eqsk_radiance', type:'passive', name:'灼世之尘', behavior:'corrosion', pct:0.01,
            desc:'【被动】灼世之尘：每秒对所有敌人造成 最大生命×1% 的真实伤害。' },
    desc:'金尘无孔不入，沾上的敌人从皮肉开始溃烂。' },
  { id:'eq_t3_5', tier:3, name:'振魂石', price:30, icon:'💎', cat:'magic',
    stats:{ hp:35, manaRegen:3 }, desc:'生命 +35，魔法恢复 +3。' },
  { id:'eq_t3_6', tier:3, name:'散失之刃', price:30, icon:'⚔️', cat:'phys',
    stats:{ atk:5, atkSpd:0.1 },
    skill:{ id:'eqsk_manaBurn', type:'passive', name:'消散', behavior:'manaBurn', mana:12,
            desc:'【被动】消散：攻击燃烧目标 12 点魔法，拖慢敌人的技能节奏。' },
    desc:'刀锋过处，法力尽散。' },
  { id:'eq_t3_7', tier:3, name:'狂战斧', price:30, icon:'🪓', cat:'phys',
    stats:{ atk:7 },
    skill:{ id:'eqsk_cleave', type:'passive', name:'分裂', behavior:'cleave', mult:0.6,
            desc:'【被动】分裂：攻击命中后溅射其他敌人，造成 60% 伤害。' },
    desc:'一斧横扫，人仰马翻。' },
  { id:'eq_t3_8', tier:3, name:'死亡面具', price:30, icon:'💀', cat:'phys',
    stats:{ crit:10, critMult:20, lifesteal:8 }, desc:'暴击率 +10%，暴击倍数 +20%，物理吸血 +8%。' },
  { id:'eq_t3_9', tier:3, name:'先锋盾', price:30, icon:'🔰', cat:'tank',
    stats:{ hp:30, armor:1 },
    skill:{ id:'eqsk_block3', type:'passive', name:'格挡', behavior:'takenReduce', pct:0.18,
            desc:'【被动】格挡：受到的所有伤害 -18%。' },
    desc:'最扎实的盾，前排的第二条命。' },
  { id:'eq_t3_10', tier:3, name:'巫师之冠', price:30, icon:'👑', cat:'magic',
    stats:{ ap:6, mlifesteal:8 }, desc:'法强 +6，魔法吸血 +8%。' },

  /* ---------- 4 档（40 金）：黑皇杖、强袭、林肯、碎骨锤、守护天使 ---------- */
  { id:'eq_t4_1', tier:4, name:'黑皇杖', price:40, icon:'🦯', cat:'tank',
    stats:{ atk:5, hp:40 },
    skill:{ id:'eqsk_bkb', type:'passive', name:'魔免', behavior:'takenReduce', pct:0.10,
            desc:'【被动】魔免：受到的所有伤害 -10%。' },
    desc:'金光护体，寻常伤害难伤分毫。' },
  { id:'eq_t4_2', tier:4, name:'散夜对剑', price:40, icon:'⚔️', cat:'phys',
    stats:{ atk:7, atkSpd:0.15, dodge:6 }, desc:'攻击 +7，攻击速度 +0.15，闪避 +6%。' },
  { id:'eq_t4_3', tier:4, name:'强袭胸甲', price:40, icon:'🏰', cat:'tank',
    stats:{ armor:3, hp:40 },
    skill:{ id:'eqsk_assault', type:'passive', name:'强袭光环', behavior:'auraStat', pct:{ atkSpd:0.06 },
            desc:'【被动】强袭光环：全队攻击速度 +6%。' },
    desc:'胸甲高鸣，全队出手更快。' },
  { id:'eq_t4_4', tier:4, name:'林肯法球', price:40, icon:'🔮', cat:'magic',
    stats:{ ap:8, hp:25 },
    skill:{ id:'eqsk_linken', type:'passive', name:'法球格挡', behavior:'shieldOnHit', pct:0.6, internalCd:4,
            desc:'【被动】法球格挡：受击时获得相当于伤害 60% 的护盾，每 4 秒至多一次。' },
    desc:'法球流转，替你挡下重击。' },
  { id:'eq_t4_5', tier:4, name:'蝴蝶', price:40, icon:'🦋', cat:'phys',
    stats:{ atkSpd:0.18, dodge:10, crit:8 }, desc:'攻击速度 +0.18，闪避 +10%，暴击率 +8%。' },
  { id:'eq_t4_6', tier:4, name:'碎骨锤', price:40, icon:'💥', cat:'phys',
    stats:{ atk:8 },
    skill:{ id:'eqsk_bash', type:'passive', name:'碎骨一击', behavior:'attackStun', chance:0.2, dur:1.2,
            desc:'【被动】碎骨一击：普攻有 20% 概率眩晕目标 1.2 秒。' },
    desc:'一锤下去，骨头都在响。' },
  { id:'eq_t4_7', tier:4, name:'阿哈利姆神杖', price:40, icon:'🎩', cat:'magic',
    stats:{ ap:9, manaRegen:4, hp:20 }, desc:'法强 +9，魔法恢复 +4，生命 +20。' },
  { id:'eq_t4_8', tier:4, name:'血棘', price:40, icon:'🌹', cat:'phys',
    stats:{ atk:7, crit:8 },
    skill:{ id:'eqsk_bloodthorn', type:'passive', name:'血棘', behavior:'attackDot',
            dot:{ name:'血棘灼烧', stat:'atk', mult:0.35, dur:3, color:'#ff4d6d' },
            desc:'【被动】血棘：攻击附加血棘灼烧，目标每秒受到 攻击×0.35 伤害，持续 3 秒。' },
    desc:'荆棘入体，血如泉涌。' },
  { id:'eq_t4_9', tier:4, name:'深海重锤', price:40, icon:'🌊', cat:'phys',
    stats:{ atk:6, crit:8, hp:25 }, desc:'攻击 +6，暴击率 +8%，生命 +25。' },
  { id:'eq_t4_10', tier:4, name:'守护天使', price:40, icon:'🪽', cat:'tank',
    stats:{ armor:2, dodge:6, hp:25 },
    skill:{ id:'eqsk_laststand', type:'passive', name:'回光返照', behavior:'lastStand',
            pct:0.3, heal:0.3, shield:0.2,
            desc:'【被动】回光返照：生命首次低于 30% 时立即回复 30% 生命并获得 20% 护盾（每场一次）。' },
    desc:'天使的羽翼，为你挡下死亡。' },

  /* ---------- 5 档（50 金）：一半纯属性，一半带招牌被动 ---------- */
  { id:'eq_t5_1', tier:5, name:'圣剑', price:50, icon:'☄️', cat:'phys',
    stats:{ atk:16 }, desc:'攻击 +16。最纯粹的暴力，除此之外一无所有。' },
  { id:'eq_t5_2', tier:5, name:'代达罗斯之殇', price:50, icon:'💀', cat:'phys',
    stats:{ atk:11, crit:15, critMult:30 },
    skill:{ id:'eqsk_bigcrit', type:'passive', name:'致命一击', behavior:'assureCrit', every:3,
            desc:'【被动】致命一击：每第 3 次攻击必定暴击。' },
    desc:'巨炮蓄力，三炮必有一发暴击。' },
  { id:'eq_t5_3', tier:5, name:'龙之心', price:50, icon:'❤️', cat:'tank',
    stats:{ hp:70, hpRegen:5 }, desc:'生命 +70，生命恢复 +5。' },
  { id:'eq_t5_4', tier:5, name:'银月之晶', price:50, icon:'🌙', cat:'phys',
    stats:{ atk:9, atkSpd:0.2 }, desc:'攻击 +9，攻击速度 +0.20。' },
  { id:'eq_t5_5', tier:5, name:'深渊之刃', price:50, icon:'🔱', cat:'phys',
    stats:{ atk:12, armor:3 },
    skill:{ id:'eqsk_abyss', type:'passive', name:'深渊眩晕', behavior:'attackStun', chance:0.15, dur:1.5,
            desc:'【被动】深渊眩晕：普攻 15% 几率眩晕目标 1.5 秒。' },
    desc:'从深渊挥出的重击，挨上的都晕头转向。' },
  { id:'eq_t5_6', tier:5, name:'虚灵之刃', price:50, icon:'👻', cat:'magic',
    stats:{ ap:14, manaRegen:4 }, desc:'法强 +14，魔法恢复 +4。' },
  { id:'eq_t5_7', tier:5, name:'灭世魔铠', price:50, icon:'🏯', cat:'tank',
    stats:{ armor:5, hp:60 },
    skill:{ id:'eqsk_wraithshield', type:'passive', name:'灭世壁垒', behavior:'shieldOnHit', pct:0.7, internalCd:3,
            desc:'【被动】灭世壁垒：受击时获得相当于伤害 70% 的护盾，每 3 秒至多一次。' },
    desc:'魔铠吞噬来袭的力道，把伤害酿成护盾。' },
  { id:'eq_t5_8', tier:5, name:'灵魂收割者', price:50, icon:'☠️', cat:'magic',
    stats:{ lifesteal:12, mlifesteal:10, ap:9 },
    skill:{ id:'eqsk_soulkill', type:'passive', name:'灵魂收割', killMana:25,
            desc:'【被动】灵魂收割：击杀敌人立即回复 25 点魔法。' },
    desc:'收割灵魂化为魔力，越杀越有蓝。' },
  { id:'eq_t5_9', tier:5, name:'水晶剑', price:50, icon:'❄️', cat:'phys',
    stats:{ atk:8, crit:16 }, desc:'攻击 +8，暴击率 +16%。' },
  { id:'eq_t5_10', tier:5, name:'诸神黄昏', price:50, icon:'🌋', cat:'magic',
    stats:{ atk:9, ap:9, hp:40 },
    skill:{ id:'eqsk_ragnarok', type:'passive', name:'诸神黄昏', behavior:'deathBloom', mult:0.8,
            desc:'【被动】诸神黄昏：死亡时爆炸，对所有敌人造成 攻击×80% 真实伤害。' },
    desc:'与世界一同燃烧，死也要拉人陪葬。' },

  /* ---------- 特化装（每档 2 件）：一半带特色被动 ---------- */
  { id:'eq_p1_1', tier:1, name:'巨人力量带', price:10, icon:'🧱', cat:'tank',
    stats:{ hp:20 }, desc:'生命 +20。' },
  { id:'eq_p1_2', tier:1, name:'精准护腕', price:10, icon:'🎯', cat:'phys',
    stats:{ atk:3, crit:5 },
    skill:{ id:'eqsk_assure1', type:'passive', name:'招招见血', behavior:'assureCrit', every:4,
            desc:'【被动】招招见血：每第 4 次攻击必定暴击。' },
    desc:'瞄准要害，招招致命。' },
  { id:'eq_p2_1', tier:2, name:'守护者板甲', price:20, icon:'💂', cat:'tank',
    stats:{ armor:3, atk:3 },
    skill:{ id:'eqsk_helix', type:'passive', name:'守护反击', behavior:'counterHelix', chance:0.15, mult:0.5,
            desc:'【被动】守护反击：受击时 15% 几率旋转反击，对所有敌人造成 攻击×50% 伤害。' },
    desc:'谁打他，谁就要面对旋转的甲叶。' },
  { id:'eq_p2_2', tier:2, name:'燃魔头环', price:20, icon:'🔥', cat:'magic',
    stats:{ ap:6, hp:12 },
    skill:{ id:'eqsk_ignite', type:'passive', name:'引燃', behavior:'skillDot',
            dot:{ name:'引燃', stat:'ap', mult:0.35, dur:3, color:'#ff9f43' },
            desc:'【被动】引燃：技能命中后，目标每秒受到 法强×0.35 的灼烧伤害，持续 3 秒。' },
    desc:'头环嗡嗡作响，法术掠过即燃。' },
  { id:'eq_p3_1', tier:3, name:'刃甲', price:30, icon:'📯', cat:'tank',
    stats:{ armor:2, hp:14, atk:3 },
    skill:{ id:'eqsk_thorns', type:'passive', name:'尖刺', behavior:'thorns', mult:0.6,
            desc:'【被动】尖刺：受击时反弹 攻击×60% 的伤害。' },
    desc:'谁打我，谁挨扎。' },
  { id:'eq_p3_2', tier:3, name:'不朽之证', price:30, icon:'🧿', cat:'tank',
    stats:{ hp:40, hpRegen:2 }, desc:'生命 +40，生命恢复 +2。' },
  { id:'eq_p4_1', tier:4, name:'灭世肩铠', price:40, icon:'⛰️', cat:'tank',
    stats:{ armor:4, hp:35, hpRegen:3 },
    skill:{ id:'eqsk_wrath', type:'passive', name:'灭世之怒', behavior:'phaseTwo', hpPct:0.5, rage:6, spikes:8,
            desc:'【被动】灭世之怒：生命首次低于 50% 时狂怒（+6 攻击）并长出尖刺（每次受击反弹 8 伤害）。' },
    desc:'肩铠里的怒火，濒死时彻底爆发。' },
  { id:'eq_p4_2', tier:4, name:'星辰坠饰', price:40, icon:'🌟', cat:'magic',
    stats:{ ap:10, manaRegen:4, mlifesteal:6 },
    skill:{ id:'eqsk_starheal', type:'passive', name:'星辰庇护', behavior:'allyHealOnHit', chance:0.3, stat:'ap', mult:0.5,
            desc:'【被动】星辰庇护：受击时 30% 几率为生命最低的友军恢复 法强×50% 的生命。' },
    desc:'星辰之力庇护着同行的伙伴。' },
  { id:'eq_p5_1', tier:5, name:'传说之刃', price:50, icon:'🎇', cat:'phys',
    stats:{ atk:10, atkSpd:0.15, crit:6 }, desc:'攻击 +10，攻击速度 +0.15，暴击率 +6%。' },
  { id:'eq_p5_2', tier:5, name:'永恒壁垒', price:50, icon:'🧱', cat:'tank',
    stats:{ armor:5, hp:60, dodge:6 },
    skill:{ id:'eqsk_barrier', type:'passive', name:'壁垒', behavior:'takenReduce', pct:0.12,
            desc:'【被动】壁垒：受到的所有伤害 -12%。' },
    desc:'固若金汤，滴水不漏。' },
];

/* ================= 敌人数值 =================
 * 基础：生命 96（约等于伤害的 4 倍，配合我方输出把单关节奏控制在 10 秒左右）、
 *       攻击 6、护甲 1。
 * 每关成长：生命 ×(1+0.18×(关卡-1))，攻击 ×(1+0.12×(关卡-1))，护甲 ×(1+0.06×(关卡-1))
 * 难度系数（DIFFICULTIES.enemyMul）在生成时统一相乘。 */
const ENEMY_BASE = {
  hp:96, maxMana:50, atk:6, atkSpd:1.0, ap:4, armor:1, dodge:2, crit:5, critMult:150,
  hpRegen:1, manaRegen:2, lifesteal:0, mlifesteal:0
};

const ENEMY_SCALING = { hp:0.18, atk:0.12, armor:0.06 };

const ENEMY_TYPES = {
  minion:   { name:'小兵',     gold:2,  emoji:'👺', mult:{ hp:1,   atk:1,   armor:1   },
              skills:[],                                pos:['front','mid','back'] },
  elite:    { name:'精英',     gold:4,  emoji:'😈', mult:{ hp:1.8, atk:1.4, armor:1.3 },
              skills:['elitePower'],                    pos:['front','mid','back'] },
  /* —— 新增特色杂兵（金币整体下调后由它们强化“每关难点”辨识度）—— */
  brute:    { name:'蛮兵',     gold:4,  emoji:'🪨', mult:{ hp:2.3, atk:0.8, armor:1.7 },
              skills:[],                                pos:['front','mid'] },
  fury:     { name:'狂战士',   gold:5,  emoji:'💢', mult:{ hp:0.85,atk:1.6, armor:0.7 },
              skills:['affixFrenzy'],                   pos:['front','mid'] },
  hexer:    { name:'咒师',     gold:6,  emoji:'🧿', mult:{ hp:0.9, atk:1.2, armor:0.9 },
              skills:['teamBloom'],                     pos:['back','mid'] },
  swift:    { name:'疾行者',   gold:5,  emoji:'🏃', mult:{ hp:0.9, atk:1.4, armor:0.8 },
              skills:['affixSwift'],                    pos:['mid','back'] },
  /* —— 三种新特色杂兵：后排狙杀 / 法术 AOE / 近战流血 —— */
  sniper:   { name:'狙击手',   gold:6,  emoji:'🎯', mult:{ hp:0.7, atk:1.7, armor:0.7 },
              skills:['snipeShot'],                     pos:['back'] },
  warlock:  { name:'术士',     gold:6,  emoji:'🔮', mult:{ hp:0.8, atk:1.3, armor:0.8 },
              skills:['chaosBolt'],                     pos:['back'] },
  bloodletter:{ name:'血刃手', gold:6,  emoji:'🗡️', mult:{ hp:1.1, atk:1.2, armor:1.0 },
              skills:['bloodSickle'],                   pos:['front','mid'] },
  miniBoss: { name:'小Boss',   gold:6,  emoji:'👹', mult:{ hp:1,   atk:1,   armor:1   },
              skills:[],                                pos:['front'] },
  bigBoss:  { name:'大Boss',   gold:15, emoji:'👿', mult:{ hp:1,   atk:1,   armor:1   },
              skills:[],                                pos:['front'] },
};

/* ================= 每关难点主题（15 关各不相同） =================
 * icon/name：介绍栏显示；diff：悬停💰价格小图标时显示的本关难点说明；
 * count：本关杂兵数量（少数精英关 2~3 个、人海关 4~5 个）——
 *        人海关需要 AOE/多人输出，少怪关需要单体点杀与破甲；
 * mobs：杂兵构成池（rollEnemyTypes 按顺序铺满，展示与实际生成完全一致）。 */
const LEVEL_TRAITS = {
  1:  { icon:'🌿', name:'林间前哨', count:4, diff:'新兵训练场：4 名脆皮小兵一拥而上，AOE 技能清得飞快，压力最低的一关。',
        mobs:['minion','minion','minion','minion'] },
  2:  { icon:'🪨', name:'蛮兵营地', count:2, diff:'敌人只有 2 个但全是高血高甲蛮兵：普攻刮痧，集中法术或破甲手段逐个点破。',
        mobs:['brute','brute'] },
  3:  { icon:'💢', name:'狂兽风暴', count:4, diff:'4 名狂战士攻高皮脆、越伤越狂：务必快速点杀或用控制拖过狂怒期，持久战会被反噬。',
        mobs:['fury','fury','minion','fury'] },
  4:  { icon:'😈', name:'精英巡逻', count:3, diff:'精英携带随机词缀（狂暴/荆棘/迅捷…），后排狙击手超远狙杀我方最脆单位，先切狙击手。',
        mobs:['elite','minion','sniper','elite'] },
  5:  { icon:'🌋', name:'熔岩裂隙', count:3, diff:'熔岩巨兽（大Boss）尖刺反伤 + 每 8 秒熔岩喷发灼烧全体；后排狙击手点名脆皮，注意爆发与回复。',
        mobs:['brute','sniper','brute','warlock','elite'] },
  6:  { icon:'🏃', name:'疾影密林', count:4, diff:'疾行者高速切后排 + 狙击手定点狙杀：前排还站着时后排已经被切，需要点杀。',
        mobs:['swift','minion','swift','sniper','elite'] },
  7:  { icon:'🛡️', name:'铁壁要塞', count:2, diff:'本关只有 2 个敌人：双蛮兵高甲压阵 + 石肤巨人（受伤-30%），纯物理队会打得非常吃力。',
        mobs:['brute','brute','minion','swift','elite'] },
  8:  { icon:'👻', name:'亡语沼泽', count:4, diff:'复仇之魂死亡爆炸 + 血刃手普攻挂流血 + 术士腐蚀法术：集火顺序错了会连环减员。',
        mobs:['bloodletter','elite','warlock','fury','brute'] },
  9:  { icon:'🌊', name:'人海战术', count:5, diff:'满编 5 人小人海 + 后排术士 AOE：范围技能收益最高的一关，单体点杀队慎选挑战。',
        mobs:['minion','minion','warlock','minion','minion'] },
  10: { icon:'👿', name:'深渊之门', count:3, diff:'深渊领主（大Boss）召唤小卒并眩晕；后排咒师回血、术士 AOE、狙击手点杀——必须先秒后排。',
        mobs:['hexer','warlock','sniper','elite','brute'] },
  11: { icon:'⚡', name:'疾风决斗', count:4, diff:'疾行者高速连斩 + 后排狙击手狙杀 + 迅捷词缀：我方攻速跟不上就会被连到死。',
        mobs:['swift','sniper','swift','minion','elite'] },
  12: { icon:'🧛', name:'嗜血盛宴', count:4, diff:'嗜血伯爵吸血 + 血刃手流血不止，狂战士与蛮兵混编：持久战等于给Boss回血。',
        mobs:['bloodletter','brute','elite','fury','hexer'] },
  13: { icon:'🌑', name:'噩梦仪式', count:3, diff:'敌人只有 3 个但个个带招：双咒师每秒抬血 + 术士暗影法术 + 暗影祭司噬魔，先断奶再逐个点破。',
        mobs:['hexer','warlock','hexer','elite','minion'] },
  14: { icon:'🔥', name:'狂怒洪流', count:5, diff:'满编 5 人全输出阵容：狂战士冲脸、血刃手流血、狙击/术士后排轰炸，开局爆发极高。',
        mobs:['fury','bloodletter','elite','sniper','warlock'] },
  15: { icon:'👑', name:'腐化之心', count:4, diff:'最终关：古树之心半血觉醒（+狂怒+尖刺）并召唤树卫，混合编队全员带特性（流血/治疗/法术）。',
        mobs:['bloodletter','hexer','elite','warlock','fury'] },
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
  1: { name:'荆棘幼龙', emoji:'🐲', trait:'尖刺 4：受击时反弹 4 点伤害。',
       mods:{ hp:2.6, atk:1.2, armor:1.2 }, spikes:4 },
  2: { name:'狂怒斗士', emoji:'😡', trait:'战斗开始拥有 5 层狂怒，攻击越打越疼（狂怒每 4 秒衰减 1 层）。',
       mods:{ hp:2.4, atk:1.5, armor:1.0 }, rage:5 },
  3: { name:'铁甲卫士', emoji:'🛡️', trait:'高额护甲 6：每次受击额外减免 6 点伤害。',
       mods:{ hp:3.0, atk:1.0, armor:1.0 }, stats:{ armor:6 } },
  4: { name:'吞噬兽', emoji:'🦈', trait:'物理吸血 40%：攻击回复造成伤害 40% 的生命。',
       mods:{ hp:2.6, atk:1.4, armor:1.1 }, stats:{ lifesteal:40 } },
  5: { name:'剧毒史莱姆', emoji:'☠️', trait:'瘟疫蔓延：我方全体每秒损失 2% 最大生命。',
       mods:{ hp:2.4, atk:1.1, armor:1.0 }, skills:['plagueSpray'] },
  6: { name:'影舞者', emoji:'🥷', trait:'闪避 25% 且迅捷：开局立刻出手。',
       mods:{ hp:2.0, atk:1.6, armor:1.0 }, stats:{ dodge:25 }, quick:true },
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
  12:{ name:'嗜血伯爵', emoji:'🧛', trait:'物理吸血 30% + 尖刺 3：越战越勇。',
       mods:{ hp:2.6, atk:1.5, armor:1.1 }, stats:{ lifesteal:30 }, spikes:3 },
  13:{ name:'暗影祭司', emoji:'🌑', trait:'噬魔之刃：普攻额外燃烧我方 8 点魔法值。',
       mods:{ hp:2.4, atk:1.3, armor:1.0 }, skills:['manaBurnBlade'] },
  14:{ name:'狂暴狮王', emoji:'🦁', trait:'多重打击：每次攻击连击 2 次。',
       mods:{ hp:2.6, atk:1.4, armor:1.1 }, multistrike:1 },
  15:{ name:'腐化树妖', emoji:'🌳', trait:'腐化花粉：每秒为生命最低的友军恢复 2% 最大生命。',
       mods:{ hp:2.6, atk:1.4, armor:1.2 }, skills:['teamBloom'] },
};

/* 大 Boss（第 5 / 10 / 15 关），与小 Boss 同场出现，占前排中央 */
const BIG_BOSSES = {
  5: { name:'熔岩巨兽', emoji:'🌋', class:'eboss',
       trait:'尖刺 6；每 8 秒熔岩喷发，灼烧我方全体并附加灼烧。',
       mods:{ hp:5, atk:1.8, armor:1.8 }, spikes:6,
       skills:['magmaEruption','bossSweep'] },
  10:{ name:'深渊领主', emoji:'👿', class:'eboss',
       trait:'周期召唤深渊小卒；深渊之触眩晕，鲜血渴望吸血。',
       mods:{ hp:6.5, atk:2.0, armor:1.8 },
       skills:['summonAbyss','abyssTouch','bloodThirst'] },
  15:{ name:'森林主宰·古树之心', emoji:'👑', class:'boss',
       trait:'最终 Boss：古树之心——半血觉醒（+8 层狂怒、+6 尖刺），召唤树卫，震地横扫。',
       mods:{ hp:8, atk:2.3, armor:2.2 }, armorFlat:5,
       skills:['phaseTwo','summonGuard','bossSweep'] },
};

/* 召唤物模板：数值基于“关卡成长后的 ENEMY_BASE”倍率 */
const SUMMON_TEMPLATES = {
  abyss: { name:'深渊小卒', emoji:'🦑', mult:{ hp:0.9, atk:0.9, armor:1.0 }, gold:0, skills:[] },
  guard: { name:'树卫',     emoji:'🌿', mult:{ hp:2.0, atk:0.7, armor:2.0 }, gold:0, skills:['bossPassive'] },
};

/* 每关杂兵数量（不含 Boss）：按本关主题 count 走——
 * 少数精英关 2~3 个（考验单体点杀），人海关 4~5 个（考验 AOE/多人输出） */
function rollEnemyCount(level){
  const t = LEVEL_TRAITS[level];
  if(t && t.count) return t.count;
  if(level <= 3) return 2;
  if(level <= 6) return 3;
  return 4;
}

/* 每关敌人构成：小 Boss 必有，5/10/15 关加大 Boss；
 * 杂兵按本关主题（LEVEL_TRAITS[关卡].mobs）铺满，保证介绍栏显示与实战一致；
 * 挑战难度（difficulty === 1）杂兵 +1；总数上限 6 */
function rollEnemyTypes(level, difficulty){
  const list = [];
  if(isBigBossLevel(level)) list.push('bigBoss');
  list.push('miniBoss');
  const bossN = list.length;
  const add = Math.min(rollEnemyCount(level) + ((difficulty === 1) ? 1 : 0), 6 - bossN);
  const trait = LEVEL_TRAITS[level] || null;
  const pool = (trait && trait.mobs && trait.mobs.length) ? trait.mobs : ['minion','minion','elite'];
  for(let i = 0; i < add; i++) list.push(pool[i % pool.length]);
  return list;
}
