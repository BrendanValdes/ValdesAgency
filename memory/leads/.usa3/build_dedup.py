#!/usr/bin/env python3
# Rebuild the dedup book from EVERY .csv and .md in memory/leads/ (incl POOL USA 1/2).
# Strongest dedup key = phone (last-10). Names normalized like the pipeline.
import csv, re, os, glob, json, sys

LEADS = os.path.join(os.path.dirname(__file__), "..")
DEDUP = os.path.join(LEADS, ".dedup")
os.makedirs(DEDUP, exist_ok=True)

def norm_name(s):
    s = (s or "").lower()
    s = re.sub(r'[^a-z0-9 ]', '', s)
    s = re.sub(r'\b(llc|inc|co|company|services|service|pools|pool|the|and|of|las|vegas|lv)\b', '', s)
    return re.sub(r'\s+', ' ', s).strip()

def norm_phone(s):
    d = re.sub(r'\D', '', s or '')
    d = d[-10:] if len(d) >= 10 else ''
    # valid US: 10 digits, area code + exchange first digits 2-9
    if len(d) == 10 and d[0] in '23456789' and d[3] in '23456789':
        return d
    return None

PHONE_RE = re.compile(r'(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}')
# markdown table row -> cells
def md_cells(line):
    if not line.strip().startswith('|'):
        return None
    return [c.strip() for c in line.strip().strip('|').split('|')]

NAME_HEADERS = {'business_name', 'company_name', 'business name', 'company name', 'company'}

names = set()
phones = set()
files_seen = 0

for path in sorted(glob.glob(os.path.join(LEADS, "*.csv")) + glob.glob(os.path.join(LEADS, "*.md"))):
    files_seen += 1
    raw = open(path, encoding='utf-8', errors='replace').read()
    # phones from anywhere in the file
    for m in PHONE_RE.findall(raw):
        p = norm_phone(m)
        if p:
            phones.add(p)
    if path.endswith('.csv'):
        rows = list(csv.reader(raw.splitlines()))
        if not rows:
            continue
        header = [h.strip().lower() for h in rows[0]]
        # find the business-name column
        col = None
        for i, h in enumerate(header):
            if h in NAME_HEADERS:
                col = i
                break
        for r in rows[1:]:
            if col is not None and col < len(r):
                nn = norm_name(r[col])
                if nn:
                    names.add(nn)
    else:  # .md — pull company names from dial-sheet tables (| # | Company | ... |)
        for line in raw.splitlines():
            cells = md_cells(line)
            if not cells or len(cells) < 2:
                continue
            # header/separator rows -> skip
            if cells[0].lower() in ('#', '') or set(cells[1]) <= set('-: '):
                continue
            if cells[1].lower() in ('company', 'business', 'name'):
                continue
            # only treat as a name row if col0 is a rank number
            if re.fullmatch(r'\d+', cells[0]):
                nn = norm_name(cells[1])
                if nn:
                    names.add(nn)

names.discard('')
phones.discard(None)
with open(os.path.join(DEDUP, 'names.txt'), 'w') as fh:
    fh.write('\n'.join(sorted(names)) + '\n')
with open(os.path.join(DEDUP, 'phones.txt'), 'w') as fh:
    fh.write('\n'.join(sorted(phones)) + '\n')

print(f"files scanned: {files_seen}")
print(f"DEDUP BOOK: names={len(names)}  phones={len(phones)}")
