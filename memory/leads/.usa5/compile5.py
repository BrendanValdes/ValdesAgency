#!/usr/bin/env python3
# POOL USA 5 compile: authoritative qualify/tier via shared qual.py → POOL USA 5.csv.
# Same gap filter + deterministic hooks as .usa4/compile.py, no threshold drift.
import json, re, csv, os, collections, sys
import qual as Q
D = os.path.dirname(os.path.abspath(__file__))
TARGET = int(sys.argv[1]) if len(sys.argv) > 1 else 150

phone_set = set(x.strip() for x in open(f"{D}/../.dedup/phones.txt") if x.strip())
d = json.load(open(f"{D}/enriched5.json"))

seen = set(); rows = []
for c in d:
    row = Q.qualify(c, phone_set, seen)
    if row is not None:
        rows.append(row)

# Tier 1 first, then Tier 2; within each, weakest signal first (lower rating, fewer reviews)
rows.sort(key=lambda x: (x["_tier"], x["_r"], x["_rv"]))
if TARGET:
    rows = rows[:TARGET]
t1 = sum(1 for r in rows if r["_tier"] == 1)
t2 = sum(1 for r in rows if r["_tier"] == 2)
cols = ["business_name","phone","city","metro","owner","website","rating","review_count","primary_pain","hook","confidence"]
with open(f"{D}/../POOL USA 5.csv", "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=cols); w.writeheader()
    for r in rows: w.writerow({k: r[k] for k in cols})
json.dump(rows, open(f"{D}/final_rows5.json", "w"), indent=0)

print(f"QUALIFIED (capped {TARGET}): {len(rows)}  |  Tier1(strong 2-of-3)={t1}  Tier2(fill)={t2}")
print("pain dist:", dict(collections.Counter(r["primary_pain"] for r in rows)))
print("metros:", len(set(r["metro"] for r in rows)))
