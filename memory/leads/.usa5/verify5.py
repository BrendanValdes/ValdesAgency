#!/usr/bin/env python3
# Independent verify of POOL USA 5.csv: format + phone-present + ZERO name/phone collision
# vs EVERY other .csv/.md in memory/leads/. Belt-and-suspenders on the in-pipeline dedup.
import csv, re, os, glob, sys
D = os.path.dirname(os.path.abspath(__file__))
LEADS = os.path.join(D, '..')
OUT = os.path.join(LEADS, 'POOL USA 5.csv')
REF = os.path.join(LEADS, 'POOL USA 1.csv')

def norm_name(s):
    s = (s or "").lower(); s = re.sub(r'[^a-z0-9 ]', '', s)
    s = re.sub(r'\b(llc|inc|co|company|services|service|pools|pool|the|and|of|las|vegas|lv)\b', '', s)
    return re.sub(r'\s+', ' ', s).strip()
def norm_phone(s):
    d = re.sub(r'\D', '', s or ''); d = d[-10:] if len(d) >= 10 else ''
    return d if len(d) == 10 and d[0] in '23456789' and d[3] in '23456789' else None
PHONE_RE = re.compile(r'(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}')
NAME_HEADERS = {'business_name','company_name','business name','company name','company'}

# --- load batch 5 ---
rows = list(csv.DictReader(open(OUT, encoding='utf-8')))
b5_header = open(OUT, encoding='utf-8').readline().strip()
ref_header = open(REF, encoding='utf-8').readline().strip()
b5_names = {norm_name(r['business_name']) for r in rows}
b5_phones = {norm_phone(r['phone']) for r in rows}

errs = []
if b5_header != ref_header:
    errs.append(f"HEADER MISMATCH:\n  b5={b5_header}\n ref={ref_header}")
if len(rows) != 150:
    errs.append(f"ROW COUNT = {len(rows)} (expected 150)")
noph = [r['business_name'] for r in rows if not norm_phone(r['phone'])]
if noph:
    errs.append(f"{len(noph)} rows missing/invalid phone: {noph[:5]}")
blank_owner = [r['business_name'] for r in rows if not (r['owner'] or '').strip()]
if blank_owner:
    errs.append(f"{len(blank_owner)} rows with blank owner")

# --- build prior universe from every OTHER file ---
prior_names, prior_phones = set(), set()
files = sorted(glob.glob(os.path.join(LEADS, '*.csv')) + glob.glob(os.path.join(LEADS, '*.md')))
SELF = {os.path.abspath(OUT), os.path.abspath(os.path.join(LEADS, 'POOL USA 5.md'))}
scanned = 0
for path in files:
    if os.path.abspath(path) in SELF:   # skip batch-5's own outputs (csv AND md)
        continue
    scanned += 1
    raw = open(path, encoding='utf-8', errors='replace').read()
    for m in PHONE_RE.findall(raw):
        p = norm_phone(m)
        if p: prior_phones.add(p)
    if path.endswith('.csv'):
        rr = list(csv.reader(raw.splitlines()))
        if not rr: continue
        hdr = [h.strip().lower() for h in rr[0]]
        col = next((i for i,h in enumerate(hdr) if h in NAME_HEADERS), None)
        if col is not None:
            for r in rr[1:]:
                if col < len(r):
                    nn = norm_name(r[col])
                    if nn: prior_names.add(nn)
    else:
        for line in raw.splitlines():
            if not line.strip().startswith('|'): continue
            cells = [c.strip() for c in line.strip().strip('|').split('|')]
            if len(cells) >= 2 and re.fullmatch(r'\d+', cells[0]):
                nn = norm_name(cells[1])
                if nn: prior_names.add(nn)

name_hits = sorted(b5_names & prior_names)
phone_hits = sorted(p for p in (b5_phones & prior_phones) if p)
if name_hits:
    errs.append(f"NAME COLLISIONS ({len(name_hits)}): {name_hits[:10]}")
if phone_hits:
    errs.append(f"PHONE COLLISIONS ({len(phone_hits)}): {phone_hits[:10]}")

print(f"POOL USA 5.csv — {len(rows)} leads")
print(f"header matches POOL USA 1.csv: {b5_header == ref_header}")
print(f"all rows phoned: {not noph} | all owners populated: {not blank_owner}")
print(f"dedup checked against {scanned} other files ({len(prior_names)} prior names / {len(prior_phones)} prior phones)")
print(f"name collisions: {len(name_hits)} | phone collisions: {len(phone_hits)}")
if errs:
    print("\n=== FAIL ==="); [print(" -", e) for e in errs]; sys.exit(1)
print(f"\n=== PASS === {len(rows)} leads · 0 name collisions · 0 phone collisions vs {scanned} prior files")
