# -*- coding: utf-8 -*-
"""修复 .cd_reduce.py 产生的 cd:cd:N 重复前缀。"""
import io, re, sys

path = 'js/data.js'
src = io.open(path, encoding='utf-8').read()
src, n = re.subn(r'cd:cd:(\d+)', r'cd:\1', src)
io.open(path, 'w', encoding='utf-8', newline='').write(src)

bad = re.findall(r'cd:cd:|cd:(\d+),', src)
over = [c for c in bad if c and int(c) > 5]
print('fixed:', n, '| over5:', over)
sys.exit(1 if n == 0 or over else 0)
