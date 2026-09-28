'use strict';

/* ================= 肉鸽选择界面（难度 / 升星 / 神器） =================
 * 新流程链（战后三屏，其他奖励已全部移除）：
 *   战前【难度二选一】→ 战斗 → ① 装备购买（Loot：6 件标价装备拖给英雄）
 *   → ② 升星（openStar：点一位英雄升 1 星，花金币且星级越高越贵）→ ③ 神器三选一（openArt：点一件进下一关）
 *   → 下一关难度选择…
 * 神器：全局被动收集（唯一，不重复）。
 * 改造三选一 / 商店（shop.js）/ 祝福（blessing.js）/ 随机事件（encounter.js）
 *   已移出流程，文件保留以兼容旧存档。
 */

/* ---------- 从池中随机 n 个 ---------- */
function rollArtifacts(n){
  const owned = G.artifacts || [];
  let pool = ARTIFACTS.filter(a => owned.indexOf(a.id) < 0);
  if(pool.length < n) pool = ARTIFACTS.slice();   // 池耗尽 → 允许重复（可叠加效果）
  const out = [];
  while(out.length < n && pool.length){
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}
function rollUpgrades(n){
  const used = {};
  (G.formation || []).forEach(u => (u.upgrades || []).forEach(id => {
    used[typeof id === 'string' ? id : id.id] = true;   // 改造全局唯一
  }));
  const pool = UPGRADES.filter(up => !used[up.id]);
  const out = [];
  while(out.length < n && pool.length){
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

const Rogue = {
  options: [],    // 当前三选一候选
  msg: null,      // 结果反馈 { text, cls }
  curHero: 0,     // 改造选择时的装入目标英雄

  /* ---------- 单位强化槽数 / 已用槽数 ---------- */
  slotsOf(u){
    return (typeof HERO_SLOTS_BASE !== 'undefined' ? HERO_SLOTS_BASE : 1) +
           ((G.artifacts || []).indexOf('shell') >= 0 ? 1 : 0);
  },
  slotsUsed(u){ return (u.upgrades || []).length; },

  /* ================= ① 战前难度选择（每关开始前） ================= */
  openDiff(){
    G.phase = 'diff';
    this.msg = null;
    UI.setScreen('diff');
    this.renderDiff();
    UI.updateHeader();
    Save.save();
  },

  renderDiff(){
    const lv = G.level;
    const mini = (typeof MINI_BOSSES !== 'undefined') ? MINI_BOSSES[lv] : null;
    const big = (typeof BIG_BOSSES !== 'undefined') ? BIG_BOSSES[lv] : null;
    const typeStr = id => {
      const arr = rollEnemyTypes(lv, id);
      const c = {};
      arr.forEach(t => { c[t] = (c[t] || 0) + 1; });
      return Object.keys(c).map(t => ENEMY_TYPES[t].name + '×' + c[t]).join('、');
    };
    const trait = (typeof LEVEL_TRAITS !== 'undefined') ? LEVEL_TRAITS[lv] : null;
    // 预计通关奖励：本关敌人 gold 合计 × 难度金币倍率（与 onBattleEnd 的结算同一算法）
    const estReward = id => Math.max(1, Math.round(
      rollEnemyTypes(lv, id).reduce((s, t) => s + (ENEMY_TYPES[t] ? ENEMY_TYPES[t].gold : 0), 0)
      * (difficultyDef(id).goldMul || 1)));
    // 悬停💰价格小图标 → 显示本关难点（主题难点 + Boss 词条 + 敌人构成 + 预计奖励）
    const attr = s => String(s).replace(/&/g, '&').replace(/"/g, '"')
                     .replace(/</g, '<').replace(/\n/g, '&#10;');
    const tipText = id => {
      const d = difficultyDef(id);
      let s = '【第 ' + lv + ' 关 · ' + (trait ? trait.icon + trait.name : '无主题') + '】';
      if(trait) s += '\n⚠️ 难点：' + trait.diff;
      if(mini)  s += '\n👹 小Boss ' + mini.name + '：' + mini.trait;
      if(big)   s += '\n👿 大Boss ' + big.name + '：' + big.trait;
      s += '\n🧾 敌人构成：' + typeStr(id);
      s += '\n💰 ' + d.icon + d.name + '预计奖励：' + estReward(id) + ' 金币';
      return s;
    };

    const html =
      '<div class="bless-wrap">' +
        '<div class="shop-top">' +
          '<span>⚔️ 即将进入第 <b>' + lv + '/' + MAX_LEVEL + '</b> 关</span>' +
          (trait ? '<span class="diff-boss">🧭 本关主题 · <b>' + trait.icon + trait.name + '</b></span>' : '') +
          (mini ? '<span class="diff-boss">👹 小Boss · <b>' + mini.emoji + mini.name +
                  '</b>：' + mini.trait + '</span>' : '') +
          (big ? '<span class="diff-boss big">👿 大Boss · <b>' + big.emoji + big.name +
                 '</b>：' + big.trait + '</span>' : '') +
        '</div>' +
        '<div class="panel bless-main">' +
          '<div class="p-title">💥 选择本关难度 · ' +
            (trait ? trait.icon + trait.name : '第 ' + lv + ' 关') +
            '（悬停 💰 图标查看本关难点）</div>' +
          '<div class="loot-cards bless-cards" id="diffCards">' +
            DIFFICULTIES.map(d =>
              '<button class="loot-card diff-card" data-i="' + d.id + '">' +
                '<span class="lc-top"><span class="opt-ico">' + d.icon + '</span>' +
                '<span class="opt-name">' + d.name +
                '<span class="opt-tier">' + d.reward + '</span>' +
                '<span class="diff-price" title="' + attr(tipText(d.id)) + '">💰' +
                estReward(d.id) + '金</span></span>' +
                '<span class="lc-pick">选择</span></span>' +
                '<span class="lc-desc">' + d.desc + '</span>' +
                '<span class="lc-stats">敌人构成：' + typeStr(d.id) + '</span>' +
              '</button>').join('') +
          '</div>' +
          (this.msg ? '<div class="loot-msg ' + this.msg.cls + '">' + this.msg.text + '</div>' : '') +
          '<div class="loot-foot"><span class="shop-hint">选择难度后立即开始本关战斗；挑战难度通关金币 +50%（敌人更强，奖励更多）。</span></div>' +
        '</div>' +
      '</div>';

    const scr = document.getElementById('diffScreen');
    scr.innerHTML = html;
    scr.querySelector('#diffCards').addEventListener('click', ev => {
      const card = ev.target.closest('.loot-card');
      if(!card) return;
      this.chooseDiff(Number(card.dataset.i));
    });
    UI.updateHeader();
  },

  chooseDiff(id){
    G.difficulty = id;
    const d = difficultyDef(id);
    Save.save();
    // 进入本关战斗（spawnEnemies 会按 G.difficulty 缩放敌人）
    beginLevel();
    UI.float && UI.float(G.formation[0], '难度：' + d.icon + d.name, 'good');
  },

  /* ================= 战后第②屏：升星（点一位英雄升 1 星，花金币且越升越贵） ================= */
  openStar(){
    G.phase = 'star';
    this.msg = null;
    UI.setScreen('star');
    this.renderStar();
    UI.info('unit', G.formation[0] || null);
    UI.updateHeader();
    Save.save();
  },

  renderStar(){
    const heroes = G.formation || [];
    const cards = heroes.map((u, i) => this.starCardHtml(u, i)).join('') ||
      '<div class="shop-hint">暂无英雄</div>';
    const html =
      '<div class="bless-wrap">' +
        '<div class="shop-top">' +
          '<span>🏆 第 <b>' + G.level + '</b> 关通过！</span>' +
          '<span class="gold-badge">💰 <b>' + G.gold + '</b></span>' +
          '<span class="hint">点击一位英雄升 1 星（花金币，星级越高越贵：' +
          '1星15 / 2星30 / 3星45 / 4星60 金；每星核心属性 +35%、攻速 +7%）</span>' +
        '</div>' +
        '<div class="panel bless-main">' +
          '<div class="p-title">⭐ 升星 · 点击一位英雄升 1 星（花费金币，越升越贵）</div>' +
          '<div class="loot-cards bless-cards" id="starCards">' + cards + '</div>' +
          (this.msg ? '<div class="loot-msg ' + this.msg.cls + '">' + this.msg.text + '</div>' : '') +
          '<div class="loot-foot">' +
            '<button class="btn" id="btnSkipStar">⏭ 不升星 → 选择神器</button>' +
            '<span class="shop-hint">升到 3★ / 5★ 会解锁新技能并播放华丽特效，升完进入第 ③ 步神器选择</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    const scr = document.getElementById('starScreen');
    scr.innerHTML = html;
    const box = scr.querySelector('#starCards');
    if(box){
      box.addEventListener('click', ev => {
        const card = ev.target.closest('.loot-card');
        if(!card) return;
        this.chooseStar(Number(card.dataset.i));
      });
    }
    const skip = scr.querySelector('#btnSkipStar');
    if(skip) skip.addEventListener('click', () => this.skipStar());
    UI.updateHeader();
  },

  starCardHtml(u, i){
    const star = u.star || 1;
    const smax = (typeof STAR_MAX !== 'undefined') ? STAR_MAX : 5;
    const maxed = star >= smax;
    const before = starSkillCount(star);
    const after = maxed ? before : starSkillCount(star + 1);
    const sk = after > before ? SKILLS[(u.def.skills || [])[after - 1]] : null;
    const cost = (typeof STAR_COST !== 'undefined') ? (STAR_COST[star] || 0) : 0;
    const upLine = maxed
      ? '<span class="lc-stats">已满星（' + smax + '★）</span>'
      : '<span class="lc-stats">⭐ ' + star + ' → ' + (star + 1) +
        '★ · 💰' + cost + ' 金 · 核心属性 +' + Math.round((typeof STAR_ATTR_PER !== 'undefined' ? STAR_ATTR_PER : 0.35) * 100) +
        '%、攻速 +7%</span>';
    const skLine = sk
      ? '<span class="opt-skill">⚙ 升星解锁「' + sk.name + '」：' + sk.desc + '</span>'
      : '';
    return '<button class="loot-card star-card' + (maxed ? ' disabled' : '') + '" data-i="' + i + '">' +
      '<span class="lc-top"><span class="opt-ico">' + u.def.emoji + '</span>' +
      '<span class="opt-name">' + u.def.name +
      '<span class="opt-tier" style="color:#ffd257;border-color:#ffd25766">' + star + '★</span></span>' +
      '<span class="lc-pick">' + (maxed ? '满星' : '💰' + cost + '升星') + '</span></span>' +
      upLine + skLine +
      '<span class="lc-desc">' +
      (maxed ? '该英雄已满星，选别的英雄吧'
             : '点击花 ' + cost + ' 金币升 1 星（星级越高越贵），升完自动进入神器选择') +
      '</span>' +
      '</button>';
  },

  chooseStar(i){
    const u = (G.formation || [])[i];
    if(!u) return;
    const smax = (typeof STAR_MAX !== 'undefined') ? STAR_MAX : 5;
    if((u.star || 1) >= smax){
      this.msg = { text:'❌ ' + u.def.name + ' 已经满星（' + smax + '★），请选择其他英雄', cls:'err' };
      this.renderStar();
      UI.info('unit', u);
      return;
    }
    const r = starUp(u);                // 战后升星界面：同样花金币（星级越高越贵）
    if(!r.ok){
      this.msg = { text:r.msg, cls:'err' };
      this.renderStar();
      return;
    }
    Save.save();
    this.msg = null;
    this.openArt();                     // 升星完成 → 第 ③ 屏神器（特效挂在 body 上，切换界面不中断）
  },

  skipStar(){
    this.msg = null;
    Save.save();
    this.openArt();
  },

  /* ================= 战后第③屏：神器三选一（点一件进入下一关） ================= */
  openArt(){
    G.phase = 'art';
    this.options = rollArtifacts(3);
    this.msg = null;
    UI.setScreen('art');
    this.renderArt();
    UI.updateHeader();
    Save.save();
  },

  renderArt(){
    const owned = G.artifacts || [];
    const ownedChips = owned.length
      ? owned.map(id => {
          const a = artifactById(id);
          if(!a) return '';
          return '<span class="bless-chip" title="' + a.desc + '">' + a.icon + a.name + '</span>';
        }).join('')
      : '<span class="shop-hint">还没有获得任何神器</span>';

    const html =
      '<div class="bless-wrap">' +
        '<div class="shop-top">' +
          '<span>🏆 第 <b>' + G.level + '</b> 关通过！</span>' +
          '<span class="gold-badge">💰 <b>' + G.gold + '</b></span>' +
          '<span>🏺 已获神器：<b>' + owned.length + '</b> 个</span>' +
          '<span class="hint">点一件神器，立即进入下一关（神器唯一，全局生效）</span>' +
        '</div>' +
        '<div class="panel bless-main">' +
          '<div class="p-title">🏺 神器三选一 · 全局强化</div>' +
          '<div class="loot-cards bless-cards" id="artCards">' +
            this.options.map((a, i) => this.artCardHtml(a, i)).join('') +
          '</div>' +
          (this.msg ? '<div class="loot-msg ' + this.msg.cls + '">' + this.msg.text + '</div>' : '') +
          '<div class="loot-foot">' +
            '<span class="shop-hint">已拥有神器（点击卡片选择后继续）：</span>' +
            '<span class="bless-owned">' + ownedChips + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    const scr = document.getElementById('artScreen');
    scr.innerHTML = html;
    scr.querySelector('#artCards').addEventListener('click', ev => {
      const card = ev.target.closest('.loot-card');
      if(!card) return;
      this.chooseArt(Number(card.dataset.i));
    });
    UI.updateHeader();
  },

  artCardHtml(a, i){
    return '<button class="loot-card bless-card" data-i="' + i + '">' +
      '<span class="lc-top"><span class="opt-ico">' + a.icon + '</span>' +
      '<span class="opt-name" style="color:#ffb02e">' + a.name +
      '<span class="opt-tier" style="color:#ffb02e;border-color:#ffb02e66">神器</span></span>' +
      '<span class="lc-pick">选择</span></span>' +
      '<span class="lc-desc">' + a.desc + '</span>' +
      '</button>';
  },

  chooseArt(i){
    const a = this.options[i];
    if(!a) return;
    G.artifacts = G.artifacts || [];
    if(G.artifacts.indexOf(a.id) < 0) G.artifacts.push(a.id);
    G.artRound = G.level;                 // 标记本关神器已选
    // 神器可能改写面板属性（巨人腰带 / 疾风之羽 / 尖刺系列）→ 缓存失效
    (G.formation || []).forEach(u => { u._frame = -1; });
    Save.save();
    nextLevel();                          // → 下一关难度选择（战后流程终点）
  },

  /* ================= 改造三选一（已移出战后流程，仅旧存档兼容） ================= */
  openUpg(){
    G.phase = 'upg';
    const heroes = G.formation || [];
    const can = heroes.some(u => this.slotsUsed(u) < this.slotsOf(u));
    if(!can || !rollUpgrades(1).length){
      // 所有英雄槽已满 / 改造池耗尽 → 自动跳过
      G.upgRound = G.level;
      Save.save();
      afterLoot();
      return;
    }
    this.options = rollUpgrades(3);
    // 默认装入目标：第一个有空槽的英雄
    if(!heroes[this.curHero] || this.slotsUsed(heroes[this.curHero]) >= this.slotsOf(heroes[this.curHero])){
      const idx = heroes.findIndex(u => this.slotsUsed(u) < this.slotsOf(u));
      this.curHero = idx < 0 ? 0 : idx;
    }
    this.msg = null;
    UI.setScreen('upg');
    this.renderUpg();
    UI.updateHeader();
    Save.save();
  },

  renderUpg(){
    const heroes = G.formation || [];
    const heroList = heroes.map((u, i) => {
      const used = this.slotsUsed(u), mx = this.slotsOf(u);
      const full = used >= mx;
      const cls = full ? ' full' : (i === this.curHero ? ' sel' : '');
      const chips = (u.upgrades || []).map(id => {
        const up = upgradeById(typeof id === 'string' ? id : id.id);
        return up ? '<span class="upg-chip" title="' + up.desc + '">' + up.icon + up.name + '</span>' : '';
      }).join('');
      return '<div class="hero-pick' + cls + '" data-idx="' + i + '">' +
        '<span class="hp-emoji">' + u.def.emoji + '</span>' +
        '<span class="hp-info"><span class="hp-name">' + u.def.name + ' <span class="stars">' + '★'.repeat(u.star || 1) + '</span></span>' +
        '<span class="hp-sub">强化槽 ' + used + '/' + mx +
        (full ? '（已满）' : '') + (chips ? ' · ' + chips : '') + '</span></span>' +
        '</div>';
    }).join('') || '<div class="shop-hint">暂无英雄</div>';

    const cur = heroes[this.curHero];
    const html =
      '<div class="bless-wrap">' +
        '<div class="shop-top">' +
          '<span>🏆 第 <b>' + G.level + '</b> 关通过！</span>' +
          '<span>💰 金币：<b>' + G.gold + '</b></span>' +
          '<span class="hint">改造装入英雄的强化槽（每英雄 ' +
          (typeof HERO_SLOTS_BASE !== 'undefined' ? HERO_SLOTS_BASE : 1) +
          ' 槽，薪火石外壳 +1 槽）</span>' +
        '</div>' +
        '<div class="loot-cols">' +
          '<div class="panel shop-heroes">' +
            '<div class="p-title">选择装入的英雄</div>' +
            '<div class="hero-list" id="upgHeroList">' + heroList + '</div>' +
            '<div class="shop-hint">点击上方英雄切换装入目标，再点右侧改造卡装入</div>' +
          '</div>' +
          '<div class="panel bless-main">' +
            '<div class="p-title">🧩 改造三选一 · ' +
              (cur ? cur.def.emoji + ' ' + cur.def.name + ' 的强化槽' : '强化槽') + '</div>' +
            '<div class="loot-cards bless-cards" id="upgCards">' +
              this.options.map((up, i) => this.upgCardHtml(up, i)).join('') +
            '</div>' +
            (this.msg ? '<div class="loot-msg ' + this.msg.cls + '">' + this.msg.text + '</div>' : '') +
            '<div class="loot-foot">' +
              '<button class="btn skip-btn" id="btnSkipUpg">跳过+奖励金币（+10💰）</button>' +
              '<span class="shop-hint">不想要改造时点这里，选择后进入下一关的难度选择</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';

    const scr = document.getElementById('upgScreen');
    scr.innerHTML = html;
    scr.querySelector('#upgHeroList').addEventListener('click', ev => {
      const item = ev.target.closest('.hero-pick');
      if(!item) return;
      this.pickHero(Number(item.dataset.idx));
    });
    scr.querySelector('#upgCards').addEventListener('click', ev => {
      const card = ev.target.closest('.loot-card');
      if(!card) return;
      this.chooseUpg(Number(card.dataset.i));
    });
    scr.querySelector('#btnSkipUpg').addEventListener('click', () => this.skipUpg());
    UI.updateHeader();
  },

  upgCardHtml(up, i){
    const statLine = up.stats
      ? '<span class="lc-stats">属性：' + Object.keys(up.stats).map(k => k + ' +' + up.stats[k]).join('，') + '</span>'
      : '';
    const rageLine = up.startRage ? '<span class="lc-stats">开场 +' + up.startRage + ' 层狂怒</span>' : '';
    return '<button class="loot-card bless-card" data-i="' + i + '">' +
      '<span class="lc-top"><span class="opt-ico">' + up.icon + '</span>' +
      '<span class="opt-name" style="color:#8fe3a8">' + up.name +
      '<span class="opt-tier" style="color:#8fe3a8;border-color:#8fe3a866">改造</span></span>' +
      '<span class="lc-pick">装入</span></span>' +
      statLine + rageLine +
      '<span class="lc-desc">' + up.desc + '</span>' +
      '</button>';
  },

  pickHero(i){
    const u = (G.formation || [])[i];
    if(!u) return;
    if(this.slotsUsed(u) >= this.slotsOf(u)){
      this.msg = { text:'❌ ' + u.def.name + ' 的强化槽已满（' +
        this.slotsUsed(u) + '/' + this.slotsOf(u) + '），请选择其他英雄', cls:'err' };
    } else {
      this.curHero = i;
      this.msg = null;
    }
    this.renderUpg();
    UI.info('unit', u);
    UI.updateHeader();
  },

  chooseUpg(i){
    const up = this.options[i];
    const u = (G.formation || [])[this.curHero];
    if(!up || !u) return;
    if(this.slotsUsed(u) >= this.slotsOf(u)){
      this.msg = { text:'❌ ' + u.def.name + ' 的强化槽已满，请先点击左侧其他英雄', cls:'err' };
      this.renderUpg();
      return;
    }
    u.upgrades = u.upgrades || [];
    u.upgrades.push(up.id);
    u._frame = -1;
    G.upgRound = G.level;                 // 标记本关改造已选
    Save.save();
    afterLoot();                          // → 下一关难度选择
  },

  skipUpg(){
    G.gold += 5;
    G.upgRound = G.level;
    Save.save();
    afterLoot();
  },
};
