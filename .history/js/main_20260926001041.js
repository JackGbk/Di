'use strict';

/* ================= 游戏流程 ================= */
const previewCache = {};

function heroPreview(def){
  if(!previewCache[def.id]) previewCache[def.id] = createUnit(def, 'player');
  return previewCache[def.id];
}

/* ---------- 选择英雄界面（选满 3 名后自动进入第一关） ---------- */
const chosenHeroes = [];

function buildSelect(){
  // 候选池：排除已选英雄，随机 3 张候选卡
  const pool = HEROES.filter(h => !chosenHeroes.some(c => c.id === h.id));
  const cand = [];
  while(cand.length < 3 && pool.length){
    cand.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }

  // 进度标题 + 已选英雄列表
  const title = document.getElementById('selectTitle');
  if(title){
    title.textContent = '选择你的英雄（已选 ' + chosenHeroes.length +
      '/3，选满 3 名自动进入第一关）';
  }
  const bar = document.getElementById('chosenBar');
  if(bar){
    bar.innerHTML =
      (chosenHeroes.length
        ? '<span class="chosen-hint">已选：</span>' +
          chosenHeroes.map(h => '<span class="chosen-chip">' + h.emoji +
            '<b>' + h.name + '</b></span>').join('') +
          '<span class="chosen-hint">再选 ' + (3 - chosenHeroes.length) + ' 名</span>'
        : '<span class="chosen-hint">开局需要选择 3 名英雄组成初始阵容</span>');
  }

  const wrap = document.getElementById('selectCards');
  wrap.innerHTML = cand.map(h => {
    const sks = h.skills.map(id => SKILLS[id]).filter(Boolean);
    const mini = [['❤ 生命值', h.base.hp], ['⚔ 攻击', h.base.atk],
                  ['⚡ 攻速', (h.base.atkSpd || 1).toFixed(2)], ['✨ 法强', h.base.ap],
                  ['🛡 护甲', h.base.armor], ['🎯 暴击率', h.base.crit + '%'], ['📍 位置', POS_NAMES[h.pos]]];
    return '<div class="scard" data-hero="' + h.id + '">' +
      '<div class="scard-top"><div class="scard-emoji">' + h.emoji + '</div>' +
      '<div><div class="scard-name">' + h.name + '</div>' +
      '<div class="scard-sub">' + POS_NAMES[h.pos] + ' · ' + HERO_TIERS[h.tier] + '档</div></div></div>' +
      '<div class="scard-stats">' +
        mini.map(m => '<div class="stat-row"><span class="sl">' + m[0] + '：</span>' +
                      '<span class="sv">' + m[1] + '</span></div>').join('') +
      '</div>' +
      '<div class="scard-skills">' +
        sks.map(sk => '<div class="scard-skill"><b>' + (sk.type === 'active' ? '【主动】' : '【被动】') +
          sk.name + '</b><br>' + sk.desc + '</div>').join('') +
      '</div>' +
      '<div class="scard-btns">' +
        '<button class="btn" data-detail="' + h.id + '">查看详情</button>' +
        '<button class="btn primary" data-choose="' + h.id + '">选择该英雄</button>' +
      '</div></div>';
  }).join('');

  wrap.onclick = ev => {
    const detail = ev.target.closest('[data-detail]');
    if(detail){
      const def = HEROES.find(h => h.id === detail.dataset.detail);
      UI.info('unit', heroPreview(def));
      return;
    }
    const choose = ev.target.closest('[data-choose]');
    if(choose){
      const def = HEROES.find(h => h.id === choose.dataset.choose);
      if(!def || chosenHeroes.some(c => c.id === def.id)) return;
      chosenHeroes.push(def);
      // 选满 3 名 → 开始第一关
      if(chosenHeroes.length >= 3){ startGame(chosenHeroes.slice()); return; }
      buildSelect();   // 刷新候选卡与进度
    }
  };
}

/* ---------- 开始游戏 ---------- */
function startGame(heroDefs){
  G.phase = 'battle';
  G.level = 1;
  G.gold = 0;
  G.reward = 0;
  G.formation = [];
  G.currentHeroIdx = 0;

  const units = [];
  heroDefs.forEach(def => {
    const u = createUnit(def, 'player');
    placeUnit(u);
    G.formation.push(u);
    units.push(u);
  });

  spawnEnemies(1);
  UI.setScreen('battle');
  UI.renderBattle();
  startBattle();
  UI.info('unit', units[0] || null);
  UI.updateHeader();
}

/* ---------- 通关 → 商店 / 通关 20 关 → 胜利 ---------- */
function onBattleEnd(result){
  if(result === 'win'){
    // 打通关数上限 → 胜利结算（不进商店）
    if(typeof MAX_LEVEL !== 'undefined' && G.level >= MAX_LEVEL){
      G.phase = 'over';
      G.win = true;
      const t = document.getElementById('overTitle');
      const s = document.getElementById('overSub');
      if(t) t.textContent = '🎉 通关！';
      if(s) s.innerHTML = '你通关了全部 <b>' + MAX_LEVEL + '</b> 关，森林重归和平！';
      UI.setScreen('over');
      return;
    }
    const reward = G.enemies.reduce((sum, e) => sum + (e.def.gold || 0), 0);
    G.reward = reward;
    G.gold += reward;
    G.phase = 'shop';
    UI.setScreen('shop');
    Shop.open();
  } else {
    G.phase = 'over';
    G.win = false;
    const t = document.getElementById('overTitle');
    const s = document.getElementById('overSub');
    if(t) t.textContent = '全军覆没…';
    if(s) s.innerHTML = '你坚持到了第 <b id="overLevel">' + G.level + '</b> 关';
    UI.setScreen('over');
  }
}

/* ---------- 进入下一关 ---------- */
function nextLevel(){
  G.level++;
  G.phase = 'battle';

  // 玩家阵营恢复状态（击杀数、装备、道具保留）
  G.formation.forEach(u => {
    if(!u.alive){ u.alive = true; }
    u._frame = -1;
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
  });

  // 重新排布所有我方单位，避免复活单位与商店新购单位占同一格
  G.formation.forEach(u => { u.row = -1; u.col = -1; });
  G.formation.forEach(u => placeUnit(u));

  spawnEnemies(G.level);
  UI.setScreen('battle');
  UI.renderBattle();
  startBattle();
  UI.updateHeader();
}

/* ---------- 重新开始 ---------- */
function restart(){
  location.reload();
}

/* ---------- 主循环 ---------- */
let _last = performance.now();
function loop(now){
  const dt = Math.min(0.05, (now - _last) / 1000);
  _last = now;
  if(G.phase === 'battle') update(dt);
  UI.updateFrame(dt);
  drawFX(dt);
  requestAnimationFrame(loop);
}

/* ---------- 启动 ---------- */
window.addEventListener('DOMContentLoaded', () => {
  G.phase = 'select';
  buildSelect();
  UI.setScreen('select');
  UI.info('help');
  UI.updateHeader();
  UI.initTip();     // 装备 / 道具悬停属性提示
  document.getElementById('btnRestart').addEventListener('click', restart);
  window.addEventListener('resize', () => {
    if(G.phase === 'battle'){ UI.updatePositions(); resizeCanvas(); }
  });
  requestAnimationFrame(loop);
});
