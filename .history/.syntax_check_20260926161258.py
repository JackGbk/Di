# -*- coding: utf-8 -*-
"""JS 语法检查（esprima）+ CSS 括号平衡检查"""
import io, sys, json

try:
    import esprima
except ImportError:
    print("NO_ESPRIMA")
    sys.exit(2)

js_files = ["js/data.js", "js/engine.js", "js/ui.js", "js/shop.js",
            "js/loot.js", "js/blessing.js", "js/encounter.js", "js/main.js"]
ok = True
for f in js_files:
    try:
        with io.open(f, "r", encoding="utf-8") as fh:
            src = fh.read()
        esprima.parseScript(src)
        print("JS OK  : " + f)
    except Exception as e:
        ok = False
        print("JS FAIL: " + f + " -> " + str(e))

try:
    with io.open("css/style.css", "r", encoding="utf-8") as fh:
        css = fh.read()
    bal = css.count("{") - css.count("}")
    if bal == 0:
        print("CSS OK : css/style.css (braces balanced)")
    else:
        ok = False
        print("CSS FAIL: css/style.css brace imbalance = %d" % bal)
except Exception as e:
    ok = False
    print("CSS FAIL: " + str(e))

print("RESULT: " + ("PASS" if ok else "FAIL"))
sys.exit(0 if ok else 1)
