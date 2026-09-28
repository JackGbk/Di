'use strict';

/* ================= 游戏流程 ================= */
const previewCache = {};

function heroPreview(def){
  if(!previewCache[def.id]) previewCache[def.id] = createUnit(def, 'player');
  return previewCache[def.id];
}

/* ---------- 选择英雄界面（3 选 1） ---------- */
function buildSelect(){
  const pool = HEROES.slice();
  const chosen = [];
  while(chosen.length < 3 && pool.length){
    chosen.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  const wrap = document.getElementById('selectCards');
  wrap.innerHTML = chosen.map(h => {
    const sks = h.skills.map(id => SKILLS[id]).filter(Boolean);
    const mini = [['❤ 生命值', h.base.hp], ['⚔ 攻击', h.base.atk], ['✨ 法强', h.base.ap],
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
      startGame(def);
    }
  };
}

/* ---------- 开始游戏 ---------- */
function startGame(heroDef){
  G.phase = 'battle';
  G.level = 1;
  G.gold = 0;
  G.reward = 0;
  G.formation = [];
  G.currentHeroIdx = 0;

  const u = createUnit(heroDef, 'player');
  placeUnit(u);
  G.formation.push(u);

  spawnEnemies(1);
  UI.setScreen('battle');
  UI.renderBattle();
  startBattle();
  UI.info('unit', u);
  UI.updateHeader();
}

/* ---------- 通关 → 商店 ---------- */
function onBattleEnd(result){
  if(result === 'win'){
    const reward = G.enemies.reduce((s, e) => s + (e.def.gold || 0), 0);
    G.reward = reward;
    G.gold += reward;
    G.phase = 'shop';
    UI.setScreen('shop');
    Shop.open();
  } else {
    G.phase = 'over';
    document.getElementById('overLevel').textContent = G.level;
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
    u.mana = 0;
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
  document.getElementById('btnRestart').addEventListener('click', restart);
  window.addEventListener('resize', () => {
    if(G.phase === 'battle'){ UI.updatePositions(); resizeCanvas(); }
  });
  requestAnimationFrame(loop);
});
