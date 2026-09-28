# -*- coding: utf-8 -*-
import io, sys
import esprima

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

# 追加检查：不应再有冷却残留字段引用（blessCd / killReset / sk.cd）
with io.open("js/engine.js", "r", encoding="utf-8") as fh:
    eng = fh.read()
for token in ["blessCd", "killReset", "u.cd[", "cdMul"]:
    if token in eng:
        ok = False
        print("LEFTOVER in engine.js: " + token)

print("RESULT: " + ("PASS" if ok else "FAIL"))
sys.exit(0 if ok else 1)
