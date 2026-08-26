#!/usr/bin/env python3
# Authoritative rebuild: per-business knowledge-block lookup -> real rating, reviews, phone, site, address.
# No reasoning agent per lead; deterministic parallel SERP knowledge lookups.
import subprocess, json, re, os, sys
from concurrent.futures import ThreadPoolExecutor, as_completed
D=os.path.dirname(__file__)

def norm_name(s):
    s=(s or "").lower(); s=re.sub(r'[^a-z0-9 ]','',s)
    s=re.sub(r'\b(llc|inc|co|company|services|service|pools|pool|the|and|of|las|vegas|lv)\b','',s)
    return re.sub(r'\s+',' ',s).strip()

name_set=set(x.strip() for x in open(os.path.join(D,'..','.dedup','names.txt')) if x.strip())
JUNK=re.compile(r'(best|top \d|near me|\d{4}|cost|prices|companies in|list of|reviews of|^pool service$|^pool cleaning$)',re.I)

raw=[json.loads(l) for l in open(os.path.join(D,'candidates.jsonl'))]
# Use snack_pack businesses (clean GBP names). Dedup name vs book + within batch.
seen=set(); enrich=[]
for c in raw:
    if c['src']!='snack': continue
    nm=(c.get('name') or '').strip()
    if not nm or JUNK.search(nm) or len(nm)<3: continue
    nn=norm_name(nm)
    if not nn or nn in name_set or nn in seen: continue
    seen.add(nn)
    enrich.append({"name":nm,"city":c['city'],"metro":c['metro'],"nn":nn})
print("snack businesses to enrich (name-deduped):",len(enrich))

def lookup(c):
    q=f"{c['name']} {c['city']}"
    try:
        p=subprocess.run(["bdata","search",q,"--zone","mcp_unlocker","--json"],
                         capture_output=True,text=True,timeout=90)
        raw=p.stdout; i=raw.find('{')
        if i<0: return None
        d=json.loads(raw[i:])
    except Exception: return None
    k=d.get("knowledge") or {}
    if not isinstance(k,dict) or not k.get("name"): return None
    c["kname"]=k.get("name"); c["rating"]=k.get("rating"); c["reviews"]=k.get("reviews_cnt")
    c["phone"]=k.get("phone"); c["site"]=k.get("site"); c["address"]=k.get("address")
    return c

out=[]
with ThreadPoolExecutor(max_workers=12) as ex:
    futs=[ex.submit(lookup,c) for c in enrich]
    done=0
    for f in as_completed(futs):
        done+=1; r=f.result()
        if r: out.append(r)
        if done%40==0 or done==len(enrich):
            print(f"[{done}/{len(enrich)}] enriched={len(out)}",flush=True)
json.dump(out,open(os.path.join(D,'enriched.json'),'w'),indent=0)
print("ENRICHED (has knowledge block):",len(out))
print("  of those, with phone:",sum(1 for c in out if c.get('phone')))
