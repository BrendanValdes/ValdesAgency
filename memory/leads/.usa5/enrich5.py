#!/usr/bin/env python3
# POOL USA 5 enrich — reuse the .usa4 paid harvest (candidates.jsonl); no re-harvest.
# Parallel Google KNOWLEDGE-BLOCK lookups via the Bright Data CLI. WORKERS bumped to 24
# (main speed win). Two spend-savers vs .usa4:
#   1) skip candidates already looked up for batch 4 (../.usa4/enriched.json) — zero re-pay.
#   2) TRUE early-exit: after each chunk, run the AUTHORITATIVE qualifier (qual.py) over all
#      accumulated records and stop the moment >= TARGET_BUF qualify. No over-enriching.
import subprocess, json, re, os, sys
from concurrent.futures import ThreadPoolExecutor
import qual as Q

D = os.path.dirname(os.path.abspath(__file__))
CANDIDATES = os.path.join(D, '..', '.usa4', 'candidates.jsonl')   # REUSE paid harvest
PRIOR_ENRICHED = os.path.join(D, '..', '.usa4', 'enriched.json')  # skip these (already paid)
NAMES = os.path.join(D, '..', '.dedup', 'names.txt')              # REFRESHED book (incl USA4)
PHONES = os.path.join(D, '..', '.dedup', 'phones.txt')

WORKERS = 24
CHUNK = WORKERS * 6
TARGET_BUF = 155          # stop once this many qualify (buffer over the 150 ship target)
MAX_LOOKUPS = int(sys.argv[1]) if len(sys.argv) > 1 else 1400   # hard spend ceiling

def norm_name(s):
    s = (s or "").lower(); s = re.sub(r'[^a-z0-9 ]', '', s)
    s = re.sub(r'\b(llc|inc|co|company|services|service|pools|pool|the|and|of|las|vegas|lv)\b', '', s)
    return re.sub(r'\s+', ' ', s).strip()

name_set = set(x.strip() for x in open(NAMES) if x.strip())
phone_set = set(x.strip() for x in open(PHONES) if x.strip())
JUNK = re.compile(r'(best|top \d|near me|\bcost\b|prices|companies in|list of|reviews of|cheap|'
    r'^pool service$|^pool cleaning$|^pool maintenance$|updated 20|how much|guide|near you|'
    r'^the \d+|vs\.?\b|recommendations|which |what )', re.I)

def clean_title(t):
    t = re.split(r'[:|\-–—•]', t or "")[0].strip()
    t = re.sub(r'\s*\(.*?\)\s*', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()

def build_candidates():
    raw = [json.loads(l) for l in open(CANDIDATES)]
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
    enrich.sort(key=lambda c: 0 if c['src'] == 'snack' else 1)   # snack first → higher panel hit rate
    return enrich

def lookup(c):
    # --country us is REQUIRED: the mcp_unlocker zone otherwise exits via a non-US IP (gl=PL),
    # and Google then serves no US knowledge panel / US phone. Retry once on a thin/blocked
    # response (only general+input keys) before giving up on the candidate.
    q = f"{c['name']} {c['city']}"
    d = None
    for _attempt in range(2):
        try:
            p = subprocess.run(["bdata", "search", q, "--zone", "mcp_unlocker",
                                "--country", "us", "--json"],
                               capture_output=True, text=True, timeout=120)
            raw = p.stdout; i = raw.find('{')
            if i < 0:
                continue
            cand = json.loads(raw[i:])
        except Exception:
            continue
        if len(cand.keys()) > 2:   # real SERP payload, not a thin/blocked stub
            d = cand; break
        d = cand   # keep the stub in case both attempts are thin
    if d is None:
        return None
    k = d.get("knowledge") or {}
    if not isinstance(k, dict) or not k.get("name"):
        return None
    c["kname"] = k.get("name"); c["rating"] = k.get("rating"); c["reviews"] = k.get("reviews_cnt")
    c["phone"] = k.get("phone"); c["site"] = k.get("site"); c["address"] = k.get("address")
    c["subtitle"] = k.get("subtitle") or ""
    return c

def count_qualified(records):
    """authoritative running count — same qualifier compile5 uses."""
    seen = set(); n = 0
    for c in records:
        if Q.qualify(c, phone_set, seen) is not None:
            n += 1
    return n

def main():
    enrich = build_candidates()
    # skip anything already looked up for batch 4 (name-panel resolved) → no re-spend
    prior = json.load(open(PRIOR_ENRICHED))
    already = set(norm_name(c.get('kname')) for c in prior)
    already |= set(c.get('nn') for c in prior if c.get('nn'))
    pool = [c for c in enrich if c['nn'] not in already]
    print(f"pool: {len(enrich)} name-deduped | {len(enrich)-len(pool)} already-enriched skipped "
          f"| {len(pool)} fresh to enrich (cap {MAX_LOOKUPS})", flush=True)

    out = []; done = 0; with_phone = 0
    seen_names = set()   # re-dedup on resolved knowledge-panel name
    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        for i in range(0, min(len(pool), MAX_LOOKUPS), CHUNK):
            batch = pool[i:i + CHUNK]
            for r in ex.map(lookup, batch):
                done += 1
                if not r:
                    continue
                kn = norm_name(r.get('kname'))
                if not kn or kn in name_set or kn in seen_names:
                    continue   # resolved to a book dup or in-batch dup — drop
                seen_names.add(kn)
                out.append(r)
                if r.get("phone"): with_phone += 1
            q = count_qualified(out)
            print(f"[{done}/{min(len(pool),MAX_LOOKUPS)}] hits={len(out)} with_phone={with_phone} qualified={q}", flush=True)
            if q >= TARGET_BUF:
                print(f"reached TARGET_BUF={TARGET_BUF} qualified at {done} SERP calls — stopping", flush=True)
                break

    json.dump(out, open(os.path.join(D, 'enriched5.json'), 'w'), indent=0)
    print("ENRICHED5 (knowledge block, name-deduped):", len(out))
    print("  with phone:", sum(1 for c in out if c.get('phone')))
    print("  qualified (authoritative):", count_qualified(out))
    print("  SERP calls spent:", done)

if __name__ == '__main__':
    main()
