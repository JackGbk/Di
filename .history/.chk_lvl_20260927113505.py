# -*- coding: utf-8 -*-
# 验证：LEVEL_TRAITS.mobs 只引用 ENEMY_TYPES 中存在的类型；每关 pool 长度足够；
#       技能引用存在于 SKILLS；预计奖励计算抽查。
import re, io
s = io.open('js/data.js', encoding='utf-8').read()

def block(name):
    i = s.index('const ' + name)
    j = s.index('};', i)
    return s[i:j]

et = block('ENEMY_TYPES')
etypes = set(re.findall(r"^\s*(\w+):\s*\{\s*name:", et, re.M))

lt = block('LEVEL_TRAITS')
mobs = dict((int(a), b) for a, b in re.findall(r"^\s*(\d+):\s*\{[^}]*?mobs:\[([^\]]*)\]", lt, re.M))

bad = []
for lv, arr in sorted(mobs.items()):
    toks = [t.strip().strip("'") for t in arr.split(',') if t.strip()]
    for t in toks:
        if t not in etypes:
            bad.append((lv, t))
    # 需求数量：count(lv) 或 +1（挑战），boss 关 cap
    cnt = 2 if lv <= 3 else (3 if lv <= 6 else 4)
    bossN = 2 if lv % 5 == 0 else 1
    need = min(cnt + 1, 6 - bossN)
    if len(toks) < need:
        bad.append((lv, 'pool太短 %d < %d' % (len(toks), need)))

# 技能引用检查
sk_ids = set(re.findall(r"^\s*(\w+):\s*\{\s*\n?\s*id:'(\w+)'", s, re.M))
sk_ids = set(x[1] for x in sk_ids)
et_skills = re.findall(r"skills:\[([^\]]*)\]", et)
for grp in et_skills:
    for t in re.findall(r"'(\w+)'", grp):
        if t not in sk_ids:
            bad.append(('skill', t))

print('etypes:', sorted(etypes))
print('levels:', len(mobs))
print('BAD:', bad if bad else 'none')
