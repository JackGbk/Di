'use strict';

/* ================= 全局游戏状态 ================= */
const G = {
  phase:'select',        // select | battle | shop | over
  level:0,
  gold:0,
  reward:0,
  formation:[],          // 玩家单位
  enemies:[],            // 敌方单位
  currentHeroIdx:0,      // 商店当前选中英雄（默认第一个）
  battle:null,
};

let _uid = 1;
let _frame = 0;
const bullets = [];      // 飞行中的子弹
const effects = [];      // 画布特效（原地效果 / 爆炸）

/* ================= 工具 ================= */
function zeroObj(){ const o = {}; for(const k of ZERO_KEYS) o[k] = 0; return o; }
function addStats(dst, src){
  if(!src) return dst;
  for(const k of ZERO_KEYS){ if(src[k]) dst[k] = (dst[k] || 0) + src[k]; }
  return dst;
}
function addPctStats(base, dst, pct){
  if(!pct) return dst;
  for(const k of ZERO_KEYS){ if(pct[k]) dst[k] = (dst[k] || 0) + base[k] * pct[k]; }
  return dst;
}
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const chance = p => Math.random() < p;
const pickOne = arr => arr[Math.floor(Math.random() * arr.length)];
const fmtN = n => Math.round(n);

function skillsOf(u){
  return (u.def.skills || []).map(id => SKILLS[id]).filter(Boolean);
}
function getActiveSkills(u){
  return skillsOf(u).filter(s => s.type === 'active');
}
/* 当前技能的魔法值（每条蓝条独立累计） */
function skillManaOf(u, sk){
  if(!u.skillMana) u.skillMana = {};
  return u.skillMana[sk.id] || 0;
}
function setSkillMana(u, sk, v){
  if(!u.skillMana) u.skillMana = {};
  u.skillMana[sk.id] = v;
}
function allUnits(){ return G.formation.concat(G.enemies); }
function getAllies(u){
  const arr = u.faction === 'player' ? G.formation : G.enemies;
  return arr.filter(x => x.alive);
}
function getEnemies(u){
  const arr = u.faction === 'player' ? G.enemies : G.formation;
  return arr.filter(x => x.alive);
}

/* ================= 属性计算 =================
 * 白字 = 英雄基础属性，绿字 = 装备 + 道具 + 被动 + 光环 + 临时增益
 */
function calcTotals(u){
  if(u._frame === _frame && u._cache) return u._cache;
  const base = u.def.base;
  if(!base.atkSpd) base.atkSpd = 1;      // 缺少攻速属性的单位默认 1.0
  const bonus = zeroObj();

  // 装备与道具
  (u.equips || []).forEach(e => addStats(bonus, e.stats));
  addStats(bonus, u.itemStats);

  const sks = skillsOf(u);
  // 自身被动的固定属性加成
  sks.forEach(sk => {
    if(sk.behavior === 'statBuff'){
      addStats(bonus, sk.stats);
      addPctStats(base, bonus, sk.pct);
    }
  });
  // 队友光环（含自身）
  getAllies(u).forEach(a => {
    skillsOf(a).forEach(sk => {
      if(sk.behavior === 'auraStat') addPctStats(base, bonus, sk.pct);
    });
  });
  // 血怒：每损失 10% 最大生命攻击 +4%
  sks.forEach(sk => {
    if(sk.behavior === 'bloodRage'){
      const missing = u.maxHp > 0 ? Math.max(0, 1 - u.hp / u.maxHp) : 0;
      bonus.atk += base.atk * 0.40 * missing;
    }
  });
  // 临时增益
  (u.buffs || []).forEach(b => {
    if(b.mult && ZERO_KEYS.indexOf(b.stat) >= 0) bonus[b.stat] += base[b.stat] * b.mult;
    else if(b.add){ const o = {}; o[b.stat] = b.add; addStats(bonus, o); }
  });

  const total = zeroObj();
  ZERO_KEYS.forEach(k => total[k] = base[k] + (bonus[k] || 0));
  total.dodge = clamp(total.dodge, 0, 75);
  total.crit   = clamp(total.crit, 0, 100);
  total.atkSpd = clamp(total.atkSpd, 0.3, 5);

  u._frame = _frame;
  u._cache = { base, bonus, total };
  return u._cache;
}
function stat(u, k){ return calcTotals(u).total[k]; }

/* ================= 单位 ================= */
function createUnit(def, faction, posType){
  const u = {
    id: _uid++,
    def: def,
    faction: faction,
    posType: posType || def.pos,
    row: -1, col: -1,
    alive: true,
    kills: 0,
    hp: 1, maxHp: 1, skillMana: {}, shield: 0,
    hpDelayed: 1, dropActive: false, delayT: 0,
    atkTimer: 0,
    equips: [], itemStats: {},
    statuses: { stun:0, silence:0, disarm:0 },
    dots: [], buffs: [], cd: {},
    px: 0, py: 0,
    el: null, parts: null, stHtml: '',
    _shieldCd: 0, _frame: -1, _cache: null,
  };
  const t = calcTotals(u);
  u.maxHp = t.total.hp;
  u.hp = u.maxHp;
  u.hpDelayed = u.maxHp;
  return u;
}

/* maxHp 增长时同步当前生命 */
function refreshMaxHp(u){
  const nm = stat(u, 'hp');
  if(nm > u.maxHp){
    u.hp += nm - u.maxHp;
    u.maxHp = nm;
  }
}

/* 生成位置：先横向居中，再按位置类型决定纵向行（前排离对面更近） */
const COL_ORDER = [2, 1, 3, 0, 4];
function cellTaken(r, c, self){
  return allUnits().some(x => x !== self && x.alive && x.row === r && x.col === c);
}
function placeUnit(u){
  const isEnemy = u.faction === 'enemy';
  let rows;
  if(u.posType === 'front')      rows = [isEnemy ? GRID_ROWS - 1 : 0];
  else if(u.posType === 'back')  rows = [isEnemy ? 0 : GRID_ROWS - 1];
  else                           rows = isEnemy ? [2, 1] : [1, 2];
  for(const r of rows){
    for(const c of COL_ORDER){
      if(!cellTaken(r, c, u)){ u.row = r; u.col = c; return; }
    }
  }
  for(let r = 0; r < GRID_ROWS; r++){
    for(const c of COL_ORDER){
      if(!cellTaken(r, c, u)){ u.row = r; u.col = c; return; }
    }
  }
}

/* ================= 敌人生成 ================= */
function spawnEnemies(level){
  G.enemies = [];
  const types = rollEnemyTypes(level);
  for(const t of types){
    const u = makeEnemy(t, level);
    G.enemies.push(u);
    placeUnit(u);
  }
}
function makeEnemy(type, level){
  const T = ENEMY_TYPES[type];
  const hpS  = 1 + 0.30 * (level - 1);
  const atkS = 1 + 0.18 * (level - 1);
  const arS  = 1 + 0.08 * (level - 1);
  const def = {
    id: 'e_' + type,
    name: T.name,
    emoji: T.emoji,
    gold: T.gold,
    enemyType: type,
    pos: pickOne(T.pos),
    skills: T.skills.slice(),
    base: {
      hp:        Math.round(ENEMY_BASE.hp * hpS * T.mult.hp),
      maxMana:   ENEMY_BASE.maxMana,
      atk:       Math.round(ENEMY_BASE.atk * atkS * T.mult.atk),
      atkSpd:    Math.min(1.6, ENEMY_BASE.atkSpd + 0.03 * (level - 1)),
      ap:        Math.round(ENEMY_BASE.ap * atkS * T.mult.atk),
      armor:     Math.round(ENEMY_BASE.armor * arS * T.mult.armor),
      dodge:     ENEMY_BASE.dodge,
      crit:      ENEMY_BASE.crit,
      critMult:  ENEMY_BASE.critMult,
      hpRegen:   Math.round(ENEMY_BASE.hpRegen * T.mult.hp),
      manaRegen: ENEMY_BASE.manaRegen,
      lifesteal: ENEMY_BASE.lifesteal,
      mlifesteal:ENEMY_BASE.mlifesteal,
    },
    bio: '第 ' + level + ' 关的敌人。',
  };
  const u = createUnit(def, 'enemy', def.pos);
  return u;
}

/* ================= 战斗开始 ================= */
function startBattle(){
  _frame++;
  bullets.length = 0;
  effects.length = 0;

  allUnits().forEach(u => {
    u._frame = -1;
    if(!u.alive) return;
    refreshMaxHp(u);
    u.hp = u.maxHp;
    u.skillMana = {};
    u.shield = 0;
    u.statuses = { stun:0, silence:0, disarm:0 };
    u.dots = [];
    u.buffs = [];
    u.cd = {};
    u._shieldCd = 0;
    u.hpDelayed = u.hp;
    u.dropActive = false;
    // 即时制：错峰安排首次普攻时间，避免所有单位同时出手
    u.atkTimer = 0.35 + Math.random() * 0.9;
  });

  G.battle = {
    secAcc: 0,
    ending: null,
    endT: 0,
  };
}

/* ================= 主更新循环 ================= */
function update(dt){
  const B = G.battle;
  if(!B) return;
  _frame++;

  const units = allUnits();
  for(const u of units){
    u._frame = -1;
    if(!u.alive) continue;

    // 冷却
    for(const k in u.cd){ if(u.cd[k] > 0) u.cd[k] = Math.max(0, u.cd[k] - dt); }
    if(u._shieldCd > 0) u._shieldCd = Math.max(0, u._shieldCd - dt);

    // 状态衰减（眩晕 / 沉默 / 缴械）
    const st = u.statuses;
    st.stun    = Math.max(0, st.stun - dt);
    st.silence = Math.max(0, st.silence - dt);
    st.disarm  = Math.max(0, st.disarm - dt);

    // 属性成长同步 + 恢复
    refreshMaxHp(u);
    if(u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + stat(u, 'hpRegen') * dt);
    // 每条独立蓝条各自回复
    const acts = getActiveSkills(u);
    if(acts.length){
      const mx = stat(u, 'maxMana');
      const regen = stat(u, 'manaRegen') * dt;
      for(const sk of acts) setSkillMana(u, sk, Math.min(mx, skillManaOf(u, sk) + regen));
    }

    // 持续伤害（中毒 / 灼烧）
    for(let i = u.dots.length - 1; i >= 0; i--){
      const d = u.dots[i];
      d.remain -= dt;
      d.acc += dt;
      while(d.acc >= 1){
        d.acc -= 1;
        if(u.alive && d.remain > 0){
          const lost = dealDamage(u, d.dps, { source:d.source, type:'true' }).hpLost;
          if(lost > 0) UI.float(u, '-' + fmtN(lost), 'dot');
        }
      }
      if(d.remain <= 0) u.dots.splice(i, 1);
    }

    // 临时增益到期（攻速 / 攻击等 buff）
    for(let i = u.buffs.length - 1; i >= 0; i--){
      const bf = u.buffs[i];
      if(bf.remain != null){
        bf.remain -= dt;
        if(bf.remain <= 0) u.buffs.splice(i, 1);
      }
    }
  }

  // 每秒触发的被动（腐蚀光环 / 自然再生）
  B.secAcc += dt;
  while(B.secAcc >= 1){ B.secAcc -= 1; perSecondTick(); }

  // 即时制：所有单位同时在场，各自按攻击速度独立行动
  if(!B.ending){
    for(const u of units){
      if(!u.alive) continue;
      tryCast(u);                       // 蓝条满且冷却完毕 → 立即释放技能
      u.atkTimer -= dt;                 // 普攻计时（攻速越快走得越快）
      if(u.atkTimer <= 0){
        u.atkTimer = ATTACK_INTERVAL / Math.max(0.3, stat(u, 'atkSpd'));
        if(u.statuses.stun > 0) UI.float(u, '眩晕', 'status');   // 眩晕浪费一次普攻
        else doAttack(u);
      }
    }
  }

  updateBullets(dt);

  // 胜负判定
  if(!B.ending){
    if(!G.enemies.some(u => u.alive)) B.ending = 'win';
    else if(!G.formation.some(u => u.alive)) B.ending = 'lose';
    if(B.ending){ B.endT = 0; bullets.length = 0; }
  } else {
    B.endT += dt;
    if(B.endT >= 1.0){
      const result = B.ending;
      G.battle = null;
      bullets.length = 0;
      effects.length = 0;
      onBattleEnd(result);
    }
  }
}

/* 每秒被动结算 */
function perSecondTick(){
  for(const u of allUnits()){
    if(!u.alive) continue;
    for(const sk of skillsOf(u)){
      if(sk.behavior === 'corrosion'){
        for(const e of getEnemies(u)){
          const dmg = e.maxHp * sk.pct;
          const lost = dealDamage(e, dmg, { source:u, type:'true' }).hpLost;
          if(lost > 0) UI.float(e, '-' + fmtN(lost), 'dot');
        }
      }
      if(sk.behavior === 'healLowestPerSec'){
        const allies = getAllies(u);
        if(allies.length){
          const a = lowestRatio(allies);
          const h = stat(u, sk.stat) * sk.mult;
          if(healUnit(a, h) > 0) UI.float(a, '+' + fmtN(h), 'heal');
        }
      }
    }
  }
}
function lowestRatio(arr){
  return arr.reduce((a, b) => (a.hp / Math.max(1, a.maxHp) <= b.hp / Math.max(1, b.maxHp) ? a : b));
}

/* ================= 即时制普攻 ================= */
function doAttack(u){
  if(!u.alive) return;
  if(u.statuses.disarm > 0){       // 缴械：无法普攻
    UI.float(u, '缴械', 'status');
    return;
  }
  const foes = getEnemies(u);
  if(!foes.length) return;
  const target = pickOne(foes);

  const payload = { kind:'attack', source:u, canCrit:true, canDodge:true,
                    effect:{ damage:{ type:'physical', stat:'atk', mult:1 } } };

  // 普攻类被动改写子弹效果
  for(const sk of skillsOf(u)){
    if(sk.behavior === 'attackDot'){
      payload.onHitDot = { name:sk.dot.name,
        dps: stat(u, sk.dot.stat) * sk.dot.mult, dur:sk.dot.dur, color:sk.dot.color };
    }
    if(sk.behavior === 'attackStun'){
      payload.chill = { chance:sk.chance, dur:sk.dur };
    }
    if(sk.behavior === 'cleave'){
      payload.splash = { mult:sk.mult };   // 潮汐使者：命中后溅射其他敌人
    }
  }

  spawnBullet(u, target, payload, { skill:false });
  gainMana(u, MANA_ON_ATTACK);
}

/* ================= 魔法值与技能释放 =================
 * 每个主动技能有自己独立的蓝条（独立累计 / 独立消耗）
 */
function gainMana(u, amt){
  if(!u.alive) return;
  const acts = getActiveSkills(u);
  if(!acts.length) return;
  const mx = stat(u, 'maxMana');
  for(const sk of acts) setSkillMana(u, sk, Math.min(mx, skillManaOf(u, sk) + amt));
}

function tryCast(u){
  const B = G.battle;
  if(!u.alive || !B || B.ending) return;
  if(u.statuses.stun > 0 || u.statuses.silence > 0) return;   // 眩晕/沉默无法释放
  for(const sk of getActiveSkills(u)){
    if((u.cd[sk.id] || 0) > 0) continue;
    if(skillManaOf(u, sk) < sk.cost) continue;
    castSkill(u, sk);
    return;
  }
}

function resolveTargets(u, mode){
  const foes = getEnemies(u);
  const friends = getAllies(u);
  switch(mode){
    case 'enemyLowestHp':
      return foes.length ? [foes.reduce((a,b) => a.hp <= b.hp ? a : b)] : [];
    case 'enemyLowestHpRatio':
      return foes.length ? [lowestRatio(foes)] : [];
    case 'enemyHighestHp':
      return foes.length ? [foes.reduce((a,b) => a.hp >= b.hp ? a : b)] : [];
    case 'allEnemies':  return foes.slice();
    case 'allAllies':   return friends.slice();
    case 'allyLowestHp':
      return friends.length ? [lowestRatio(friends)] : [];
    case 'enemyRandom3': {
      const copy = foes.slice();
      const out = [];
      while(copy.length && out.length < 3) out.push(copy.splice(Math.floor(Math.random()*copy.length), 1)[0]);
      return out;
    }
    case 'self': return [u];
  }
  return [];
}

function buildPayload(u, sk){
  const payload = { skill:true, source:u, color:sk.color, effect: sk.effect ? Object.assign({}, sk.effect) : {} };
  // 引燃（被动）：技能命中附加燃烧
  for(const s of skillsOf(u)){
    if(s.behavior === 'skillDot' && payload.effect.damage){
      payload.bonusDot = { name:s.dot.name,
        dps: stat(u, s.dot.stat) * s.dot.mult, dur:s.dot.dur, color:s.dot.color };
    }
  }
  return payload;
}

/* 释放技能：原地视觉效果 + 抛物线技能子弹（左右随机方向），到达后结算 */
function castSkill(u, sk){
  setSkillMana(u, sk, Math.max(0, skillManaOf(u, sk) - sk.cost));   // 只扣这条蓝条
  u.cd[sk.id] = sk.cd;
  UI.float(u, sk.name, 'skill');
  addEffect({ type:'cast', x:u.px, y:u.py, t:0, life:0.55,
              color: sk.color || '#ffffff', fx: sk.fx || 'ring' });

  // 附带的友方效果：自身立即生效，其他友军发射恢复子弹
  if(sk.allyEffect){
    applyHit(u, { skill:true, source:u, color:sk.color, effect:Object.assign({}, sk.allyEffect) });
    for(const a of getAllies(u)){
      if(a === u || !a.alive) continue;
      spawnBullet(u, a, { skill:true, source:u, color:sk.color,
                          effect:Object.assign({}, sk.allyEffect) },
                  { skill:true, color:sk.color, icon:sk.icon });
    }
  }

  const targets = resolveTargets(u, sk.targeting);
  if(!targets.length) return;
  if(sk.targeting === 'self'){            // 自身技能：原地生效
    applyHit(u, buildPayload(u, sk));
    return;
  }
  for(const t of targets){
    spawnBullet(u, t, buildPayload(u, sk), { skill:true, color:sk.color, icon:sk.icon });
  }
}

/* ================= 子弹 ================= */
function spawnBullet(from, to, payload, opt){
  const fx = from.px, fy = from.py - 14;
  const tx = to.px,   ty = to.py - 10;
  const dx = tx - fx, dy = ty - fy;
  const dist = Math.hypot(dx, dy) || 1;
  const skill = !!opt.skill;
  const b = {
    from, to, payload, skill,
    color: opt.color || (from.faction === 'player' ? '#8fe3ff' : '#ff8f8f'),
    icon: skill ? (opt.icon || null) : null,   // 技能专属图标（如斧王的 🪓）
    sx:fx, sy:fy, tx, ty, x:fx, y:fy,
    dist, p:0,
    speed: skill ? 460 : 640,
    r: skill ? 8 : 4,           // 技能子弹尺寸是普通子弹的 2 倍
    spin: 0, trail: [], ctrl: null,
  };
  if(skill){
    // 抛物线弹道，左右随机方向甩出
    const nx = -dy / dist, ny = dx / dist;
    const side = chance(0.5) ? 1 : -1;
    const amp = (70 + Math.random() * 90) * side;
    b.ctrl = { x:(fx + tx) / 2 + nx * amp, y:(fy + ty) / 2 + ny * amp - 18 };
  }
  bullets.push(b);
}

function updateBullets(dt){
  for(let i = bullets.length - 1; i >= 0; i--){
    const b = bullets[i];
    b.p += b.speed * dt / Math.max(60, b.dist);
    b.spin += dt * 12;
    if(b.p >= 1){
      bullets.splice(i, 1);
      applyHit(b.to, b.payload);
      continue;
    }
    if(b.ctrl){
      const t = b.p, it = 1 - t;
      b.x = it * it * b.sx + 2 * it * t * b.ctrl.x + t * t * b.tx;
      b.y = it * it * b.sy + 2 * it * t * b.ctrl.y + t * t * b.ty;
    } else {
      b.x = b.sx + (b.tx - b.sx) * b.p;
      b.y = b.sy + (b.ty - b.sy) * b.p;
    }
    b.trail.push({ x:b.x, y:b.y });
    // 普攻子弹拖尾缩短为 8 段，技能子弹 18 段（保留图标识别度）
    const maxTrail = b.skill ? 18 : 8;
    if(b.trail.length > maxTrail) b.trail.shift();
  }
}

/* ================= 结算 ================= */
function applyHit(target, payload){
  if(!target || !target.alive) return;
  const src = payload.source;
  const e = payload.effect || {};

  if(e.cleanse){
    target.statuses = { stun:0, silence:0, disarm:0 };
    target.dots = [];
    UI.float(target, '净化', 'good');
  }

  let dealt = 0, type = null, crit = false, dodged = false;

  if(e.damage || e.missingHp){
    let raw;
    if(e.missingHp){
      raw = (target.maxHp - target.hp) * e.missingHp;   // （最大生命 - 当前生命）× 系数
      type = 'true';
    } else {
      type = e.damage.type;
      raw = (src ? stat(src, e.damage.stat) : 0) * e.damage.mult;
      if(payload.canCrit && src && chance(stat(src, 'crit') / 100)){
        raw *= stat(src, 'critMult') / 100;
        crit = true;
      }
    }
    if(payload.canDodge && chance(stat(target, 'dodge') / 100)){
      dodged = true;
      UI.float(target, '闪避', 'miss');
    }
    if(!dodged){
      if(type === 'physical') raw *= 100 / (100 + stat(target, 'armor'));
      raw *= (1 - takenReduce(target));
      const r = dealDamage(target, raw, { source:src, type, crit });
      dealt = r.hpLost;
      if(dealt > 0) UI.float(target, '-' + fmtN(dealt) + (crit ? ' 暴击' : ''), crit ? 'crit' : 'dmg');
      else if(r.absorbed > 0) UI.float(target, '盾 -' + fmtN(r.absorbed), 'shield');
    }
  }

  // 潮汐使者（cleave）：命中后向其他敌人溅射伤害
  if(payload.splash && !dodged && src){
    for(const o of getEnemies(src)){
      if(o === target || !o.alive) continue;
      let sd = stat(src, 'atk') * payload.splash.mult * (100 / (100 + stat(o, 'armor')));
      sd *= (1 - takenReduce(o));
      const rr = dealDamage(o, sd, { source:src, type:'physical' });
      if(rr.hpLost > 0) UI.float(o, '-' + fmtN(rr.hpLost), 'dmg');
    }
  }

  // 吸血
  if(!dodged && dealt > 0 && src && src.alive){
    const ls = type === 'physical' ? stat(src, 'lifesteal')
             : type === 'magic'    ? stat(src, 'mlifesteal') : 0;
    if(ls > 0){
      const h = dealt * ls / 100;
      if(healUnit(src, h) > 0) UI.float(src, '+' + fmtN(h), 'heal');
    }
  }

  if(dodged || !target.alive) return;

  if(e.heal){
    const h = e.heal.pctMaxHp ? target.maxHp * e.heal.pctMaxHp
                            : (src ? stat(src, e.heal.stat) : 0) * e.heal.mult;
    if(healUnit(target, h) > 0) UI.float(target, '+' + fmtN(h), 'heal');
  }
  if(e.shield){
    let s = 0;
    if(e.shield.pctMaxHp) s = target.maxHp * e.shield.pctMaxHp;
    else s = (src ? stat(src, e.shield.stat) : 0) * e.shield.mult;
    target.shield += s;
    UI.float(target, '盾+' + fmtN(s), 'shield');
  }
  if(e.stun){    applyStatus(target, 'stun', e.stun);    UI.float(target, '眩晕', 'status'); }
  if(e.silence){ applyStatus(target, 'silence', e.silence); UI.float(target, '沉默', 'status'); }
  if(e.disarm){  applyStatus(target, 'disarm', e.disarm);  UI.float(target, '缴械', 'status'); }
  if(e.dot) applyDot(target, { name:e.dot.name,
    dps:(src ? stat(src, e.dot.stat) : 0) * e.dot.mult, dur:e.dot.dur, color:e.dot.color }, src);
  if(payload.bonusDot) applyDot(target, payload.bonusDot, src);
  if(payload.onHitDot) applyDot(target, payload.onHitDot, src);
  if(payload.chill && chance(payload.chill.chance)){
    applyStatus(target, 'stun', payload.chill.dur);
    UI.float(target, '冰冻', 'status');
  }
  // 临时增益（攻速 / 攻击等），带持续时间
  if(e.buff){
    target.buffs.push({ stat:e.buff.stat, mult:e.buff.mult,
                        add:e.buff.add, remain:e.buff.dur,
                        name:e.buff.name || '强化' });
    UI.float(target, e.buff.name || '强化', 'good');
  }
}

function takenReduce(u){
  let r = 0;
  for(const sk of skillsOf(u)) if(sk.behavior === 'takenReduce') r += sk.pct;
  return clamp(r, 0, 0.8);
}

/* 伤害结算：护盾先吸收，随后扣血，攻击与被击都增加魔法值 */
function dealDamage(target, amount, info){
  if(!target.alive || amount <= 0) return { hpLost:0, absorbed:0 };
  const before = target.hp;
  let dmg = amount;
  let absorbed = 0;
  if(target.shield > 0){
    absorbed = Math.min(target.shield, dmg);
    target.shield -= absorbed;
    dmg -= absorbed;
  }
  if(dmg > 0) target.hp -= dmg;

  UI.hitFlash(target);
  gainMana(target, MANA_ON_HIT);

  // 受击类被动
  for(const sk of skillsOf(target)){
    if(sk.behavior === 'shieldOnHit' && target._shieldCd <= 0){
      const s = amount * sk.pct;
      target.shield += s;
      target._shieldCd = sk.internalCd;
      UI.float(target, '盾+' + fmtN(s), 'shield');
    }
    if(sk.behavior === 'allyHealOnHit' && chance(sk.chance)){
      const allies = getAllies(target);
      if(allies.length){
        const a = lowestRatio(allies);
        const h = stat(target, sk.stat) * sk.mult;
        if(healUnit(a, h) > 0) UI.float(a, '+' + fmtN(h), 'heal');
      }
    }
    // 反击螺旋：受击后旋转反击敌方全体
    if(sk.behavior === 'counterHelix' && chance(sk.chance)){
      UI.float(target, '反击螺旋', 'skill');
      for(const e of getEnemies(target)){
        const dmg = stat(target, 'atk') * sk.mult * (100 / (100 + stat(e, 'armor')));
        const r = dealDamage(e, dmg, { source:target, type:'physical' });
        if(r.hpLost > 0) UI.float(e, '-' + fmtN(r.hpLost), 'dmg');
      }
    }
  }

  const hpLost = Math.max(0, before - target.hp);
  if(target.hp <= 0) killUnit(target, info && info.source);
  return { hpLost, absorbed };
}

function healUnit(u, amt){
  if(!u.alive || amt <= 0) return 0;
  const real = Math.min(amt, u.maxHp - u.hp);
  if(real <= 0) return 0;
  u.hp += real;
  return real;
}

function applyStatus(u, key, sec){
  u.statuses[key] = Math.max(u.statuses[key], sec);
}
function applyDot(u, dot, source){
  const exist = u.dots.find(d => d.name === dot.name);
  if(exist){
    exist.dps = Math.max(exist.dps, dot.dps);
    exist.remain = dot.dur;
    exist.acc = 0;
    exist.source = source;
    return;
  }
  if(u.dots.length >= 6) u.dots.shift();
  u.dots.push({ name:dot.name, dps:dot.dps, remain:dot.dur, acc:0, color:dot.color, source });
}

function killUnit(u, killer){
  if(!u.alive) return;
  u.alive = false;
  u.hp = 0;
  u.shield = 0;
  u.dots = [];
  if(killer && killer !== u) killer.kills++;
  addEffect({ type:'boom', x:u.px, y:u.py, t:0, life:0.75, color:'#ffb02e' });
  UI.removeUnit(u);
  UI.updateHeader();
}

/* ================= 特效 ================= */
function addEffect(e){
  if(e.type === 'boom'){
    e.parts = [];
    const colors = ['#ffd35c','#ff8a3c','#ff5252','#fff2a8'];
    for(let i = 0; i < 26; i++){
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 220;
      e.parts.push({
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        size: 2 + Math.random() * 3.5,
        color: colors[i % colors.length],
      });
    }
  }
  effects.push(e);
}

function hexA(hex, a){
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + clamp(a, 0, 1) + ')';
}

let _dpr = 1;
function resizeCanvas(){
  const cv = document.getElementById('fx');
  const field = document.getElementById('battlefield');
  if(!cv || !field) return;
  _dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = field.clientWidth, h = field.clientHeight;
  cv.width = Math.max(1, Math.round(w * _dpr));
  cv.height = Math.max(1, Math.round(h * _dpr));
  cv.style.width = w + 'px';
  cv.style.height = h + 'px';
}

function drawFX(dt){
  const cv = document.getElementById('fx');
  if(!cv || !cv.getContext) return;
  const ctx = cv.getContext('2d');
  ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
  ctx.clearRect(0, 0, cv.width / _dpr, cv.height / _dpr);

  ctx.globalCompositeOperation = 'lighter';

  // 特效推进与绘制
  for(let i = effects.length - 1; i >= 0; i--){
    const e = effects[i];
    e.t += dt;
    if(e.t >= e.life){ effects.splice(i, 1); continue; }
    const p = e.t / e.life;
    if(e.type === 'cast'){
      ctx.save();
      ctx.globalAlpha = (1 - p);
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 3.5 * (1 - p) + 1;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 8 + p * 52, 0, Math.PI * 2);
      ctx.stroke();
      if(e.fx === 'burst'){
        ctx.fillStyle = e.color;
        for(let k = 0; k < 8; k++){
          const a = (k / 8) * Math.PI * 2;
          const r = 14 + p * 34;
          ctx.beginPath();
          ctx.arc(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, 2.4 * (1 - p), 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = e.color;
        for(let k = 0; k < 6; k++){
          const a = (k / 6) * Math.PI * 2 + p * 2;
          ctx.beginPath();
          ctx.arc(e.x + Math.cos(a) * (20 + p * 22), e.y + Math.sin(a) * (20 + p * 22), 2 * (1 - p), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    } else if(e.type === 'boom'){
      // 单位阵亡爆炸
      ctx.save();
      ctx.globalAlpha = (1 - p);
      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, 16 + p * 46);
      g.addColorStop(0, 'rgba(255,240,180,' + (0.9 * (1 - p)) + ')');
      g.addColorStop(0.4, 'rgba(255,140,60,' + (0.7 * (1 - p)) + ')');
      g.addColorStop(1, 'rgba(255,60,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 16 + p * 46, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,200,120,' + (1 - p) + ')';
      ctx.lineWidth = 3 * (1 - p) + 0.5;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 6 + p * 58, 0, Math.PI * 2);
      ctx.stroke();
      const tt = e.t;
      for(const q of e.parts){
        const px = e.x + q.vx * tt;
        const py = e.y + q.vy * tt + 60 * tt * tt;
        ctx.globalAlpha = Math.max(0, 1 - p);
        ctx.fillStyle = q.color;
        ctx.beginPath();
        ctx.arc(px, py, q.size * (1 - p * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // 子弹（华丽滤镜拖尾）
  if(G.phase === 'battle'){
    ctx.lineCap = 'round';
    for(const b of bullets){
      if(b.trail.length > 1){
        if(b.skill){
          // 技能子弹：发光光带拖尾（blur 滤镜 + 分段渐变描边）
          ctx.save();
          ctx.filter = 'blur(3px)';
          ctx.strokeStyle = hexA(b.color, 0.4);
          ctx.lineWidth = b.r * 1.7;
          ctx.beginPath();
          ctx.moveTo(b.trail[0].x, b.trail[0].y);
          for(let i = 1; i < b.trail.length; i++) ctx.lineTo(b.trail[i].x, b.trail[i].y);
          ctx.stroke();
          ctx.restore();
          for(let i = 1; i < b.trail.length; i++){
            const a = i / b.trail.length;
            ctx.strokeStyle = hexA(b.color, a * 0.9);
            ctx.lineWidth = Math.max(0.8, b.r * a * 0.95);
            ctx.beginPath();
            ctx.moveTo(b.trail[i - 1].x, b.trail[i - 1].y);
            ctx.lineTo(b.trail[i].x, b.trail[i].y);
            ctx.stroke();
          }
        } else {
          // 普攻子弹：星尘拖尾 —— 一串闪烁的小亮点，越靠弹头越大越亮，尾部轻微散开
          ctx.save();
          ctx.filter = 'blur(1.2px)';
          for(let i = 0; i < b.trail.length; i++){
            const p = b.trail[i];
            const a = (i + 1) / b.trail.length;
            const tw = 0.7 + 0.3 * Math.sin(b.spin * 7 + i * 2.1);       // 闪烁
            const scat = (1 - a) * 3;                                      // 尾部散开
            const ox = Math.sin(i * 12.9898) * scat;
            const oy = Math.cos(i * 78.233) * scat;
            const rr = Math.max(0.7, b.r * 0.6 * a * tw);
            ctx.fillStyle = hexA(b.color, a * 0.85 * tw);
            ctx.beginPath();
            ctx.arc(p.x + ox, p.y + oy, rr, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
          // 靠近弹头的白色星核
          for(let i = Math.max(1, b.trail.length - 3); i < b.trail.length; i++){
            const p = b.trail[i];
            const a = i / b.trail.length;
            ctx.fillStyle = 'rgba(255,255,255,' + (a * 0.8).toFixed(2) + ')';
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(0.6, b.r * 0.32 * a), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      // 弹头光晕
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2.6);
      g.addColorStop(0, 'rgba(255,255,255,0.95)');
      g.addColorStop(0.35, hexA(b.color, 0.9));
      g.addColorStop(1, hexA(b.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 2.6, 0, Math.PI * 2);
      ctx.fill();
      if(b.skill){
        ctx.save();
        ctx.translate(b.x, b.y);
        if(b.icon){
          // 专属图标弹头：切回普通混合模式绘制（'lighter' 会把彩色 emoji 洗白）
          ctx.globalCompositeOperation = 'source-over';
          ctx.rotate(b.spin * 0.35);
          ctx.font = Math.round(b.r * 3.4) + 'px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(b.icon, 0, 1);
        } else {
          // 无图标技能：旋转白色菱形
          ctx.rotate(b.spin);
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(0, -b.r);
          ctx.lineTo(b.r * 0.72, 0);
          ctx.lineTo(0, b.r);
          ctx.lineTo(-b.r * 0.72, 0);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  ctx.globalCompositeOperation = 'source-over';
}
