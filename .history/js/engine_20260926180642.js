'use strict';

/* ================= 全局游戏状态 ================= */
const G = {
  phase:'select',        // select | battle | loot（战后装备三选一）| bless（祝福三选一）| enc（奇遇）| shop（备用）| over
  level:0,
  gold:0,
  reward:0,
  formation:[],          // 玩家单位
  enemies:[],            // 敌方单位
  currentHeroIdx:0,      // 装备选择 / 商店当前选中英雄（默认第一个）
  battle:null,
  speed:1,               // 战斗速度倍率（×1 / ×2 / ×3）
  paused:false,          // 战斗暂停（空格切换）
  /* ---- 肉鸽祝福（全局强化，可叠加） ---- */
  blessings:[],          // 已获得的祝福 id 列表
  blessRound:0,          // 已完成祝福选择的关卡（每关一次）
  encRound:0,            // 已完成奇遇事件的关卡
  blessStats:null,       // 汇总：固定属性加成
  blessPct:null,         // 汇总：百分比属性加成
  blessTaken:0,          // 汇总：受到伤害降低
  blessFlags:{},         // 汇总：特殊效果开关
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
  const arr = [];
  const heroIds = u.def.skills || [];
  /* 英雄技能按星级解锁：1 星 1 个、3 星 2 个、5 星 3 个（敌人不受星级限制） */
  const n = u.faction === 'player'
    ? Math.min(heroIds.length, starSkillCount(u.star))
    : heroIds.length;
  for(let i = 0; i < n; i++){
    const s = SKILLS[heroIds[i]];
    if(s) arr.push(s);
  }
  // 装备技能：每件装备自带的 skill 并入同一套行为分发，
  // 于是普攻 / 受击 / 每秒 / 光环 / 减伤 / 主动施法等钩子全部自动生效；
  // 同 id 只生效一次（重复购买同一装备不叠加技能效果）
  const eqs = u.equips || [];
  for(let i = 0; i < eqs.length; i++){
    const s = eqs[i] && eqs[i].skill;
    if(!s) continue;
    const sk = (typeof s === 'string') ? SKILLS[s] : s;
    if(!sk) continue;
    let dup = false;
    for(let j = 0; j < arr.length; j++){ if(arr[j].id === sk.id){ dup = true; break; } }
    if(!dup) arr.push(sk);
  }
  return arr;
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

/* 升星放大的核心属性键（百分比类属性不参与，避免溢出与失衡） */
const STAR_ATTR_KEYS = ['hp','atk','ap','armor','hpRegen','manaRegen'];

/* ================= 属性计算 =================
 * 白字 = 英雄基础属性（含升星加成），绿字 = 装备 + 被动 + 光环 + 临时增益
 */
function calcTotals(u){
  if(u._frame === _frame && u._cache) return u._cache;
  const base = u.def.base;
  if(!base.atkSpd) base.atkSpd = 1;      // 缺少攻速属性的单位默认 1.0
  const bonus = zeroObj();

  // 装备
  (u.equips || []).forEach(e => addStats(bonus, e.stats));

  const sks = skillsOf(u);
  // 被动的固定属性加成：任何被动携带的 stats 都生效（如剑舞的暴击倍数），
  // 百分比加成仅 statBuff 类被动作用于自身
  sks.forEach(sk => {
    if(sk.stats) addStats(bonus, sk.stats);
    if(sk.behavior === 'statBuff') addPctStats(base, bonus, sk.pct);
  });
  // 队友光环（含自身）
  getAllies(u).forEach(a => {
    skillsOf(a).forEach(sk => {
      if(sk.behavior === 'auraStat') addPctStats(base, bonus, sk.pct);
    });
  });
  // 血怒：每损失 10% 最大生命按 per 比例增攻（英雄 4%/10%，狂暴词缀 5%/10%）
  sks.forEach(sk => {
    if(sk.behavior === 'bloodRage'){
      const missing = u.maxHp > 0 ? Math.max(0, 1 - u.hp / u.maxHp) : 0;
      bonus.atk += base.atk * (sk.per || 0.40) * missing;
    }
  });
  // 肉鸽祝福：全局属性（仅我方生效，重复祝福可叠加）
  if(u.faction === 'player'){
    if(G.blessStats) addStats(bonus, G.blessStats);
    if(G.blessPct) addPctStats(base, bonus, G.blessPct);
    if(G.blessFlags && G.blessFlags.lowHpAtk){
      const miss2 = u.maxHp > 0 ? Math.max(0, 1 - u.hp / u.maxHp) : 0;
      bonus.atk += base.atk * 0.20 * miss2;   // 祝福·战意沸腾：每损失 10% 生命攻击 +2%
    }
  }
  // 临时增益
  (u.buffs || []).forEach(b => {
    if(b.mult && ZERO_KEYS.indexOf(b.stat) >= 0) bonus[b.stat] += base[b.stat] * b.mult;
    else if(b.add){ const o = {}; o[b.stat] = b.add; addStats(bonus, o); }
  });

  const total = zeroObj();
  ZERO_KEYS.forEach(k => total[k] = base[k] + (bonus[k] || 0));

  /* 升星加成：核心属性每星 +35%、攻速每星 +7%（大幅提高）。
     白字 / 绿字按同比例放大展示，保证面板 白字 + 绿字 = 实际总值。 */
  const sMul = starAttrMul(u.star);
  const spdMul = starSpdMul(u.star);
  let showBase = base;
  if(sMul !== 1 || spdMul !== 1){
    showBase = {};
    ZERO_KEYS.forEach(k => { showBase[k] = base[k]; });
    STAR_ATTR_KEYS.forEach(k => {
      showBase[k] = base[k] * sMul;
      bonus[k] = (bonus[k] || 0) * sMul;
      total[k] *= sMul;
    });
    showBase.atkSpd = base.atkSpd * spdMul;
    bonus.atkSpd = (bonus.atkSpd || 0) * spdMul;
    total.atkSpd *= spdMul;
  }

  total.dodge = clamp(total.dodge, 0, 75);
  total.crit   = clamp(total.crit, 0, 100);
  total.atkSpd = clamp(total.atkSpd, 0.3, 5);
  total.atk    = Math.max(0, total.atk);        // 负向减攻（龙威）不会跌破 0
  total.armor  = Math.max(-90, total.armor);    // 破甲（龙息）不会低到减免 90% 以上

  u._frame = _frame;
  u._cache = { base: showBase, bonus, total };
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
    dmgDealt: 0,          // 本关累计输出（商店输出榜用）
    hp: 1, maxHp: 1, skillMana: {}, shield: 0,
    hpDelayed: 1, dropActive: false, delayT: 0,
    atkTimer: 0,
    star: 1, equips: [],
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

/* ================= 升星 =================
 * 每星：核心属性 +35%、攻速 +7%；3 星解锁第 2 个技能、5 星解锁第 3 个。
 * 只有我方英雄可升星，花费金币（20 / 40 / 60 / 80）。 */
function starUp(u){
  if(!u || u.faction !== 'player') return { ok:false, msg:'❌ 只有我方英雄可以升星' };
  if(u.star >= STAR_MAX) return { ok:false, msg:'❌ ' + u.def.name + ' 已经满星（' + STAR_MAX + '★）' };
  const cost = STAR_COST[u.star] || 0;
  if(G.gold < cost) return { ok:false, msg:'❌ 金币不足：升到 ' + (u.star + 1) + ' 星需要 ' + cost + ' 金币' };
  G.gold -= cost;
  const before = starSkillCount(u.star);
  u.star++;
  u._frame = -1;
  refreshMaxHp(u);
  const after = starSkillCount(u.star);
  let msg = '⭐ ' + u.def.name + ' 升到 ' + u.star + ' 星！核心属性 ×' +
            starAttrMul(u.star).toFixed(2) + '、攻速 ×' + starSpdMul(u.star).toFixed(2);
  if(after > before){
    const sk = SKILLS[(u.def.skills || [])[after - 1]];
    if(sk) msg += '，解锁技能「' + sk.name + '」';
  }
  return { ok:true, msg: msg + '！' };
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
/* 敌方词缀：第 6 关起精英/Boss 随机携带，中后期敌人更具威胁与变化 */
function rollAffixes(type, level){
  if(level < 6) return [];
  const pool = ['affixFrenzy','affixLifesteal','affixThorns',
                'affixIron','affixArcane','affixSwift'];
  let n = 0;
  if(type === 'eliteBoss')     n = 2;
  else if(type === 'boss')     n = level >= 12 ? 2 : 1;
  else if(type === 'elite')    n = 1;
  else return [];
  const out = [];
  let guard = 0;
  while(out.length < n && guard++ < 30){
    const a = pickOne(pool);
    if(out.indexOf(a) < 0) out.push(a);
  }
  return out;
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
    skills: T.skills.slice().concat(rollAffixes(type, level)),
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
    u.dmgDealt = 0;       // 本关输出统计清零
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
    u._atkN = 0;              // 剑舞：普攻计数（每第 N 刀必暴）
    u._lastStandDone = false; // 回光返照：每场一次
    u.hpDelayed = u.hp;
    u.dropActive = false;
    // 即时制：错峰安排首次普攻时间，避免所有单位同时出手
    u.atkTimer = 0.35 + Math.random() * 0.9;
  });

  // 肉鸽祝福：开局满蓝 / 开局护盾（仅我方）
  if(G.blessFlags){
    if(G.blessFlags.fullMana){
      G.formation.forEach(x => {
        if(!x.alive) return;
        getActiveSkills(x).forEach(sk => setSkillMana(x, sk, stat(x, 'maxMana')));
      });
    }
    if(G.blessFlags.openShield){
      G.formation.forEach(x => {
        if(!x.alive) return;
        const s = x.maxHp * 0.12;
        x.shield += s;
        UI.float(x, '盾+' + fmtN(s), 'shield');
      });
    }
  }

  G.battle = {
    secAcc: 0,
    ending: null,
    endT: 0,
    elapsed: 0,           // 战斗已进行秒数（风暴计时）
    rageAcc: 0,
    stormed: false,
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

    // 技能无冷却：蓝条满即自动释放；仅装备护盾保留内置 CD
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

  // 风暴：战斗超过 90 秒后全场按最大生命百分比持续掉血（每 60 秒+1 级），
  // 防止高回复阵容把战斗拖成无限长；双方都受伤害，撑得久的一方获胜
  if(!B.ending){
    B.elapsed += dt;
    if(B.elapsed >= 90){
      B.rageAcc += dt;
      while(B.rageAcc >= 1){
        B.rageAcc -= 1;
        const stormLv = Math.floor((B.elapsed - 90) / 60);
        const pct = 0.04 + Math.min(0.06, stormLv * 0.02);   // 4% → 10% 最大生命/秒
        for(const u of allUnits()){
          if(!u.alive) continue;
          // 祝福·风暴行者：我方受到的风暴伤害减半
          let sp = pct;
          if(u.faction === 'player' && G.blessFlags && G.blessFlags.stormGuard) sp *= 0.5;
          const r = dealDamage(u, u.maxHp * sp, { type:'true' });
          if(r.hpLost > 0) UI.float(u, '🌪-' + fmtN(r.hpLost), 'dot');
        }
        if(!B.stormed){
          B.stormed = true;
          const flag = document.getElementById('turnFlag');
          if(flag) flag.textContent = '🌪 风暴来袭！全场持续掉血，速战速决';
        }
      }
    }
  }

  // 即时制：所有单位同时在场，各自按攻击速度独立行动
  if(!B.ending){
    for(const u of units){
      if(!u.alive) continue;
      tryCast(u);                       // 蓝条满 → 立即释放技能（无冷却）
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
    // 祝福·生命涌动：我方每秒回复 0.8% 最大生命
    if(u.faction === 'player' && G.blessFlags && G.blessFlags.hots){
      const h = u.maxHp * 0.008;
      if(u.hp < u.maxHp && healUnit(u, h) > 0) UI.float(u, '+' + fmtN(h), 'heal');
    }
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
/* 按排加权选目标：70% 前排 / 20% 中排 / 10% 后排（所选排无人则按权重顺序回退） */
function pickRowTarget(foes){
  const rows = { front:[], mid:[], back:[] };
  for(const f of foes){
    const k = (f.posType === 'front' || f.posType === 'back') ? f.posType : 'mid';
    rows[k].push(f);
  }
  const r = Math.random();
  const order = r < 0.70 ? ['front', 'mid', 'back']     // 70% 打前排
              : r < 0.90 ? ['mid', 'front', 'back']     // 20% 打中排
                         : ['back', 'front', 'mid'];    // 10% 打后排
  for(const k of order) if(rows[k].length) return pickOne(rows[k]);
  return pickOne(foes);
}

function doAttack(u){
  if(!u.alive) return;
  if(u.statuses.disarm > 0){       // 缴械：无法普攻
    UI.float(u, '缴械', 'status');
    return;
  }
  const foes = getEnemies(u);
  if(!foes.length) return;
  const target = pickRowTarget(foes);

  const payload = { kind:'attack', source:u, canCrit:true, canDodge:true,
                    effect:{ damage:{ type:'physical', stat:'atk', mult:1 } } };

  // 剑舞：普攻计数，每第 N 刀必定暴击
  u._atkN = (u._atkN || 0) + 1;

  // 普攻类被动改写子弹效果（同时装备多件时取最强的一条，互不覆盖）
  for(const sk of skillsOf(u)){
    if(sk.behavior === 'assureCrit' && u._atkN % (sk.every || 3) === 0){
      payload.forceCrit = true;
    }
    if(sk.behavior === 'attackDot'){
      const dps = stat(u, sk.dot.stat) * sk.dot.mult;
      if(!payload.onHitDot || dps > payload.onHitDot.dps)
        payload.onHitDot = { name:sk.dot.name, dps, dur:sk.dot.dur, color:sk.dot.color };
    }
    if(sk.behavior === 'attackStun'){
      if(!payload.chill || sk.chance > payload.chill.chance)
        payload.chill = { chance:sk.chance, dur:sk.dur, name:sk.name };   // 浮字用技能本名（如 碎骨一击）
    }
    if(sk.behavior === 'cleave'){
      if(!payload.splash || sk.mult > payload.splash.mult)
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
    if(skillManaOf(u, sk) < sk.cost) continue;   // 蓝条满（够耗蓝）即直接释放
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
  // 引燃（被动）：技能命中附加燃烧（多件取最强）
  for(const s of skillsOf(u)){
    if(s.behavior === 'skillDot' && payload.effect.damage){
      const dps = stat(u, s.dot.stat) * s.dot.mult;
      if(!payload.bonusDot || dps > payload.bonusDot.dps)
        payload.bonusDot = { name:s.dot.name, dps, dur:s.dot.dur, color:s.dot.color };
    }
  }
  return payload;
}

/* 释放技能：原地视觉效果 + 抛物线技能子弹（左右随机方向），到达后结算 */
function castSkill(u, sk){
  setSkillMana(u, sk, Math.max(0, skillManaOf(u, sk) - sk.cost));   // 只扣这条蓝条
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

  // 自身附带效果（如剑刃风暴给自己套盾）
  if(sk.selfEffect){
    applyHit(u, { skill:true, source:u, color:sk.color,
                  effect:Object.assign({}, sk.selfEffect) });
  }
  // 对全体友军的增益（如幽灵船的朗姆酒：全队护甲提升）
  if(sk.allyBuff){
    for(const a of getAllies(u)) applyBuff(a, sk.allyBuff);
  }

  const targets = resolveTargets(u, sk.targeting);
  if(!targets.length) return;
  if(sk.targeting === 'self'){            // 自身技能：原地生效
    applyHit(u, buildPayload(u, sk));
    return;
  }
  if(sk.fx === 'lightning'){
    // 闪电链：逐段跳跃传递，雷电击中目标的瞬间才结算伤害（无弹道）
    castLightningFx(u, targets, sk);
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
    // 普攻光痕拖尾 12 段（保证“划过留痕”可见），技能子弹 12 段（保留图标识别度）
    const maxTrail = 12;
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
    if(payload.forceCrit) crit = true;   // 剑舞：第 N 刀强制暴击
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
    UI.float(target, payload.chill.name || '冰冻', 'status');
  }
  // 临时增益（正/负向均可：如冰缓减攻速、龙威减攻、龙息破甲）
  if(e.buff) applyBuff(target, e.buff);
  if(e.buffs) for(const b of e.buffs) applyBuff(target, b);
  // 处决：目标生命低于阈值直接斩杀（斧王·斩杀）
  if(e.execute && target.alive && target.hp <= target.maxHp * e.execute){
    UI.float(target, '处决!', 'crit');
    killUnit(target, src);
  }
}

function takenReduce(u){
  let r = 0;
  for(const sk of skillsOf(u)) if(sk.behavior === 'takenReduce') r += sk.pct;
  if(u.faction === 'player') r += (G.blessTaken || 0);   // 祝福·铁壁
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
  // 祝福·能量涌动：受击额外获得 3 魔法值
  gainMana(target, MANA_ON_HIT +
    (target.faction === 'player' && G.blessFlags && G.blessFlags.manaHit ? 3 : 0));

  // 受击类被动
  for(const sk of skillsOf(target)){
    // 回光返照：生命首次低于阈值 → 反转生死（每场一次）
    if(sk.behavior === 'lastStand' && !target._lastStandDone &&
       target.alive && target.hp > 0 && target.hp <= target.maxHp * sk.pct){
      target._lastStandDone = true;
      const ha = target.maxHp * (sk.heal || 0.25);
      target.hp = Math.min(target.maxHp, target.hp + ha);
      target.statuses = { stun:0, silence:0, disarm:0 };
      target.dots = [];
      const sa = target.maxHp * (sk.shield || 0.15);
      target.shield += sa;
      UI.float(target, '回光返照!', 'good');
      addEffect({ type:'cast', x:target.px, y:target.py, t:0, life:0.6,
                  color:'#6bffc8', fx:'ring' });
    }
    // 荆棘词缀：反弹真实伤害（noThorns 防止无限递归）
    if(sk.behavior === 'thorns' && info && !info.noThorns &&
       info.source && info.source !== target && info.source.alive){
      const td = stat(target, 'atk') * sk.mult;
      const rr = dealDamage(info.source, td, { source:target, type:'true', noThorns:true });
      if(rr.hpLost > 0) UI.float(info.source, '-' + fmtN(rr.hpLost), 'dmg');
    }
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
  // 输出统计：记录伤害来源的本关累计输出（商店顶部输出榜）
  const dmgSrc = info && info.source;
  if(hpLost > 0 && dmgSrc && dmgSrc.dmgDealt != null) dmgSrc.dmgDealt += hpLost;
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
/* 施加临时增益/减益（mult 为百分比、add 为固定值；负数即为减益） */
function applyBuff(u, b){
  if(!u || !b) return;
  u.buffs.push({ stat:b.stat, mult:b.mult, add:b.add, remain:b.dur,
                 name:b.name || '强化' });
  const neg = (b.mult != null && b.mult < 0) || (b.add != null && b.add < 0);
  UI.float(u, b.name || '强化', neg ? 'status' : 'good');
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
  if(killer && killer !== u){
    killer.kills++;
    if(killer.alive && killer.faction === 'player'){
      // 魂之挽歌：击杀敌人 → 立即回蓝（影魔收割滚雪球，技能无冷却）
      for(const sk of skillsOf(killer)){
        if(sk.killMana){
          gainMana(killer, sk.killMana);
          UI.float(killer, '灵魂收割!', 'skill');
        }
      }
      // 祝福·战意汲取：击杀回复 15% 最大生命
      if(G.blessFlags && G.blessFlags.killHeal){
        const h = killer.maxHp * 0.15;
        if(healUnit(killer, h) > 0) UI.float(killer, '+' + fmtN(h), 'heal');
      }
    }
  }
  addEffect({ type:'boom', x:u.px, y:u.py, t:0, life:0.75, color:'#ffb02e' });
  UI.removeUnit(u);
  UI.updateHeader();
}

/* ================= 特效 ================= */
/* ---- 雷电几何：中点位移折线 + 随机分支 ---- */
function genBoltPts(x1, y1, x2, y2, rough){
  let pts = [{ x:x1, y:y1 }, { x:x2, y:y2 }];
  let o = rough;
  while(o > 3){
    const next = [pts[0]];
    for(let i = 1; i < pts.length; i++){
      const a = pts[i - 1], b = pts[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const off = (Math.random() * 2 - 1) * o;
      next.push({ x: (a.x + b.x) / 2 + (-dy / len) * off,
                  y: (a.y + b.y) / 2 + ( dx / len) * off });
      next.push(b);
    }
    pts = next;
    o *= 0.52;
  }
  return pts;
}

function genBoltBranches(main, count){
  const out = [];
  const total = main.length - 1;
  if(total < 3) return out;
  for(let k = 0; k < count; k++){
    const idx = 1 + Math.floor(Math.random() * Math.max(1, total - 2));
    if(idx >= total - 1) continue;
    const p0 = main[idx], end = main[total];
    const baseAng = Math.atan2(end.y - p0.y, end.x - p0.x);
    const ang = baseAng + (Math.random() < 0.5 ? 1 : -1) * (0.45 + Math.random() * 0.55);
    const len = Math.hypot(end.x - p0.x, end.y - p0.y) * (0.25 + Math.random() * 0.3) + 18;
    const ex = p0.x + Math.cos(ang) * len;
    const ey = p0.y + Math.sin(ang) * len;
    out.push({
      pts: genBoltPts(p0.x, p0.y, ex, ey, Math.min(26, len * 0.4)),
      at: idx / total,
    });
  }
  return out;
}

function makeSparks(x, y, color){
  const out = [];
  for(let i = 0; i < 8; i++){
    const a = Math.random() * Math.PI * 2;
    const sp = 50 + Math.random() * 150;
    out.push({
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 50,
      size: 1.4 + Math.random() * 2.2,
      c: [color, '#ffffff', '#fff6c0'][i % 3],
    });
  }
  return out;
}

function makeLightning(main, hits, opt){
  const e = {
    type:'lightning', t:0, life: opt.life || 0.5,
    color: opt.color || '#9fd0ff',
    seed: Math.random() * 100,
    main, hits,
    branches: genBoltBranches(main, opt.branches == null ? 3 : opt.branches),
    revealT: opt.revealT || 0.24,
    seg: opt.seg || 0,          // 闪电链每次跳跃传递的耗时
    marks: opt.marks || null,   // 各目标在主干折线上的点索引（分段揭示 / 到达同步）
  };
  for(const h of hits){
    if(h.at == null) h.at = e.revealT;
    h.done = false;
    if(!h.sparks) h.sparks = makeSparks(h.x, h.y, e.color);
  }
  return e;
}

/* 施放闪电链：逐段跳跃传递，雷电抵达目标的瞬间经 onHit 结算伤害
   雷神之怒（allEnemies）：天雷从天顶直击首目标，再向其余敌人连锁传递；
   弧形闪电等：雷电从施法者出手，链式弹跳穿过所有目标 */
function castLightningFx(u, targets, sk){
  const col = sk.color || '#9fd0ff';
  const sky = sk.targeting === 'allEnemies';
  const nodes = [];
  if(sky){
    // 雷神之怒：全屏白金闪光 + 天雷从天顶直击第一个目标
    const f0 = targets[0];
    addEffect({ type:'flash', t:0, life:0.34, color:'#fff4c0', amp:0.26 });
    nodes.push({ x: f0.px + (Math.random() * 36 - 18), y: 6 });
    nodes.push({ x: f0.px, y: f0.py - 10 });
    for(let i = 1; i < targets.length; i++)
      nodes.push({ x: targets[i].px, y: targets[i].py - 10 });
  } else {
    nodes.push({ x: u.px, y: u.py - 14 });
    for(const t of targets) nodes.push({ x: t.px, y: t.py - 10 });
  }
  // 逐段生成锯齿折线并拼接；marks 记录每个目标的抵达点索引
  const main = [nodes[0]];
  const marks = [0];
  for(let i = 1; i < nodes.length; i++){
    const a = nodes[i - 1], b = nodes[i];
    const dist = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const rough = Math.min(sky && i === 1 ? 42 : 40, Math.max(12, dist * 0.17));
    const seg = genBoltPts(a.x, a.y, b.x, b.y, rough);
    for(let j = 1; j < seg.length; j++) main.push(seg[j]);
    marks.push(main.length - 1);
  }
  const segDur = sky ? 0.075 : 0.09;   // 每次跳跃传递的间隔（秒）
  const revealT = (nodes.length - 1) * segDur;
  const hits = [];
  for(let i = 0; i < targets.length; i++){
    const t = targets[i];
    // 第 i 个目标在第 i+1 段抵达时被击中并结算（击打传递）
    hits.push({
      x: t.px, y: t.py - 10,
      at: (i + 1) * segDur,
      onHit: () => applyHit(t, buildPayload(u, sk)),
    });
  }
  addEffect(makeLightning(main, hits,
    { color: col, branches: sky ? 2 : 3,
      life: revealT + 0.3, revealT, seg: segDur, marks }));
}

/* 沿折线描边到进度 f（0~1，按段推进） */
function strokeBoltPath(ctx, pts, f){
  if(f <= 0 || !pts.length) return false;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  if(f >= 1){
    for(let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    return true;
  }
  const total = pts.length - 1;
  const exact = f * total;
  const n = Math.floor(exact);
  for(let i = 1; i <= n; i++) ctx.lineTo(pts[i].x, pts[i].y);
  const frac = exact - n;
  if(n < total){
    const a = pts[n], b = pts[n + 1];
    ctx.lineTo(a.x + (b.x - a.x) * frac, a.y + (b.y - a.y) * frac);
  }
  return true;
}

function strokeBolt(ctx, pts, f, style, width){
  if(!strokeBoltPath(ctx, pts, f)) return;
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.stroke();
}

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
      if(e.fx === 'burst' || e.fx === 'lightning'){
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
    } else if(e.type === 'lightning'){
      // 闪电链：雷电抵达目标的瞬间结算伤害（击打传递）
      for(const h of e.hits){
        if(!h.done && e.t >= h.at){
          h.done = true;
          if(h.onHit) h.onHit();
        }
      }
      // 揭示进度：按段耗时映射到折线点索引（视觉抵达与伤害结算严格同步）
      let f;
      if(e.marks && e.marks.length > 1 && e.seg > 0){
        const last = e.marks[e.marks.length - 1];
        const k = clamp(Math.floor(e.t / e.seg), 0, e.marks.length - 2);
        const su = clamp((e.t - k * e.seg) / e.seg, 0, 1);
        f = (e.marks[k] + (e.marks[k + 1] - e.marks[k]) * su) / last;
      } else {
        f = Math.min(1, e.t / e.revealT);
      }
      // 雷电：白热核心 + 彩色辉光 + 高频闪烁 + 分支电弧
      const flick = 0.6 + 0.4 * Math.abs(Math.sin(e.t * 64 + e.seed));
      const a = Math.pow(1 - p, 1.35) * flick;
      ctx.save();
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      strokeBolt(ctx, e.main, f, hexA(e.color, 0.18 * a), 13);
      strokeBolt(ctx, e.main, f, hexA(e.color, 0.5 * a), 6);
      strokeBolt(ctx, e.main, f, 'rgba(255,255,255,' + (0.95 * a) + ')', 2.4);
      for(const br of e.branches){
        const bf = clamp((f - br.at) / 0.4, 0, 1);
        if(bf <= 0) continue;
        strokeBolt(ctx, br.pts, bf, hexA(e.color, 0.14 * a), 7);
        strokeBolt(ctx, br.pts, bf, hexA(e.color, 0.42 * a), 3);
        strokeBolt(ctx, br.pts, bf, 'rgba(255,255,255,' + (0.72 * a) + ')', 1.2);
      }
      ctx.restore();
      // 各命中点：抵达后 白热闪斑 + 扩散电环 + 电火花（从命中时刻起算）
      ctx.save();
      for(const h of e.hits){
        if(e.t < h.at) continue;   // 雷电尚未传到这里：不发光
        const hp = clamp((e.t - h.at) / Math.max(0.01, e.life - h.at), 0, 1);
        const ha = Math.pow(1 - hp, 1.5);
        const R = 10 + 30 * (1 - ha);
        const g = ctx.createRadialGradient(h.x, h.y, 0, h.x, h.y, R);
        g.addColorStop(0, 'rgba(255,255,255,' + (0.95 * ha) + ')');
        g.addColorStop(0.4, hexA(e.color, 0.65 * ha));
        g.addColorStop(1, hexA(e.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(h.x, h.y, R, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = hexA('#ffffff', 0.7 * ha);
        ctx.lineWidth = 1.5 + 2 * ha;
        ctx.beginPath();
        ctx.arc(h.x, h.y, 8 + (1 - ha) * 34, 0, Math.PI * 2);
        ctx.stroke();
        const et = e.t - h.at;
        for(const s of (h.sparks || [])){
          const sx = h.x + s.vx * et;
          const sy = h.y + s.vy * et + 240 * et * et;
          ctx.fillStyle = hexA(s.c, Math.max(0, ha * 0.9));
          ctx.beginPath();
          ctx.arc(sx, sy, Math.max(0.4, s.size * (1 - hp * 0.7)), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    } else if(e.type === 'flash'){
      // 全屏闪光（雷神之怒）
      const w = cv.width / _dpr, h = cv.height / _dpr;
      ctx.fillStyle = hexA(e.color || '#ffffff', (e.amp || 0.22) * (1 - p) * (1 - p));
      ctx.fillRect(0, 0, w, h);
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
          // 普攻子弹：渐变光痕 —— 整条轨迹一次渐变描边，划过留下连续痕迹
          // （不使用 ctx.filter，逐段 blur 太卡；渐变 + lighter 同样有“滤镜感”且开销极低）
          const head = b.trail[b.trail.length - 1];
          const tail = b.trail[0];
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          const path = () => {
            ctx.beginPath();
            ctx.moveTo(tail.x, tail.y);
            for(let i = 1; i < b.trail.length; i++) ctx.lineTo(b.trail[i].x, b.trail[i].y);
          };
          // ① 外层辉光带：尾部透明 → 弹头处发散
          const g1 = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
          g1.addColorStop(0, hexA(b.color, 0));
          g1.addColorStop(0.5, hexA(b.color, 0.18));
          g1.addColorStop(1, hexA(b.color, 0.55));
          ctx.strokeStyle = g1;
          ctx.lineWidth = b.r * 1.7;
          path();
          ctx.stroke();
          // ② 内层亮痕：更细更亮的实色光带
          const g2 = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
          g2.addColorStop(0, hexA(b.color, 0));
          g2.addColorStop(0.6, hexA(b.color, 0.5));
          g2.addColorStop(1, hexA(b.color, 1));
          ctx.strokeStyle = g2;
          ctx.lineWidth = Math.max(1, b.r * 0.75);
          path();
          ctx.stroke();
          // ③ 弹头白色灼痕芯线（最后 4 段，单次描边）
          const st = Math.max(1, b.trail.length - 4);
          ctx.strokeStyle = 'rgba(255,255,255,0.8)';
          ctx.lineWidth = Math.max(0.7, b.r * 0.4);
          ctx.beginPath();
          ctx.moveTo(b.trail[st - 1].x, b.trail[st - 1].y);
          for(let i = st; i < b.trail.length; i++) ctx.lineTo(b.trail[i].x, b.trail[i].y);
          ctx.stroke();
          ctx.restore();
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
