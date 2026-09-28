# -*- coding: utf-8 -*-
"""data.js 文案：去掉技能冷却描述，改为蓝满即放"""
import io, re, sys

path = "js/data.js"
with io.open(path, "r", encoding="utf-8") as f:
    src = f.read()

rules = [
    (r"耗蓝 (\d+)，冷却 (\d+) 秒。", r"耗蓝 \1，蓝满即放。"),
    (r"消耗 (\d+) 魔法值，冷却 (\d+) 秒。", r"消耗 \1 魔法值，蓝满即放。"),
    (r"击杀敌人则重置冷却并回 40 蓝。", r"击杀敌人立即回 40 蓝。"),
    (r"大招击杀敌人 → 重置冷却并回蓝，滚起雪球", r"大招击杀敌人 → 立即回蓝，滚起雪球"),
    (r"装上后获得独立蓝条与冷却（3 档起出现）", r"装上后获得独立蓝条（3 档起出现）"),
]

total = 0
for pat, rep in rules:
    src, n = re.subn(pat, rep, src)
    print("%-40s -> %d" % (pat, n))
    total += n

with io.open(path, "w", encoding="utf-8", newline="") as f:
    f.write(src)

# 校验：不应再有“冷却 X 秒”式技能文案（“内置冷却”为护盾机制，允许保留）
left = [m.start() for m in re.finditer(r"冷却 \d+ 秒", src)]
print("remaining '冷却 N 秒':", len(left))
print("TOTAL:", total)
sys.exit(0 if (total > 0 and not left) else 1)
