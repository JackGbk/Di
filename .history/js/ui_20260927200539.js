'use strict';

/* ================= UI 模块 ================= */
const UI = {
  _lastUnit: null,

  /* ---------- 屏幕切换 ---------- */
  setScreen(name){
    ['select','battle','shop','loot','star','diff','art','upg','bless','enc','over'].forEach(s => {
      const el = document.getElementById(s + 'Screen');
      if(el) el.classList.toggle('hidden', s !== name);
    });
    this.updateHeader();
    if(name === 'battle'){
      requestAnimationFrame(() => { this.updatePositions(); resizeCanvas(); });
    }
  },

  /* ---------- 顶栏 ---------- */
  updateHeader(){
    const set = (id, v) => { const el = document.getElementById(id); if(el) el.textContent = v; };
    set('hudLevel', G.level + ' / ' + (typeof MAX_LEVEL !== 'undefined' ? MAX_LEVEL : '?'));
    set('hudGold', G.gold);
    const enemyAlive = G.enemies.filter(u => u.alive).length;
    set('hudEnemy', G.phase === 'battle' ? enemyAlive :
      (['shop','loot','star','diff','art','upg','bless','enc'].indexOf(G.phase) >= 0 ? G.enemies.length : 0));
    const dif = (typeof difficultyDef === 'function') ? difficultyDef(G.difficulty || 0) : null;
    const phaseText = {
      select:'选择英雄',
      battle:'第 ' + G.level + ' 关 · 战斗中' + (dif ? ' · ' + dif.icon + dif.name : ''),
      shop:'通关 · 补给商店',
      loot:'通关 · ① 装备购买',
      star:'通关 · ② 升星',
      diff:'战前 · 选择第 ' + G.level + ' 关难度',
      art:'通关 · ③ 神器选择',
      upg:'通关 · 改造三选一（已停用）',
      bless:'通关 · 祝福三选一',
      enc:'通关 · 奇遇事件',
      over: G.win ? '🎉 通关 ' + (typeof MAX_LEVEL !== 'undefined' ? MAX_LEVEL : '') + ' 关' : '全军覆没',
    }[G.phase] || '';
    set('hudPhase', phaseText);

    // 速度/暂停控件只在战斗中显示
    const spd = document.getElementById('tbSpeed');
    if(spd) spd.classList.toggle('hidden', G.phase !== 'battle');

    const flag = document.getElementById('turnFlag');
    if(flag && G.battle){
      const mine = G.formation.filter(u => u.alive).length;
      const foes = G.enemies.filter(u => u.alive).length;
      if(G.paused)                    flag.textContent = '⏸ 已暂停 · 按空格继续';
      else if(G.battle.elapsed >= 90) flag.textContent = '🌪 风暴来袭 · 我方 ' + mine + ' ｜ 敌方 ' + foes;
      else                            flag.textContent = '⚔ 即时战斗中 · 我方 ' + mine + ' ｜ 敌方 ' + foes;
      flag.style.color = '#ffd35c';
    }
  },

  /* ---------- 卖血按钮（所有花金币的界面通用）----------
   * 点一下立刻 +10💰，代价是下一场开战时全体当前 HP -20%；
   * 可叠加（上限 4 层 = -80%），开战时结算并清零。 */
  SELL_MAX: 4,
  sellLabel(n){
    if(n >= this.SELL_MAX) return '🩸 卖血已叠满 ×' + n + '（下场 -80% HP）';
    return n > 0 ? '🩸 卖血 ×' + n + '（下场全体 -' + (n * 20) + '% HP）'
                 : '🩸 卖血：下场全体 -20% HP，+10💰';
  },
  sellBtnHtml(){
    const n = G.sellBlood | 0;
    const tip = '🩸 卖血：立刻获得 10💰；下一场开战时全体存活单位当前 HP -20%' +
      '（可叠加，最多 4 层 -80%，开战时结算）';
    return '<button class="btn sell-blood' + (n > 0 ? ' on' : '') + (n >= this.SELL_MAX ? ' max' : '') +
      '" id="btnSellBlood" data-tip="' + tip + '"' + (n >= this.SELL_MAX ? ' disabled' : '') + '>' +
      this.sellLabel(n) + '</button>';
  },
  bindSell(root, rerender){
    const b = root.querySelector('#btnSellBlood');
    if(!b) return;
    b.addEventListener('click', () => {
      if((G.sellBlood | 0) >= this.SELL_MAX) return;
      const rect = b.getBoundingClientRect();   // 重绘会替换按钮，先取位置
      G.sellBlood = (G.sellBlood | 0) + 1;
      G.gold += 10;
      Save.save();
      this.updateHeader();
      this.sellFx();                     // 卖血视觉：全屏血雾脉冲
      this.sellGainAt(rect);             // 按钮处飘字 🩸 +10💰
      if(rerender) rerender();          // 重绘当前界面（刷新金币与按钮文案）
      else this.refreshGold();
    });
  },
  /* 原地刷新各界面的金币数字 */
  refreshGold(){
    ['shopGold', 'encGold', 'lootGoldBar'].forEach(id => {
      const el = document.getElementById(id);
      if(el) el.textContent = G.gold;
    });
    document.querySelectorAll('.gold-badge b').forEach(el => { el.textContent = G.gold; });
    const btn = document.getElementById('btnSellBlood');
    if(btn){
      const n = G.sellBlood | 0;
      btn.classList.toggle('on', n > 0);
      btn.classList.toggle('max', n >= this.SELL_MAX);
      if(n >= this.SELL_MAX) btn.disabled = true;
      btn.textContent = this.sellLabel(n);
    }
  },

  /* ---------- 卖血视觉：全屏血雾脉冲（点击普通 / 开战结算 strong） ---------- */
  sellFx(strong){
    const d = document.createElement('div');
    d.className = 'sell-fx' + (strong ? ' strong' : '');
    document.body.appendChild(d);
    setTimeout(() => { if(d.parentNode) d.parentNode.removeChild(d); }, 1000);
  },
  /* 点击卖血按钮的即时反馈：按钮位置飘 🩸 +10💰 */
  sellGainAt(rect){
    const f = document.createElement('div');
    f.className = 'sell-gain';
    f.textContent = '🩸 +10💰';
    f.style.left = (rect.left + rect.width / 2) + 'px';
    f.style.top = rect.top + 'px';
    document.body.appendChild(f);
    setTimeout(() => { if(f.parentNode) f.parentNode.removeChild(f); }, 1000);
  },

  /* ---------- 战场渲染 ---------- */
  renderBattle(){
    this.buildGrid('enemyGrid', G.enemies);
    this.buildGrid('playerGrid', G.formation);
    // 敌方阵营标题标注 Boss 战
    const hasBig = G.enemies.some(u => u.alive && u.def.enemyType === 'bigBoss');
    const hasMini = G.enemies.some(u => u.alive && u.def.enemyType === 'miniBoss');
    const et = document.querySelector('#battlefield .faction.enemy .faction-tag');
    if(et) et.textContent = hasBig ? '敌方阵营 · 👿 大 BOSS 战'
      : hasMini ? '敌方阵营 · 👹 小 BOSS 战' : '敌方阵营';
    this.updatePositions();
    resizeCanvas();
    this.updateHeader();
  },

  buildGrid(gridId, list){
    const grid = document.getElementById(gridId);
    if(!grid) return;
    grid.innerHTML = '';
    const isEnemy = gridId === 'enemyGrid';
    // 格子
    for(let r = 0; r < GRID_ROWS; r++){
      for(let c = 0; c < GRID_COLS; c++){
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.style.gridRow = (r + 1);
        cell.style.gridColumn = (c + 1);
        grid.appendChild(cell);
      }
    }
    // 单位
    list.filter(u => u.alive && u.row >= 0).forEach(u => {
      const d = document.createElement('div');
      const et = u.def.enemyType || '';
      const bossCls = et === 'bigBoss' ? ' u-eboss' : et === 'miniBoss' ? ' u-boss'
                    : et === 'elite' ? ' u-elite' : '';
      d.className = 'unit ' + (u.faction === 'player' ? 'u-player' : 'u-enemy') + bossCls;
      d.dataset.uid = u.id;
      d.style.gridRow = (u.row + 1);
      d.style.gridColumn = (u.col + 1);
      const act = getActiveSkills(u);   // 每个主动技能一条独立蓝条
      const nameMark = et === 'bigBoss' ? '👿' : et === 'miniBoss' ? '👹' : '';
      // 星级用星星个数表示（★ 重复 star 次），静态金色、独占一行更明显
      const starMark = u.faction === 'player'
        ? '<div class="u-star">' + '★'.repeat(u.star) + '</div>'
        : '';
      d.innerHTML =
        '<div class="u-head"><span class="u-name">' + nameMark + u.def.name + '</span>' +
        '<span class="u-tag">' + POS_SHORT[u.posType] + '</span></div>' +
        starMark +
        '<div class="u-emoji">' + u.def.emoji + '</div>' +
        '<div class="u-bars">' +
          '<div class="bar hpbar"><i class="barmax"></i><i class="bardelay"></i><i class="barfill"></i><span class="bar-num"></span></div>' +
          '<div class="bar shbar hidden"><i class="barfill"></i></div>' +
          act.map(sk => '<div class="bar mnbar" title="' + sk.name + '（独立蓝条 · 冷却 ' + skillCdMax(sk) + ' 秒）">' +
            '<i class="barfill" style="background:' + (sk.color || '#3f7dff') + '"></i>' +
            '<i class="cdmask"></i>' +
            '<span class="bar-num"></span></div>').join('') +
        '</div>' +
        '<div class="u-st"></div>';
      u.el = d;
      u.parts = {
        fill:  d.querySelector('.hpbar .barfill'),
        delay: d.querySelector('.hpbar .bardelay'),
        hpNum: d.querySelector('.hpbar .bar-num'),
        hpTxt: '',
        sh:    d.querySelector('.shbar'),
        shf:   d.querySelector('.shbar .barfill'),
        mns:   Array.prototype.map.call(d.querySelectorAll('.mnbar'), (el, i) => ({
          el,
          fill: el.querySelector('.barfill'),
          mask: el.querySelector('.cdmask'),
          num:  el.querySelector('.bar-num'),
          sk:   act[i],
          txt:  '',
          onCd: false,
        })),
        st:    d.querySelector('.u-st'),
      };
      u.stHtml = '';
      u.hpDelayed = u.hp;
      u.dropActive = false;
      grid.appendChild(d);
    });
    void isEnemy;
  },

  /* ---------- 单位坐标（子弹/飘字定位） ---------- */
  updatePositions(){
    const field = document.getElementById('battlefield');
    if(!field) return;
    const br = field.getBoundingClientRect();
    for(const u of allUnits()){
      if(!u.el) continue;
      const r = u.el.getBoundingClientRect();
      u.px = r.left - br.left + r.width / 2;
      u.py = r.top - br.top + r.height * 0.45;
    }
  },

  /* ---------- 每帧刷新单位卡片 ---------- */
  updateFrame(dt){
    if(G.phase !== 'battle') return;
    for(const u of allUnits()){
      if(!u.el || !u.parts) continue;
      const p = u.parts;
      const maxHp = u.maxHp || 1;

      // 血条：当前条立刻变化，延迟条慢慢追上（掉血红色残影）
      if(u.hpDelayed < u.hp) u.hpDelayed = u.hp;
      else if(u.hpDelayed > u.hp){
        if(!u.dropActive){ u.dropActive = true; u.delayT = 0.25; }
        u.delayT -= dt;
        if(u.delayT <= 0){
          u.hpDelayed = Math.max(u.hp, u.hpDelayed - maxHp * 1.4 * dt);
        }
      } else u.dropActive = false;

      p.fill.style.width  = clamp(u.hp / maxHp * 100, 0, 100) + '%';
      p.delay.style.width = clamp(u.hpDelayed / maxHp * 100, 0, 100) + '%';

      // 血条数字：当前/上限
      if(p.hpNum){
        const ht = fmtN(u.hp) + '/' + fmtN(maxHp);
        if(ht !== p.hpTxt){ p.hpNum.textContent = ht; p.hpTxt = ht; }
      }

      // 护盾条（类似魔法条，单独显示）
      if(u.shield > 0){
        p.sh.classList.remove('hidden');
        p.shf.style.width = clamp(u.shield / maxHp * 100, 0, 100) + '%';
      } else p.sh.classList.add('hidden');

      // 独立蓝条：每条对应一个主动技能，各自显示数字；
      // 冷却中 → 暗色遮罩按剩余比例盖住蓝条 + 数字变为倒计时（可视化 CD）
      if(p.mns && p.mns.length){
        const mx = Math.max(1, stat(u, 'maxMana'));
        for(const m of p.mns){
          if(!m.sk) continue;
          const cur = skillManaOf(u, m.sk);
          m.fill.style.width = clamp(cur / mx * 100, 0, 100) + '%';
          const cd = skillCdOf(u, m.sk);
          if(cd > 0){
            const cdMax = Math.max(0.01, skillCdMax(m.sk));
            if(!m.onCd){ m.el.classList.add('on-cd'); m.onCd = true; }
            m.mask.style.width = clamp(cd / cdMax * 100, 0, 100) + '%';
            const ct = (cd >= 1 ? Math.ceil(cd) : cd.toFixed(1)) + 's';
            if(ct !== m.txt){ m.num.textContent = ct; m.txt = ct; }
          } else {
            if(m.onCd){ m.el.classList.remove('on-cd'); m.onCd = false; m.mask.style.width = '0%'; m.txt = ''; }
            const mt = fmtN(cur) + '/' + fmtN(mx);
            if(mt !== m.txt){ m.num.textContent = mt; m.txt = mt; }
          }
        }
      }

      // 状态图标 + 临时 BUFF（显示名称与剩余秒数）
      let st = '';
      if(u.statuses.stun > 0)    st += '<span title="眩晕">😵 眩晕</span>';
      if(u.statuses.silence > 0) st += '<span title="沉默">🤐 沉默</span>';
      if(u.statuses.disarm > 0)  st += '<span title="缴械">✋ 缴械</span>';
      if(u.dots.length)          st += '<span style="color:#7dff9a">☠ 中毒</span>';
      // 怪物火车关键词：狂怒 / 护甲 / 尖刺
      if(u.rage > 0) st += '<span title="狂怒：每层 +' + RAGE_ATK + ' 攻击，每 ' +
        RAGE_DECAY_SEC + ' 秒衰减 1 层" style="color:#ff8a3c">🔥' + u.rage + '</span>';
      const armv = stat(u, 'armor');
      if(armv !== 0) st += '<span title="护甲：每次受击' + (armv > 0 ? '减免 ' + fmtN(armv) : '额外承受 ' + fmtN(-armv)) +
        ' 点伤害" style="color:' + (armv > 0 ? '#9adcff' : '#ff8f8f') + '">🛡' + fmtN(armv) + '</span>';
      const spkv = stat(u, 'spikes');
      if(spkv > 0) st += '<span title="尖刺：被击中时反弹 ' + fmtN(spkv) + ' 点真实伤害" style="color:#8fe3a8">🌵' + fmtN(spkv) + '</span>';
      if(u.buffs && u.buffs.length){
        for(const bf of u.buffs){
          const sec = (bf.remain != null && bf.remain > 0) ? ' ' + Math.ceil(bf.remain) + 's' : '';
          st += '<span class="u-buff" title="增益">✨' + (bf.name || '强化') + sec + '</span>';
        }
      }
      if(st !== u.stHtml){ p.st.innerHTML = st; u.stHtml = st; }
    }
    this.updateHeader();
  },

  /* ---------- 飘字 ---------- */
  float(u, text, cls){
    const layer = document.getElementById('floatLayer');
    if(!layer || !u.el) return;
    if(layer.childElementCount > 60){
      for(let i = 0; i < 20; i++) if(layer.firstElementChild) layer.removeChild(layer.firstElementChild);
    }
    const d = document.createElement('div');
    d.className = 'float ' + (cls || 'dmg');
    d.textContent = text;
    d.style.left = (u.px + (Math.random() * 24 - 12)) + 'px';
    d.style.top = (u.py - 26) + 'px';
    layer.appendChild(d);
    setTimeout(() => { if(d.parentNode) d.parentNode.removeChild(d); }, 950);
  },

  /* ---------- 被击边框变红 0.1s 渐隐 ---------- */
  hitFlash(u){
    if(!u.el) return;
    const el = u.el;
    el.classList.remove('hit');
    void el.offsetWidth;
    el.classList.add('hit');
  },

  /* ---------- 释放技能视觉 ----------
   * 动态往单位卡片里追加三个子元素（各自独立 CSS 动画，不占用 .unit 的
   * animation 属性，避免覆盖受击闪红与 Boss 呼吸动画）：
   *   .cast-glow  技能色全卡辉光（径向渐变 + 内发光，0.5s 淡出）
   *   .cast-ring  技能色扩散光环（从中心放大扫过卡片，被 overflow 裁出边界）
   *   .cast-ico   技能图标从中心弹出放大再上飘淡出
   * 另外把刚释放的那条蓝条闪一下（.bar-cast），让"哪条蓝放的"一眼可见。 */
  castFx(u, sk){
    if(!u.el) return;
    const el = u.el;
    const color = (sk && sk.color) || '#ffffff';
    el.style.setProperty('--castc', color);
    // 清掉上一次残留（连续快速施法）
    const olds = el.querySelectorAll('.cast-glow,.cast-ring,.cast-ico');
    for(let i = 0; i < olds.length; i++){
      if(olds[i].parentNode) olds[i].parentNode.removeChild(olds[i]);
    }
    const glow = document.createElement('i');
    glow.className = 'cast-glow';
    const ring = document.createElement('i');
    ring.className = 'cast-ring';
    el.appendChild(glow);
    el.appendChild(ring);
    setTimeout(() => { if(glow.parentNode) glow.parentNode.removeChild(glow); }, 560);
    setTimeout(() => { if(ring.parentNode) ring.parentNode.removeChild(ring); }, 560);
    if(sk && sk.icon){
      const ico = document.createElement('span');
      ico.className = 'cast-ico';
      ico.textContent = sk.icon;
      el.appendChild(ico);
      setTimeout(() => { if(ico.parentNode) ico.parentNode.removeChild(ico); }, 700);
    }
    // 刚释放的那条蓝条闪烁（施法后蓝量已被扣除，闪一下强调来源）
    if(u.parts && u.parts.mns && sk){
      for(const m of u.parts.mns){
        if(!m.sk || m.sk.id !== sk.id) continue;
        m.el.classList.remove('bar-cast');
        void m.el.offsetWidth;
        m.el.classList.add('bar-cast');
        const bar = m.el;
        setTimeout(() => { bar.classList.remove('bar-cast'); }, 480);
        break;
      }
    }
  },

  removeUnit(u){
    if(!u.el) return;
    const el = u.el;
    el.classList.add('dead');
    u.el = null;
    u.parts = null;
    setTimeout(() => { if(el.parentNode) el.parentNode.removeChild(el); }, 320);
  },

  /* ================= 升星视觉特效 =================
   * 在升星按钮位置爆出金色光环 + 星星粒子；升到 3★ 用双环、5★ 用三环 + 更大文字 + 全屏闪光。 */
  starFx(anchor, star){
    if(typeof document === 'undefined' || !document.body) return;
    const el = (anchor && anchor.getBoundingClientRect) ? anchor : null;
    const r = el ? el.getBoundingClientRect()
                 : { left:window.innerWidth / 2, top:window.innerHeight / 2, width:0, height:0 };
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const big = star >= 3, mega = star >= 5;
    const fx = document.createElement('div');
    fx.className = 'star-fx' + (mega ? ' mega' : big ? ' big' : '');
    fx.style.left = cx + 'px';
    fx.style.top = cy + 'px';
    let html = '';
    const rings = mega ? 3 : (big ? 2 : 1);
    for(let i = 0; i < rings; i++) html += '<div class="star-fx-ring' + (i ? ' r' + (i + 1) : '') + '"></div>';
    html += '<div class="star-fx-txt">⭐ 升到 ' + star + ' 星！</div>';
    const n = mega ? 16 : (big ? 12 : 8);
    const pool = mega ? ['⭐', '🌟', '✨', '💫'] : ['⭐', '✨'];
    for(let i = 0; i < n; i++){
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const d = (mega ? 130 : (big ? 100 : 70)) + Math.random() * 40;
      html += '<div class="star-fx-p" style="--dx:' + Math.round(Math.cos(a) * d) +
              'px;--dy:' + Math.round(Math.sin(a) * d) + 'px;animation-delay:' + (i * 0.02) + 's">' +
              pool[i % pool.length] + '</div>';
    }
    fx.innerHTML = html;
    document.body.appendChild(fx);
    setTimeout(() => { if(fx.parentNode) fx.parentNode.removeChild(fx); }, mega ? 2600 : (big ? 2300 : 1700));
    if(big){   // 3★ / 5★ 追加全屏闪光
      const fl = document.createElement('div');
      fl.className = 'star-flash';
      document.body.appendChild(fl);
      setTimeout(() => { if(fl.parentNode) fl.parentNode.removeChild(fl); }, 1000);
    }
  },

  /* ================= 悬停属性提示 ================= */
  itemTip(item){
    if(!item) return '';
    const stats = item.stats || {};
    const lines = Object.keys(stats).map(k => {
      const row = STAT_ROWS.find(r => r[0] === k);
      const label = row ? (row[1].split(' ')[1] || k) : k;
      const ic = row ? row[1].split(' ')[0] : '•';
      const pct = row ? row[2] : 0;
      return ic + label + ' +' + stats[k] + (pct ? '%' : '');
    });
    // 装备技能行：徽章 + 技能名 + 效果（跟在属性后面、风味描述前面）
    let skHtml = '';
    const sk = item.skill;
    if(sk){
      skHtml = '<div class="ht-skill"><span class="badge ' + (sk.type === 'active' ? 'b-a' : 'b-p') + '">' +
        (sk.type === 'active' ? '主动' : '被动') + '</span><b>' + sk.name + '</b></div>' +
        '<div class="ht-sdesc">' + sk.desc + '</div>';
    }
    const tierC = item.tier ? TIER_COLORS[item.tier] : '';
    const catC = EQ_CATS[item.cat] || null;
    return '<b>' + item.icon + ' ' + item.name + '</b>' +
      (catC ? ' <span class="ht-tier" style="color:' + catC.color + ';border-color:' + catC.color +
        '66;background:' + catC.color + '1f">' + catC.icon + ' ' + catC.name + '</span>' : '') +
      (item.tier ? ' <span class="ht-tier" style="color:' + tierC + ';border-color:' + tierC + '55">' +
        item.tier + ' 档 · ' + TIER_NAMES[item.tier] + '</span>' : '') +
      (item.pure || !item.skill ? ' <span class="ht-tier" style="color:#8fe3a8;border-color:rgba(143,227,168,.4)">纯属性</span>' : '') +
      (item.price ? ' ｜ ' + item.price + ' 金' : '') +
      '<div class="ht-stats">' + (lines.join(' ｜ ') || '无属性') + '</div>' +
      skHtml +
      (item.desc ? '<div class="ht-desc">' + item.desc + '</div>' : '');
  },

  /* 生成可放进 data-tip 属性的字符串：
     把 HTML 里的双引号统一换成单引号，属性值就不会被提前截断、打乱商店排版
     （HTML 属性用单引号包裹同样合法，innerHTML 解析不受影响） */
  tipAttr(item){ return this.itemTip(item).replace(/"/g, "'"); },

  /* 全局悬停监听：鼠标移到带 data-tip 的元素即显示属性浮层（只绑定一次） */
  initTip(){
    if(this._tipBound) return;
    const tip = document.getElementById('hoverTip');
    if(!tip) return;
    this._tipBound = true;
    const find = e => (e.target && e.target.closest) ? e.target.closest('[data-tip]') : null;
    document.addEventListener('mouseover', e => {
      const el = find(e);
      if(!el) return;
      tip.innerHTML = el.getAttribute('data-tip') || '';
      tip.classList.remove('hidden');
    });
    document.addEventListener('mousemove', e => {
      if(tip.classList.contains('hidden')) return;
      let x = e.clientX + 16, y = e.clientY + 18;
      const r = tip.getBoundingClientRect();
      if(x + r.width > window.innerWidth - 8)  x = e.clientX - r.width - 12;
      if(y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 12;
      tip.style.left = Math.max(4, x) + 'px';
      tip.style.top  = Math.max(4, y) + 'px';
    });
    document.addEventListener('mouseout', e => {
      const el = find(e);
      if(!el) return;
      if(e.relatedTarget && el.contains(e.relatedTarget)) return;   // 仍在同一元素内移动
      tip.classList.add('hidden');
    });
  },

  /* ================= 介绍栏 ================= */
  info(kind, data, noPush){
    const body = document.getElementById('ipBody');
    if(!body) return;
    // 视图历史：支持「← 返回」逐级回退（单位 → 技能 / 装备 / 图鉴 → …）
    if(!noPush){
      if(!this._hist) this._hist = [];
      if(this._curKind) this._hist.push({ kind:this._curKind, data:this._curData });
      if(this._hist.length > 16) this._hist.shift();
    }
    this._curKind = kind;
    this._curData = data;
    if(kind === 'unit') this._lastUnit = data;
    let html = '';
    if(kind === 'help')           html = this.helpHtml();
    else if(kind === 'unit')      html = this.unitHtml(data);
    else if(kind === 'skill')     html = this.skillHtml(data);
    else if(kind === 'item')      html = this.itemHtml(data);
    else if(kind === 'heroCodex') html = this.heroCodexHtml();
    else if(kind === 'equipCodex')html = this.equipCodexHtml();
    body.innerHTML = html;
    body.scrollTop = 0;
  },

  helpHtml(){
    return '<div class="ip-head"><div class="ip-emoji">📖</div>' +
      '<div><div class="ip-name">玩法说明</div><div class="ip-sub">点击单位 / 技能 / 装备查看，顶部可开图鉴</div></div></div>' +
      '<div class="desc-box">' +
      '<b>战斗（即时制）</b><br>双方所有单位同时在场、各自行动：每个单位按自己的' +
      '<b>攻击速度</b>独立普攻（攻速 1.0 = 每 1 秒出手一次，攻速 0.5 = 每 2 秒一次），没有回合切换。' +
      '子弹到达目标后才结算伤害。<br><br>' +
      '<b>升星</b><br>英雄初始 <b>1 星、只有 1 个技能</b>；<b>3 星解锁第 2 个、5 星解锁第 3 个</b>（最多 5 星）。' +
      '每次升星<b>核心属性 +35%、攻速 +7%</b>，<b>一律花金币且星级越高越贵</b>（1星15 / 2星30 / 3星45 / 4星60 金）：' +
      '战后第 ② 屏、英雄详情里的升星按钮均可花费金币继续升。<br><br>' +
      '<b>魔法值与冷却</b><br>每个主动技能都有自己<b>独立的蓝条</b>（随英雄升星解锁）。攻击与被攻击会同时为所有蓝条充能，<b>蓝条满（够耗蓝）且冷却完毕才会释放</b>（眩晕、沉默无法释放）。' +
      '每个技能释放后进入<b>独立冷却</b>，<b>CD 最长 5 秒</b>；冷却中的蓝条会被<b>暗色遮罩按剩余时间盖住，数字变成倒计时</b>，遮罩退完即可再次释放（眩晕不影响冷却流逝）。<br><br>' +
      '<b>装备档位</b><br>装备分 1~5 档并<b>用颜色区分</b>：普通（灰蓝）/ 精良（绿）/ 稀有（蓝）/ 史诗（紫）/ 传说（金）；' +
      '一半装备是<b>纯属性</b>、一半带一件<b>特色被动</b>（Dota2 式招牌：格挡 / 溅射 / 吸血 / 反弹 / 晕眩……），' +
      '技能<b>悬停装备或技能图标</b>即可查看完整说明。<br><br>' +
      '<b>位置类型</b><br>前 / 中 / 后 三种，生成时先横向居中，再由位置类型决定纵向位置，前排离对面更近。<br><br>' +
      '<b>状态</b><br>😵 眩晕：跳过行动；🤐 沉默：无法放技能；✋ 缴械：无法普攻。<br><br>' +
      '<b>图鉴与通关</b><br>介绍栏顶部的<b>「英雄图鉴」「装备图鉴」</b>可查看全部英雄与装备。' +
      '全程共 <b>15 关</b>：<b>每关 1 个小 Boss</b>（各有独特机制），第 <b>5/10/15 关额外出现大 Boss</b>，' +
      '通关第 15 关即获胜。<br><br>' +
      '<b>关键词（怪物火车式）</b><br>' +
      '🛡 <b>护甲</b>——平坦减免：物理伤害先减去等额护甲（护甲可为负 → 增伤），单次至少保留 1 点；' +
      '🔥 <b>狂怒</b>——每层 +1 攻击，最多 15 层，每 4 秒衰减 1 层；' +
      '🌵 <b>尖刺</b>——被击中时对攻击者反弹固定真实伤害。<br><br>' +
      '<b>关卡难度</b><br>每关开战前二选一：⚔️ 标准（正常强度）／' +
      '🔥 挑战（敌人属性 +30%、数量 +1；通关金币 +50%）。' +
      '难度卡片上的 <b>💰 小图标</b>显示本关预计奖励，<b>鼠标悬停</b>可查看本关主题难点与 Boss 词条。<br><br>' +
      '<b>战后流程</b><br>战斗胜利后依次经历：' +
      '<b>① 装备购买</b>——随机刷出 <b>6 件 1~5★ 装备</b>，<b>点选装备再点英雄</b>即购买' +
      '（也支持拖拽；点<b>【选好了】</b>可直接继续）；' +
      '<b>② 升星</b>——点击一位英雄<b>花金币升 1 星</b>（星级越高越贵）；' +
      '<b>③ 神器三选一</b>——点一件全局神器（永久改变规则）。' +
      '之后<b>随机穿插</b>：<b>🌟 祝福三选一</b>（全局强化、可叠加）与 <b>🎲 奇遇事件</b>' +
      '（二选一、结果不可撤销）按概率触发、<b>每关最多各一次</b>——有的关出现、有的关没有，' +
      '顺序也可能不同，<b>每关都不一样</b>；全部结算完毕后进入下一关难度选择。<br><br>' +
      '<b>敌人词缀</b><br>第 <b>4 关</b>起精英随机携带 <b>1 条词缀</b>' +
      '（狂暴 / 吸血 / 荆棘 / 铁壁 / 奥术 / 迅捷），挑战前先看清楚对手。' +
      '</div>';
  },

  unitHtml(u){
    const c = calcTotals(u);
    const isPlayer = u.faction === 'player';
    let rows = '';
    STAT_ROWS.forEach(([k, label, pct]) => {
      const b = c.base[k] || 0;
      const bn = c.bonus[k] || 0;
      // 攻击速度保留两位小数，其余按整数 / 百分比显示
      const f = v => k === 'atkSpd' ? (Math.round(v * 100) / 100).toFixed(2)
                  : pct ? (fmtN(v) + '%') : fmtN(v);
      const bs = f(b);
      let ns = '';
      if(bn > 0.001) ns = '+' + f(bn);
      rows += '<div class="stat-row"><span class="sicon">' + label.split(' ')[0] + '</span>' +
              '<span class="sl">' + label.split(' ')[1] + '：</span>' +
              '<span class="sv">' + bs + '</span><span class="sb">' + ns + '</span></div>';
    });
    rows += '<div class="stat-row"><span class="sicon">🥉</span><span class="sl">击杀数：</span>' +
            '<span class="sv">' + u.kills + '</span><span class="sb"></span></div>';
    rows += '<div class="stat-row"><span class="sicon">📍</span><span class="sl">位置类型：</span>' +
            '<span class="sv">' + POS_NAMES[u.posType] + '</span><span class="sb"></span></div>';
    if(isPlayer){
      rows += '<div class="stat-row"><span class="sicon">⭐</span><span class="sl">星级：</span>' +
              '<span class="sv"><span class="stars">' + '★'.repeat(u.star) +
              '</span>（' + u.star + '/' + STAR_MAX + '）</span>' +
              '<span class="sb">' + (u.star >= STAR_MAX ? '已满星' : '下星 +' + Math.round(STAR_ATTR_PER * 100) + '% 属性') + '</span></div>';
      // 强化槽（改造）一览
      const upgNames = (u.upgrades || []).map(id => {
        const up = upgradeById(typeof id === 'string' ? id : id.id);
        return up ? up.icon + up.name : '';
      }).filter(Boolean).join(' ');
      rows += '<div class="stat-row"><span class="sicon">🧩</span><span class="sl">强化槽：</span>' +
              '<span class="sv">' + (u.upgrades || []).length + '/' +
              ((typeof Rogue !== 'undefined') ? Rogue.slotsOf(u) : 1) + '</span>' +
              '<span class="sb">' + (upgNames || '尚未装入改造') + '</span></div>';
    }
    // 狂怒层数（战斗中动态）
    if(u.rage > 0){
      rows += '<div class="stat-row"><span class="sicon">🔥</span><span class="sl">狂怒：</span>' +
              '<span class="sv">' + u.rage + ' 层</span>' +
              '<span class="sb">共 +' + (u.rage * RAGE_ATK) + ' 攻击</span></div>';
    }

    const sks = skillsOf(u);
    const mxMana = fmtN(stat(u, 'maxMana'));
    // 技能栏只显示单位自带技能；装备技能压缩成图标小圆片，鼠标悬停才显示完整说明
    let eqSkChips = '';
    let skillList = sks.map(sk => {
      const sid = sk.id || '';
      if(sid.indexOf('eqsk_') === 0){
        const e = (u.equips || []).find(x => x.skill &&
          (typeof x.skill === 'string' ? x.skill : x.skill.id) === sid);
        const tip = ('<b>' + (e ? e.icon + ' ' + e.name : '装备') + '</b>' +
          ' <span class="ht-tier" style="color:#8fe3a8;border-color:rgba(143,227,168,.4)">装备技能</span>' +
          '<div class="ht-skill"><span class="badge ' + (sk.type === 'active' ? 'b-a' : 'b-p') + '">' +
          (sk.type === 'active' ? '主动' : '被动') + '</span><b>' + sk.name + '</b></div>' +
          '<div class="ht-sdesc">' + sk.desc + '</div>').replace(/"/g, "'");
        eqSkChips += '<span class="eqsk-chip" data-tip="' + tip + '">' + (e ? e.icon : '✨') + '</span>';
        return '';
      }
      const badge = '<span class="badge ' + (sk.type === 'active' ? 'b-a' : 'b-p') + '">' +
                    (sk.type === 'active' ? '主动' : '被动') + '</span>';
      const kv = sk.type === 'active'
        ? '<div class="iskill-kv">💧 消耗 ' + sk.cost + ' 魔法 ｜ 当前 ' + fmtN(skillManaOf(u, sk)) + '/' + mxMana +
          ' ｜ ⏱ 冷却 ' + skillCdMax(sk) + ' 秒' +
          (skillCdOf(u, sk) > 0 ? '（剩余 ' + skillCdOf(u, sk).toFixed(1) + ' 秒）' : '（就绪）') + '</div>'
        : '<div class="iskill-kv">被动技能，满足条件时自动生效</div>';
      return '<div class="iskill">' +
        '<div class="iskill-head">' + badge + '<b>' + sk.name + '</b></div>' +
        '<div class="iskill-desc">' + sk.desc + '</div>' + kv + '</div>';
    }).join('');
    if(isPlayer){
      const heroIds = u.def.skills || [];
      const got = starSkillCount(u.star);
      for(let i = got; i < heroIds.length; i++){
        const sk = SKILLS[heroIds[i]];
        if(!sk) continue;
        skillList += '<div class="iskill locked">' +
          '<div class="iskill-head"><span class="badge b-star">🔒 ' + skillNeedStar(i) + '★ 解锁</span>' +
          '<b>' + sk.name + '</b></div>' +
          '<div class="iskill-desc">' + sk.desc + '</div>' +
          '<div class="iskill-kv">升到 ' + skillNeedStar(i) + ' 星后解锁（当前 ' + u.star + ' 星）</div></div>';
      }
    }
    if(!skillList) skillList = '<div class="ip-note">该单位没有技能。</div>';

    let eqHtml = '';
    if(isPlayer){
      let slots = '';
      for(let i = 0; i < 6; i++){
        const e = u.equips[i];
        if(e){
          const c = TIER_COLORS[e.tier] || '#4b6ea9';                 // 边框 = 档位色
          const cc = EQ_CATS[e.cat] ? EQ_CATS[e.cat].color : c;        // 名字 = 分类色（坦克/物理/魔法）
          slots += '<button class="eq-slot filled" data-equip="' + e.id +
                   '" data-tip="' + this.tipAttr(e) + '"' +
                   ' style="border-color:' + c + ';color:' + cc + '">' +
                   (EQ_CATS[e.cat] ? EQ_CATS[e.cat].icon + ' ' : '') + e.icon + ' ' + e.name + '</button>';
        }
        else  slots += '<div class="eq-slot empty">空格子</div>';
      }
      eqHtml = '<div class="ip-sec">装备（' + u.equips.length + '/6）</div><div class="eq-grid">' + slots + '</div>';
    }

    // 升星按钮（任何阶段都花金币：星级越高越贵 15/30/45/60）
    let starBtn = '';
    if(isPlayer && (G.phase === 'shop' || G.phase === 'loot' || G.phase === 'star')){
      const scost = STAR_COST[u.star] || 0;
      starBtn = u.star >= STAR_MAX
        ? '<button class="btn ip-star max" disabled>⭐ 已满星（' + STAR_MAX + '★）</button>'
        : '<button class="btn primary ip-star" data-starup="1">⭐ 升到 ' + (u.star + 1) + ' 星 · ' +
          scost + ' 金币' +
          '（核心属性 +' + Math.round(STAR_ATTR_PER * 100) + '%）</button>';
    }

    const act = getActiveSkills(u);
    const manaStr = act.length
      ? ' ｜ 魔法条：' + act.map(sk => fmtN(skillManaOf(u, sk)) + '/' + mxMana +
          (skillCdOf(u, sk) > 0 ? '（冷却 ' + skillCdOf(u, sk).toFixed(1) + 's）' : '')).join(' ｜ ')
      : '';
    const cur = '当前生命 ' + fmtN(u.hp) + '/' + fmtN(u.maxHp) + manaStr;

    return '<div class="ip-head"><div class="ip-emoji">' + u.def.emoji + '</div>' +
      '<div><div class="ip-name">' + u.def.name + '</div>' +
      '<div class="ip-sub">' + (isPlayer ? '我方 · <span class="stars">' + '★'.repeat(u.star) + '</span>' : '敌方') + ' · ' + POS_NAMES[u.posType] + ' · ' + cur + '</div></div></div>' +
      '<div class="stat-grid">' + rows + '</div>' + starBtn +
      '<div class="ip-sec">技能（单位自带）</div><div class="ip-list">' + skillList + '</div>' +
      (eqSkChips ? '<div class="ip-sec">装备技能（悬停图标查看）</div><div class="eqsk-row">' + eqSkChips + '</div>' : '') +
      eqHtml +
      (u.def.bio ? '<div class="ip-sec">简介</div><div class="ip-note">' + u.def.bio + '</div>' : '');
  },

  skillHtml(sk){
    const kv = sk.type === 'active'
      ? '消耗：' + sk.cost + ' 魔法值<br>冷却：' + skillCdMax(sk) + ' 秒（上限 ' + SKILL_CD_MAX + ' 秒）<br>蓝条满且冷却完毕自动释放'
      : '被动技能，满足条件时自动生效';
    return '<div class="ip-head"><div class="ip-emoji">✨</div>' +
      '<div><div class="ip-name">' + sk.name + '</div>' +
      '<div class="ip-sub">' + (sk.type === 'active' ? '主动技能' : '被动技能') + '</div></div></div>' +
      '<div class="stat-grid"><div class="stat-row" style="grid-column:span 2">' +
      '<span class="sicon">◆</span><span class="kv">' + kv + '</span></div></div>' +
      '<div class="ip-sec">技能说明</div><div class="desc-box">' + sk.desc + '</div>' +
      '<button class="btn ip-back" data-back="1">← 返回</button>';
  },

  itemHtml(item){
    let statLine = '';
    if(item.stats){
      statLine = Object.keys(item.stats).map(k => {
        const row = STAT_ROWS.find(r => r[0] === k);
        const label = row ? row[1].split(' ')[1] : k;
        const pct = row ? row[2] : 0;
        return label + ' +' + item.stats[k] + (pct ? '%' : '');
      }).join('<br>');
    }
    // 档位颜色（1~5 档一眼区分）+ 分类标记（坦克/物理/魔法）+ 纯属性标记
    const tierC = item.tier ? TIER_COLORS[item.tier] : '';
    const catC = EQ_CATS[item.cat] || null;
    const catN = catC
      ? ' ｜ <span style="color:' + catC.color + '">' + catC.icon + ' ' + catC.name + '</span>' : '';
    const tierTxt = item.tier
      ? '<span style="color:' + tierC + '">' + item.tier + ' 档 · ' + TIER_NAMES[item.tier] + '</span>' + catN +
        (item.pure || !item.skill ? ' · 纯属性装备' : '')
      : '装备';
    // 装备技能区块（属性与说明之间）；纯属性装备没有技能行
    let skSec = '';
    const sk = (typeof item.skill === 'string') ? SKILLS[item.skill] : item.skill;
    if(sk){
      const badge = '<span class="badge ' + (sk.type === 'active' ? 'b-a' : 'b-p') + '">' +
                    (sk.type === 'active' ? '主动' : '被动') + '</span>';
      const kv = sk.type === 'active'
        ? '<br>💧 消耗 ' + sk.cost + ' 魔法值 ｜ ⏱ 冷却 ' + skillCdMax(sk) + ' 秒 ｜ 蓝满且冷却完毕即放（装上后获得独立蓝条）'
        : '<br>装备后满足条件时自动生效';
      skSec = '<div class="ip-sec">装备技能</div>' +
        '<div class="desc-box">' + badge + ' <b>' + sk.name + '</b><br>' + sk.desc + kv + '</div>';
    } else if(item.pure || !item.skill){
      skSec = '<div class="ip-sec">特点</div>' +
        '<div class="desc-box">🧱 纯属性装备：不带任何技能，全部价值都在属性加成上。</div>';
    }
    return '<div class="ip-head"><div class="ip-emoji">' + (item.icon || '📦') + '</div>' +
      '<div><div class="ip-name">' + item.name + '</div>' +
      '<div class="ip-sub">' + tierTxt + '</div></div></div>' +
      '<div class="desc-price">价格：' + item.price + ' 金币</div>' +
      '<div class="ip-sec">属性</div>' +
      '<div class="desc-box">' + (statLine || '无') + '</div>' +
      skSec +
      '<div class="ip-sec">说明</div><div class="desc-box">' + item.desc + '</div>' +
      this.unequipHtml(item) +
      '<button class="btn ip-back" data-back="1">← 返回</button>';
  },

  /* 装备选择 / 商店阶段：已穿在英雄身上的装备 → 卸下并回收一半金币（解决 6 格占满无法替换） */
  unequipHtml(item){
    if((G.phase !== 'shop' && G.phase !== 'loot') || !item || !item.id) return '';
    const w = G.formation.find(x => (x.equips || []).some(e => e.id === item.id));
    if(!w) return '';
    const gain = Math.floor((item.price || 0) / 2);
    return '<div class="ip-sec">装备管理</div>' +
      '<div class="desc-box">当前由 <b>' + w.def.name + '</b> 装备（' +
      w.equips.length + '/6），可卸下回收换取部分金币。' +
      '<button class="btn ip-unequip" data-unequip="' + item.id + '">⬇ 卸下并回收 +' + gain + ' 金币</button></div>';
  },

  /* ================= 英雄图鉴 ================= */
  heroCodexHtml(){
    const tiers = [20, 40, 60];
    let list = '';
    tiers.forEach(t => {
      const arr = HEROES.filter(h => h.tier === t);
      list += '<div class="ip-sec">' + HERO_TIERS[t] + ' · ' + t + ' 金币 · ' + arr.length + ' 名</div>' +
        '<div class="ip-list">' + arr.map(h =>
          '<button class="ip-item" data-heroinfo="' + h.id + '">' +
          '<span>' + h.emoji + '</span><span><b>' + h.name + '</b> · ' + POS_NAMES[h.pos] +
          '<br><span class="codex-sub">技能 ×3：1★ / 3★ / 5★ 逐步解锁</span></span></button>'
        ).join('') + '</div>';
    });
    return '<div class="ip-head"><div class="ip-emoji">🧝</div>' +
      '<div><div class="ip-name">英雄图鉴</div>' +
      '<div class="ip-sub">共 ' + HEROES.length + ' 名英雄 · 点击查看详情</div></div></div>' +
      '<div class="ip-note">英雄初始 <b>1 星 1 个技能</b>，<b>3 星 2 个、5 星 3 个</b>；每次升星核心属性 +35%、攻速 +7%。</div><br>' +
      list +
      '<button class="btn ip-back" data-back="1">← 返回</button>';
  },

  /* ================= 装备图鉴（按档位颜色分组） ================= */
  equipCodexHtml(){
    let list = '';
    for(let t = 1; t <= 5; t++){
      const arr = EQUIPS.filter(e => e.tier === t);
      const c = TIER_COLORS[t];
      list += '<div class="ip-sec" style="color:' + c + '">' +
        '<span class="tier-dot" style="background:' + c + '"></span>' +
        t + ' 档 · ' + TIER_NAMES[t] + '（' + arr.length + ' 件）</div>' +
        '<div class="codex-grid">' + arr.map(e => {
          const sk = (typeof e.skill === 'string') ? SKILLS[e.skill] : e.skill;
          const tag = !sk
            ? '<span class="badge b-pure">纯属性</span>'
            : (sk ? '<span class="badge ' + (sk.type === 'active' ? 'b-a' : 'b-p') + '">' +
                (sk.type === 'active' ? '主动' : '被动') + '</span>' : '');
          const cd = EQ_CATS[e.cat] || null;
          const cdHtml = cd
            ? '<span class="opt-cat opt-cat--' + e.cat + '">' + cd.icon + cd.name + '</span>' : '';
          return '<button class="codex-item" data-equip="' + e.id + '" data-tip="' + this.tipAttr(e) + '"' +
            ' style="border-color:' + c + '55">' +
            '<span class="codex-ico">' + e.icon + '</span>' +
            '<span class="codex-name" style="color:' + c + '">' + e.name + '</span>' + cdHtml + tag + '</button>';
        }).join('') + '</div>';
    }
    return '<div class="ip-head"><div class="ip-emoji">⚔️</div>' +
      '<div><div class="ip-name">装备图鉴</div>' +
      '<div class="ip-sub">共 ' + EQUIPS.length + ' 件 · 按档位颜色区分 · 悬停看属性</div></div></div>' +
      '<div class="ip-note">1~5 档依次为普通 / 精良 / 稀有 / 史诗 / 传说；带被动标签的是特色装备（悬停图标看完整技能），带「纯属性」标签的只加属性。</div><br>' +
      list +
      '<button class="btn ip-back" data-back="1">← 返回</button>';
  },
};

/* 介绍栏点击：图鉴 / 技能 / 装备 / 英雄详情 / 升星 / 返回 */
document.addEventListener('click', ev => {
  const codexBtn = ev.target.closest && ev.target.closest('[data-codex]');
  if(codexBtn){
    UI.info(codexBtn.dataset.codex === 'hero' ? 'heroCodex' : 'equipCodex');
    return;
  }
  const skillBtn = ev.target.closest && ev.target.closest('[data-skill]');
  if(skillBtn && skillBtn.closest('#ipBody')){
    const sk = SKILLS[skillBtn.dataset.skill];
    if(sk){ UI.info('skill', sk); return; }
  }
  const eqBtn = ev.target.closest && ev.target.closest('[data-equip]');
  if(eqBtn && eqBtn.closest('#ipBody')){
    const item = EQUIPS.find(e => e.id === eqBtn.dataset.equip);
    if(item){ UI.info('item', item); return; }
  }
  const heroBtn = ev.target.closest && ev.target.closest('[data-heroinfo]');
  if(heroBtn && heroBtn.closest('#ipBody')){
    const def = HEROES.find(h => h.id === heroBtn.dataset.heroinfo);
    if(def){ UI.info('unit', heroPreview(def)); return; }
  }
  const starBtn = ev.target.closest && ev.target.closest('[data-starup]');
  if(starBtn && starBtn.closest('#ipBody')){
    const u = UI._lastUnit;
    if(u){
      // 升星一律收费（星级越高越贵），战后第②屏不再免费
      const r = starUp(u);
      if(typeof Shop !== 'undefined' && G.phase === 'shop'){
        Shop.msg = { text: r.msg, cls: r.ok ? 'ok' : 'err' };
        Shop.renderHeroes();
        Shop.showDesc();
        const goldEl = document.getElementById('shopGold');
        if(goldEl) goldEl.textContent = G.gold;
      } else if(typeof Loot !== 'undefined' && G.phase === 'loot'){
        Loot.msg = { text: r.msg, cls: r.ok ? 'ok' : 'err' };
        Loot.render();
      } else if(r.ok && typeof Rogue !== 'undefined' && G.phase === 'star'){
        // 升星屏内升星成功 → 完成第 ② 步，直接进入第 ③ 屏神器选择
        UI.info('unit', u, true);
        UI.updateHeader();
        if(typeof Save !== 'undefined') Save.save();
        Rogue.openArt();
        return;
      } else if(typeof Rogue !== 'undefined' && G.phase === 'star'){
        Rogue.msg = { text: r.msg, cls: 'err' };
        Rogue.renderStar();
      }
      UI.info('unit', u, true);
      UI.updateHeader();
      if(typeof Save !== 'undefined') Save.save();
    }
    return;
  }
  const unBtn = ev.target.closest && ev.target.closest('[data-unequip]');
  if(unBtn && unBtn.closest('#ipBody')){
    const id = unBtn.dataset.unequip;
    const w = G.formation.find(x => (x.equips || []).some(e => e.id === id));
    if(w){
      const i = w.equips.findIndex(e => e.id === id);
      if(i >= 0){
        const eq = w.equips[i];
        w.equips.splice(i, 1);
        w._frame = -1;
        refreshMaxHp(w);
        if(w.hp > w.maxHp) w.hp = w.maxHp;
        const gain = Math.floor((eq.price || 0) / 2);
        G.gold += gain;
        if(typeof Shop !== 'undefined' && G.phase === 'shop'){
          Shop.msg = { text:'✅ 已卸下「' + eq.name + '」，回收 +' + gain + ' 金币（' +
            w.def.name + ' 装备 ' + w.equips.length + '/6）', cls:'ok' };
          Shop.renderHeroes();
          Shop.showDesc();
          const goldEl = document.getElementById('shopGold');
          if(goldEl) goldEl.textContent = G.gold;
        } else if(typeof Loot !== 'undefined' && G.phase === 'loot'){
          Loot.msg = { text:'✅ 已卸下「' + eq.name + '」，回收 +' + gain + ' 金币（' +
            w.def.name + ' 装备 ' + w.equips.length + '/6）', cls:'ok' };
          Loot.render();
        }
        if(typeof Save !== 'undefined') Save.save();
        UI.info('unit', w, true);
        UI.updateHeader();
      }
    }
    return;
  }
  const back = ev.target.closest && ev.target.closest('[data-back]');
  if(back && back.closest('#ipBody')){
    const hist = UI._hist || [];
    const prev = hist.pop();
    if(prev && prev.kind) UI.info(prev.kind, prev.data, true);
    else UI.info('help', null, true);
  }
});

/* 点击战场单位 → 介绍栏显示说明 */
document.addEventListener('click', ev => {
  const card = ev.target.closest && ev.target.closest('.unit');
  if(!card) return;
  const uid = Number(card.dataset.uid);
  const u = allUnits().find(x => x.id === uid);
  if(u) UI.info('unit', u);
});
