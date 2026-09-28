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

# 残留检查
import re
joined = ''
for f in sorted(glob.glob('js/*.js')):
    joined += io.open(f, encoding='utf-8').read()
for bad in ['u.cd[', 'cdMul', 'blessCd', 'killReset']:
    if bad in joined:
        print('LEFTOVER:', bad); ok = False

# 雷电接线检查
checks = [
    ("data.js fx:'lightning'", "fx:'lightning'" in io.open('js/data.js', encoding='utf-8').read()),
    ('castSkill castLightningFx', 'castLightningFx(u, targets, sk)' in joined),
    ('drawFX lightning branch', "e.type === 'lightning'" in joined),
    ('drawFX flash branch', "e.type === 'flash'" in joined),
    ('genBoltPts defined', 'function genBoltPts' in joined),
    ('makeLightning defined', 'function makeLightning' in joined),
    ('strokeBolt defined', 'function strokeBolt(' in joined),
    ('clamp exists', 'function clamp(' in joined),
    ('hexA exists', 'function hexA(' in joined),
]
for name, res in checks:
    print(('PASS' if res else 'FAIL'), name)
    if not res: ok = False

sys.exit(0 if ok else 1)
