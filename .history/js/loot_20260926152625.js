'use strict';

/* ================= 战后装备三选一（替代通关商店） =================
 * 流程：战斗胜利 → 通关金币入账 → 每位英雄依次三选一装备，
 * 或点【跳过+奖励金币】拿一笔金币 → 全部英雄选完 → 进入下一关。
 * 商店（js/shop.js）代码保留备用，流程不再调用它。
 */
const Loot = {
  options: [],     // 当前英雄的 3 件候选装备
  eqTier: 1,       // 本轮装备档位（随下一关关数提高，1~5 档）
  nextNo: 1,       // 下一关关数
  skipGold: 0,     // 跳过奖励金币
  msg: null,       // 结果反馈 { text, cls }

  currentHero(){ return G.formation[G.currentHeroIdx] || null; },

  /* ---------- 战斗胜利后开始本轮装备选择 ---------- */
  open(){
    const nl = (typeof MAX_LEVEL !== 'undefined') ? Math.min(MAX_LEVEL, G.level + 1) : G.level + 1;
    this.nextNo = nl;
    // 档位随关卡提高：每 4 关解锁一档（1~5 档），与原商店一致
    this.eqTier = Math.min(5, Math.max(1, Math.ceil(nl / 4)));
    // 跳过奖励与档位对齐：1 档 10 金 … 5 档 50 金
    this.skipGold = this.eqTier * 10;
    if(G.currentHeroIdx >= G.formation.length) G.currentHeroIdx = 0;
    this.msg = null;
    this.roll();
    UI.setScreen('loot');
    UI.info('unit', this.currentHero());
    UI.updateHeader();
    Save.save();
  },

  /* ---------- 为当前英雄随机 3 件候选装备 ---------- */
  roll(){
    const picked = new Set();
    const out = [];
    const take = (arr, k) => {
      const c = arr.filter(e => !picked.has(e.id));
      for(let i = 0; i < k && c.length; i++){
        const e = c.splice(Math.floor(Math.random() * c.length), 1)[0];
        picked.add(e.id);
        out.push(e);
      }
    };
    // 当前档 2 件 + 已解锁档随机 1 件；不足时从全部装备补齐（保证三选一）
    take(EQUIPS.filter(e => e.tier === this.eqTier), 2);
    take(EQUIPS.filter(e => e.tier >= 1 && e.tier <= this.eqTier), 3 - out.length);
    if(out.length < 3) take(EQUIPS.slice(), 3 - out.length);
    this.options = out;
  },

  /* ---------- 渲染 ---------- */
  render(){
    const hero = this.currentHero();
    const nl = this.nextNo;
    const total = (typeof MAX_LEVEL !== 'undefined') ? MAX_LEVEL : '?';
    const isBoss = (typeof isBossLevel === 'function') && isBossLevel(nl);
    const nextCount = rollEnemyCount(nl);
    const nextTypes = rollEnemyTypes(nl);
    const typeCount = {};
    nextTypes.forEach(t => typeCount[t] = (typeCount[t] || 0) + 1);
    const typeStr = Object.keys(typeCount).map(t => ENEMY_TYPES[t].name + '×' + typeCount[t]).join('、');
    // 上关输出榜：按本关累计输出取前 3 名
    const dmgBoard = G.formation.filter(u => u.dmgDealt > 0)
      .sort((a, b) => b.dmgDealt - a.dmgDealt).slice(0, 3)
      .map(u => u.def.name + ' ' + fmtN(u.dmgDealt)).join('｜');
    const full = hero && hero.equips.length >= 6;

    const html =
      '<div class="loot-wrap">' +
        '<div class="shop-top">' +
          '<span>🏆 第 <b>' + G.level + '</b> 关通过！</span>' +
          '<span class="reward">获得 +' + G.reward + ' 金币</span>' +
          '<span>💰 当前金币：<b id="lootGold">' + G.gold + '</b></span>' +
          '<span class="reward">🎁 跳过奖励 +' + this.skipGold + ' 金币/人</span>' +
          (dmgBoard ? '<span class="dmg-board">⚔ 上关输出：' + dmgBoard + '</span>' : '') +
          '<span class="hint">下一关（第 ' + nl + '/' + total + ' 关' + (isBoss ? ' · ⚠️ Boss 关' : '') +
            '）预计敌人 ' + nextCount + ' 个：' + typeStr + '</span>' +
        '</div>' +

        '<div class="loot-cols">' +
          '<div class="panel shop-heroes">' +
            '<div class="p-title">选择英雄（第 ' + (G.currentHeroIdx + 1) + '/' + G.formation.length + ' 位）</div>' +
            '<div class="hero-list" id="lootHeroList"></div>' +
            '<div class="shop-hint">每位英雄<b>依次</b>三选一装备（点击装备卡直接生效）；' +
            '点英雄列表的 ⭐ 按钮升星</div>' +
          '</div>' +

          '<div class="panel loot-main">' +
            '<div class="p-title">' +
              (hero
                ? ' ' + hero.def.emoji + ' ' + hero.def.name + ' 的装备选择（三选一）'
                : '装备选择') +
            '</div>' +
            (full ? '<div class="loot-full">⚠ ' + (hero ? hero.def.name : '该英雄') +
              ' 的装备格已满（6/6），请选择【跳过+奖励金币】</div>' : '') +
            '<div class="loot-cards">' +
              this.options.map((eq, i) => this.cardHtml(eq, i, full)).join('') +
            '</div>' +
            '<div class="loot-foot">' +
              '<button class="btn skip-btn" id="btnSkip">跳过+奖励金币（+' + this.skipGold + '💰）</button>' +
              '<span class="shop-hint">不想要装备时点这里，' + this.skipGold + ' 金币直接入账；' +
              '全部英雄选完后自动进入第 ' + nl + ' 关</span>' +
            '</div>' +
            (this.msg ? '<div class="loot-msg ' + this.msg.cls + '">' + this.msg.text + '</div>' : '') +
          '</div>' +
        '</div>' +
      '</div>';

    const scr = document.getElementById('lootScreen');
    scr.innerHTML = html;

    this.renderHeroes();
    scr.querySelector('#lootHeroList').addEventListener('click', ev => {
      const starEl = ev.target.closest('.hp-star');
      if(starEl){
        const u = G.formation[Number(starEl.dataset.star)];
        if(!u) return;
        const r = starUp(u);
        this.msg = { text: r.msg, cls: r.ok ? 'ok' : 'err' };
        this.render();
        UI.info('unit', u, true);
        UI.updateHeader();
        Save.save();
        const goldEl = document.getElementById('lootGold');
        if(goldEl) goldEl.textContent = G.gold;
        return;
      }
      const item = ev.target.closest('.hero-pick');
      if(!item) return;
      G.currentHeroIdx = Number(item.dataset.idx);
      this.msg = null;
      this.roll();       // 切换英雄 → 重新随机该英雄的 3 件候选
      this.render();
      UI.info('unit', this.currentHero());
    });
    scr.querySelector('.loot-cards').addEventListener('click', ev => {
      const card = ev.target.closest('.loot-card');
      if(!card || card.classList.contains('disabled')) return;
      this.choose(Number(card.dataset.i));
    });
    scr.querySelector('#btnSkip').addEventListener('click', () => this.skip());
    UI.initTip();       // 装备悬停属性提示
    UI.updateHeader();
  },

  /* 一张装备卡（免费选择，不扣金币；点击即生效） */
  cardHtml(eq, i, full){
    const statLine = Object.keys(eq.stats || {}).map(k => {
      const row = STAT_ROWS.find(r => r[0] === k);
      const label = row ? row[1].split(' ')[1] : k;
      const pct = row ? row[2] : 0;
      return label + ' +' + eq.stats[k] + (pct ? '%' : '');
    }).join('，');
    const rawSk = eq.skill;
    const sk = (typeof rawSk === 'string') ? SKILLS[rawSk] : rawSk;
    const skHtml = sk
      ? '<span class="opt-skill">⚙ ' + (sk.type === 'active' ? '主动' : '被动') + '·' + sk.name + '：' + sk.desc + '</span>'
      : '';
    const tierTag = eq.tier
      ? '<span class="opt-tier" style="color:' + TIER_COLORS[eq.tier] +
        ';border-color:' + TIER_COLORS[eq.tier] + '66">' + TIER_NAMES[eq.tier] + ' ' + eq.tier + '档</span>'
      : '';
    const pureTag = eq.pure
      ? '<span class="opt-tier" style="color:#8fe3a8;border-color:rgba(143,227,168,.4)">纯属性</span>' : '';
    return '<button class="loot-card' + (full ? ' disabled' : '') + '" data-i="' + i + '"' +
      (full ? ' disabled' : ' data-tip="' + UI.tipAttr(eq) + '"') + '>' +
      '<span class="lc-top"><span class="opt-ico">' + eq.icon + '</span>' +
      '<span class="opt-name">' + eq.name + tierTag + pureTag + '</span>' +
      '<span class="lc-pick">选择</span></span>' +
      '<span class="lc-stats">属性：' + statLine + '</span>' +
      '<span class="lc-desc">' + (eq.desc || '') + skHtml + '</span>' +
      '</button>';
  },

  renderHeroes(){
    const list = document.getElementById('lootHeroList');
    if(!list) return;
    list.innerHTML = G.formation.map((u, i) => {
      const maxed = u.star >= STAR_MAX;
      const cost = maxed ? 0 : (STAR_COST[u.star] || 0);
      const starBtn = maxed
        ? '<button class="hp-star max" data-star="' + i + '" disabled title="已满 ' + STAR_MAX + ' 星">⭐满星</button>'
        : '<button class="hp-star" data-star="' + i + '" title="升星到 ' + (u.star + 1) + ' 星 · ' +
          cost + ' 金币 · 核心属性 +35%、攻速 +7%">⭐' + cost + '金</button>';
      return '<div class="hero-pick' + (i === G.currentHeroIdx ? ' sel' : '') + '" data-idx="' + i + '">' +
        '<span class="hp-emoji">' + u.def.emoji + '</span>' +
        '<span class="hp-info"><span class="hp-name">' + u.def.name + '</span>' +
        '<span class="hp-sub">⭐' + u.star + '★ · ' + POS_NAMES[u.posType] + ' · 装备 ' + u.equips.length + '/6</span></span>' +
        starBtn +
        '</div>';
    }).join('') || '<div class="shop-hint">暂无英雄</div>';
  },

  /* ---------- 选择一件装备（点击即生效） ---------- */
  choose(i){
    const hero = this.currentHero();
    const eq = this.options[i];
    if(!hero || !eq) return;
    if(hero.equips.length >= 6){
      this.msg = { text: '❌ ' + hero.def.name + ' 的装备格已满（6/6），请选择【跳过+奖励金币】', cls: 'err' };
      this.render();
      return;
    }
    hero.equips.push(eq);
    hero._frame = -1;
    refreshMaxHp(hero);
    UI.info('unit', hero, true);
    Save.save();
    this.advance('✅ ' + eq.name + ' 已装备给 ' + hero.def.name +
      '（' + hero.equips.length + '/6）');
  },

  /* ---------- 跳过：拿金币奖励 ---------- */
  skip(){
    G.gold += this.skipGold;
    UI.updateHeader();
    Save.save();
    const hero = this.currentHero();
    this.advance('🎁 ' + (hero ? hero.def.name : '当前英雄') +
      ' 跳过了装备选择，获得 ' + this.skipGold + ' 金币奖励');
  },

  /* ---------- 轮到下一位英雄；全部选完 → 进入下一关 ---------- */
  advance(text){
    G.currentHeroIdx++;
    if(G.currentHeroIdx >= G.formation.length){
      // 全部英雄选完 → 复位索引，进入下一关
      G.currentHeroIdx = 0;
      G.phase = 'battle';
      Save.save();
      nextLevel();
      return;
    }
    this.msg = { text, cls: 'ok' };
    this.roll();
    this.render();
    UI.info('unit', this.currentHero());
    UI.updateHeader();
    Save.save();
  },
};
