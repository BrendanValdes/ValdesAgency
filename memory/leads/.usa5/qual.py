#!/usr/bin/env python3
# Shared qualifier for POOL USA 5 — single source of truth for the gap filter + hooks.
# Extracted verbatim from .usa4/compile.py so enrich5.py (running count / early-exit)
# and compile5.py (authoritative output) can never drift on thresholds.
import re

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
def num(x):
    if isinstance(x, (int, float)): return x
    if isinstance(x, str):
        m = re.search(r'\d[\d,\.]*', x)
        if m:
            try: return float(m.group(0).replace(',', ''))
            except ValueError: return None
    return None


def qualify(c, phone_set, seen):
    """Return a row dict (with _tier/_strong/_r/_rv sort keys) if the enriched record
    qualifies, else None. Mutates `seen` (in-batch phone dedup) only on acceptance.
    phone_set = the .dedup/phones.txt book (last-10 strings)."""
    nm = (c.get('kname') or c.get('name') or "").strip()
    if not nm or CHAIN.search(nm):
        return None
    sub = (c.get('subtitle') or "").lower()
    # pool-type guard: if a subtitle exists it must read pool/spa/swim; empty subtitle allowed
    if sub and not re.search(r'(pool|spa|swim)', sub):
        return None
    ph = norm_phone(c.get('phone'))
    if not ph or ph in phone_set or ph in seen:
        return None
    r = num(c.get('rating')); rv = num(c.get('reviews'))
    rv = int(rv) if rv is not None else None
    raw_site = c.get('site') or ""
    site = "" if JUNKSITE.search(raw_site) else raw_site
    weak = (not site) or bool(FREE.search(site))
    # HARD EXCLUSION (both tiers): 4.5+ rating AND 50+ reviews = healthy, not a buyer
    if r is not None and rv is not None and r >= 4.5 and rv >= 50:
        return None
    # strong signals (Tier 1 test): tighter thresholds
    s_rating = r is not None and r < 3.8
    s_reviews = rv is not None and rv < 10
    s_web = weak
    strong = int(s_rating) + int(s_reviews) + int(s_web)
    # loose single-signal gap (Tier 2 test)
    loose = (r is not None and r < 4.0) or (rv is not None and rv < 15) or weak
    if strong >= 2:
        tier = 1
    elif loose:
        tier = 2
    else:
        return None
    seen.add(ph)
    addr = c.get('address') or ""
    m = re.search(r',\s*([A-Za-z .]+),\s*[A-Z]{2}\b', addr)
    city = m.group(1).strip() if m else re.sub(r'\s+[A-Z]{2}$', '', c['city']).strip()
    fb = freebuilder(site)
    # lead with the strongest pain: reputation > website > reviews
    if r is not None and r < 4.0:
        pain = "Reputation"
        hook = f"{nm} sits at {r}★ across {rv if rv is not None else '—'} reviews — under 4.0 means every competitor above them wins the click by default. Reputation repair is the fast money."
    elif not site:
        pain = "Website"
        hook = f"{nm} has no real website — every Google searcher gets handed to a competitor with a booking page. Fastest fix we do."
    elif fb:
        pain = "Website"
        hook = f"{nm}'s site is on a free {fb} template — reads DIY and kills trust before they call. Real site plus ads is the play."
    elif rv is not None and rv < 15:
        pain = "Reviews"
        hook = f"Only {rv} Google reviews on {nm} — invisible to anyone not already searching the name. Review engine plus ads changes that fast."
    else:
        pain = "Reviews"
        hook = f"{nm} shows a thin review base — the top {city} shops run 5-10x that and take the premium jobs. Ads plus reviews closes the gap."
    return {"business_name": nm, "phone": disp(ph), "city": city, "metro": c['metro'],
        "owner": nm,  # owner fallback: business_name when unknown (never blank/guessed)
        "website": clean_site(site),
        "rating": r if r is not None else "", "review_count": rv if rv is not None else "",
        "primary_pain": pain, "hook": hook, "confidence": "verified",
        "_tier": tier, "_strong": strong,
        "_r": r if r is not None else 9, "_rv": rv if rv is not None else 99999}
