'use strict';

/* ================= 肉鸽祝福系统（战后全局强化三选一） =================
 * 每关通关、英雄装备全部选完后 → 祝福三选一 → 可能触发奇遇 → 下一关。
 * 祝福是全局被动强化，可重复叠加；通过 recomputeBless() 汇总到 G.bless*，
 * 再由 engine.js 的 calcTotals / castSkill / startBattle / killUnit 等挂点生效。
 * 稀有度：1 普通（白） / 2 稀有（紫） / 3 史诗（金），史诗效果多为机制型。
 */
const BLESSINGS = [
  /* ---------- 普通（白）：稳定属性 ---------- */
  { id:'b_str',     rarity:1, icon:'❤️', name:'力量祝福',
    desc:'全队生命上限 +10%。', pct:{ hp:0.10 } },
  { id:'b_atk',     rarity:1, icon:'⚔️', name:'破甲之刃',
    desc:'全队攻击 +8%。', pct:{ atk:0.08 } },
  { id:'b_ap',      rarity:1, icon:'✨', name:'奥术智慧',
    desc:'全队法强 +10%。', pct:{ ap:0.10 } },
  { id:'b_armor',   rarity:1, icon:'🛡️', name:'坚韧',
    desc:'全队护甲 +8。', stats:{ armor:8 } },
  { id:'b_regen',   rarity:1, icon:'🌱', name:'生机',
    desc:'全队生命恢复速度 +4/秒。', stats:{ hpRegen:4 } },
  { id:'b_mana',    rarity:1, icon:'💧', name:'法力涌流',
    desc:'全队魔法恢复速度 +3/秒。', stats:{ manaRegen:3 } },
  { id:'b_spd',     rarity:1, icon:'⚡', name:'疾风',
    desc:'全队攻击速度 +0.06。', stats:{ atkSpd:0.06 } },

  /* ---------- 稀有（紫）：进阶属性与机制 ---------- */
  { id:'b_crit',    rarity:2, icon:'🎯', name:'致命精准',
    desc:'全队暴击率 +8%。', stats:{ crit:8 } },
  { id:'b_ls',      rarity:2, icon:'🩸', name:'嗜血',
    desc:'全队物理吸血 +8%。', stats:{ lifesteal:8 } },
  { id:'b_mls',     rarity:2, icon:'🔮', name:'法术虹吸',
    desc:'全队魔法吸血 +10%。', stats:{ mlifesteal:10 } },
  { id:'b_dodge',   rarity:2, icon:'💨', name:'闪避大师',
    desc:'全队闪避 +6%。', stats:{ dodge:6 } },
  { id:'b_mcap',    rarity:2, icon:'🧿', name:'魔力扩容',
    desc:'全队最大魔法值 +25，蓝条更长、技能更快就绪。', stats:{ maxMana:25 } },
  { id:'b_lowhp',   rarity:2, icon:'💢', name:'战意沸腾',
    desc:'全队每损失 10% 生命，攻击 +2%。', flag:'lowHpAtk' },
  { id:'b_killheal',rarity:2, icon:'☘️', name:'战意汲取',
    desc:'我方击杀敌人时，回复 15% 最大生命。', flag:'killHeal' },
  { id:'b_manahit', rarity:2, icon:'🔋', name:'能量涌动',
    desc:'我方受击时额外获得 3 魔法值，技能更频繁。', flag:'manaHit' },

  /* ---------- 史诗（金）：改变玩法的机制祝福 ---------- */
  { id:'b_fullmana',rarity:3, icon:'🌟', name:'先发制人',
    desc:'战斗开始时，全队所有技能直接满蓝。', flag:'fullMana' },
  { id:'b_openshield',rarity:3, icon:'🔰', name:'开战护盾',
    desc:'战斗开始时，全队获得 12% 最大生命的护盾。', flag:'openShield' },
  { id:'b_amp',     rarity:3, icon:'🔥', name:'战神附体',
    desc:'全队攻击 +15%、暴击率 +8%。', pct:{ atk:0.15 }, stats:{ crit:8 } },
  { id:'b_fort',    rarity:3, icon:'🏰', name:'铁壁',
    desc:'全队受到的所有伤害降低 6%（可叠加）。', taken:0.06 },
  { id:'b_storm',   rarity:3, icon:'🌪️', name:'风暴行者',
    desc:'风暴对我方的伤害减半，拖得起。', flag:'stormGuard' },
  { id:'b_hots',    rarity:3, icon:'🌿', name:'生命涌动',
    desc:'全队每秒回复 0.8% 最大生命。', flag:'hots' },
  { id:'b_gold',    rarity:3, icon:'💰', name:'贪婪印契',
    desc:'每关通关额外获得 20 金币。', flag:'bonusGold' },
];

const RARITY_NAMES = { 1:'普通', 2:'稀有', 3:'史诗' };
const RARITY_COLORS = { 1:'#c8d2e0', 2:'#c07bff', 3:'#ffb02e' };

/* 汇总所有已拥有祝福 → G.bless*，并使属性缓存失效 */
function recomputeBless(){
  G.blessStats = zeroObj();
  G.blessPct = zeroObj();
  G.blessTaken = 0;
  G.blessFlags = {};
  const list = G.blessings || [];
  for(let i = 0; i < list.length; i++){
    const b = BLESSINGS.find(x => x.id === list[i]);
    if(!b) continue;
    if(b.stats) addStats(G.blessStats, b.stats);
    if(b.pct) for(const k in b.pct) G.blessPct[k] = (G.blessPct[k] || 0) + b.pct[k];
    if(b.taken) G.blessTaken += b.taken;
    if(b.flag) G.blessFlags[b.flag] = true;
  }
  G.blessTaken = Math.min(0.4, G.blessTaken);  // 减伤上限 40%
  (G.formation || []).forEach(u => { u._frame = -1; });   // 使面板缓存失效
}

/* 从祝福池加权随机 n 个（已拥有越多权重越低，保证新意；允许重复叠加） */
function rollBlessings(n){
  const owned = G.blessings || [];
  const pool = BLESSINGS.slice();
  const out = [];
  let guard = 0;
  while(out.length < n && pool.length && guard++ < 50){
    let total = 0;
    const w = pool.map(b => {
      const cnt = owned.filter(x => x === b.id).length + out.filter(x => x === b.id).length;
      const ww = Math.pow(0.5, cnt);           // 每已拥有一个，权重减半
      total += ww;
      return ww;
    });
    let r = Math.random() * total;
    let pick = pool[pool.length - 1];
    for(let i = 0; i < pool.length; i++){
      r -= w[i];
      if(r <= 0){ pick = pool[i]; break; }
    }
    out.push(pick);
    pool.splice(pool.indexOf(pick), 1);
  }
  return out;
}

const Bless = {
  options: [],   // 本次三选一候选
  msg: null,

  open(){
    G.phase = 'bless';
    this.options = rollBlessings(3);
    this.msg = null;
    UI.setScreen('bless');
    this.render();
    UI.updateHeader();
    Save.save();
  },

  render(){
    const owned = G.blessings || [];
    const ownedChips = owned.length
      ? owned.map(id => {
          const b = BLESSINGS.find(x => x.id === id);
          if(!b) return '';
          return '<span class="bless-chip r' + b.rarity + '" title="' + b.desc + '">' +
            b.icon + b.name + '</span>';
        }).join('')
      : '<span class="shop-hint">还没有获得任何祝福</span>';

    const html =
      '<div class="bless-wrap">' +
        '<div class="shop-top">' +
          '<span>🏆 第 <b>' + G.level + '</b> 关通过！</span>' +
          '<span>💰 金币：<b>' + G.gold + '</b></span>' +
          '<span>🌟 已获祝福：<b>' + owned.length + '</b> 个（可叠加）</span>' +
          '<span class="hint">下一关进入前，从 3 个祝福中选择 1 个（重复选择可叠加）</span>' +
        '</div>' +
        '<div class="panel bless-main">' +
          '<div class="p-title">🌟 祝福三选一 · 全局强化</div>' +
          '<div class="loot-cards bless-cards">' +
            this.options.map((b, i) => this.cardHtml(b, i)).join('') +
          '</div>' +
          (this.msg ? '<div class="loot-msg ' + this.msg.cls + '">' + this.msg.text + '</div>' : '') +
          '<div class="loot-foot">' +
            '<span class="shop-hint">已拥有祝福（点击卡片选择后继续）：</span>' +
            '<span class="bless-owned">' + ownedChips + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    const scr = document.getElementById('blessScreen');
    scr.innerHTML = html;
    scr.querySelector('.bless-cards').addEventListener('click', ev => {
      const card = ev.target.closest('.loot-card');
      if(!card) return;
      this.choose(Number(card.dataset.i));
    });
    UI.updateHeader();
  },

  cardHtml(b, i){
    const color = RARITY_COLORS[b.rarity] || RARITY_COLORS[1];
    return '<button class="loot-card bless-card r' + b.rarity + '" data-i="' + i + '"' +
      ' style="border-color:' + color + '">' +
      '<span class="lc-top"><span class="opt-ico">' + b.icon + '</span>' +
      '<span class="opt-name" style="color:' + color + '">' + b.name +
      '<span class="opt-tier" style="color:' + color + ';border-color:' + color + '66">' +
      RARITY_NAMES[b.rarity] + '</span></span>' +
      '<span class="lc-pick">选择</span></span>' +
      '<span class="lc-desc">' + b.desc + '</span>' +
      '</button>';
  },

  choose(i){
    const b = this.options[i];
    if(!b) return;
    G.blessings = G.blessings || [];
    G.blessings.push(b.id);
    G.blessRound = G.level;   // 标记本关祝福已选，afterLoot 不再重复进入
    recomputeBless();
    Save.save();
    // 祝福选完 → 回到流程链（可能触发奇遇 → 进入下一关）
    afterLoot();
  },
};
