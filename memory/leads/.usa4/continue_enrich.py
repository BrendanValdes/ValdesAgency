#!/usr/bin/env python3
# One-off: use the remaining authorized SERP budget. Enrich the next slice of candidates
# (beyond the 504 already spent) and MERGE into enriched.json. No re-lookup of done work.
import json, os, sys
from concurrent.futures import ThreadPoolExecutor
import importlib.util
D = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("enrich", os.path.join(D, "enrich.py"))
E = importlib.util.module_from_spec(spec)
# guard: enrich.py runs main() only under __main__, safe to exec for its funcs
spec.loader.exec_module(E)

START = int(sys.argv[1]); N = int(sys.argv[2])
enrich = E.build_candidates()
slice_ = enrich[START:START+N]
print(f"continuation: candidates[{START}:{START+len(slice_)}] ({len(slice_)} more calls)", flush=True)

existing = json.load(open(os.path.join(D, "enriched.json")))
have = set(E.norm_name(c.get("kname")) for c in existing)

new = []; done = 0
with ThreadPoolExecutor(max_workers=12) as ex:
    for r in ex.map(E.lookup, slice_):
        done += 1
        if r: new.append(r)
print(f"calls={done} knowledge_hits={len(new)}", flush=True)

for c in new:
    kn = E.norm_name(c.get("kname"))
    if not kn or kn in E.name_set or kn in have:
        continue
    have.add(kn); existing.append(c)

json.dump(existing, open(os.path.join(D, "enriched.json"), "w"), indent=0)
print("merged enriched.json total:", len(existing), "| with phone:", sum(1 for c in existing if c.get("phone")))
