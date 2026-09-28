# -*- coding: utf-8 -*-
# 装备完整性检查：
# 1) 抽取 data.js 中的行内 skill:{...}，校验 id/type/desc/behavior 与必需字段
# 2) 校验 60 件装备全部带 cat(tank/phys/magic)、id 唯一、EQ_CATS 存在
# 3) 校验同档位内属性行不重复（同质化检查）
import io, re, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
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

ALLOW = {'takenReduce','bloodRage','healTeamPerSec','healLowestPerSec','attackStun','attackDot',
         'manaBurn','cleave','assureCrit','shieldOnHit','lastStand','thorns','auraStat',
         'allyHealOnHit','deathBloom','corrosion','skillDot','phaseTwo','counterHelix'}
REQ = {
    'takenReduce': ['pct:'], 'bloodRage': ['per:'], 'healTeamPerSec': ['pct:'],
    'healLowestPerSec': ['stat:', 'mult:'],
    'attackStun': ['chance:', 'dur:'], 'attackDot': ['dot:{', 'mult:', 'dur:'],
    'manaBurn': ['mana:'], 'cleave': ['mult:'], 'assureCrit': ['every:'],
    'shieldOnHit': ['pct:', 'internalCd:'], 'lastStand': ['pct:', 'heal:'],
    'thorns': ['mult:'], 'auraStat': ['pct:{'], 'allyHealOnHit': ['chance:', 'stat:', 'mult:'],
    'deathBloom': ['mult:'], 'corrosion': ['pct:'],
    'skillDot': ['dot:{', 'mult:', 'dur:'], 'phaseTwo': ['hpPct:'],
    'counterHelix': ['chance:', 'mult:'],
}
bad = 0
skbs = blocks(src, 'skill:{')
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

# ---------- 2) 分类覆盖 ----------
if 'const EQ_CATS' not in src:
    print('MISS const EQ_CATS'); bad += 1
eqsec = src[src.find('const EQUIPS'):src.find('];', src.find('const EQUIPS'))]

def item_blocks(s):
    """从每个 { id:'eq_... 起做括号配平，截出完整装备条目（含 id/tier/name/cat/stats/skill）"""
    out, i = [], 0
    while True:
        j = s.find("id:'eq_", i)
        if j < 0:
            break
        start = s.rfind('{', 0, j)
        depth, k = 0, start
        while k < len(s):
            if s[k] == '{':
                depth += 1
            elif s[k] == '}':
                depth -= 1
                if depth == 0:
                    break
            k += 1
        out.append(s[start:k + 1])
        i = k + 1
    return out

items = item_blocks(eqsec)
print('equip count = %d (expect 60)' % len(items))
if len(items) != 60:
    bad += 1
ids, sigs = {}, {}
for it in items:
    mid = re.search(r"id:'([^']+)'", it)
    mt = re.search(r'tier:(\d)', it)
    mc = re.search(r"cat:'(tank|phys|magic)'", it)
    mn = re.search(r"name:'([^']+)'", it)
    if not mid or not mt or not mn:
        print('PARSE FAIL: ' + it[:60]); bad += 1; continue
    if not mc:
        print('NO cat: ' + mn.group(1)); bad += 1
    if mid.group(1) in ids:
        print('DUP id: ' + mid.group(1)); bad += 1
    ids[mid.group(1)] = 1
    ms = re.search(r'stats:\{([^}]*)\}', it)
    sig = re.sub(r'\s+', '', ms.group(1)) if ms else ''
    key = (mt.group(1), sig)
    if key in sigs and sig:
        print('DUP stats t%s: %s == %s' % (mt.group(1), mn.group(1), sigs[key])); bad += 1
    sigs[key] = mn.group(1)

# ---------- 3) CSS 分类主题 ----------
css = io.open('css/style.css', encoding='utf-8').read()
if css.count('{') != css.count('}'):
    print('CSS brace mismatch %d/%d' % (css.count('{'), css.count('}'))); bad += 1
for cls in ['.lc-eq--tank', '.lc-eq--phys', '.lc-eq--magic',
            '.opt--tank', '.opt--phys', '.opt--magic', '.opt-cat--tank', '.opt-cat--phys', '.opt-cat--magic']:
    if cls not in css:
        print('CSS miss ' + cls); bad += 1

# ---------- 4) 渲染点都接入分类 ----------
for f, pat in [('js/loot.js', 'lc-eq--'), ('js/shop.js', 'opt--'),
               ('js/ui.js', 'opt-cat--'), ('js/ui.js', "EQ_CATS[item.cat]")]:
    t = io.open(f, encoding='utf-8').read()
    if pat not in t:
        print('render miss %s in %s' % (pat, f)); bad += 1

print('DONE bad=%d' % bad)
sys.exit(1 if bad else 0)
