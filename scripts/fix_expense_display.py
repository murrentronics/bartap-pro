fname = r'c:\Users\thero\BARTENDAZ-PRO\bartap-pro\src\routes\_app\machines.tsx'
with open(fname, 'r', encoding='utf-8') as f:
    lines = f.readlines()

changed = 0

for i, l in enumerate(lines):
    # Fix isPayout in both HistoryMonthAccordion (L862) and AllHistoryTab (L5043)
    stripped = l.strip()
    if stripped == 'const isPayout = e.type === "payout";':
        indent = l[:len(l) - len(l.lstrip())]
        lines[i] = indent + 'const isPayout = e.type === "payout" || e.type === "expense";\n'
        print(f'Fixed isPayout at L{i+1}')
        changed += 1

    # In HistoryMonthAccordion mEntries.map — filter out expense entries
    # The map is: mEntries.map((e) => {  around L859
    if 'mEntries.map((e) => {' in l and i < 1000:
        # Replace mEntries.map with filtered map
        lines[i] = l.replace(
            'mEntries.map((e) => {',
            'mEntries.filter(e => e.type !== "expense").map((e) => {'
        )
        print(f'Filtered expense from mEntries.map at L{i+1}')
        changed += 1

with open(fname, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print(f'Done. {changed} changes.')
