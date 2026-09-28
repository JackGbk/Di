'use strict';

/* ================= 战后第①屏：装备购买（6 件标价装备，拖到英雄身上） =================
 * 新战后流程（三屏，其他奖励已全部移除）：
 *   ① 装备购买（本文件）——只刷出「价格 ≤ 当前金币」的装备，最多 6 件，
 *      把装备拖到英雄身上（或先点装备再点英雄）即购买并扣金币；
 *   ② 升星（Rogue.openStar）——点击一位英雄免费升 1 星；
 *   ③ 神器（Rogue.openArt）——点击一件神器进入下一关。
 * 商店（js/shop.js）与改造三选一代码保留备用，流程不再调用。
 */
const Loot = {
  options: [],     // 本轮候选装备（最多 6 件，价格均 ≤ 打开时的金币）
  eqTier: 1,       // 本轮装备档位（随下一关关数提高，1~5 档）
  nextNo: 1,       // 下一关关数
  sel: -1,         // 点击选中的装备下标（拖拽的备选操作方式）
  msg: null,       // 结果反馈 { text, cls }

  /* ---------- 战斗胜利后打开装备购买屏 ---------- */
  open(){
    const nl = (typeof MAX_LEVEL !== 'undefined') ? Math.min(MAX_LEVEL, G.level + 1) : G.level + 1;
    this.nextNo = nl;
    // 档位随关卡提高：每 3 关解锁一档（1~5 档，第 15 关到顶）
    this.eqTier = Math.min(5, Math.max(1, Math.ceil(nl / 3)));
    this.sel = -1;
    this.msg = null;
    this.roll();
    UI.setScreen('loot');
    this.render();
    UI.info('unit', G.formation[0] || null);
    UI.updateHeader();
    Save.save();
  },

  /* ---------- 随机 6 件候选：只出现价格 ≤ 当前金币的装备（当前档优先） ---------- */
  roll(){
    const n = 6;
    const pool = EQUIPS.filter(e => e.tier <= this.eqTier && (e.price || 0) <= G.gold);
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
    // 当前档优先占一半，低档补齐；金币太少时只出得起几件就出几件
    take(pool.filter(e => e.tier === this.eqTier), 3);
    take(pool, n - out.length);
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

    const html =
      '<div class="loot-wrap">' +
        '<div class="shop-top">' +
          '<span>🏆 第 <b>' + G.level + '</b> 关通过！</span>' +
          '<span class="reward">获得 +' + G.reward + ' 金币</span>' +
          '<span class="gold-badge" id="lootGold">💰 <b>' + G.gold + '</b></span>' +
          (dmgBoard ? '<span class="dmg-board">⚔ 上关输出：' + dmgBoard + '</span>' : '') +
          '<span class="hint">下一关（第 ' + nl + '/' + total + ' 关' + (isBoss ? ' · ⚠️ Boss 关' : '') +
            '）预计敌人 ' + nextCount + ' 个：' + typeStr + '</span>' +
        '</div>' +

        '<div class="loot-cols">' +
          '<div class="panel shop-heroes">' +
            '<div class="p-title">英雄（拖到这里购买）</div>' +
            '<div class="hero-list" id="lootHeroList"></div>' +
            '<div class="shop-hint">把右侧装备<b>拖到英雄身上</b>即购买（扣对应金币）；' +
            '也可先点装备、再点英雄。</div>' +
          '</div>' +

          '<div class="panel loot-main">' +
            '<div class="p-title">🛒 装备 · 6 件（只出现价格 ≤ 你的金币）</div>' +
            '<div class="loot-goldbar">💰 可用金币：<b id="lootGoldBar">' + G.gold + '</b>' +
              '<span class="shop-hint">把装备拖到左侧英雄身上即扣款购买；金币花完会自动进入升星界面</span></div>' +
            (this.options.length
              ? '<div class="loot-cards" id="lootCards">' + cards + '</div>'
              : '<div class="loot-full">💰 金币不足（' + G.gold + '），本轮没有买得起的装备。</div>') +
            '<div class="loot-foot">' +
              '<button class="btn primary" id="btnLootDone">✅ 选好了 → 升星界面</button>' +
              '<span class="shop-hint">不买也可以直接继续；买下的装备会立即生效，选完进入第 ② 步升星。</span>' +
            '</div>' +
            (this.msg ? '<div class="loot-msg ' + this.msg.cls + '">' + this.msg.text + '</div>' : '') +
          '</div>' +
        '</div>' +
      '</div>';

    const scr = document.getElementById('lootScreen');
    scr.innerHTML = html;

    this.renderHeroes();
    this.bindEvents(scr);
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
          ? { text: '👉 已选中「' + eq.name + '」，点击左侧英雄购买（或直接拖过去）', cls: 'ok' }
          : null;
        this.render();
      });
    }

    scr.querySelector('#btnLootDone').addEventListener('click', () => this.done());
  },

  /* 一张装备卡（标价，拖拽购买） */
  cardHtml(eq, i){
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
    const pureTag = !sk
      ? '<span class="opt-tier" style="color:#8fe3a8;border-color:rgba(143,227,168,.4)">纯属性</span>' : '';
    const price = eq.price || 0;
    const afford = G.gold >= price;
    const cls = 'loot-card lc-eq' + (afford ? '' : ' disabled') + (this.sel === i ? ' sel' : '');
    return '<button class="' + cls + '" data-i="' + i + '"' +
      (afford ? ' draggable="true"' : '') + ' data-tip="' + UI.tipAttr(eq) + '">' +
      '<span class="lc-top"><span class="opt-ico">' + eq.icon + '</span>' +
      '<span class="opt-name">' + eq.name + tierTag + pureTag + '</span>' +
      '<span class="lc-price' + (afford ? '' : ' poor') + '">💰' + price + '</span>' +
      '</span>' +
      '<span class="lc-stats">属性：' + statLine + '</span>' +
      '<span class="lc-desc">' + (eq.desc || '') + skHtml + '</span>' +
      (afford ? '<span class="lc-drag">🛒 拖到英雄身上购买</span>' : '<span class="lc-drag poor">金币不足</span>') +
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
        '<span class="hp-sub">⭐' + (u.star || 1) + '★ · 装备 ' + u.equips.length +
        '/6' + (full ? '（已满）' : '') + ' · ❤' + fmtN(u.maxHp || u.def.base.hp) + '</span></span>' +
        '</div>';
    }).join('') || '<div class="shop-hint">暂无英雄</div>';
  },

  /* ---------- 购买：把第 i 件装备装备给第 heroIdx 位英雄 ---------- */
  buy(i, heroIdx){
    const eq = this.options[i];
    const u = G.formation[heroIdx];
    if(!eq || !u) return;
    const price = eq.price || 0;
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
    this.msg = { text: '✅ ' + eq.icon + ' ' + eq.name + '（-' + price + '💰）→ ' + u.def.name +
      '（装备 ' + u.equips.length + '/6）', cls: 'ok' };
    UI.info('unit', u, true);
    UI.updateHeader();
    Save.save();
    // 金币减少后，剩余装备可能买不起了 → 重算可用性；买完/全买不起 → 自动进入升星
    if(!this.options.length || this.options.every(e => (e.price || 0) > G.gold)){
      this.done();
      return;
    }
    this.render();          // render 会按最新金币重画顶部徽章与金币条
  },

  /* ---------- 完成选购 → 第 ② 屏：升星 ---------- */
  done(){
    this.sel = -1;
    this.msg = null;
    Save.save();
    if(typeof Rogue !== 'undefined' && Rogue.openStar) Rogue.openStar();
  },
};
