# -*- coding: utf-8 -*-
import sys, io, glob
import esprima

ok = True
for f in sorted(glob.glob('js/*.js')):
    src = io.open(f, encoding='utf-8').read()
    try:
        esprima.parseScript(src)
        print('PASS', f)
    except Exception as ex:
        ok = False
        print('FAIL', f, ex)

css = io.open('css/style.css', encoding='utf-8').read()
b = css.count('{') - css.count('}')
print('CSS braces balance:', b, 'PASS' if b == 0 else 'FAIL')
if b != 0: ok = False

eng = io.open('js/engine.js', encoding='utf-8').read()
dat = io.open('js/data.js', encoding='utf-8').read()

checks = [
    ("data.js arcLightning 闪电链 desc", '闪电链：雷电劈向随机 3 个敌人' in dat),
    ("data.js thundergod 连锁传递 desc", '连锁跳跃传递' in dat),
    ("castSkill 不再瞬间结算", 'for(const t of targets) applyHit(t, buildPayload(u, sk))' not in eng),
    ("onHit 逐段结算", 'onHit: () => applyHit(t, buildPayload(u, sk))' in eng),
    ("hits 分段抵达结算", 'if(!h.done && e.t >= h.at)' in eng),
    ("marks 分段揭示", 'e.marks[k + 1] - e.marks[k]' in eng),
    ("雷神之怒天雷入场", 'y: 6' in eng and "type:'flash'" in eng),
    ("旧 e.sparks 已移除", 'for(const s of e.sparks)' not in eng),
    ("makeSparks defined", 'function makeSparks' in eng),
]
for name, res in checks:
    print(('PASS' if res else 'FAIL'), name)
    if not res: ok = False

sys.exit(0 if ok else 1)
