#!/usr/bin/env python3
# Enrich snack + organic candidates via the Google knowledge block (verified
# rating/reviews/phone/site/address). Deterministic parallel SERP lookups — no agents.
import subprocess, json, re, os, sys
from concurrent.futures import ThreadPoolExecutor, as_completed
D = os.path.dirname(__file__)

def norm_name(s):
    s = (s or "").lower(); s = re.sub(r'[^a-z0-9 ]', '', s)
    s = re.sub(r'\b(llc|inc|co|company|services|service|pools|pool|the|and|of|las|vegas|lv)\b', '', s)
    return re.sub(r'\s+', ' ', s).strip()

name_set = set(x.strip() for x in open(os.path.join(D, '..', '.dedup', 'names.txt')) if x.strip())
JUNK = re.compile(r'(best|top \d|near me|\bcost\b|prices|companies in|list of|reviews of|cheap|'
    r'^pool service$|^pool cleaning$|^pool maintenance$|updated 20|how much|guide|near you|'
    r'^the \d+|vs\.?\b|recommendations|which |what )', re.I)

def clean_title(t):
    # organic title -> best-guess business name = text before first delimiter
    t = re.split(r'[:|\-–—•]', t or "")[0].strip()
    t = re.sub(r'\s*\(.*?\)\s*', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()

raw = [json.loads(l) for l in open(os.path.join(D, 'candidates.jsonl'))]
seen = set(); enrich = []
for c in raw:
    nm = (c.get('name') or '').strip()
    if c['src'] == 'organic':
        nm = clean_title(nm)
    if not nm or JUNK.search(nm) or len(nm) < 3 or len(nm) > 55:
        continue
    nn = norm_name(nm)
    if not nn or len(nn) < 2 or nn in name_set or nn in seen:
        continue
    seen.add(nn)
    enrich.append({"name": nm, "city": c['city'], "metro": c['metro'], "nn": nn, "src": c['src']})
print("candidates to enrich (name-deduped):", len(enrich))

def lookup(c):
    q = f"{c['name']} {c['city']}"
    try:
        p = subprocess.run(["bdata", "search", q, "--zone", "mcp_unlocker", "--json"],
                           capture_output=True, text=True, timeout=120)
        raw = p.stdout; i = raw.find('{')
        if i < 0: return None
        d = json.loads(raw[i:])
    except Exception:
        return None
    k = d.get("knowledge") or {}
    if not isinstance(k, dict) or not k.get("name"):
        return None
    c["kname"] = k.get("name"); c["rating"] = k.get("rating"); c["reviews"] = k.get("reviews_cnt")
    c["phone"] = k.get("phone"); c["site"] = k.get("site"); c["address"] = k.get("address")
    c["subtitle"] = k.get("subtitle") or ""
    return c

out = []
with ThreadPoolExecutor(max_workers=12) as ex:
    futs = [ex.submit(lookup, c) for c in enrich]
    done = 0
    for f in as_completed(futs):
        done += 1; r = f.result()
        if r: out.append(r)
        if done % 50 == 0 or done == len(enrich):
            print(f"[{done}/{len(enrich)}] enriched={len(out)}", flush=True)

# re-dedup on the resolved knowledge-panel name (organic guesses can resolve to same biz)
seen2 = set(); dedup = []
for c in out:
    kn = norm_name(c.get('kname'))
    if not kn or kn in name_set or kn in seen2:
        continue
    seen2.add(kn)
    dedup.append(c)

json.dump(dedup, open(os.path.join(D, 'enriched.json'), 'w'), indent=0)
print("ENRICHED (knowledge block, name-deduped):", len(dedup))
print("  of those, with phone:", sum(1 for c in dedup if c.get('phone')))
