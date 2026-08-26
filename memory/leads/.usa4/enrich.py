#!/usr/bin/env python3
# Enrich harvested candidates via the Google KNOWLEDGE BLOCK through the Bright Data CLI
# (verified rating/reviews/phone/site/address). This restores the USA 2/3 path — the prior
# Firecrawl-search version stalled (snippets rarely carry the phone; hard phone req starved it).
# Deterministic parallel SERP lookups, no reasoning agents, no per-site fetch.
#
# COST CAP (this batch, per user): stop after MAX_LOOKUPS Bright Data SERP calls. Ship whatever
# qualifies downstream — no attempt to force 150. Snack-first ordering maximizes yield per call.
import subprocess, json, re, os, sys
from concurrent.futures import ThreadPoolExecutor
D = os.path.dirname(__file__)

MAX_LOOKUPS = int(sys.argv[1]) if len(sys.argv) > 1 else 600   # hard ceiling on SERP calls (spend)
PHONE_SURPLUS_STOP = 400   # early-exit once this many phone-bearing records collected (plenty for TARGET 150)
WORKERS = 12

def norm_name(s):
    s = (s or "").lower(); s = re.sub(r'[^a-z0-9 ]', '', s)
    s = re.sub(r'\b(llc|inc|co|company|services|service|pools|pool|the|and|of|las|vegas|lv)\b', '', s)
    return re.sub(r'\s+', ' ', s).strip()

name_set = set(x.strip() for x in open(os.path.join(D, '..', '.dedup', 'names.txt')) if x.strip())
JUNK = re.compile(r'(best|top \d|near me|\bcost\b|prices|companies in|list of|reviews of|cheap|'
    r'^pool service$|^pool cleaning$|^pool maintenance$|updated 20|how much|guide|near you|'
    r'^the \d+|vs\.?\b|recommendations|which |what )', re.I)

def clean_title(t):
    t = re.split(r'[:|\-–—•]', t or "")[0].strip()
    t = re.sub(r'\s*\(.*?\)\s*', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()

def build_candidates():
    """candidate prep + name-dedup vs the book; snack-first (Google-verified panels → higher
    knowledge-block/phone hit rate per call, which matters under a call budget)."""
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
    enrich.sort(key=lambda c: 0 if c['src'] == 'snack' else 1)   # snack first, stable → metro spread
    return enrich

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

def main():
    enrich = build_candidates()
    pool = enrich[:MAX_LOOKUPS]   # hard call cap — never look up more than this
    print(f"candidates available (name-deduped): {len(enrich)}  |  enriching first {len(pool)} (cap {MAX_LOOKUPS})", flush=True)
    out = []; done = 0; with_phone = 0
    CHUNK = WORKERS * 6
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for i in range(0, len(pool), CHUNK):
            batch = pool[i:i + CHUNK]
            for r in ex.map(lookup, batch):
                done += 1
                if r:
                    out.append(r)
                    if r.get("phone"): with_phone += 1
            print(f"[{done}/{len(pool)}] knowledge_hits={len(out)} with_phone={with_phone}", flush=True)
            if with_phone >= PHONE_SURPLUS_STOP:
                print(f"reached PHONE_SURPLUS_STOP={PHONE_SURPLUS_STOP} at {done} calls, stopping", flush=True)
                break

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
    print("  with phone:", sum(1 for c in dedup if c.get('phone')))
    print("  with rating:", sum(1 for c in dedup if c.get('rating') is not None))
    print("  with reviews:", sum(1 for c in dedup if c.get('reviews') is not None))
    print("  SERP calls spent:", done)

if __name__ == '__main__':
    main()
