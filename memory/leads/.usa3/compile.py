#!/usr/bin/env python3
import json, re, csv, os, collections, sys
D = os.path.dirname(__file__)
TARGET = int(sys.argv[1]) if len(sys.argv) > 1 else 150

FREE = re.compile(r'(wixsite|\.wix\.com|weebly|b12sites|godaddysites|business\.site|square\.site|'
    r'squarespace\.com|wordpress\.com|blogspot|webnode|jimdo|yolasite)', re.I)
JUNKSITE = re.compile(r'(google\.com|bing\.com|/maps|yelp\.|facebook\.|instagram\.|linktr)', re.I)
# national chains / franchises — independents only
CHAIN = re.compile(r'\b(leslie|pinch a penny|poolwerx|asp\b|america.?s swimming pool|'
    r'aqua ?tots|pool ?corp|superpool|blue haven|anthony ?& ?sylvan|premier pools ?& ?spas|'
    r'california pools|shasta pools|presidential pools)\b', re.I)

def norm_phone(s):
    d = re.sub(r'\D', '', s or ''); return d[-10:] if len(d) >= 10 else None
def disp(p): return f"({p[:3]}) {p[3:6]}-{p[6:]}"
def clean_site(s):
    if not s: return ""
    if JUNKSITE.search(s): return ""
    return re.sub(r'^https?://', '', s).rstrip('/')
def freebuilder(s):
    m = FREE.search(s or ""); return m.group(1) if m else None

phone_set = set(x.strip() for x in open(f"{D}/../.dedup/phones.txt") if x.strip())
d = json.load(open(f"{D}/enriched.json"))

seen = set(); rows = []; drop_chain = 0; drop_nonpool = 0; drop_nogap = 0; drop_phone = 0
for c in d:
    nm = (c.get('kname') or c.get('name') or "").strip()
    if not nm or CHAIN.search(nm):
        drop_chain += 1; continue
    sub = (c.get('subtitle') or "").lower()
    # pool-type guard: if a subtitle exists it must read pool/spa; empty subtitle allowed
    if sub and not re.search(r'(pool|spa|swim)', sub):
        drop_nonpool += 1; continue
    ph = norm_phone(c.get('phone'))
    if not ph or ph in phone_set or ph in seen:
        drop_phone += 1; continue
    r = c['rating'] if isinstance(c.get('rating'), (int, float)) else None
    rv = c['reviews'] if isinstance(c.get('reviews'), int) else None
    raw_site = c.get('site') or ""
    site = "" if JUNKSITE.search(raw_site) else raw_site
    weak = (not site) or bool(FREE.search(site))
    # STRICT gap: rating<4.0 OR reviews<15 OR weak/no site
    gap_rating = r is not None and r < 4.0
    gap_reviews = rv is not None and rv < 15
    if not (gap_rating or gap_reviews or weak):
        drop_nogap += 1; continue
    seen.add(ph)
    addr = c.get('address') or ""
    m = re.search(r',\s*([A-Za-z .]+),\s*[A-Z]{2}\b', addr)
    city = m.group(1).strip() if m else re.sub(r'\s+[A-Z]{2}$', '', c['city']).strip()
    fb = freebuilder(site)
    if gap_rating:
        pain = "Reputation"
        hook = f"{nm} sits at {r}★ across {rv} reviews — under 4.0 means every competitor above them wins the click by default. Reputation repair is the fast money."
    elif not site:
        pain = "Website"
        hook = f"{nm} has no real website — every Google searcher gets handed to a competitor with a booking page. Fastest fix we do."
    elif fb:
        pain = "Website"
        hook = f"{nm}'s site is on a free {fb} template — reads DIY and kills trust before they call. Real site plus ads is the play."
    elif gap_reviews:
        pain = "Reviews"
        hook = f"Only {rv} Google reviews on {nm} — invisible to anyone not already searching the name. Review engine plus ads changes that fast."
    else:
        pain = "Reviews"
        hook = f"{nm} shows a thin review base — the top {city} shops run 5-10x that and take the premium jobs. Ads plus reviews closes the gap."
    rows.append({"business_name": nm, "phone": disp(ph), "city": city, "metro": c['metro'],
        "owner": nm,  # owner fallback: business_name when unknown (never blank/guessed)
        "website": clean_site(site),
        "rating": r if r is not None else "", "review_count": rv if rv is not None else "",
        "primary_pain": pain, "hook": hook, "confidence": "verified",
        "_r": r if r is not None else 9, "_rv": rv if rv is not None else 99999})

# best-first: weakest signal first (lower rating, fewer reviews)
rows.sort(key=lambda x: (x["_r"], x["_rv"]))
if TARGET:
    rows = rows[:TARGET]
cols = ["business_name","phone","city","metro","owner","website","rating","review_count","primary_pain","hook","confidence"]
with open(f"{D}/../POOL USA 3.csv", "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=cols); w.writeheader()
    for r in rows: w.writerow({k: r[k] for k in cols})
json.dump(rows, open(f"{D}/final_rows.json", "w"), indent=0)

print(f"QUALIFIED (capped {TARGET}): {len(rows)}")
print(f"dropped: chain={drop_chain} nonpool={drop_nonpool} phone(dup/none)={drop_phone} no_gap={drop_nogap}")
print("pain dist:", dict(collections.Counter(r["primary_pain"] for r in rows)))
print("metros:", len(set(r["metro"] for r in rows)))
