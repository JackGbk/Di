# -*- coding: utf-8 -*-
import esprima, sys, io
files = ['js/data.js', 'js/engine.js', 'js/ui.js', 'js/shop.js',
         'js/loot.js', 'js/blessing.js', 'js/encounter.js', 'js/main.js']
bad = 0
for f in files:
    try:
        src = io.open(f, encoding='utf-8').read()
        esprima.parseScript(src)
        print('OK  ' + f)
    except Exception as e:
        bad += 1
        print('ERR ' + f + ' -> ' + str(e))
print('DONE bad=%d' % bad)
sys.exit(1 if bad else 0)
