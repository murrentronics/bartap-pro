fname = r'c:\Users\thero\BARTENDAZ-PRO\bartap-pro\src\routes\_app\machines.tsx'
with open(fname, 'r', encoding='utf-8') as f:
    lines = f.readlines()

changed = 0
for i, l in enumerate(lines):
    # ScreensTab totalPayout — add expense
    if 'const totalPayout = entries.filter(e => e.type === "payout").reduce' in l:
        lines[i] = l.replace(
            'e.type === "payout"',
            '(e.type === "payout" || e.type === "expense")'
        )
        print(f'Fixed totalPayout at L{i+1}'); changed += 1

    # todayPayouts
    if 'const todayPayouts = entries.filter(e => e.type === "payout"' in l:
        lines[i] = l.replace(
            'e.type === "payout"',
            '(e.type === "payout" || e.type === "expense")'
        )
        print(f'Fixed todayPayouts at L{i+1}'); changed += 1

    # sessionPayouts in ScreensTab (uses barSessionStart filter)
    if 'sessionPayouts' in l and 'barSessionStart' in l and 'e.type === "payout"' in l:
        lines[i] = l.replace(
            'e.type === "payout"',
            '(e.type === "payout" || e.type === "expense")'
        )
        print(f'Fixed sessionPayouts (barSessionStart) at L{i+1}'); changed += 1

    # sessionPayouts in main page (uses floatSession)
    if 'sessionPayouts' in l and 'floatSession' not in l and 'e.type === "payout"' in l and 'barSessionStart' not in l:
        # only the ScreensTab one — skip MachineDetail which is per-machine
        pass

with open(fname, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print(f'Done. {changed} lines changed.')
