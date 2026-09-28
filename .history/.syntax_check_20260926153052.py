import esprima, glob, sys

bad = 0
for f in sorted(glob.glob('js/*.js')):
    s = open(f, encoding='utf-8').read()
    try:
        esprima.parseScript(s)
        print('OK  ', f)
    except Exception as e:
        bad = 1
        print('FAIL', f, e)
sys.exit(bad)
