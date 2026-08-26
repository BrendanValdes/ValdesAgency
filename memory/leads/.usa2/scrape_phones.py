#!/usr/bin/env python3
import subprocess, json, re, os, sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
D=os.path.dirname(__file__)

phone_set=set(x.strip() for x in open(os.path.join(D,'..','.dedup','phones.txt')) if x.strip())
cands=json.load(open(os.path.join(D,'filtered.json')))
targets=[c for c in cands if c.get("website")]

TEL=re.compile(r'tel:\+?1?[\s\-.]?\(?(\d{3})\)?[\s\-.]?(\d{3})[\s\-.]?(\d{4})')
PLAIN=re.compile(r'\(?(\d{3})\)?[\s\-.]?(\d{3})[\s\-.]?(\d{4})')
BAD_AREA={'000','111','555','800','888','877','866','855','844','833','822','900'}  # skip tollfree/fake for "local" preference

def pick_phone(md):
    # 1) tel: hrefs (most reliable)
    tel=[a+b+c for a,b,c in TEL.findall(md)]
    tel=[t for t in tel if t[:3] not in {'000','111','555'}]
    if tel:
        # prefer a non-tollfree tel, else any tel
        local=[t for t in tel if t[:3] not in BAD_AREA]
        return Counter(local or tel).most_common(1)[0][0]
    # 2) plain patterns in text
    plain=[a+b+c for a,b,c in PLAIN.findall(md)]
    plain=[t for t in plain if t[:3] not in {'000','111','555'} and len(set(t))>2]
    local=[t for t in plain if t[:3] not in BAD_AREA]
    pool=local or plain
    if pool: return Counter(pool).most_common(1)[0][0]
    return None

def scrape(c):
    url=c["website"]
    if not url.startswith("http"): url="https://"+url
    try:
        p=subprocess.run(["bdata","scrape",url,"--zone","mcp_unlocker"],
                         capture_output=True,text=True,timeout=75)
        md=p.stdout or ""
    except Exception as e:
        return None
    ph=pick_phone(md)
    if not ph: return None
    c["phone10"]=ph
    return c

results=[]
with ThreadPoolExecutor(max_workers=12) as ex:
    futs={ex.submit(scrape,c):c for c in targets}
    done=0
    for f in as_completed(futs):
        done+=1
        r=f.result()
        if r: results.append(r)
        if done%20==0 or done==len(targets):
            print(f"[{done}/{len(targets)}] phones so far={len(results)}",flush=True)

# phone dedup: vs prior book AND within batch
seen_ph=set(); final=[]; dup_book=0; dup_batch=0
for c in results:
    ph=c["phone10"]
    if ph in phone_set: dup_book+=1; continue
    if ph in seen_ph: dup_batch+=1; continue
    seen_ph.add(ph); final.append(c)

json.dump(final,open(os.path.join(D,'with_phones.json'),'w'),indent=0)
print(f"\nscraped targets={len(targets)}  got_phone={len(results)}")
print(f"phone-dedup dropped: vs_book={dup_book} within_batch={dup_batch}")
print(f"FINAL with unique phone = {len(final)}")
