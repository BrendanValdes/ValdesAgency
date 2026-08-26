#!/usr/bin/env python3
import json,re,csv,os
D=os.path.dirname(__file__)
FREE=re.compile(r'(wixsite|\.wix\.com|weebly|b12sites|godaddysites|business\.site|square\.site|squarespace\.com|wordpress\.com|blogspot|webnode|jimdo|yolasite)',re.I)
def norm_phone(s):
    d=re.sub(r'\D','',s or ''); return d[-10:] if len(d)>=10 else None
def disp(p): return f"({p[:3]}) {p[3:6]}-{p[6:]}"
def clean_site(s):
    if not s: return ""
    return re.sub(r'^https?://','',s).rstrip('/')
def freebuilder(s):
    m=FREE.search(s or ""); return m.group(1) if m else None

phone_set=set(x.strip() for x in open(f"{D}/../.dedup/phones.txt") if x.strip())
d=json.load(open(f"{D}/enriched.json"))

seen=set(); rows=[]
for c in d:
    ph=norm_phone(c.get('phone'))
    if not ph or ph in phone_set or ph in seen: continue
    r=c['rating'] if isinstance(c['rating'],(int,float)) else None
    rv=c['reviews'] if isinstance(c['reviews'],int) else None
    site=c.get('site') or ""
    weak = (not site) or bool(FREE.search(site))
    # MED gap: rating<4.5 OR reviews<30 OR weak/no site
    gap_rating = r is not None and r<4.5
    gap_reviews = rv is not None and rv<30
    if not (gap_rating or gap_reviews or weak): continue
    seen.add(ph)
    # tier by strict vs med
    strict = (r is not None and r<4.0) or (rv is not None and rv<15) or weak
    tier = 1 if strict else 2
    # city from address
    addr=c.get('address') or ""
    m=re.search(r',\s*([A-Za-z .]+),\s*[A-Z]{2}\b',addr)
    city = m.group(1).strip() if m else re.sub(r'\s+[A-Z]{2}$','',c['city']).strip()
    # dominant pain + hook (built from real gap columns; deterministic, no per-row agent)
    fb=freebuilder(site)
    nm=c.get('kname') or c['name']
    if r is not None and r<4.0:
        pain="Reputation"
        hook=f"{nm} sits at {r}★ across {rv} reviews — under 4.0 means every competitor above them wins the click by default. Reputation repair is the fast money."
    elif not site:
        pain="Website"
        hook=f"{nm} has no real website — every Google searcher gets handed to a competitor with a booking page. Fastest fix we do."
    elif fb:
        pain="Website"
        hook=f"{nm}'s site is on a free {fb} template — reads DIY and kills trust before they call. Real site plus ads is the play."
    elif rv is not None and rv<15:
        pain="Reviews"
        hook=f"Only {rv} Google reviews on {nm} — invisible to anyone not already searching the name. Review engine plus ads changes that fast."
    elif rv is not None and rv<30:
        pain="Reviews"
        hook=f"{nm} has {rv} reviews at {r}★ — a real start, but the top {city} shops run 5-10x that and take the premium jobs. Ads plus reviews closes the gap."
    else:  # rating 4.0-4.4
        pain="Reputation"
        hook=f"{nm} is at {r}★ — decent, not top-tier. In {city} the 4.8-4.9 shops win the high-ticket jobs. Tighten reputation and run ads."
    rows.append({"business_name":nm,"phone":disp(ph),"city":city,"metro":c['metro'],
        "owner":"unknown","website":clean_site(site),
        "rating":r if r is not None else "","review_count":rv if rv is not None else "",
        "primary_pain":pain,"hook":hook,"confidence":"verified",
        "_tier":tier,"_r":r if r is not None else 9,"_rv":rv if rv is not None else 99999})

# best-first: tier1 first, then by weakest signal (lower rating, fewer reviews)
rows.sort(key=lambda x:(x["_tier"], x["_r"], x["_rv"]))
cols=["business_name","phone","city","metro","owner","website","rating","review_count","primary_pain","hook","confidence"]
with open(f"{D}/../POOL USA 2.csv","w",newline="") as fh:
    w=csv.DictWriter(fh,fieldnames=cols); w.writeheader()
    for r in rows: w.writerow({k:r[k] for k in cols})

import collections
print("FINAL POOL USA 2 leads:",len(rows))
print("tier1 (strict gap):",sum(1 for r in rows if r["_tier"]==1),"| tier2 (med gap):",sum(1 for r in rows if r["_tier"]==2))
print("pain dist:",dict(collections.Counter(r["primary_pain"] for r in rows)))
print("metros:",len(set(r["metro"] for r in rows)))
json.dump(rows,open(f"{D}/final_rows.json","w"),indent=0)
