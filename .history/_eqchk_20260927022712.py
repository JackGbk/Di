# -*- coding: utf-8 -*-
# 装备技能完整性检查：抽取 data.js 中的行内 skill:{...}，校验 id/type/desc/behavior 字段
import io, re, sys

src = io.open('js/data.js', encoding='utf-8').read()

def blocks(s, key):
    out, i = [], 0
    while True:
        j = s.find(key, i)
        if j < 0:
            break
        start = j + len(key) - 1
        depth, k = 0, start
        while k < len(s):
            if s[k] == '{':
                depth += 1
            elif s[k] == '}':
                depth -= 1
                if depth == 0:
                    break
            k += 1
        out.append(s[j:k + 1])
        i = k + 1
    return out

ALLOW = {'takenReduce','bloodRage','healTeamPerSec','attackStun','attackDot','manaBurn',
         'cleave','assureCrit','shieldOnHit','lastStand','thorns','auraStat',
         'allyHealOnHit','deathBloom'}
REQ = {
    'takenReduce': ['pct:'], 'bloodRage': ['per:'], 'healTeamPerSec': ['pct:'],
    'attackStun': ['chance:', 'dur:'], 'attackDot': ['dot:{', 'mult:', 'dur:'],
    'manaBurn': ['mana:'], 'cleave': ['mult:'], 'assureCrit': ['every:'],
    'shieldOnHit': ['pct:', 'internalCd:'], 'lastStand': ['pct:', 'heal:'],
    'thorns': ['mult:'], 'auraStat': ['pct:{'], 'allyHealOnHit': ['chance:', 'stat:', 'mult:'],
    'deathBloom': ['mult:'],
}
skbs = blocks(src, 'skill:{')
bad = 0
for b in skbs:
    owner = ''
    p = src.rfind("id:'eq_", 0, src.find(b))
    if p >= 0:
        owner = src[p:src.find("'", p + 4) + 1]
    if "id:'eqsk_" not in b:
        print('BAD id  ' + owner); bad += 1
    if "type:'passive'" not in b:
        print('BAD type ' + owner); bad += 1
    if "desc:'" not in b:
        print('NO desc ' + owner); bad += 1
    m = re.search(r"behavior:'([A-Za-z]+)'", b)
    if m:
        beh = m.group(1)
        if beh not in ALLOW:
            print('UNKNOWN behavior ' + beh + ' @ ' + owner); bad += 1
        else:
            for f in REQ[beh]:
                if f not in b:
                    print('MISS ' + f + ' for ' + beh + ' @ ' + owner); bad += 1
    elif 'killMana:' not in b:
        print('NO behavior/killMana @ ' + owner); bad += 1

# 血量核查：英雄基础生命与敌方基础生命
hps = [int(x) for x in re.findall(r"base:\{ hp:(\d+)", src)]
eb = re.search(r"ENEMY_BASE = \{[^}]*?hp:(\d+)", src)
ebhp = int(eb.group(1)) if eb else -1
atk = [float(x) for x in re.findall(r"base:\{ hp:\d+, maxMana:\d+, atk:([\d.]+)", src)]
print('hero hp: %d-%d   enemy hp: %d   hero atk: %g-%g'
      % (min(hps), max(hps), ebhp, min(atk), max(atk)))
print('skills: %d   ' % len(skbs) + ('DONE bad=0' if bad == 0 else 'BAD %d' % bad))
sys.exit(1 if bad else 0)
