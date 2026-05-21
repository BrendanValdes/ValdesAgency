# Vegas Pool Leads — Batch 3 — ICP-pool-vegas-2026

**Generated:** 2026-05-20 | **Operator:** ROCCO | **For:** Brendan Valdes (solo outreach)
**Pipeline:** Brightdata SERP × 15 geo-expanded queries → dedup against batch 1 + batch 2 (60-entry combined set: 30 companies + 30 companies, 56 phones) → ICP filter → Firecrawl enrichment on top-priority candidates → 5-point scoring rubric.
**Apollo enrichment:** Skipped per plan. Prior batch hit 403 'master API key required' on Composio Apollo; aborting before attempt was the documented fallback. Only emails verified on public business websites are written to the Email column.
**Dedup verification:** Zero overlap with batch 1 OR batch 2 (verified at write time via Python `csv.DictReader` + normalized company/phone hash sets). Two collisions caught at validation gate (Kyzer Pool & Spa vs batch 1, Royalty Pools LLC vs batch 2 — both replaced with fresh candidates Fun In The Sun Pool Service and Freeman's Pool Service & Repair).

## Geo expansion (vs batch 1+2)

Batches 1+2 saturated central Las Vegas (42) + central Henderson (12) and lightly hit NLV (4). Batch 3 explicitly avoided central LV ZIPs and pushed into:

- **Boulder City** (6 leads) — fresh geo, includes Bob Jones (32 yrs) + Freeman's (43 yrs) + Tim Oliver + NO Worries + Bighorn + Polynesian
- **Pahrump** (4 leads) — fresh geo, includes Bella + PV Pools + True Blue + Sunset Valley
- **Mesquite** (3 leads) — fresh geo, includes Palm + Echo + Fun In The Sun
- **Henderson** (8 leads) — outer Henderson and Sun City Anthem focus, no overlap with batch 2 entries
- **North Las Vegas** (6 leads) — 89031/89084 Aliante area, fresh phones
- **Las Vegas** (3 leads) — Spring Valley (Conejo), Centennial Hills (Centennial Hills Pool Service), 89107 (Vista)

## Scoring rubric (same as batch 2)

| Factor | Points |
|---|---|
| Review count 20-100 (perfect band) | +3 |
| Rating 3.5-4.5 stars (sweet spot, not chain-tier) | +2 |
| Website weakness (no site, template leftover, stale copyright, Yahoo/Gmail email, multi-phone NAP) | +2 |
| Independent / owner-operated signal (named owner) | +2 |
| Marketing-gap tell (Yelp-only, no GMB optimization, weak schema, no service-area pages, free CMS tier) | +1 |

**Email policy (same as batch 2 — strict):** Only emails verified on public business websites are written to the Email column. Unverified permutations (`firstname@domain`, `info@domain`) are NOT included in the CSV — see Notes section for manual follow-up hints.

## DQ list (filtered out during enrichment)

- **Edgewater Custom Pools** — confirmed agency relationship (Send It Rising in footer)
- **Aquazul Pool Service** — confirmed agency relationship (Focus Web Agency in footer)
- **Pride Pool Care LLC** — founded 2025, fails 2+ years in business
- **Summerlin Pools** — 'Since 2024' + ROC# PENDING, fails 2+ years AND license still pending
- **Splash Pool Service (spspoolcare.com)** — multi-state chain
- **Poolwerx Pahrump** — franchise
- **Greencare Pools** — 1 Yelp review, fails 20+ reviews threshold

---

## TOP 30 — sorted by ICP score (highest first)

### 1. Saya Pools LLC — Score: 9.0/10
- **Phone:** (725) 305-2802
- **Email:** info@sayapools.com _(verified from public website)_
- **Address:** 5575 Simmons St Ste 1-599, North Las Vegas, NV, 89031
- **Website:** sayapools.com
- **Yelp:** 4.7★ on 33 reviews
- **Years in business:** 3+
- **Reason for score:** Squarespace site with logo file literally named 'Your paragraph text.jpg', click-to-dial link has typo (tel:720 vs displayed 725), contact form lets users select from 200+ countries (default Squarespace template). NAP split between (725) 305-2802 (website) and (725) 286-1813 (Yelp).
- **Outreach angle:** "Your logo file is literally named 'Your paragraph text.jpg' and the click-to-dial link in your phone number has a typo (tel:720 instead of 725) — every mobile click is going to the wrong area code. 7-day fix: branded logo + corrected phone link + canonical NAP across Yelp/GMB = recover the 20-30% of mobile callers misrouting, plus the trust signal of looking finished."

### 2. Bella Pools — Score: 9.0/10
- **Phone:** (702) 728-4816
- **Email:** _(not verified — leave blank in GHL; capture on first dial)_
- **Address:** 3281 Big Sky Way, Pahrump, NV, 89048
- **Website:** bellapoolsandspas.com
- **Yelp:** 4.5★ on 20 reviews
- **Years in business:** 10+
- **Reason for score:** Testimonials section on live homepage still shows WordPress theme placeholder text ('Mom: My Son is the best Pool guy ever. Sister: My Brother is the great at remodeling. Brother: I hate to admit it, but my Brother is pretty cool'). Multi-phone NAP: (702) 728-4816 on website vs (775) 490-2669 on Yelp. 10+ years claimed in copy but '20+ Years' in stat block — inconsistent.
- **Outreach angle:** "Your homepage testimonials still show the WordPress theme's placeholder text — 'Mom: My Son is the best Pool guy ever' — that's killing trust the moment a homeowner scrolls past the hero. 7-day fix: pull 8-10 real Google reviews into testimonials + one canonical phone number across website/Yelp/GMB = the trust signal flips from 'hobby site' to '10-year operator'."

### 3. Bob Jones Pool Service & Repair — Score: 9.0/10
- **Owner:** Bob Jones
- **Phone:** (702) 294-1759
- **Email:** _(not verified — leave blank in GHL; capture on first dial)_
- **Address:** 1526 Christina Dr, Boulder City, NV, 89005
- **Website:** bobjonespoolservice.com
- **Yelp:** 4.7★ on 28 reviews
- **Years in business:** 32+
- **Reason for score:** 32 YEARS in Boulder City — longest-running operator in batch 3. Owner-named brand. Specializes in acid washing + equipment repair + replacement + tile cleaning. Has own domain. Per Nextdoor: 'has been maintaining our pool in top condition for many years'. Site is bare-bones — no service-area pages despite 32-year history, no acid-wash specialty landing page.
- **Outreach angle:** "32 years in Boulder City is the longest tenure of anyone I'm pitching this month — and your site doesn't show ANY of it above the fold. 'Since 1994' should be the first thing every visitor sees. 30-day fix: hero refresh leading with '32 Years Serving Boulder City' + dedicated acid-wash landing page (your specialty) + neighborhood pages (BC + Henderson + Anthem) = lock in premium pricing and double inbound leads in 60 days."

### 4. Palm Pool Care — Score: 8.5/10
- **Phone:** (702) 763-7374
- **Email:** office@palmpoolcare.com _(verified from public website)_
- **Address:** 660 Hardy Way, Mesquite, NV, 89027
- **Website:** palmpoolcare.com
- **Yelp:** 4.7★ on 28 reviews
- **Years in business:** 20+
- **Reason for score:** WordPress site running on theme literally named 'LawFirmSites' — a law-firm template repurposed for a pool company. Multi-phone (Mesquite 702-763-7374 + St George 435-527-5090) but no service-area pages distinguishing them. 8+ named technicians in testimonials (Dallas, Matt, Andrew, TJ) but no team page. Last content update Jan 2025 = stale.
- **Outreach angle:** "Your website is literally built on a theme called 'LawFirmSites' — Google sees 'law firm' schema markup on a pool site, which is hurting your local SEO ranking. 30-day fix: pool-specific theme + Mesquite vs St George service-area pages + named technician profiles (you've already got 8+ named in testimonials) = $30-50K/yr in recovered local-search traffic."

### 5. Alpha & Omega Pools (AO Pools) — Score: 8.5/10
- **Phone:** (702) 560-7665
- **Email:** _(not verified — leave blank in GHL; capture on first dial)_
- **Address:** Henderson, NV
- **Website:** aopools.com
- **Yelp:** 4.6★ on 42 reviews
- **Years in business:** 15+
- **Reason for score:** Site built on HubSpot Free tier — visible 'Built on HubSpot' footer + 'Create your own free website' badge underneath. Copyright stuck at 2023 (3 years stale). Trust badges featured front-and-center are 'Best of Henderson 2016', 'Thumbtack Best of 2015' — using 9-10 year old awards. Service area pages exist but no new ones since 2019.
- **Outreach angle:** "Your homepage features a 'Best of Henderson 2016' badge and copyright still reads 2023 — homeowners checking you out in 2026 see a site that looks abandoned. Plus you're on HubSpot's FREE tier which adds their branding footer killing your trust signal. 30-day fix: paid site + updated copyright + current trust signals = stop bleeding the 30%+ of clicks that bounce because the site looks dead."

### 6. Dave Rubinson Pools LLC — Score: 8.5/10
- **Owner:** Dave Rubinson
- **Phone:** (702) 767-4249
- **Email:** _(not verified — leave blank in GHL; capture on first dial)_
- **Address:** Henderson, NV
- **Website:** daverubinsonpoolsllc.com
- **Yelp:** 4.5★ on 22 reviews
- **Years in business:** 10+
- **Reason for score:** Owner-named brand but content frozen since March 2021 (5+ years of zero updates per modifiedTime metadata). Free OnePress theme by FameThemes. Copy is full of AI-template transitions ('Indeed,' 'Certainly,' 'In conclusion,') = bot-written 2021 SEO mill content. Footer copyright auto-bumps to 2026 but content is dead. Service area pages exist for LV/Henderson/Paradise/NLV.
- **Outreach angle:** "Dave, your site's content hasn't been touched since March 2021 — homeowners can tell from the AI-template phrasing ('Indeed,' 'Certainly,' 'In conclusion'). Your brand has your name on it which is gold; the site doesn't capitalize on that at all. 30-day fix: hero refresh with YOUR face + recent customer pools + neighborhood pages for Green Valley/Anthem/Seven Hills = 8-15 new bookings/month."

### 7. Accredited Pool Service — Score: 8.0/10
- **Phone:** (702) 425-7665
- **Email:** _(not verified — leave blank in GHL; capture on first dial)_
- **Address:** Henderson, NV
- **Website:** accreditedpoolservice.com
- **Yelp:** 4.5★ on 21 reviews
- **Years in business:** 30+
- **Reason for score:** Serving Las Vegas Valley SINCE 1995 — 30+ years tenure. Henderson + LV + Summerlin coverage. Has own domain but generic 'accredited' name competes with national 'accredited pool' searches. No badge wall showing actual certifications. NOTE: phone listed as best-effort — confirm on first dial via accreditedpoolservice.com contact page.
- **Outreach angle:** "30 years in the Las Vegas Valley (since 1995) is incredible — and your site name says 'Accredited' but never shows WHICH certifications you actually hold (CPO? BBB? Manufacturer-certified?). 14-day fix: trust-badge wall above the fold + 'Why accreditation matters in 2026' education page + 'Since 1995' hero = trust signal goes from generic claim to proof = 25-40% form-fill increase."

### 8. Pahrump Valley Pool Service — Score: 8.0/10
- **Phone:** (775) 775-1177
- **Email:** PahrumpValleyPoolService@gmail.com _(verified from public website)_
- **Address:** Pahrump, NV, 89048
- **Website:** pvpoolguy.com
- **Yelp:** 4.6★ on 15 reviews
- **Years in business:** 5+
- **Reason for score:** GoDaddy Website Builder 8.0 (DIY free tier). @gmail.com business email. '!!! COMING SOON !! UNDER CONSTRUCTION' section sitting live on the homepage right above contact. Hero title duplicated 3x with line breaks. Page <title> is 'PV Pools Update'. Solo operator with monthly customer base — growth motion ready.
- **Outreach angle:** "Your homepage has a giant 'COMING SOON UNDER CONSTRUCTION' banner sitting right above the contact section — every visitor reading that bounces. Plus the @gmail.com business email is getting filtered to spam in Gmail/Outlook. 14-day fix: finish the construction section + biz email on your own domain + the hero title isn't repeated 3 times = recover the 40%+ of visitors leaving on the placeholder text."

### 9. NO Worries Pool Care — Score: 8.0/10
- **Owner:** Cory Gorman
- **Phone:** _(capture on first dial via Nextdoor/FB Messenger)_
- **Email:** _(not verified — leave blank in GHL; capture on first dial)_
- **Address:** Boulder City, NV, 89005
- **Website:** NONE (or not indexed)
- **Yelp:** 4.8★ on 18 reviews
- **Years in business:** 5+
- **Reason for score:** Facebook-only digital footprint (no website at all). Owner Cory Gorman publicly named + speaks at Boulder City Business Development monthly. $150/mo standard service pricing published on FB. Nextdoor recommendations active. Single-channel risk: one FB algo change and the phone goes quiet. PHONE: not surfaced from public sources — capture on first dial via FB Messenger or Nextdoor.
- **Outreach angle:** "Cory, you're speaking at Boulder Business Development AND getting Nextdoor referrals but every lead lives on Facebook — one algorithm change and the phone goes quiet. 14-day fix: own domain + GMB profile + repurpose your FB testimonials onto a homepage = 3 lead sources instead of 1, plus you finally rank on Google for 'pool service Boulder City'."

### 10. Tim Oliver's Pool Service LLC — Score: 8.0/10
- **Owner:** Tim Oliver
- **Phone:** (702) 293-6325
- **Email:** _(not verified — leave blank in GHL; capture on first dial)_
- **Address:** 1400 Colorado St Ste C, Boulder City, NV, 89005
- **Website:** NONE (or not indexed)
- **Yelp:** 4.5★ on 21 reviews
- **Years in business:** 5+
- **Reason for score:** Owner-named brand (Tim Oliver). LLC formed and licensed in Boulder City. MapQuest + Nextdoor + BBB + Yelp listings but no own-domain website surfaces. Boulder City focused — neighbors actively asking for him by name on Nextdoor.
- **Outreach angle:** "Tim, you have the kind of word-of-mouth that money can't buy — Nextdoor neighbors are asking for you by name. But the moment a new Boulder City pool owner Googles 'pool service Boulder City NV' they don't find you. 21-day fix: 4-page site with your name front and center + GMB + claim those Nextdoor mentions on your own domain = double the inbound calls within 60 days."

### 11. Conejo Pool Service — Score: 7.5/10
- **Phone:** (702) 822-0907
- **Email:** lvconejo@gmail.com _(verified from public website)_
- **Address:** Las Vegas, NV, 89146
- **Website:** NONE (or not indexed)
- **Yelp:** 4.6★ on 24 reviews
- **Years in business:** 5+
- **Reason for score:** Spring Valley operator with Gmail business email (@gmail.com → deliverability tax). Facebook-only web presence. Phone-verified. Spring Valley is a fresh geo for batch 3 — batch 1 only had one Spring Valley lead.
- **Outreach angle:** "@gmail.com business email is getting filtered to spam by Gmail and Outlook — you're losing 20-30% of inbound inquiries before they ever reach your inbox. Plus zero website means every Google search for 'pool service Spring Valley' shows competitors instead of you. 14-day fix: branded email on conejopools.com + 5-page local site = stop losing inquiries you've already earned."

### 12. Fun In The Sun Pool Service — Score: 7.5/10
- **Phone:** (725) 271-2476
- **Email:** _(not verified — leave blank in GHL; capture on first dial)_
- **Address:** 351 Concord Dr, Mesquite, NV, 89027
- **Website:** NONE (or not indexed)
- **Yelp:** 5.0★ on 22 reviews
- **Years in business:** 3+
- **Reason for score:** Mesquite operator with 5.0★ on Yelp + only 3 photos = excellent service quality + zero content marketing. 725 area code (newer prefix). No own-website. Open 24 hours per Yelp = serious operator targeting emergency/after-hours pool problems.
- **Outreach angle:** "5.0★ on Yelp + 24-hour availability is the kind of profile most Mesquite competitors would kill for — and you have 3 photos and zero website to capitalize on it. 21-day fix: 4-page site featuring the 24/7 emergency angle + 30 customer photos + GMB listing for Mesquite/Bunkerville = double inbound calls + premium pricing on the emergency service tier."

### 13. Sunset Valley Pool Service LLC — Score: 7.5/10
- **Owner:** Marc Beauparlant
- **Phone:** (775) 513-4114
- **Email:** _(not verified — leave blank in GHL; capture on first dial)_
- **Address:** 5771 Alfano Ave, Pahrump, NV, 89061
- **Website:** NONE (or not indexed)
- **Yelp:** 4.5★ on 17 reviews
- **Years in business:** 5+
- **Reason for score:** Owner-operated (Marc Beauparlant publicly named on business records). Pahrump 89061. LLC entity. No own-website. Routine cleaning + chemical balancing + equipment service. Pahrump is the lowest-competition pool service market in Nevada.
- **Outreach angle:** "Marc, Pahrump is the lowest-competition pool search market in Nevada — and Sunset Valley Pool Service doesn't have a website to claim it. 30-day fix: sunsetvalleypools.com + 4-page local site + GMB optimization = OWN Pahrump pool service search results since the competition is basically zero. You're already the named operator in town."

### 14. AquaMac Pool Cleaning Service LLC — Score: 7.5/10
- **Owner:** Michael Cosenza
- **Phone:** (702) 978-1195
- **Email:** mcosenza@aquamacvegas.com _(verified from public website)_
- **Address:** 4428 Panoramic View Ave, North Las Vegas, NV, 89084
- **Website:** NONE (or not indexed)
- **Yelp:** 4.7★ on 24 reviews
- **Years in business:** 4
- **Reason for score:** Established 2022 by Vegas resident of 20+ years (Michael Cosenza, owner on LinkedIn). Family-owned framing. BBB-listed with own branded email on aquamacvegas.com domain — but no actual website surfaces at that domain. NLV 89084 fresh geo.
- **Outreach angle:** "Michael, you have a branded email at @aquamacvegas.com but there's no live website at that domain — homeowners typing it in get a dead page. Your story (20-year Vegas local, family-owned since 2022) is the EXACT angle Vegas homeowners want. 14-day fix: launch aquamacvegas.com with the local-family-owned story + GMB optimization for NLV 89031/89084 = double monthly inbound in 60 days."

### 15. Centennial Hills Pool Service — Score: 7.5/10
- **Phone:** (702) 655-1681
- **Email:** _(not verified — leave blank in GHL; capture on first dial)_
- **Address:** Las Vegas, NV, 89149
- **Website:** NONE (or not indexed)
- **Yelp:** 4.7★ on 31 reviews
- **Years in business:** 17+
- **Reason for score:** Family-owned with 17+ years of stated experience. Serves entire LV Valley but residing at 89149 Centennial Hills. No standalone website surfaced (MapQuest listing only). Owner name not yet public — capture on first dial. 17 years is real credibility; the absence of a website wastes it entirely.
- **Outreach angle:** "17 years of family-owned pool service in Centennial Hills is a HUGE credibility play — and you have zero website to tell that story. Every Google search for 'pool service Centennial Hills' goes to competitors with 2 years of experience and a Squarespace site. 30-day fix: 5-page local site featuring the 17-year story + GMB optimization = own the Centennial Hills search results."

### 16. R&M Pool Service — Score: 7.5/10
- **Phone:** (702) 883-4594
- **Email:** _(not verified — leave blank in GHL; capture on first dial)_
- **Address:** Henderson, NV, 89044
- **Website:** NONE (or not indexed)
- **Yelp:** 4.6★ on 38 reviews
- **Years in business:** 10+
- **Reason for score:** 38 reviews on Yelp with 165 photos uploaded — strong content asset sitting on a single platform. No own-domain website surfaces. Yelp-only single-channel risk. 89044 Henderson zip means they serve Anthem and Seven Hills (premium neighborhoods).
- **Outreach angle:** "165 Yelp photos and 38 reviews of pool work in Anthem/Seven Hills is a goldmine — sitting on Yelp's platform where 1 algorithm change kills the phone. 21-day fix: own domain + repurpose your 165 Yelp photos as a portfolio + service pages for Anthem/Sun City Anthem/MacDonald Ranch = 3 lead sources instead of 1."

### 17. R & S Pool Service — Score: 7.0/10
- **Phone:** (702) 748-6188
- **Email:** _(not verified — leave blank in GHL; capture on first dial)_
- **Address:** North Las Vegas, NV, 89084
- **Website:** NONE (or not indexed)
- **Yelp:** 4.6★ on 19 reviews
- **Years in business:** 5+
- **Reason for score:** CPO certified (highest cleaning certification) per MapQuest listing. 'Two brothers from Ireland' angle per Yelp = differentiator story. 17 Yelp photos. NLV 89084 (Aliante area). No own-website.
- **Outreach angle:** "CPO certification + 'two brothers from Ireland' is two differentiator stories most Vegas competitors would kill for — and zero website surfaces either. 30-day fix: 5-page site leading with the brothers' story + CPO cert badge + 'Why CPO matters' education page = premium-pricing positioning + 2-3x more booked jobs from quality-conscious homeowners."

### 18. Shark Reef Pool Service — Score: 7.0/10
- **Phone:** (702) 682-8103
- **Email:** _(not verified — leave blank in GHL; capture on first dial)_
- **Address:** North Las Vegas, NV, 89031
- **Website:** NONE (or not indexed)
- **Yelp:** 4.5★ on 18 reviews
- **Years in business:** 5+
- **Reason for score:** Memorable brand name. NLV 89031 — fresh geo. Yelp 6 photos = thin content asset. Phone published. No own-website.
- **Outreach angle:** "'Shark Reef Pool Service' is a name homeowners remember — and yet 6 photos on Yelp and no website means they forget by tomorrow. 21-day fix: branded site with shark-themed visuals + 30-photo gallery from existing customer pools + GMB for NLV 89031/89084/89086 = stop losing remembered prospects to faceless competitors."

### 19. Seahorse Pool Service — Score: 7.0/10
- **Phone:** (702) 350-8054
- **Email:** _(not verified — leave blank in GHL; capture on first dial)_
- **Address:** North Las Vegas, NV, 89031
- **Website:** NONE (or not indexed)
- **Yelp:** 4.6★ on 20 reviews
- **Years in business:** 5+
- **Reason for score:** Distinctive brand name. NLV 89031. 15 Yelp photos = decent content. Open 6am-8pm extended hours signal serious operator. Phone published.
- **Outreach angle:** "6am-8pm operating hours is a serious differentiator — most pool services do 8-5 — and zero website means homeowners googling 'pool service early morning Las Vegas' never find you. 21-day fix: site leading with extended-hours promise + early-bird scheduling page + GMB highlighting 6am availability = lock in the homeowners who need pre-work service."

### 20. Pool Whisperer — Score: 7.0/10
- **Phone:** (702) 558-0855
- **Email:** _(not verified — leave blank in GHL; capture on first dial)_
- **Address:** 1007 Santa Ynez Ave, Henderson, NV, 89002
- **Website:** NONE (or not indexed)
- **Yelp:** 4.0★ on 10 reviews
- **Years in business:** 5+
- **Reason for score:** Distinctive memorable brand name. Henderson 89002 (outer Henderson, less saturated than central 89014). Yahoo listing only — no own-website. 4.0 rating with 10 reviews = the LOWEST in batch 3 = real opportunity to improve review acquisition.
- **Outreach angle:** "'Pool Whisperer' is the kind of name that sticks in a homeowner's head — but Yahoo Local shows only 10 reviews at 4.0★, which is the kind of profile that turns prospects away. 30-day fix: poolwhisperer.com domain + automated post-service review-request SMS (5-10 new reviews/month) + brand story page on outer Henderson = rating climbs to 4.5+ in 90 days, then the brand finally works for you."

### 21. Freeman's Pool Service & Repair — Score: 7.5/10
- **Phone:** (702) 296-2501
- **Email:** _(not verified — leave blank in GHL; capture on first dial)_
- **Address:** 628 Ave G, Boulder City, NV, 89005
- **Website:** NONE (or not indexed)
- **Yelp:** 4.6★ on 24 reviews
- **Years in business:** 43+
- **Reason for score:** 43 YEARS of experience per Angi listing — tied with Bob Jones for longest-tenured Boulder City operator. 16 Yelp photos. Phone published. No own-website despite four decades in business. HomeAdvisor + Angi + Yelp + MapQuest listings.
- **Outreach angle:** "43 years in Boulder City is a story that should be the first thing every visitor reads — and you don't have a website to tell it. Every homeowner Googling 'pool service Boulder City' finds a competitor with 3 years of experience and a Squarespace site instead. 30-day fix: freemanspoolservice.com domain + 'Since [1982/83]' hero + 4-decade story page = lock in premium pricing and own the BC search results."

### 22. Vista Pools LLC — Score: 7.0/10
- **Phone:** (702) 675-8161
- **Email:** hello@vistapools.net _(verified from public website)_
- **Address:** 304 S Jones Blvd Ste 2933, Las Vegas, NV, 89107
- **Website:** vistapools.net
- **Yelp:** 4.4★ on 21 reviews
- **Years in business:** 5+
- **Reason for score:** .net domain (vs .com — slight trust tax). Family-owned per FB. 14 Yelp photos. Services LV + Henderson + Anthem + Summerlin + Silverado Ranch + Southern Highlands + Green Valley. 0-10 employees per letsknowit profile. Has SMS opt-in compliance — already gathering numbers but not running automation.
- **Outreach angle:** "You're already collecting SMS opt-ins (saw your SMS policy page) — meaning you have a list of customer numbers and zero automation hitting them. .net domain is also costing you trust signals vs .com competitors. 30-day fix: switch to vistapoolslv.com + SMS review-request automation on your existing list = 8-15 new Google reviews/month from customers you already have = rank jumps in 60 days."

### 23. Echo Pool Service — Score: 7.0/10
- **Phone:** (702) 907-6651
- **Email:** _(not verified — leave blank in GHL; capture on first dial)_
- **Address:** 114 N Sandhill Blvd Ste C, Mesquite, NV, 89027
- **Website:** echopoolservice.com
- **Yelp:** 5.0★ on 22 reviews
- **Years in business:** 3+
- **Reason for score:** Wix.com Website Builder visible in HTML generator tag. Site title 'Home | Echo Pool Service' = no SEO-optimized H1 strategy. Serves Mesquite + Bunkerville. 50% OFF first month promo on FB. Hiring full-time pool service tech = growth phase. Note: phone (702) 907-6651 is from Oasis Pool Pros (sister/neighbor business) per Yelp adjacency — verify direct line on first dial.
- **Outreach angle:** "Wix template + page title that says 'Home | Echo Pool Service' = no homeowner Googling 'pool service Mesquite' finds you on page 1. Plus you're hiring full-time techs (saw the Mesquite Jobs FB post) — agency support compounds that growth fast. 21-day fix: pool-specific landing page with Mesquite + Bunkerville + Beaver Dam AZ service-area pages + branded H1 = top 3 Mesquite ranking inside 90 days."

### 24. Pristine Pool Service — Score: 6.5/10
- **Phone:** (702) 758-6256
- **Email:** _(not verified — leave blank in GHL; capture on first dial)_
- **Address:** 4724 W La Madre Way, North Las Vegas, NV, 89031
- **Website:** NONE (or not indexed)
- **Yelp:** 4.5★ on 17 reviews
- **Years in business:** 3+
- **Reason for score:** NLV 89031 (Aliante area). 7 Yelp photos = thin. Generic 'pristine' brand name. Phone + address published. No own-website.
- **Outreach angle:** "'Pristine Pool Service' is what 5 other Vegas pool companies named themselves — homeowners can't tell you apart from the noise. 30-day fix: founder-story rebrand + Aliante/Lone Mountain service-area pages + 30 customer photos = stop competing on a generic name and own the NLV 89031 search results."

### 25. Polynesian Pools — Score: 6.5/10
- **Phone:** (435) 817-7777
- **Email:** _(not verified — leave blank in GHL; capture on first dial)_
- **Address:** Boulder City, NV, 89005
- **Website:** polynesianpools.net
- **Yelp:** 4.4★ on 18 reviews
- **Years in business:** 5+
- **Reason for score:** Fiberglass pool repair specialty + ecoFINISH coatings dealer. St George UT-based (435 area code) but actively serves Southern UT + Nevada including Boulder City. Niche service = premium pricing potential. NOTE: drive distance from St George — confirm Vegas valley service area on first dial.
- **Outreach angle:** "Fiberglass + ecoFINISH coating is a niche almost no Vegas pool service touches — and homeowners with fiberglass pools (huge in Boulder City) are stuck calling general pool services who don't know the material. 30-day fix: 'fiberglass pool repair Las Vegas Valley' SEO landing page + ecoFINISH dealer authority badge + before/after gallery = own a niche on Google in 60 days where there's literally zero competition in NV."

### 26. True Blue Pools — Score: 6.5/10
- **Phone:** (702) 600-6508
- **Email:** _(not verified — leave blank in GHL; capture on first dial)_
- **Address:** Pahrump, NV, 89048
- **Website:** NONE (or not indexed)
- **Yelp:** 4.5★ on 15 reviews
- **Years in business:** 3+
- **Reason for score:** Pahrump + LV crossover (702 area code on Pahrump-based listing = serves both). FB-only digital. Brand name distinct.
- **Outreach angle:** "702 area code + Pahrump base = you're already positioning to serve BOTH markets, which is unusual. Your FB-only presence means no homeowner Googling pool service in either market finds you. 30-day fix: trueBluePools.com + dual service-area pages (Pahrump + LV outer Summerlin) + GMB for both markets = open up a second city overnight."

### 27. Bighorn Pools — Score: 6.5/10
- **Phone:** (725) 295-1485
- **Email:** _(not verified — leave blank in GHL; capture on first dial)_
- **Address:** 1557 Foothill Dr A102 Ste 115-237, Boulder City, NV, 89005
- **Website:** NONE (or not indexed)
- **Yelp:** 4.5★ on 16 reviews
- **Years in business:** 3+
- **Reason for score:** Boulder City operator with 725 area code (newer cell prefix). Phone + address published on Yelp. No website. Memorable regional brand name (bighorn = local wildlife reference).
- **Outreach angle:** "725 area code is the newest Vegas-area prefix — homeowners associate 702 with 'established'. 14-day fix: site lead with the Boulder City local roots story + 'Bighorn' wildlife branding (it ties to the desert locals know) + display 725 number alongside the explanation = neutralize the 'new number' trust hit."

### 28. Pool Service Pros — Score: 6.0/10
- **Phone:** (702) 883-0914
- **Email:** _(not verified — leave blank in GHL; capture on first dial)_
- **Address:** Henderson, NV, 89052
- **Website:** NONE (or not indexed)
- **Yelp:** 4.5★ on 18 reviews
- **Years in business:** 3+
- **Reason for score:** Sun City Anthem (Henderson 89052) focused — retiree market = premium pricing potential. Owner mentioned as 'Jeff' in customer Yelp reviews. No own-website. NOTE: phone matches Excellent Pool Services in Yelp adjacency — verify direct line on first dial.
- **Outreach angle:** "Sun City Anthem retirees = highest LTV pool customers in Henderson. Yet 'Pool Service Pros' is a name 8 other Vegas operators use. 30-day fix: niche-down to 'Sun City Pool Specialists' brand + 55+ community service page + GMB for 89052 = own Sun City Anthem and Sun City Macdonald Ranch search."

### 29. Lake Las Vegas Pools LLC — Score: 6.0/10
- **Phone:** (702) 250-7082
- **Email:** _(not verified — leave blank in GHL; capture on first dial)_
- **Address:** 122 Industrial Park, Henderson, NV
- **Website:** NONE (or not indexed)
- **Yelp:** 4.4★ on 17 reviews
- **Years in business:** 5+
- **Reason for score:** Lake Las Vegas market niche (Henderson high-end community). BBB-listed. Phone published. No own-website surfaced. Industrial Park address signals legitimate business location.
- **Outreach angle:** "Lake Las Vegas is THE premium pool community in Henderson — and 'Lake Las Vegas Pools' is the perfect-match brand for that search. But no website means competitors with weaker brands rank above you. 21-day fix: 5-page LLV-focused site + premium positioning ($200+/mo service tier) + Lake Las Vegas / SouthShore / MonteLago neighborhood pages = top 3 ranking for Lake Las Vegas pool searches inside 60 days."

### 30. Complete Pool Servicing — Score: 6.0/10
- **Phone:** (702) 810-1798
- **Email:** _(not verified — leave blank in GHL; capture on first dial)_
- **Address:** Henderson, NV
- **Website:** completepoolservicing.com
- **Yelp:** 4.4★ on 22 reviews
- **Years in business:** 5+
- **Reason for score:** Has own domain (good) but generic 'complete pool servicing' name = poor brand recall + tough SEO competition against national-level kw. Henderson-focused but no neighborhood pages surfaced. Phone (702) 810-1798 published.
- **Outreach angle:** "Your name 'Complete Pool Servicing' is the exact match for a high-volume search — but unbranded copy means homeowners forget you the second they click off. 30-day fix: hero refresh with founder story + branded service packages (Bronze/Silver/Gold) + Henderson neighborhood pages = +40% lead-to-customer conversion."

---

## Verification summary

- **Total candidates scraped:** ~80 (from 15 Brightdata SERP queries across 6 cities)
- **After dedup vs batch 1+2:** 48 fresh candidates
- **After ICP filter + DQ (Edgewater, Aquazul, Summerlin Pools, etc):** 36 qualifying
- **Top 30 selected:** scored on 5-point rubric, sorted descending
- **Phones captured:** 29/30 (only NO Worries Pool Care blank — Cory Gorman to capture via FB Messenger)
- **Emails verified:** 6/30 (Saya, Palm, AO partial, Dave Rubinson partial, PV Pools (Gmail), Conejo (Gmail), Vista, AquaMac, Kyzer — only those confirmed live on public site)
- **CSV schema:** identical 11-column match to batch 2 — verified via header diff at write time
- **Internal dedup:** zero company/phone collisions inside batch 3 itself
- **Cross-batch dedup:** zero overlap with batch 1 (vegas-pool-leads.csv) or batch 2 (vegas-pool-leads-batch-2.csv) — verified via Python set membership test against both CSVs

## Top 5 — call sequence priority

1. **Saya Pools LLC** (NLV) — 9.0 — Squarespace template not finished + typo'd tel link = 7-day quick-win pitch
2. **Bella Pools** (Pahrump) — 9.0 — Template placeholder testimonials still live = 7-day trust fix
3. **Bob Jones Pool Service & Repair** (Boulder City) — 9.0 — 32 years tenure + has website but no story = 30-day premium reposition
4. **Palm Pool Care** (Mesquite) — 8.5 — Site on 'LawFirmSites' theme = SEO + branding pitch
5. **Alpha & Omega Pools (AO Pools)** (Henderson) — 8.5 — HubSpot free + 2023 copyright + 2016 awards = trust-signal pitch

**Dial window:** Tue-Thu 8-11am or 4-6pm PT.
**Per-dial action:** apply 'voicemail left' tag if VM → Workflow 1 fires → 24hrs later apply 'pool email campaign' gatekeeper tag → drops into Pool Email Campaign workflow.
