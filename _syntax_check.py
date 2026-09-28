# -*- coding: utf-8 -*-
"""用 esprima 解析 js/*.js，报告语法错误（本机无 node，用 Python 版 ES 解析器代替）。"""
import glob
import sys
import esprima

bad = 0
for f in sorted(glob.glob('js/*.js')):
    src = open(f, encoding='utf-8').read()
    try:
        esprima.parseScript(src)
        print('OK   ' + f)
    except Exception as e:
        bad += 1
        print('FAIL ' + f + ' -> ' + str(e))
sys.exit(1 if bad else 0)
