'use strict';

/* ================= 第①屏：装备购买（随机 1~5★ 装备，点选装备→点英雄） =================
 * 开局流程：选满 3 名英雄 → openIntro() 装备三选一（免费）→ 神器三选一 → 第 1 关。
 * 战后流程（固定三屏 + 随机祝福/奇遇穿插，其他奖励已全部移除）：
 *   ① 装备购买（本文件）——随机刷出 6 件 1~5★ 装备（不再按当前金币过滤），
 *      点选装备再点英雄（或拖拽）即购买并扣金币；
 *   ② 升星（Rogue.openStar）——点击一位英雄花金币升 1 星（星级越高越贵）；
 *   ③ 神器（Rogue.openArt）——点击一件神器进入下一关。
 * 商店（js/shop.js）与改造三选一代码保留备用，流程不再调用。
 */
const Loot = {
  options: [],     // 本轮候选装备（战后 6 件随机 1~5★；开局三选一 3 件免费）
  eqTier: 1,       // 本轮装备档位（战后参考值）
  nextNo: 1,       // 下一关关数
  sel: -1,         // 点击选中的装备下标（拖拽的备选操作方式）
  msg: null,       // 结果反馈 { text, cls }
  intro: false,    // true = 开局装备三选一（免费，选完/跳过 → 神器三选一）

  /* ---------- 战斗胜利后打开装备购买屏 ---------- */
  open(){
    const nl = (typeof MAX_LEVEL !== 'undefined') ? Math.min(MAX_LEVEL, G.level + 1) : G.level + 1;
    this.nextNo = nl;
    // 档位随关卡提高：每 3 关解锁一档（1~5 档，第 15 关到顶）
    this.eqTier = Math.min(5, Math.max(1, Math.ceil(nl / 3)));
    this.sel = -1;
    this.msg = null;
    this.intro = false;
    this.roll();
    UI.setScreen('loot');
    this.render();
    UI.info('unit', G.formation[0] || null);
    UI.updateHeader();
    Save.save();
  },

  /* ---------- 开局：装备三选一（免费，装上/跳过 → 神器三选一） ---------- */
  openIntro(){
    G.intro = 1;
    G.phase = 'loot';
    this.intro = true;
    this.nextNo = 1;
    this.eqTier = 1;
    this.sel = -1;
    this.msg = null;
    this.roll();
    UI.setScreen('loot');
    this.render();
    UI.info('unit', G.formation[0] || null);
    UI.updateHeader();
    Save.save();
  },

  /* ---------- 随机候选：全档位 1~5★ 随机，不再按当前金币过滤 ----------
   * 开局三选一：3 件免费 1★（1 级）装备，尽量坦克/物理/魔法各一件（缺类自动补位）。 */
  roll(){
    const free = this.intro;
    const n = free ? 3 : 6;
    // 开局只出 1 级（1★）装备；战后购买则 1~5★ 全档位随机
    const pool = EQUIPS.filter(e => !free || (e.tier || 1) === 1);
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
    if(free){
      ['tank', 'phys', 'magic'].forEach(c => take(pool.filter(e => e.cat === c), 1));
      take(pool, n - out.length);
    } else {
      take(pool, n);
    }
    this.options = out;
  },

  /* ---------- 渲染 ---------- */
  render(){
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

    const cards = this.options.map((eq, i) => this.cardHtml(eq, i)).join('');

    const intro = this.intro;
    const html =
      '<div class="loot-wrap">' +
        '<div class="shop-top">' +
          (intro
            ? '<span>🎮 开局整备 · 装备三选一</span>'
            : '<span>🏆 第 <b>' + G.level + '</b> 关通过！</span>' +
              '<span class="reward">获得 +' + G.reward + ' 金币</span>') +
          '<span class="gold-badge" id="lootGold">💰 <b>' + G.gold + '</b></span>' +
          (intro
            ? '<span class="hint">三选一免费：点选一件装备 → 点左侧英雄装上</span>'
            : (dmgBoard ? '<span class="dmg-board">⚔ 上关输出：' + dmgBoard + '</span>' : '') +
              '<span class="hint">下一关（第 ' + nl + '/' + total + ' 关' + (isBoss ? ' · ⚠️ Boss 关' : '') +
                '）预计敌人 ' + nextCount + ' 个：' + typeStr + '</span>') +
        '</div>' +

        '<div class="loot-cols">' +
          '<div class="panel shop-heroes">' +
            '<div class="p-title">英雄</div>' +
            '<div class="hero-list" id="lootHeroList"></div>' +
            '<div class="shop-hint">先点装备、再点英雄即可' + (intro ? '装上' : '购买') + '。</div>' +
          '</div>' +

          '<div class="panel loot-main">' +
            '<div class="p-title">' + (intro
              ? '🎁 开局装备三选一 · 免费挑 1 件'
              : '🛒 随机装备 ×6（1~5★ 皆可能出现）') + '</div>' +
            '<div class="loot-goldbar">💰 <b id="lootGoldBar">' + G.gold + '</b></div>' +
            (this.options.length
              ? '<div class="loot-cards" id="lootCards">' + cards + '</div>'
              : '<div class="loot-full">💰 金币不足（' + G.gold + '），本轮没有买得起的装备。</div>') +
            '<div class="loot-foot">' +
              UI.sellBtnHtml() +
              (intro
                ? '<button class="btn primary" id="btnLootDone">⏭ 跳过 → 神器三选一</button>'
                : '<button class="btn primary" id="btnLootDone">✅ 选好了 → 升星界面</button>') +
              '<span class="shop-hint">' + (intro
                ? '开局免费三选一，装上（或跳过）后进入神器三选一。'
                : '不买也可以直接继续；买下的装备会立即生效，选完进入第 ② 步升星。') + '</span>' +
            '</div>' +
            (this.msg ? '<div class="loot-msg ' + this.msg.cls + '">' + this.msg.text + '</div>' : '') +
          '</div>' +
        '</div>' +
      '</div>';

    const scr = document.getElementById('lootScreen');
    scr.innerHTML = html;

    this.renderHeroes();
    this.bindEvents(scr);
    UI.bindSell(scr, () => this.render());   // 卖血按钮：+10💰，下场开战全体 -20% HP
    UI.initTip();       // 装备悬停属性提示
    UI.updateHeader();
  },

  bindEvents(scr){
    const heroList = scr.querySelector('#lootHeroList');

    // 英雄列表：点击（选中装备时购买，否则查看详情）+ 拖放目标
    heroList.addEventListener('click', ev => {
      const item = ev.target.closest('.hero-pick');
      if(!item) return;
      const idx = Number(item.dataset.idx);
      if(this.sel >= 0){
        this.buy(this.sel, idx);
        return;
      }
      const u = G.formation[idx];
      if(u) UI.info('unit', u);
    });
    heroList.addEventListener('dragover', ev => {
      const item = ev.target.closest('.hero-pick');
      if(!item) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = 'copy';
      item.classList.add('drop-ok');
    });
    heroList.addEventListener('dragleave', ev => {
      const item = ev.target.closest('.hero-pick');
      if(item) item.classList.remove('drop-ok');
    });
    heroList.addEventListener('drop', ev => {
      const item = ev.target.closest('.hero-pick');
      if(!item) return;
      ev.preventDefault();
      item.classList.remove('drop-ok');
      const i = Number(ev.dataTransfer.getData('text/plain'));
      if(!isNaN(i)) this.buy(i, Number(item.dataset.idx));
    });

    // 装备卡：可拖拽 + 点击选中
    const cardsBox = scr.querySelector('#lootCards');
    if(cardsBox){
      cardsBox.addEventListener('dragstart', ev => {
        const card = ev.target.closest('.loot-card');
        if(!card || card.classList.contains('disabled')){ ev.preventDefault(); return; }
        ev.dataTransfer.setData('text/plain', card.dataset.i);
        ev.dataTransfer.effectAllowed = 'copy';
        card.classList.add('dragging');
      });
      cardsBox.addEventListener('dragend', ev => {
        const card = ev.target.closest('.loot-card');
        if(card) card.classList.remove('dragging');
      });
      cardsBox.addEventListener('click', ev => {
        const card = ev.target.closest('.loot-card');
        if(!card) return;
        const i = Number(card.dataset.i);
        const eq = this.options[i];
        if(!eq) return;
        if(card.classList.contains('disabled')){
          this.msg = { text: '❌ 金币不足：' + eq.name + ' 需要 ' + eq.price + ' 金币', cls: 'err' };
          this.render();
          return;
        }
        this.sel = (this.sel === i) ? -1 : i;
        this.msg = this.sel >= 0
          ? { text: '👉 已选中「' + eq.name + '」→ 点击左侧英雄装上', cls: 'ok' }
          : null;
        this.render();
      });
    }

    scr.querySelector('#btnLootDone').addEventListener('click', () => this.done());
  },

  /* 一张装备卡（精简）：① 大图标 ② 名字+价格 ③ ★档位+分类 ④ 属性行 ⑤ 技能效果；悬停浮层看全部属性 */
  cardHtml(eq, i){
    const rawSk = eq.skill;
    const sk = (typeof rawSk === 'string') ? SKILLS[rawSk] : rawSk;
    const tier = eq.tier || 1;
    const tc = TIER_COLORS[eq.tier] || '#8fa4c7';
    const catC = EQ_CATS[eq.cat] || null;
    const catTag = catC
      ? '<span class="opt-cat opt-cat--' + eq.cat + '">' + catC.icon + '</span>' : '';
    const price = this.intro ? 0 : (eq.price || 0);
    const afford = this.intro || G.gold >= price;
    // 属性行：把装备功能直接显示在卡面上（如「生命 +10，生命恢复 +1」）
    const statLine = Object.keys(eq.stats || {}).map(k => {
      const row = STAT_ROWS.find(r => r[0] === k);
      const label = row ? (row[1].split(' ')[1] || k) : k;
      return label + ' +' + eq.stats[k] + (row && row[2] ? '%' : '');
    }).join('，');
    const cls = 'loot-card lc-eq' + (eq.cat ? ' lc-eq--' + eq.cat : '') +
      (afford ? '' : ' disabled') + (this.sel === i ? ' sel' : '');
    const priceHtml = this.intro
      ? '<span class="lc-price free">🎁 免费</span>'
      : '<span class="lc-price' + (afford ? '' : ' poor') + '">💰' + price + '</span>';
    const statHtml = statLine ? '<span class="lc-stats">' + statLine + '</span>' : '';
    const skHtml = sk ? '<span class="opt-skill">' + sk.desc + '</span>' : '';
    // 顺序：① 大图标（下方分隔线）② ★档位 ③ 名字+价格 ④ 分类 ⑤ 属性 ⑥ 技能
    return '<button class="' + cls + '" data-i="' + i + '"' +
      (afford ? ' draggable="true"' : '') + ' data-tip="' + UI.tipAttr(eq) + '">' +
      '<span class="lc-icobig">' + eq.icon + '</span>' +
      '<span class="lc-stars-row"><span class="lc-stars" style="color:' + tc + '">' +
        '★'.repeat(tier) + '</span>' + catTag + '</span>' +
      '<span class="lc-row"><span class="opt-name">' + eq.name + '</span>' + priceHtml + '</span>' +
      statHtml +
      skHtml +
      '</button>';
  },

  renderHeroes(){
    const list = document.getElementById('lootHeroList');
    if(!list) return;
    list.innerHTML = G.formation.map((u, i) => {
      const full = u.equips.length >= 6;
      return '<div class="hero-pick' + (this.sel >= 0 ? ' drop-hint' : '') + (full ? ' full' : '') +
        '" data-idx="' + i + '">' +
        '<span class="hp-emoji">' + u.def.emoji + '</span>' +
        '<span class="hp-info"><span class="hp-name">' + u.def.name + '</span>' +
        '<span class="hp-sub"><span class="stars">' + '★'.repeat(u.star || 1) + '</span> · 装备 ' + u.equips.length +
        '/6' + (full ? '（已满）' : '') + ' · ❤' + fmtN(u.maxHp || u.def.base.hp) + '</span></span>' +
        '</div>';
    }).join('') || '<div class="shop-hint">暂无英雄</div>';
  },

  /* ---------- 购买：把第 i 件装备装备给第 heroIdx 位英雄（开局三选一免费） ---------- */
  buy(i, heroIdx){
    const eq = this.options[i];
    const u = G.formation[heroIdx];
    if(!eq || !u) return;
    const price = this.intro ? 0 : (eq.price || 0);
    if(G.gold < price){
      this.msg = { text: '❌ 金币不足：' + eq.name + ' 需要 ' + price + ' 金币', cls: 'err' };
      this.render();
      return;
    }
    if(u.equips.length >= 6){
      this.msg = { text: '❌ ' + u.def.name + ' 的装备格已满（6/6），换一位英雄', cls: 'err' };
      this.render();
      return;
    }
    G.gold -= price;
    u.equips.push(eq);
    u._frame = -1;
    refreshMaxHp(u);
    this.options.splice(i, 1);
    this.sel = -1;
    this.msg = { text: '✅ ' + eq.icon + ' ' + eq.name +
      (this.intro ? '' : '（-' + price + '💰）') + ' → ' + u.def.name +
      '（装备 ' + u.equips.length + '/6）', cls: 'ok' };
    UI.info('unit', u, true);
    UI.updateHeader();
    Save.save();
    if(this.intro){ this.done(); return; }   // 开局三选一：装上一件 → 神器三选一
    // 金币减少后，剩余装备可能买不起了 → 重算可用性；买完/全买不起 → 自动进入升星
    if(!this.options.length || this.options.every(e => (e.price || 0) > G.gold)){
      this.done();
      return;
    }
    this.render();          // render 会按最新金币重画顶部徽章与金币条
  },

  /* ---------- 完成：开局 → 神器三选一；战后 → 第 ② 屏升星 ---------- */
  done(){
    this.sel = -1;
    this.msg = null;
    if(this.intro){
      // 开局流程：装备三选一（装上或跳过）→ 神器三选一（G.intro 保持 1）
      if(typeof Rogue !== 'undefined' && Rogue.openArt) Rogue.openArt();
      return;
    }
    Save.save();
    if(typeof Rogue !== 'undefined' && Rogue.openStar) Rogue.openStar();
  },
};
