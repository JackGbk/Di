'use strict';

/* ================= 游戏流程 ================= */
const previewCache = {};

function heroPreview(def){
  if(!previewCache[def.id]) previewCache[def.id] = createUnit(def, 'player');
  return previewCache[def.id];
}

/* ---------- 选择英雄界面（选满 3 名后自动进入第一关） ---------- */
const chosenHeroes = [];

/* 必现英雄：这些英雄每次刷新候选卡必定出现（已选中的自动跳过，槽位由随机英雄补足）。
   以后新做的英雄只需把 id 加进这个数组即可必现。 */
const GUARANTEED_HEROS = ['veno', 'puck', 'troll', 'ld', 'sniper',
  'wraith', 'pudge', 'slardar', 'legion', 'tide', 'huskar'];

function buildSelect(){
  // 候选池：排除已选英雄，随机 3 张候选卡；必现英雄优先占用卡位
  const pool = HEROES.filter(h => !chosenHeroes.some(c => c.id === h.id));
  const cand = [];
  for(const id of GUARANTEED_HEROS){
    const i = pool.findIndex(h => h.id === id);
    if(i >= 0) cand.push(pool.splice(i, 1)[0]);
  }
  while(cand.length < 3 && pool.length){
    cand.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  // 打乱顺序，避免必现英雄固定排在前面
  for(let i = cand.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    const t = cand[i]; cand[i] = cand[j]; cand[j] = t;
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
      '<div class="scard-sub">' + POS_NAMES[h.pos] + (h.role ? ' · <b style="color:#ffd166">【' + h.role + '】</b>' : '') + ' · ' + HERO_TIERS[h.tier] + '档 · <span class="stars">★</span> 起步</div></div></div>' +
      '<div class="scard-stats">' +
        mini.map(m => '<div class="stat-row"><span class="sl">' + m[0] + '：</span>' +
                      '<span class="sv">' + m[1] + '</span></div>').join('') +
      '</div>' +
      '<div class="scard-skills">' +
        sks.map((sk, i) => {
          const need = skillNeedStar(i);
          const locked = need > 1;
          return '<div class="scard-skill' + (locked ? ' locked' : '') + '"><b>' +
            (sk.type === 'active' ? '【主动】' : '【被动】') + sk.name +
            (locked ? ' <span class="lock-tag">🔒' + need + '★ 解锁</span>' : '') +
            '</b><br>' + sk.desc + '</div>';
        }).join('') +
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
      // 选满 3 名 → 开局流程：装备三选一 → 神器三选一 → 第 1 关
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
  // 肉鸽进度重置：神器 / 祝福 / 奇遇 / 改造 / 关卡难度 / 开局流程标记
  G.artifacts = [];
  G.artRound = 0;
  G.upgRound = 0;
  G.blessings = [];
  G.blessRound = 0;
  G.encRound = 0;
  G.difficulty = 0;
  G.intro = 0;
  recomputeBless();        // 清空祝福 → 重算 G.bless* 汇总

  const units = [];
  heroDefs.forEach(def => {
    const u = createUnit(def, 'player');
    placeUnit(u);
    G.formation.push(u);
    units.push(u);
  });

  UI.info('unit', units[0] || null);
  UI.updateHeader();
  // 开局流程：英雄选完 → 装备三选一（免费）→ 神器三选一 → 第 1 关难度选择
  Loot.openIntro();
}

/* ---------- 通关 → 战后流程（① 装备购买 → ② 升星 → ③ 神器 → 随机祝福）/ 通关 15 关 → 胜利 ----------
 * 战斗胜利后不再进商店（Shop 代码保留备用），
 * 依次进入：装备购买（6 件标价装备）→ 升星（花金币，星级越高越贵）→ 神器三选一
 * → 按概率随机穿插祝福三选一 → 下一关（奇遇事件 encounter.js 已停用，代码保留不进入流程） */
function onBattleEnd(result){
  // 召唤物仅单场有效：战斗一结束就从队伍里移除（蛇型守卫 / 熊灵伙伴等），
  // 不进商店购买列表、不进升星列表、不写进存档
  if(G.formation.some(u => u.isSummon)){
    G.formation = G.formation.filter(u => !u.isSummon);
    if(G.currentHeroIdx >= G.formation.length) G.currentHeroIdx = 0;
  }
  if(result === 'win'){
    // 打通关数上限 → 胜利结算（不进装备选择 / 商店）
    if(typeof MAX_LEVEL !== 'undefined' && G.level >= MAX_LEVEL){
      G.phase = 'over';
      G.win = true;
      const t = document.getElementById('overTitle');
      const s = document.getElementById('overSub');
      if(t) t.textContent = '🎉 通关！';
      if(s) s.innerHTML = '你通关了全部 <b>' + MAX_LEVEL + '</b> 关，森林重归和平！';
      Save.clear();
      UI.setScreen('over');
      return;
    }
    // 通关金币：基础击杀金币 × 上一关难度倍率（挑战 ×1.5 → 额外通关奖励）
    const base = G.enemies.reduce((sum, e) => sum + (e.def.gold || 0), 0);
    const D = difficultyDef(G.difficulty || 0);
    let reward = Math.max(1, Math.round(base * D.goldMul));
    if(G.blessFlags && G.blessFlags.bonusGold) reward += 20;   // 祝福·贪婪印契：通关 +20💰
    G.reward = reward;
    G.gold += reward;
    // 进入战后流程：① 装备购买 → ② 升星 → ③ 神器 → 随机祝福 → 下一关难度选择
    G.phase = 'loot';
    Loot.open();
  } else {
    G.phase = 'over';
    G.win = false;
    const t = document.getElementById('overTitle');
    const s = document.getElementById('overSub');
    if(t) t.textContent = '全军覆没…';
    if(s) s.innerHTML = '你坚持到了第 <b id="overLevel">' + G.level + '</b> 关';
    Save.clear();
    UI.setScreen('over');
  }
}

/* ---------- 战后流程链（所有战后屏幕的统一出口） ----------
 * 顺序：① 装备购买（Loot）→ ② 升星（Rogue.openStar）→ ③ 神器（Rogue.openArt）
 *       → 随机穿插 🌟 祝福三选一（按概率触发，每关最多一次）→ 下一关难度选择。
 * 祝福选完（Bless.choose）会回到本函数继续掷骰 → 可能整关不出现祝福。
 * 🎲 奇遇事件（encounter.js）已停用：代码保留，但不再进入流程。 */
function afterLoot(){
  if(G.artRound !== G.level){
    Rogue.openArt();          // 本关神器还没选 → 先补神器
    return;
  }
  // 本关还没拿过祝福 → 概率进入祝福三选一（选完回到本链）
  if((G.blessRound || 0) !== G.level && Math.random() < 0.6){
    Bless.open();
    return;
  }
  /* ---- 奇遇事件已停用（不删代码，仅不再调用）----
  if((G.encRound || 0) !== G.level && Math.random() < 0.35){
    Encounter.open();
    return;
  } */
  nextLevel();
}

/* ---------- 进入本关战斗（难度选定 / 恢复存档后调用） ---------- */
function beginLevel(){
  G.phase = 'battle';
  spawnEnemies(G.level);
  UI.setScreen('battle');
  UI.renderBattle();
  startBattle();
  UI.updateHeader();
  Save.save();
}

/* ---------- 进入下一关 ---------- */
function nextLevel(){
  G.level++;

  // 玩家阵营恢复状态（击杀数、装备、星级保留）
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

  // 重新排布所有我方单位，避免复活单位与新获得装备/单位占同一格
  G.formation.forEach(u => { u.row = -1; u.col = -1; });
  G.formation.forEach(u => placeUnit(u));

  // 战前难度选择（选定 → beginLevel 进入战斗）
  Rogue.openDiff();
}

/* ---------- 重新开始 ---------- */
function restart(){
  location.reload();
}

/* ================= 进度存档（localStorage） =================
 * 存档点：开始游戏 / 进入下一关 / 战后流程每次变更（买装备、升星、选神器、祝福）
 * 恢复点：选英雄界面出现「继续上次进度」按钮；通关或战败时清除存档 */
const Save = {
  key: 'forest_war_save_v1',
  data(){
    return {
      v: 1,
      phase: G.phase,
      level: G.level,
      gold: G.gold,
      reward: G.reward,
      heroIdx: G.currentHeroIdx,
      artifacts: (G.artifacts || []).slice(),
      artRound: G.artRound || 0,
      upgRound: G.upgRound || 0,
      difficulty: G.difficulty || 0,
      sellBlood: G.sellBlood || 0,
      intro: G.intro || 0,
      blessings: (G.blessings || []).slice(),
      blessRound: G.blessRound || 0,
      encRound: G.encRound || 0,
      // 召唤物不入档（仅单场有效，中途刷新也不会把召唤物恢复成正式英雄）
      formation: G.formation.filter(u => !u.isSummon).map(u => ({
        id: u.def.id,
        star: u.star || 1,
        kills: u.kills || 0,
        equips: (u.equips || []).map(e => e.id),
      })),
    };
  },
  save(){
    try{
      if(['battle','shop','loot','star','diff','art','upg','bless','enc'].indexOf(G.phase) < 0) return;
      if(!G.formation.length) return;
      localStorage.setItem(this.key, JSON.stringify(this.data()));
    }catch(e){ /* 隐私模式 / 存储满：忽略 */ }
  },
  peek(){
    try{
      const raw = localStorage.getItem(this.key);
      if(!raw) return null;
      const d = JSON.parse(raw);
      return (d && d.formation && d.formation.length) ? d : null;
    }catch(e){ return null; }
  },
  clear(){ try{ localStorage.removeItem(this.key); }catch(e){} },
  restore(d){
    if(!d || !d.formation || !d.formation.length) return false;
    const units = [];
    d.formation.forEach(s => {
      const def = HEROES.find(h => h.id === s.id);
      if(!def) return;
      const u = createUnit(def, 'player');
      u.star = clamp(s.star || 1, 1, (typeof STAR_MAX !== 'undefined' ? STAR_MAX : 5));
      u.kills = s.kills || 0;
      u.equips = (s.equips || []).map(id => EQUIPS.find(e => e.id === id)).filter(Boolean);
      u._frame = -1;
      units.push(u);
    });
    if(!units.length) return false;
    G.level = d.level || 1;
    G.gold = d.gold || 0;
    G.reward = d.reward || 0;
    G.currentHeroIdx = Math.min(d.heroIdx || 0, units.length - 1);
    G.formation = units;
    G.artifacts = (d.artifacts || []).slice();
    G.artRound = d.artRound || 0;
    G.upgRound = d.upgRound || 0;
    G.difficulty = (typeof d.difficulty === 'number') ? d.difficulty : 0;
    G.sellBlood = d.sellBlood || 0;
    G.intro = d.intro || 0;        // 开局流程做到哪一步（装备 / 神器）
    G.blessings = (d.blessings || []).slice();
    G.blessRound = d.blessRound || 0;
    G.encRound = d.encRound || 0;
    recomputeBless();       // 恢复存档里的祝福效果（面板/技能挂点重算）
    G.paused = false;
    G.speed = 1;
    G.formation.forEach(u => { u.row = -1; u.col = -1; });
    G.formation.forEach(u => placeUnit(u));
    spawnEnemies(G.level);
    if(d.phase === 'diff'){
      // 战前难度选择阶段：重新选择本关难度
      G.phase = 'diff';
      Rogue.openDiff();
      Rogue.msg = { text:'✅ 已恢复存档：请为第 ' + G.level + ' 关选择难度', cls:'ok' };
      Rogue.renderDiff();
    } else if(d.phase === 'art'){
      // 神器三选一阶段：重新开一轮神器选择
      G.phase = 'art';
      Rogue.openArt();
      Rogue.msg = G.intro
        ? { text:'✅ 已恢复存档：继续开局神器三选一', cls:'ok' }
        : { text:'✅ 已恢复存档：继续第 ' + G.level + ' 关通关后的神器选择', cls:'ok' };
      Rogue.renderArt();
    } else if(d.phase === 'star'){
      // 战后升星阶段：继续第 ② 屏升星
      G.phase = 'star';
      Rogue.openStar();
      Rogue.msg = { text:'✅ 已恢复存档：继续第 ' + G.level + ' 关通关后的升星选择', cls:'ok' };
      Rogue.renderStar();
    } else if(d.phase === 'bless'){
      // 祝福三选一阶段：重新开一轮祝福选择（选完回流程链）
      G.phase = 'bless';
      Bless.open();
      Bless.msg = { text:'✅ 已恢复存档：继续第 ' + G.level + ' 关通关后的祝福选择', cls:'ok' };
      Bless.render();
    } else if(d.phase === 'enc'){
      // 旧存档停在奇遇阶段：奇遇事件已停用（代码保留）→ 回到战后流程链补结算后进下一关
      G.phase = 'loot';
      afterLoot();
    } else if(d.phase === 'upg'){
      // 旧存档：改造三选一已移出流程 → 改为继续战后升星
      G.phase = 'star';
      Rogue.openStar();
      Rogue.msg = { text:'✅ 已恢复存档：改造选择已并入新流程，请继续升星', cls:'ok' };
      Rogue.renderStar();
    } else if(d.phase === 'shop'){
      // 旧存档：商店阶段（商店已停用，这里保留兼容）
      G.phase = 'shop';
      UI.setScreen('shop');
      Shop.open();
      Shop.msg = { text:'✅ 已恢复存档：第 ' + G.level + ' 关通过 · ' + G.gold +
        ' 金币 · 阵容 ' + G.formation.length + ' 人', cls:'ok' };
      Shop.showDesc();
    } else if(d.phase === 'loot'){
      // 第①屏：继续装备购买（开局中 → 继续开局装备三选一）
      G.phase = 'loot';
      if(G.intro){
        Loot.openIntro();
        Loot.msg = { text:'✅ 已恢复存档：继续开局装备三选一', cls:'ok' };
      } else {
        Loot.open();
        Loot.msg = { text:'✅ 已恢复存档：继续第 ' + G.level + ' 关的装备购买', cls:'ok' };
      }
      Loot.render();
    } else {
      G.phase = 'battle';
      UI.setScreen('battle');
      UI.renderBattle();
      startBattle();
      UI.info('unit', G.formation[0] || null);
    }
    UI.updateHeader();
    return true;
  },
};

/* 速度 / 暂停按钮状态同步 */
function syncSpeedBtns(){
  const pause = document.getElementById('btnPause');
  if(pause) pause.textContent = G.paused ? '▶' : '⏸';
  document.querySelectorAll('#tbSpeed [data-speed]').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.speed) === (G.speed || 1));
  });
}

/* ---------- 主循环 ---------- */
let _last = performance.now();
function loop(now){
  const dt = Math.min(0.05, (now - _last) / 1000);
  _last = now;
  // 暂停时冻结战斗逻辑；倍速时按倍率推进（子弹/技能/风暴同步加速）
  if(G.phase === 'battle' && !G.paused) update(dt * (G.speed || 1));
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
  UI.initTip();     // 装备悬停属性提示（含档位颜色）
  document.getElementById('btnRestart').addEventListener('click', restart);

  /* ---- 顶栏：速度 / 暂停控件（仅战斗中显示） ---- */
  const spd = document.getElementById('tbSpeed');
  if(spd){
    spd.addEventListener('click', ev => {
      if(ev.target.closest('#btnPause')){
        if(G.phase === 'battle'){ G.paused = !G.paused; UI.updateHeader(); }
      } else {
        const b = ev.target.closest('[data-speed]');
        if(b){
          G.speed = Number(b.dataset.speed) || 1;
          G.paused = false;
          UI.updateHeader();
        }
      }
      syncSpeedBtns();
      if(ev.target.blur) ev.target.blur();   // 防止空格键误触发按钮
    });
  }
  window.addEventListener('keydown', ev => {
    if(ev.code === 'Space'){
      ev.preventDefault();
      if(G.phase === 'battle'){ G.paused = !G.paused; syncSpeedBtns(); UI.updateHeader(); }
    } else if(ev.key === '1' || ev.key === '2' || ev.key === '3'){
      if(G.phase === 'battle'){ G.speed = Number(ev.key); syncSpeedBtns(); }
    }
  });

  /* ---- 发现存档 → 选英雄界面提供「继续上次进度」 ---- */
  const sv = Save.peek();
  if(sv){
    const bar = document.getElementById('chosenBar');
    if(bar){
      const box = document.createElement('div');
      box.className = 'save-continue';
      box.innerHTML =
        '<button class="btn primary" id="btnContinue">▶ 继续上次进度（第 ' +
        (sv.level || 1) + ' 关 · ' + (sv.gold || 0) + ' 金币）</button>' +
        '<button class="btn" id="btnClearSave">🗑 清除存档</button>' +
        '<span class="chosen-hint">也可忽略存档，直接重新开局</span>';
      bar.parentNode.insertBefore(box, bar.nextSibling);
      box.querySelector('#btnContinue').addEventListener('click', () => {
        const d = Save.peek();
        if(d && Save.restore(d)) box.remove();
      });
      box.querySelector('#btnClearSave').addEventListener('click', () => {
        Save.clear();
        box.remove();
      });
    }
  }

  window.addEventListener('resize', () => {
    if(G.phase === 'battle'){ UI.updatePositions(); resizeCanvas(); }
  });
  requestAnimationFrame(loop);
});
