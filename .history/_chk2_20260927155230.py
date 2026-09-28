# -*- coding: utf-8 -*-
import io, sys, glob
import esprima
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ok = True
for f in sorted(glob.glob('js/*.js')):
    src = io.open(f, encoding='utf-8').read()
    try:
        esprima.parseScript(src)
        print('OK  ', f)
    except Exception as e:
        ok = False
        print('FAIL', f, '->', e)
print('ALL OK' if ok else 'HAS ERRORS')
