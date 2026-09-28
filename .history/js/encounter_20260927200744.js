'use strict';

/* ================= 肉鸽奇遇事件（战后随机穿插二选一） =================
 * 每关战后在神器（以及可能的祝福）结算完后按概率触发，
 * 每关最多一次（G.encRound 标记）→ 奇遇二选一 → 进入下一关。
 * 每个事件都带风险与收益，选择不可撤销。
 */
const ENC_LEVELS = [3, 7, 11, 15, 19];

const ENCOUNTERS = [
  {
    id:'enc_spring', icon:'🌿', name:'神秘泉水',
    text:'林间藏着一泓发光的泉水，水面上泛着治愈的微光……',
    a:{ label:'全队沐浴泉水', hint:'所有英雄回复全部生命' },
    b:{ label:'汲取水中魔力', hint:'随机获得 1 个祝福' },
  },
  {
    id:'enc_gamble', icon:'🎲', name:'赌博商人',
    text:'戴着高帽的商人摆开赌桌："来一把？赢了装备白拿，输了……嘿嘿。"',
    a:{ label:'下注 30 金币', hint:'70% 获得随机高档装备；30% 金币打水漂' },
    b:{ label:'拿走红利', hint:'稳得 25 金币' },
  },
  {
    id:'enc_altar', icon:'⚰️', name:'献祭祭坛',
    text:'古老的祭坛上刻着血色符文，仿佛在低语："以血换金……"',
    a:{ label:'献祭队长 20% 生命上限', hint:'队长永久损失 20% 基础生命，获得 70 金币' },
    b:{ label:'转身离开', hint:'获得 10 金币安慰奖' },
  },
  {
    id:'enc_chest', icon:'📦', name:'遗迹宝箱',
    text:'半埋在土里的青铜宝箱，锁孔里透出微光，似乎还能打开……',
    a:{ label:'撬开宝箱', hint:'随机获得一件 3~5 档装备' },
    b:{ label:'拆解卖钱', hint:'稳得 35 金币' },
  },
  {
    id:'enc_fate', icon:'🎡', name:'命运转盘',
    text:'巨大的转盘刻着星辰与骷髅，指针在"丰饶"与"虚空"之间摇摆。',
    a:{ label:'拨动转盘（赌一把）', hint:'50% 全队各升 1 星；50% 损失 30 金币' },
    b:{ label:'放弃赌博', hint:'稳得 40 金币' },
  },
];

const Encounter = {
  list: [],        // 本次事件（1 个）
  cur: null,       // 当前事件
  result: null,    // 选择结果 { text, cls }
  done: false,     // 已选择，等待点继续

  open(){
    G.phase = 'enc';
    this.cur = pickOne(ENCOUNTERS);
    this.result = null;
    this.done = false;
    UI.setScreen('enc');
    this.render();
    UI.updateHeader();
    Save.save();
  },

  render(){
    const e = this.cur;
    if(!e) return;
    const canA = this.canChoose('a');
    const html =
      '<div class="enc-wrap">' +
        '<div class="shop-top">' +
          '<span>🏆 第 <b>' + G.level + '</b> 关通过！</span>' +
          '<span>💰 金币：<b id="encGold">' + G.gold + '</b></span>' +
          '<span class="hint">奇遇事件：做出你的选择（结果不可撤销）</span>' +
        '</div>' +
        '<div class="panel enc-main">' +
          '<div class="p-title">' + e.icon + ' 奇遇 · ' + e.name + '</div>' +
          '<div class="enc-text">' + e.text + '</div>' +
          '<div class="enc-opts">' +
            this.optHtml('a', e.a, canA) +
            this.optHtml('b', e.b, true) +
          '</div>' +
          (this.result
            ? '<div class="loot-msg ' + this.result.cls + '">' + this.result.text + '</div>' +
              '<div class="loot-foot">' + UI.sellBtnHtml() +
              '<button class="btn primary" id="encGo">继续冒险 →</button></div>'
            : '<div class="loot-foot">' + UI.sellBtnHtml() +
              '<span class="shop-hint">奇遇随机出现在通关之后，选择不可撤销。</span></div>') +
        '</div>' +
      '</div>';
    const scr = document.getElementById('encScreen');
    scr.innerHTML = html;
    UI.bindSell(scr, () => this.render());   // 卖血按钮：+10💰，下场开战全体 -20% HP

    if(!this.done){
      scr.querySelectorAll('.enc-opt').forEach(btn => {
        btn.addEventListener('click', () => {
          if(btn.dataset.k === 'a' && !this.canChoose('a')) return;
          this.choose(btn.dataset.k);
        });
      });
    } else {
      const go = scr.querySelector('#encGo');
      if(go) go.addEventListener('click', () => {
        G.encRound = G.level;   // 标记本关奇遇已触发，afterLoot 不再重复进入
        Save.save();
        afterLoot();
      });
    }
    UI.updateHeader();
  },

  optHtml(k, opt, enabled){
    return '<button class="enc-opt' + (enabled ? '' : ' disabled') + '" data-k="' + k + '"' +
      (enabled ? '' : ' disabled') + '>' +
      '<span class="eo-label">' + (k === 'a' ? 'A · ' : 'B · ') + opt.label + '</span>' +
      '<span class="eo-hint">' + opt.hint + (enabled ? '' : '（金币不足）') + '</span>' +
      '</button>';
  },

  /* A 选项可用性：下注需要 30 金币 */
  canChoose(k){
    if(!this.cur) return false;
    if(this.cur.id === 'enc_gamble' && k === 'a') return G.gold >= 30;
    if(this.cur.id === 'enc_fate' && k === 'a') return G.gold >= 30;
    return true;
  },

  choose(k){
    if(this.done) return;
    const e = this.cur;
    let text = '';
    if(e.id === 'enc_spring'){
      if(k === 'a'){
        G.formation.forEach(u => {
          if(!u.alive) return;
          const h = u.maxHp - u.hp;
          u.hp = u.maxHp;
          if(h > 0) text += u.def.name + ' +' + fmtN(h) + '｜';
        });
        text = '🌿 泉水沐浴：' + (text || '全员已满血') + '全队生命回满！';
      } else {
        const b = rollBlessings(1)[0];
        if(b){
          G.blessings = G.blessings || [];
          G.blessings.push(b.id);
          recomputeBless();
          text = '💧 汲取魔力：获得祝福 ' + b.icon + ' ' + b.name + '（' + b.desc + '）';
        } else {
          text = '💧 汲取魔力：泉水干涸，什么都没发生。';
        }
      }
    }
    else if(e.id === 'enc_gamble'){
      if(k === 'a'){
        G.gold -= 30;
        if(Math.random() < 0.7){
          const eq = this.rollEquip(3);
          const hero = this.emptyHero();
          if(eq && hero){
            hero.equips.push(eq);
            hero._frame = -1;
            refreshMaxHp(hero);
            text = '🎲 开奖大吉！获得 ' + eq.icon + ' ' + eq.name + '（已装备给 ' + hero.def.name + '）';
          } else {
            G.gold += 20;
            text = '🎲 开奖大吉！但装备格已满，折算成 20 金币入账';
          }
        } else {
          text = '🎲 骰子无情…30 金币打水漂了';
        }
      } else {
        G.gold += 8;
        text = '🎲 商人耸耸肩：红利 8 金币拿好';
      }
    }
    else if(e.id === 'enc_altar'){
      const cap = G.formation[0];
      if(k === 'a' && cap){
        // 永久损失 20% 基础生命（只影响本局该单位）
        cap.def = Object.assign({}, cap.def, { base: Object.assign({}, cap.def.base) });
        const cut = Math.round(cap.def.base.hp * 0.2);
        cap.def.base.hp = Math.max(100, cap.def.base.hp - cut);
        cap._frame = -1;
        cap.hp = Math.min(cap.hp, cap.maxHp);
        G.gold += 25;
        text = '⚰️ ' + cap.def.name + ' 献出 ' + cut + ' 点生命上限，换来 25 金币…';
      } else {
        G.gold += 4;
        text = '⚰️ 你选择远离祭坛，在角落捡到 4 金币';
      }
    }
    else if(e.id === 'enc_chest'){
      if(k === 'a'){
        const eq = this.rollEquip(2);   // 2 = 最低 3 档
        const hero = this.emptyHero();
        if(eq && hero){
          hero.equips.push(eq);
          hero._frame = -1;
          refreshMaxHp(hero);
          text = '📦 宝箱开启！获得 ' + eq.icon + ' ' + eq.name + '（已装备给 ' + hero.def.name + '）';
        } else {
          G.gold += 15;
          text = '📦 装备格已满，宝箱零件折算 15 金币';
        }
      } else {
        G.gold += 12;
        text = '📦 拆解宝箱卖废铁，稳得 12 金币';
      }
    }
    else if(e.id === 'enc_fate'){
      if(k === 'a'){
        if(Math.random() < 0.5){
          let n = 0;
          G.formation.forEach(u => {
            if(u.star < STAR_MAX){ u.star++; u._frame = -1; refreshMaxHp(u); n++; }
          });
          text = n
            ? '🎡 转盘指向丰饶！' + n + ' 名英雄各升 1 星！'
            : '🎡 转盘指向丰饶！可惜全员已满星';
        } else {
          const loss = Math.min(30, G.gold);
          G.gold -= loss;
          text = '🎡 转盘指向虚空…损失 ' + loss + ' 金币';
        }
      } else {
        G.gold += 15;
        text = '🎡 你婉拒了赌局，商人留下 15 金币作为纪念';
      }
    }

    this.result = { text: text, cls: text.indexOf('…') >= 0 || text.indexOf('水漂') >= 0 ? 'err' : 'ok' };
    this.done = true;
    Save.save();
    this.render();
    UI.updateHeader();
  },

  /* 随机一件不低于 minTier 的装备 */
  rollEquip(minTier){
    const maxTier = Math.min(5, Math.max(minTier, Math.ceil((G.level + 1) / 4)));
    let pool = EQUIPS.filter(e => e.tier >= minTier && e.tier <= maxTier);
    if(!pool.length) pool = EQUIPS.filter(e => e.tier >= minTier);
    if(!pool.length) pool = EQUIPS.slice();
    return pickOne(pool);
  },
  /* 第一个有空位的英雄 */
  emptyHero(){
    return G.formation.find(u => u.alive && u.equips.length < 6) ||
           G.formation.find(u => u.equips.length < 6) || null;
  },
};
