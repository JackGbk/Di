'use strict';

/* ================= UI 模块 ================= */
const UI = {
  _lastUnit: null,

  /* ---------- 屏幕切换 ---------- */
  setScreen(name){
    ['select','battle','shop','over'].forEach(s => {
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
    set('hudLevel', G.level);
    set('hudGold', G.gold);
    const enemyAlive = G.enemies.filter(u => u.alive).length;
    set('hudEnemy', G.phase === 'battle' ? enemyAlive : (G.phase === 'shop' ? G.enemies.length : 0));
    const phaseText = {
      select:'选择英雄',
      battle:'第 ' + G.level + ' 关 · 战斗中',
      shop:'通关 · 补给商店',
      over:'全军覆没',
    }[G.phase] || '';
    set('hudPhase', phaseText);

    const flag = document.getElementById('turnFlag');
    if(flag && G.battle){
      const mine = G.battle.side === 'player';
      flag.textContent = mine ? '⚔ 我方行动中' : '⚔ 敌方行动中';
      flag.style.color = mine ? '#8fc4ff' : '#ff9b9b';
    }
  },

  /* ---------- 战场渲染 ---------- */
  renderBattle(){
    this.buildGrid('enemyGrid', G.enemies);
    this.buildGrid('playerGrid', G.formation);
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
      d.className = 'unit ' + (u.faction === 'player' ? 'u-player' : 'u-enemy');
      d.dataset.uid = u.id;
      d.style.gridRow = (u.row + 1);
      d.style.gridColumn = (u.col + 1);
      const hasActive = !!getActiveSkill(u);
      d.innerHTML =
        '<div class="u-head"><span class="u-name">' + u.def.name + '</span>' +
        '<span class="u-tag">' + POS_SHORT[u.posType] + '</span></div>' +
        '<div class="u-emoji">' + u.def.emoji + '</div>' +
        '<div class="u-bars">' +
          '<div class="bar hpbar"><i class="barmax"></i><i class="bardelay"></i><i class="barfill"></i></div>' +
          '<div class="bar shbar hidden"><i class="barfill"></i></div>' +
          '<div class="bar mnbar' + (hasActive ? '' : ' hidden') + '"><i class="barfill"></i></div>' +
        '</div>' +
        '<div class="u-st"></div>';
      u.el = d;
      u.parts = {
        fill:  d.querySelector('.hpbar .barfill'),
        delay: d.querySelector('.hpbar .bardelay'),
        sh:    d.querySelector('.shbar'),
        shf:   d.querySelector('.shbar .barfill'),
        mn:    d.querySelector('.mnbar'),
        mnf:   d.querySelector('.mnbar .barfill'),
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

      // 护盾条（类似魔法条，单独显示）
      if(u.shield > 0){
        p.sh.classList.remove('hidden');
        p.shf.style.width = clamp(u.shield / maxHp * 100, 0, 100) + '%';
      } else p.sh.classList.add('hidden');

      // 魔法条
      if(!p.mn.classList.contains('hidden') || getActiveSkill(u)){
        p.mn.classList.remove('hidden');
        p.mnf.style.width = clamp(u.mana / Math.max(1, stat(u, 'maxMana')) * 100, 0, 100) + '%';
      }

      // 状态图标
      let st = '';
      if(u.statuses.stun > 0)    st += '<span title="眩晕">😵 眩晕</span>';
      if(u.statuses.silence > 0) st += '<span title="沉默">🤐 沉默</span>';
      if(u.statuses.disarm > 0)  st += '<span title="缴械">✋ 缴械</span>';
      if(u.dots.length)          st += '<span style="color:#7dff9a">☠ 中毒</span>';
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

  removeUnit(u){
    if(!u.el) return;
    const el = u.el;
    el.classList.add('dead');
    u.el = null;
    u.parts = null;
    setTimeout(() => { if(el.parentNode) el.parentNode.removeChild(el); }, 320);
  },

  /* ================= 介绍栏 ================= */
  info(kind, data){
    const body = document.getElementById('ipBody');
    if(!body) return;
    if(kind === 'unit') this._lastUnit = data;
    let html = '';
    if(kind === 'help')      html = this.helpHtml();
    else if(kind === 'unit') html = this.unitHtml(data);
    else if(kind === 'skill')html = this.skillHtml(data);
    else if(kind === 'item') html = this.itemHtml(data);
    body.innerHTML = html;
    body.scrollTop = 0;
  },

  helpHtml(){
    return '<div class="ip-head"><div class="ip-emoji">📖</div>' +
      '<div><div class="ip-name">玩法说明</div><div class="ip-sub">点击单位 / 技能 / 装备查看</div></div></div>' +
      '<div class="desc-box">' +
      '<b>战斗</b><br>双方按顺序轮流攻击，阵营切换无间隔。所有单位不能移动，没有距离限制。' +
      '子弹到达目标后才结算伤害。<br><br>' +
      '<b>魔法值</b><br>攻击与被攻击都会增加魔法值，达到技能消耗时立即释放技能（眩晕、沉默无法释放）。<br><br>' +
      '<b>位置类型</b><br>前 / 中 / 后 三种，生成时先横向居中，再由位置类型决定纵向位置，前排离对面更近。<br><br>' +
      '<b>状态</b><br>😵 眩晕：跳过行动；🤐 沉默：无法放技能；✋ 缴械：无法普攻。<br><br>' +
      '<b>通关</b><br>胜利后进入补给商店：点选项先看说明，再点一次生效，然后进入下一关。' +
      '</div>';
  },

  unitHtml(u){
    const c = calcTotals(u);
    const isPlayer = u.faction === 'player';
    let rows = '';
    STAT_ROWS.forEach(([k, label, pct]) => {
      const b = c.base[k] || 0;
      const bn = c.bonus[k] || 0;
      const bs = pct ? (fmtN(b) + '%') : fmtN(b);
      let ns = '';
      if(bn > 0.001) ns = '+' + (pct ? (fmtN(bn) + '%') : fmtN(bn));
      rows += '<div class="stat-row"><span class="sicon">' + label.split(' ')[0] + '</span>' +
              '<span class="sl">' + label.split(' ')[1] + '：</span>' +
              '<span class="sv">' + bs + '</span><span class="sb">' + ns + '</span></div>';
    });
    rows += '<div class="stat-row"><span class="sicon">🥉</span><span class="sl">击杀数：</span>' +
            '<span class="sv">' + u.kills + '</span><span class="sb"></span></div>';
    rows += '<div class="stat-row"><span class="sicon">📍</span><span class="sl">位置类型：</span>' +
            '<span class="sv">' + POS_NAMES[u.posType] + '</span><span class="sb"></span></div>';

    const sks = skillsOf(u);
    let skillList = '';
    if(sks.length){
      skillList = sks.map(sk =>
        '<button class="ip-item" data-skill="' + sk.id + '">' +
        '<span class="badge ' + (sk.type === 'active' ? 'b-a' : 'b-p') + '">' +
        (sk.type === 'active' ? '主动' : '被动') + '</span>' + sk.name + '</button>').join('');
    } else skillList = '<div class="ip-note">该单位没有技能。</div>';

    let eqHtml = '';
    if(isPlayer){
      let slots = '';
      for(let i = 0; i < 6; i++){
        const e = u.equips[i];
        if(e) slots += '<button class="eq-slot filled" data-equip="' + e.id + '">' + e.icon + ' ' + e.name + '</button>';
        else  slots += '<div class="eq-slot empty">空格子</div>';
      }
      eqHtml = '<div class="ip-sec">装备（' + u.equips.length + '/6）</div><div class="eq-grid">' + slots + '</div>';
    }

    const cur = '当前生命 ' + fmtN(u.hp) + '/' + fmtN(u.maxHp) +
                (getActiveSkill(u) ? ' ｜ 魔法 ' + fmtN(u.mana) + '/' + fmtN(stat(u, 'maxMana')) : '');

    return '<div class="ip-head"><div class="ip-emoji">' + u.def.emoji + '</div>' +
      '<div><div class="ip-name">' + u.def.name + '</div>' +
      '<div class="ip-sub">' + (isPlayer ? '我方' : '敌方') + ' · ' + POS_NAMES[u.posType] + ' · ' + cur + '</div></div></div>' +
      '<div class="stat-grid">' + rows + '</div>' +
      '<div class="ip-sec">技能</div><div class="ip-list">' + skillList + '</div>' +
      eqHtml +
      (u.def.bio ? '<div class="ip-sec">简介</div><div class="ip-note">' + u.def.bio + '</div>' : '');
  },

  skillHtml(sk){
    const kv = sk.type === 'active'
      ? '消耗：' + sk.cost + ' 魔法值<br>冷却：' + sk.cd + ' 秒'
      : '被动技能，满足条件时自动生效';
    return '<div class="ip-head"><div class="ip-emoji">✨</div>' +
      '<div><div class="ip-name">' + sk.name + '</div>' +
      '<div class="ip-sub">' + (sk.type === 'active' ? '主动技能' : '被动技能') + '</div></div></div>' +
      '<div class="stat-grid"><div class="stat-row" style="grid-column:span 2">' +
      '<span class="sicon">◆</span><span class="kv">' + kv + '</span></div></div>' +
      '<div class="ip-sec">技能说明</div><div class="desc-box">' + sk.desc + '</div>' +
      '<button class="btn ip-back" data-back="1">← 返回单位信息</button>';
  },

  itemHtml(item){
    const isEquip = !!item.stats;
    let statLine = '';
    if(item.stats){
      statLine = Object.keys(item.stats).map(k => {
        const row = STAT_ROWS.find(r => r[0] === k);
        const label = row ? row[1].split(' ')[1] : k;
        const pct = row ? row[2] : 0;
        return label + ' +' + item.stats[k] + (pct ? '%' : '');
      }).join('<br>');
    }
    return '<div class="ip-head"><div class="ip-emoji">' + (item.icon || '📦') + '</div>' +
      '<div><div class="ip-name">' + item.name + '</div>' +
      '<div class="ip-sub">' + (isEquip ? '装备' : '道具') + '</div></div></div>' +
      '<div class="desc-price">价格：' + item.price + ' 金币</div>' +
      '<div class="ip-sec">属性</div>' +
      '<div class="desc-box">' + (statLine || '无') + '</div>' +
      '<div class="ip-sec">说明</div><div class="desc-box">' + item.desc + '</div>' +
      '<button class="btn ip-back" data-back="1">← 返回单位信息</button>';
  },
};

/* 介绍栏点击：技能 / 装备 / 返回 */
document.addEventListener('click', ev => {
  const skillBtn = ev.target.closest && ev.target.closest('[data-skill]');
  if(skillBtn && skillBtn.closest('#ipBody')){
    const sk = SKILLS[skillBtn.dataset.skill];
    if(sk){ UI.info('skill', sk); return; }
  }
  const eqBtn = ev.target.closest && ev.target.closest('[data-equip]');
  if(eqBtn && eqBtn.closest('#ipBody')){
    const item = EQUIPS.find(e => e.id === eqBtn.dataset.equip) ||
                 ITEMS.find(e => e.id === eqBtn.dataset.equip);
    if(item){ UI.info('item', item); return; }
  }
  const back = ev.target.closest && ev.target.closest('[data-back]');
  if(back && back.closest('#ipBody')){
    if(UI._lastUnit) UI.info('unit', UI._lastUnit);
    else UI.info('help');
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
