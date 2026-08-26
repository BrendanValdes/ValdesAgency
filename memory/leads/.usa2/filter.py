#!/usr/bin/env python3
import json, re, os
D=os.path.dirname(__file__)
def norm_name(s):
    s=(s or "").lower()
    s=re.sub(r'[^a-z0-9 ]','',s)
    s=re.sub(r'\b(llc|inc|co|company|services|service|pools|pool|the|and|of|las|vegas|lv)\b','',s)
    s=re.sub(r'\s+',' ',s).strip()
    return s
def norm_phone(s):
    d=re.sub(r'\D','',s or ''); return d[-10:] if len(d)>=10 else None

name_set=set(x.strip() for x in open(os.path.join(D,'..','.dedup','names.txt')) if x.strip())
FREE=re.compile(r'(wixsite|\.wix\.com|weebly|b12sites|godaddysites|business\.site|square\.site|'
    r'squarespace\.com|wordpress\.com|blogspot|webnode|jimdo|weebly|yolasite|godaddy)',re.I)
JUNKNAME=re.compile(r'(best|top \d|near me|\d{4}|cost|prices|companies in|list of|reviews of)',re.I)

cands=[json.loads(l) for l in open(os.path.join(D,'candidates.jsonl'))]
seen=set(); kept=[]; drop_dup=0; drop_nogap=0; drop_junk=0
gapcount={'rating':0,'reviews':0,'web':0}
for c in cands:
    nm=c.get("name") or ""
    if JUNKNAME.search(nm) or len(nm)<3: drop_junk+=1; continue
    nn=norm_name(nm)
    if not nn: drop_junk+=1; continue
    if nn in name_set: drop_dup+=1; continue          # dedup vs prior book (name)
    if nn in seen: drop_dup+=1; continue               # within-batch dedup
    web=c.get("website") or ""
    r=c.get("rating"); rv=c.get("reviews")
    try: r=float(r) if r not in (None,"") else None
    except: r=None
    try: rv=int(rv) if rv not in (None,"") else None
    except: rv=None
    gaps=[]
    if r is not None and r<4.0: gaps.append("rating")
    if rv is not None and rv<15: gaps.append("reviews")
    if (not web) or FREE.search(web): gaps.append("web")
    if not gaps: drop_nogap+=1; continue
    for g in gaps: gapcount[g]+=1
    seen.add(nn)
    c["nn"]=nn; c["rating"]=r; c["reviews"]=rv; c["gaps"]=gaps
    kept.append(c)

# order: prefer richer signal (rating gap + reviews known) then snack_pack
def score(c):
    s=0
    if "rating" in c["gaps"]: s+=3
    if "reviews" in c["gaps"]: s+=2
    if c["src"]=="snack": s+=1
    if c["website"]: s+=1
    return -s
kept.sort(key=score)
json.dump(kept,open(os.path.join(D,'filtered.json'),'w'),indent=0)
print(f"raw={len(cands)} kept={len(kept)}")
print(f"dropped: dup(name)={drop_dup} no_gap={drop_nogap} junk={drop_junk}")
print("gap breakdown (a lead can have >1):",gapcount)
print("with website:",sum(1 for c in kept if c['website']))
