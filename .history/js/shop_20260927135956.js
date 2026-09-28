'use strict';

/* ================= 通关选择商店 ================= */
const Shop = {
  options: [],
  sel: null,      // 当前查看说明的选项 id
  armed: false,   // 已显示说明，再次点击生效
  msg: null,

  open(){
    // 下一关关数：装备档位随关卡提高（每 4 关解锁一档，1~5 档）
    const nl = (typeof MAX_LEVEL !== 'undefined') ? Math.min(MAX_LEVEL, G.level + 1) : G.level + 1;
    this.nextNo = nl;
    this.eqTier = Math.min(5, Math.max(1, Math.ceil(nl / 4)));

    // 每档英雄随机一个（只随机一次，保证 id / 名称 / 图标一致）
    const heroOpts = [20, 40, 60].map(tier => {
      const pool = HEROES.filter(h => h.tier === tier);
      const h = pickOne(pool);
      return { id:'h_' + tier + '_' + h.id,
               cat:'英雄', icon:h.emoji, name:h.name, price:tier, hero:h };
    });

    // 装备随机出现：当前档 4 件 + 前一档 2 件 + 已解锁档随机 2 件（共 8 件）
    const picked = new Set();
    const eqPicks = [];
    const take = (arr, k) => {
      const c = arr.filter(e => !picked.has(e.id));
      for(let i = 0; i < k && c.length; i++){
        const e = c.splice(Math.floor(Math.random() * c.length), 1)[0];
        picked.add(e.id);
        eqPicks.push(e);
      }
    };
    take(EQUIPS.filter(e => e.tier === this.eqTier), 4);
    if(this.eqTier > 1) take(EQUIPS.filter(e => e.tier === this.eqTier - 1), 2);
    take(EQUIPS.filter(e => e.tier >= 1 && e.tier <= this.eqTier), 2);
    eqPicks.sort(() => Math.random() - 0.5);

    this.options = [
      ...eqPicks.map(eq => ({ id:'e_' + eq.id, cat:'装备', icon:eq.icon, name:eq.name, price:eq.price, item:eq })),
      ...heroOpts,
    ];
    this.sel = null;
    this.armed = false;
    this.msg = null;
    if(G.currentHeroIdx >= G.formation.length) G.currentHeroIdx = 0;
    this.render();
    UI.info('unit', G.formation[G.currentHeroIdx]);
  },

  currentHero(){ return G.formation[G.currentHeroIdx] || null; },

  render(){
    // 注意：局部变量不能叫 nextLevel，否则会遮蔽全局 nextLevel() 函数
    const nl = this.nextNo || G.level + 1;
    const total = (typeof MAX_LEVEL !== 'undefined') ? MAX_LEVEL : '?';
    const isBoss = (typeof isBossLevel === 'function') && isBossLevel(nl);
    const nextCount = rollEnemyCount(nl);
    const nextTypes = rollEnemyTypes(nl);
    const typeCount = {};
    nextTypes.forEach(t => typeCount[t] = (typeCount[t] || 0) + 1);
    const typeStr = Object.keys(typeCount).map(t => ENEMY_TYPES[t].name + '×' + typeCount[t]).join('、');
    const tierStr = this.eqTier ? '｜本店装备档位：' + this.eqTier + ' 档' : '';
    // 上关输出榜：按本关累计输出取前 3 名
    const dmgBoard = G.formation.filter(u => u.dmgDealt > 0)
      .sort((a, b) => b.dmgDealt - a.dmgDealt).slice(0, 3)
      .map(u => u.def.name + ' ' + fmtN(u.dmgDealt)).join('｜');

    const html =
      '<div class="shop-wrap">' +
        '<div class="shop-top">' +
          '<span>🏆 第 <b>' + G.level + '</b> 关通过！</span>' +
          '<span class="reward">获得 +' + G.reward + ' 金币</span>' +
          '<span>💰 当前金币：<b id="shopGold">' + G.gold + '</b></span>' +
          (dmgBoard ? '<span class="dmg-board">⚔ 上关输出：' + dmgBoard + '</span>' : '') +
          '<span class="hint">下一关（第 ' + nl + '/' + total + ' 关' + (isBoss ? ' · ⚠️ Boss 关' : '') +
            tierStr + '）预计敌人 ' + nextCount + ' 个：' + typeStr + '</span>' +
        '</div>' +
        '<div class="shop-cols">' +
          '<div class="panel shop-heroes">' +
            '<div class="p-title">当前英雄（默认第一个，可点击切换）</div>' +
            '<div class="hero-list" id="heroList"></div>' +
            '<div class="shop-hint">装备装给当前选中的英雄；点英雄列表的 ⭐ 按钮升星；' +
            '在介绍栏打开已装备的道具详情可「卸下回收」换回一半金币</div>' +
          '</div>' +
          '<div class="panel shop-desc">' +
            '<div class="p-title">选项说明框</div>' +
            '<div class="desc-body" id="shopDesc"></div>' +
          '</div>' +
          '<div class="panel shop-opts">' +
            '<div class="p-title">商店：点选项查看说明，再次点击生效</div>' +
            this.optionsHtml() +
          '</div>' +
        '</div>' +
        '<div class="shop-foot">' +
          UI.sellBtnHtml() +
          '<button class="btn primary" id="btnNext">✅ 选项生效完毕，进入第 ' + nl + ' 关 →</button>' +
          '<span class="shop-hint">提示：金币可通过通关与击杀敌人获得（小兵+5 / 精英+10 / boss+20 / 精英boss+50）</span>' +
        '</div>' +
      '</div>';

    const scr = document.getElementById('shopScreen');
    scr.innerHTML = html;
    this.renderHeroes();
    this.showDesc();

    scr.querySelector('#heroList').addEventListener('click', ev => {
      // 升星按钮（单击直接生效，结果反馈到说明框）
      const starEl = ev.target.closest('.hp-star');
      if(starEl){
        const u = G.formation[Number(starEl.dataset.star)];
        if(!u) return;
        const r = starUp(u);
        this.msg = { text: r.msg, cls: r.ok ? 'ok' : 'err' };
        this.renderHeroes();
        this.showDesc();
        UI.info('unit', u, true);
        UI.updateHeader();
        Save.save();
        const goldEl = document.getElementById('shopGold');
        if(goldEl) goldEl.textContent = G.gold;
        return;
      }
      const item = ev.target.closest('.hero-pick');
      if(!item) return;
      G.currentHeroIdx = Number(item.dataset.idx);
      this.renderHeroes();
      this.showDesc();
      UI.info('unit', this.currentHero());
    });
    scr.querySelector('.shop-opts').addEventListener('click', ev => {
      const btn = ev.target.closest('.opt');
      if(!btn || btn.classList.contains('disabled')) return;
      this.onOption(btn.dataset.opt);
    });
    scr.querySelector('#btnNext').addEventListener('click', () => window.nextLevel());
    UI.bindSell(scr, () => this.render());   // 卖血按钮：+10💰，下场开战全体 -20% HP
    UI.initTip();   // 确保悬停提示已绑定（内部有重复绑定保护）
    UI.updateHeader();
    Save.save();    // 商店阶段每次渲染后写入进度存档
  },

  optionsHtml(){
    const cats = ['装备', '英雄'];
    const icons = { '装备':'⚔️', '英雄':'🧝' };
    return cats.map(cat => {
      const list = this.options.filter(o => o.cat === cat);
      return '<div class="opt-group"><div class="opt-group-title">' + icons[cat] + ' ' + cat + '</div>' +
        '<div class="opt-list">' +
        list.map(o => {
          // 装备说明 + 装备技能行直接显示在选项里，不用点开
          const rawSk = (o.cat === '装备' && o.item && o.item.skill) ? o.item.skill : null;
          const eqSk = (typeof rawSk === 'string') ? SKILLS[rawSk] : rawSk;
          const desc = (o.cat === '装备' && o.item && o.item.desc)
            ? '<span class="opt-desc">' + o.item.desc +
              (eqSk ? '<span class="opt-skill">⚙ ' + (eqSk.type === 'active' ? '主动' : '被动') +
                '·' + eqSk.name + '：' + eqSk.desc + '</span>' : '') +
              '</span>' : '';
          // 档位徽章按档位颜色显示（1~5 档一眼区分）
          const tierTag = (o.cat === '装备' && o.item && o.item.tier)
            ? ' <span class="opt-tier" style="color:' + TIER_COLORS[o.item.tier] +
              ';border-color:' + TIER_COLORS[o.item.tier] + '66">' +
              TIER_NAMES[o.item.tier] + ' ' + o.item.tier + '档</span>' : '';
          const pureTag = (o.cat === '装备' && o.item && !o.item.skill)
            ? ' <span class="opt-tier" style="color:#8fe3a8;border-color:rgba(143,227,168,.4)">纯属性</span>' : '';
          // 分类徽标 + 分类配色（注意：o.cat 是「装备/英雄」分组，装备分类要读 o.item.cat）
          const catC = (o.cat === '装备' && o.item && EQ_CATS[o.item.cat]) ? EQ_CATS[o.item.cat] : null;
          const catTag = catC
            ? ' <span class="opt-cat opt-cat--' + o.item.cat + '">' + catC.icon + catC.name + '</span>' : '';
          // 鼠标悬停显示属性浮层（装备）
          const tip = (o.cat === '装备' && o.item)
            ? ' data-tip="' + UI.tipAttr(o.item) + '"' : '';
          return '<button class="opt' + (catC ? ' opt--' + o.item.cat : '') + '" data-opt="' + o.id + '"' + tip + '>' +
            '<span class="opt-ico">' + o.icon + '</span>' +
            '<span class="opt-main"><span class="opt-name">' + o.name + catTag + tierTag + pureTag + '</span>' + desc + '</span>' +
            '<span class="opt-price">' + o.price + '金</span>' +
            '</button>';
        }).join('') +
        '</div></div>';
    }).join('');
  },

  renderHeroes(){
    const list = document.getElementById('heroList');
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
        '<span class="hp-sub"><span class="stars">' + '★'.repeat(u.star) + '</span> · ' + POS_NAMES[u.posType] + ' · 装备 ' + u.equips.length + '/6</span></span>' +
        starBtn +
        '</div>';
    }).join('') || '<div class="shop-hint">暂无英雄</div>';
  },

  /* 第一次点击：显示说明；再次点击：生效 */
  onOption(id){
    const o = this.options.find(x => x.id === id);
    if(!o) return;
    if(this.sel !== id){
      this.sel = id;
      this.armed = true;
      this.msg = null;
      this.showDesc();
      this.highlight();
      return;
    }
    if(!this.armed){
      this.armed = true;
      this.showDesc();
      return;
    }
    // 再次点击 → 生效
    this.apply(o);
  },

  highlight(){
    document.querySelectorAll('#shopScreen .opt').forEach(el => {
      el.classList.toggle('sel', el.dataset.opt === this.sel);
    });
  },

  showDesc(){
    const box = document.getElementById('shopDesc');
    if(!box) return;
    if(!this.sel){
      box.innerHTML = '<div class="desc-title">请选择选项</div>' +
        '<div class="kv">点击右侧任意选项，这里会显示它的说明；' +
        '<b>再次点击该选项</b>即可对当前选中的英雄生效。<br><br>' +
        '· 装备：装给当前英雄的 6 个装备格子（颜色区分 1~5 档，部分为纯属性装备）<br>' +
        '· 英雄：加入你的阵营（自动选择位置）<br>' +
        '· ⭐升星：点左侧英雄列表的升星按钮，每星核心属性 +35%、攻速 +7%，3 星 2 技能、5 星 3 技能</div>' +
        (this.msg ? '<div class="desc-msg ' + this.msg.cls + '">' + this.msg.text + '</div>' : '');
      return;
    }
    const o = this.options.find(x => x.id === this.sel);
    const hero = this.currentHero();
    let body = '';
    if(o.cat === '英雄'){
      const sks = (o.hero.skills || []).map(id => SKILLS[id]).filter(Boolean);
      body = '<div class="desc-title">' + o.icon + ' ' + o.name + '</div>' +
        '<span class="desc-tag">英雄 · ' + HERO_TIERS[o.price] + '档</span>' +
        '<div class="desc-price">价格：' + o.price + ' 金币</div>' +
        '<div class="kv">' + POS_NAMES[o.hero.pos] + ' ｜ ' + o.hero.bio + '</div><br>' +
        sks.map(sk => '<b>' + (sk.type === 'active' ? '【主动】' : '【被动】') + sk.name + '</b><br>' + sk.desc + '<br>').join('');
    } else {
      const statLine = Object.keys(o.item.stats || {}).map(k => {
        const row = STAT_ROWS.find(r => r[0] === k);
        const label = row ? row[1].split(' ')[1] : k;
        const pct = row ? row[2] : 0;
        return label + ' +' + o.item.stats[k] + (pct ? '%' : '');
      }).join('，');
      // 装备技能行：属性与风味描述之间单独成块（纯属性装备没有技能）
      const rawSk = o.item && o.item.skill;
      const sk = (typeof rawSk === 'string') ? SKILLS[rawSk] : rawSk;
      const skBlock = sk
        ? '<div class="kv eq-skill">装备技能：<span class="badge ' + (sk.type === 'active' ? 'b-a' : 'b-p') + '">' +
          (sk.type === 'active' ? '主动' : '被动') + '</span> <b>' + sk.name + '</b><br>' + sk.desc +
          (sk.type === 'active'
            ? '<br>💧 消耗 ' + sk.cost + ' 魔法值 ｜ ⏱ 冷却 ' + skillCdMax(sk) + ' 秒（上限 ' + SKILL_CD_MAX + ' 秒）｜ 蓝满且冷却完毕即放（装上后获得独立蓝条）'
            : '<br>装上后满足条件时自动生效') +
          '</div><br>'
        : '';
      const pureNote = (o.item && !o.item.skill)
        ? '<div class="kv">🧱 纯属性装备：不带技能，属性加成更纯粹。</div><br>' : '';
      const tierC = (o.item && o.item.tier) ? TIER_COLORS[o.item.tier] : '';
      body = '<div class="desc-title">' + o.icon + ' ' + o.name + '</div>' +
        '<span class="desc-tag"' + (tierC ? ' style="color:' + tierC + ';border-color:' + tierC + '66"' : '') + '>' +
        o.cat + (o.item && o.item.tier ? ' · ' + TIER_NAMES[o.item.tier] + ' ' + o.item.tier + ' 档' : '') +
        (o.item && !o.item.skill ? ' · 纯属性' : '') + '</span>' +
        '<div class="desc-price">价格：' + o.price + ' 金币</div>' +
        '<div class="kv">属性：' + statLine + '</div><br>' +
        skBlock + pureNote +
        o.item.desc + '<br><br>' +
        '<div class="kv">生效目标：' + (hero ? hero.def.name : '（无英雄）') + '</div>';
    }
    box.innerHTML = body +
      '<div class="desc-msg' + (this.msg ? ' ' + this.msg.cls : '') + '">' +
      (this.msg ? this.msg.text : '再次点击该选项即可生效') + '</div>';
  },

  apply(o){
    const hero = this.currentHero();
    const setMsg = (text, cls) => { this.msg = { text, cls }; this.showDesc(); };

    if(G.gold < o.price){ setMsg('❌ 金币不足，需要 ' + o.price + ' 金币', 'err'); this.armed = true; return; }

    if(o.cat === '装备'){
      if(!hero){ setMsg('❌ 没有可生效的英雄', 'err'); return; }
      if(hero.equips.length >= 6){ setMsg('❌ ' + hero.def.name + ' 的装备格子已满（6/6）', 'err'); return; }
      G.gold -= o.price;
      hero.equips.push(o.item);
      hero._frame = -1;
      refreshMaxHp(hero);
      setMsg('✅ ' + o.name + ' 已装备给 ' + hero.def.name + '（' + hero.equips.length + '/6）', 'ok');
    }
    else if(o.cat === '英雄'){
      if(G.formation.length >= FORMATION_CAP){ setMsg('❌ 阵容已满（' + FORMATION_CAP + '）', 'err'); return; }
      G.gold -= o.price;
      const u = createUnit(o.hero, 'player');
      placeUnit(u);
      G.formation.push(u);
      G.currentHeroIdx = G.formation.length - 1;
      setMsg('✅ ' + o.name + ' 已加入阵营！', 'ok');
    }

    this.armed = false;   // 生效完毕，需再次选择查看说明
    const goldEl = document.getElementById('shopGold');
    if(goldEl) goldEl.textContent = G.gold;
    this.renderHeroes();
    this.highlight();
    UI.updateHeader();
    UI.info('unit', this.currentHero());
    Save.save();
  },
};
