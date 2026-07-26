import sys; sys.stdout.reconfigure(encoding='utf-8')
fname = r'c:\Users\thero\BARTENDAZ-PRO\bartap-pro\src\routes\_app\machines.tsx'
with open(fname, 'r', encoding='utf-8') as f:
    lines = f.readlines()
for i, l in enumerate(lines, 1):
    if 'isPayout' in l and i > 4700 and i < 5200:
        print(f'L{i}: {l.rstrip()[:130]}')
