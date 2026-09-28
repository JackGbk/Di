# -*- coding: utf-8 -*-
"""解析 OpenDota 物品常量，输出精简资料卡供重做装备参考"""
import json, io, sys

with io.open('dota_od_items.json', encoding='utf-8') as f:
    data = json.load(f)

rows = []
for key, it in data.items():
    if not isinstance(it, dict):
        continue
    cost = it.get('cost') or 0
    if cost <= 0:
        continue  # 跳过消耗品/中立较小件之外的免费项? 先全部保留但排序
    name = it.get('dname') or key
    beh = it.get('behavior') or []
    if isinstance(beh, list):
        beh = [b.replace('ABILITY_BEHAVIOR_', '') for b in beh]
    attribs = []
    for a in (it.get('attrib') or []):
        if isinstance(a, dict):
            b = a.get('bonuses') or a.get('value') or ''
            if isinstance(b, list):
                b = ','.join(str(x) for x in b)
            attribs.append(str(a.get('key', '')) + ':' + str(b))
    lore = (it.get('lore') or '').replace('\n', ' ')
    comps = ','.join(it.get('components') or []) if it.get('components') else ''
    rows.append((cost, name, key, '|'.join(beh), ';'.join(attribs), comps, lore))

rows.sort(key=lambda r: (-r[0], r[1]))
out = io.open('dota_items_digest.txt', 'w', encoding='utf-8')
out.write('total=%d\n\n' % len(rows))
for cost, name, key, beh, attribs, comps, lore in rows:
    out.write('[%4d] %s (%s)\n' % (cost, name, key))
    if beh:    out.write('   beh: %s\n' % beh)
    if attribs:out.write('   attr: %s\n' % attribs)
    if comps:  out.write('   com: %s\n' % comps)
    if lore:   out.write('   lore: %s\n' % lore)
out.close()
print('rows=%d' % len(rows))
