# -*- coding: utf-8 -*-
"""把 data.js 里主动技能的 CD 压缩到 2~5 秒，并把描述里的「蓝满即放」改为带冷却的说法。"""
import io, re, sys

path = 'js/data.js'
src = io.open(path, encoding='utf-8').read()

# 原 CD -> 新 CD（最长 5 秒，保持相对梯度 2/3/4/5）
MAP = {4:2, 5:2, 6:3, 7:3, 8:3, 9:4, 10:4, 11:4, 12:5, 14:5}

def repl(m):
    old = int(m.group(2))
    new = MAP.get(old, min(old, 5))
    return '%scd:%d,' % (m.group(1), new)

# 只匹配主动技能行：id:'x', name:'y', type:'active', cost:N, cd:M,
pat = re.compile(r"(id:'[^']+', name:'[^']+', type:'active', cost:\d+, cd:)(\d+),")
src, n1 = pat.subn(repl, src)

# 描述文案：蓝满即放。 -> 蓝满且冷却就绪即放。
n2 = src.count('蓝满即放。')
src = src.replace('蓝满即放。', '蓝满且冷却就绪即放。')

io.open(path, 'w', encoding='utf-8', newline='').write(src)

# 校验：不得再有 >5 的 cd
bad = re.findall(r"cd:(\d+),", src)
over = [c for c in bad if int(c) > 5]
print('cd rewritten:', n1, '| desc rewritten:', n2, '| remaining cd values:', bad, '| over 5:', over)
sys.exit(1 if over or n1 == 0 else 0)
