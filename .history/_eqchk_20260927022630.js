// 装备技能完整性检查：读取 data.js，校验行内技能字段与 behavior 白名单
const fs = require('fs');
const src = fs.readFileSync('js/data.js', 'utf8');
const ctx = {};
(new Function('g', src + '\n;g.EQUIPS=EQUIPS;g.HEROES=HEROES;g.SKILLS=SKILLS;g.ENEMY_BASE=ENEMY_BASE;'))(ctx);

const ALLOW = new Set(['takenReduce','bloodRage','healTeamPerSec','attackStun','attackDot','manaBurn',
  'cleave','assureCrit','shieldOnHit','lastStand','thorns','auraStat','allyHealOnHit','deathBloom']);
let bad = 0, withSkill = 0, pure = 0;
const ids = new Set();
for(const e of ctx.EQUIPS){
  if(ids.has(e.id)){ console.log('DUP id ' + e.id); bad++; }
  ids.add(e.id);
  if(!e.skill){ pure++; continue; }
  withSkill++;
  const s = e.skill;
  if(typeof s === 'string'){ console.log('STRING skill ' + e.id + ' -> itemTip 不解析'); bad++; continue; }
  if(!s.id || s.id.indexOf('eqsk_') !== 0){ console.log('bad sk id ' + e.id); bad++; }
  if(s.type !== 'passive'){ console.log('bad type ' + e.id); bad++; }
  if(!s.desc){ console.log('no desc ' + e.id); bad++; }
  if(s.behavior){
    if(!ALLOW.has(s.behavior)){ console.log('unknown behavior ' + e.id + ' ' + s.behavior); bad++; }
    if(s.behavior === 'auraStat' && (typeof s.pct !== 'object' || !s.pct)){ console.log('aura pct shape ' + e.id); bad++; }
    if(s.behavior === 'attackStun' && !(s.chance > 0 && s.dur > 0)){ console.log('stun fields ' + e.id); bad++; }
    if(s.behavior === 'attackDot' && !(s.dot && s.dot.mult && s.dot.dur)){ console.log('dot fields ' + e.id); bad++; }
    if(s.behavior === 'assureCrit' && !(s.every > 0)){ console.log('every fields ' + e.id); bad++; }
    if(s.behavior === 'cleave' && !(s.mult > 0)){ console.log('cleave fields ' + e.id); bad++; }
    if(s.behavior === 'takenReduce' && !(s.pct > 0)){ console.log('reduce pct ' + e.id); bad++; }
    if(s.behavior === 'thorns' && !(s.mult > 0)){ console.log('thorns mult ' + e.id); bad++; }
    if(s.behavior === 'allyHealOnHit' && !(s.chance > 0 && s.stat && s.mult > 0)){ console.log('allyheal fields ' + e.id); bad++; }
    if(s.behavior === 'shieldOnHit' && !(s.pct > 0 && s.internalCd > 0)){ console.log('shield fields ' + e.id); bad++; }
    if(s.behavior === 'lastStand' && !(s.pct > 0 && s.heal > 0)){ console.log('laststand fields ' + e.id); bad++; }
    if(s.behavior === 'deathBloom' && !(s.mult > 0)){ console.log('bloom fields ' + e.id); bad++; }
    if(s.behavior === 'manaBurn' && !(s.mana > 0)){ console.log('manaburn fields ' + e.id); bad++; }
    if(s.behavior === 'bloodRage' && !(s.per > 0)){ console.log('bloodrage per ' + e.id); bad++; }
    if(s.behavior === 'healTeamPerSec' && !(s.pct > 0)){ console.log('heal pct ' + e.id); bad++; }
  } else if(!(s.killMana > 0)){ console.log('no behavior & no killMana ' + e.id); bad++; }
}
// 血量检查
const hp = ctx.HEROES.map(h => h.base.hp);
console.log('heroes hp min/max = ' + Math.min.apply(null, hp) + '/' + Math.max.apply(null, hp) +
            '  enemy hp = ' + ctx.ENEMY_BASE.hp);
console.log('equips = ' + ctx.EQUIPS.length + '  withSkill = ' + withSkill + '  pure = ' + pure);
console.log(bad === 0 ? 'DONE bad=0' : 'BAD ' + bad);
process.exit(bad === 0 ? 0 : 1);
