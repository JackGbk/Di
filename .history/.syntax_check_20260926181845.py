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
    ("strike+pause timing", 'const strike = 0.06, pause = 0.12;' in eng),
    ("hit at strike end", 'at: i * segDur + strike,' in eng),
    ("reveal pause via strike", '/ (e.strike || e.seg)' in eng),
    ("narrow rough", 'Math.max(5, dist * 0.07)' in eng),
    ("narrow branches", '0.2 + Math.random() * 0.3' in eng),
    ("flare on arrival", 'flare = 1.7' in eng),
    ("thicker core", "', 3.2);" in eng),
    ("strike field in makeLightning", 'strike: opt.strike || opt.seg || 0.24' in eng),
    ("12 sparks", 'i < 12' in eng),
    ("arc color updated", "color:'#6cc8ff'" in dat),
    ("onHit chain kept", 'onHit: () => applyHit(t, buildPayload(u, sk))' in eng),
    ("no old reveal su", 'clamp((e.t - k * e.seg) / e.seg, 0, 1)' not in eng),
]
for name, res in checks:
    print(('PASS' if res else 'FAIL'), name)
    if not res: ok = False

sys.exit(0 if ok else 1)
