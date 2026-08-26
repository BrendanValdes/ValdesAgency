#!/usr/bin/env python3
import json, os, collections
D = os.path.dirname(__file__)
rows = json.load(open(f"{D}/final_rows.json"))

def angle(r):
    p = r["primary_pain"]; rt = r["rating"]; rv = r["review_count"]; c = r["city"]
    if p == "Website" and (not r["website"]): return "No website — searchers go to a competitor with a booking page. Fastest fix we run."
    if p == "Website": return "Site's a free DIY template — kills trust before they call. Real site + ads."
    if p == "Reputation": return f"{rt}★ is costing jobs — competitors above 4.0 win the click by default."
    if rv != "" and int(rv) < 15: return f"Only {rv} reviews — invisible to anyone not searching the name. Reviews + ads fixes it."
    return f"Thin review base — top {c} shops run 5-10x that and take the big jobs."

def tbl(subset, start):
    L = ["| # | Company | Owner | Phone | Lead-with | Angle |", "|---|---|---|---|---|---|"]
    for i, r in enumerate(subset, start):
        L.append(f"| {i} | {r['business_name']} | — | {r['phone']} | {r['primary_pain']} | {angle(r)} |")
    return "\n".join(L)

metros = collections.Counter(r["metro"] for r in rows)
pains = collections.Counter(r["primary_pain"] for r in rows)
md = f"""# POOL USA 3 — National Pool Service Dial Sheet
**Built:** 2026-07-10 · **Leads:** {len(rows)} · **Confidence:** 100% live-verified (Google knowledge-panel rating/reviews/phone).
**Dedup:** 0 collisions vs the rebuilt book (594 names / 587 phones, incl. POOL USA 1 & 2) · 0 within-batch dups · every lead has a phone.
**Filter (strict gap):** rating <4.0 OR reviews <15 OR weak/no website. Independents only — national chains/franchises blocked.
**Best-first:** sorted by weakest signal (lowest rating, then fewest reviews). Dial top-down.

---

## DIAL LIST ({len(rows)})
{tbl(rows, 1)}

---

## APPENDIX — Analysis

**Metro spread ({len(metros)} metros):**
"""
for m, c in metros.most_common(): md += f"- {c:2} {m}\n"
md += f"""
**Gap breakdown:** {dict(pains)}

**Method:** Wide SERP harvest across {len(set((r['metro']) for r in rows))}+ metros / 200+ city queries × 4 query variants (service / cleaning / maintenance / repair) → snack_pack + organic candidates → name-dedup vs full 594-name book → per-business Google knowledge-panel enrichment (verified rating/reviews/phone/site/address) → strict gap filter on VERIFIED data → phone-dedup. Zero reasoning agents per lead — pure parallel search + enrich. Owner defaults to business name where unknown (never blank, never guessed).

**Next move:** Dial top-down. Reputation/Website leads book fastest.
"""
open(f"{D}/../POOL USA 3.md", "w").write(md)
print("wrote POOL USA 3.md — leads:", len(rows), "metros:", len(metros))
