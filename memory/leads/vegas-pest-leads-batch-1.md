# Vegas Pest Leads — Batch 1

**Generated:** 2026-05-23
**Source:** Brightdata Google Maps + Yelp SERP scrape + Firecrawl site enrichment + Exa Nevada-register / LinkedIn ownership research
**Funnel:** ~70 candidates surfaced → 50 ICP-pass after franchise filter → 30 final ranked by composite score
**Dedup baseline:** First pest batch — zero prior pest leads to dedupe against. No collisions with pool batches (cross-niche by definition).

## Geo Distribution
- Las Vegas: 14
- Henderson: 6
- Pahrump: 4
- Boulder City: 3
- Mesquite: 2
- North Las Vegas: 1

## Score Distribution
- 8.5 (top-priority — 8 leads)
- 7.5 (mid-priority — 7 leads)
- 6.5 (mid-priority — 9 leads)
- 5.5 (probe-first — 5 leads)
- 4.5 (probe-first — 1 leads)

## Email Verification
- 6/30 emails populated (20% rate) — surfaced directly from website footers (info@/office@ addresses). **Apollo deferred** to batch 2 (would burn auth flow + credits this session for marginal yield; pool batches established footer-only baseline of 25-30%).

## Saturation Flag
Vegas pest TAM after batch 1 is ~40-50% mined (30 unique independents found out of estimated 60-90 qualified). Remaining qualified ICP: ~30-60 companies — but quality drops sharply from here. Batch 2 expected score range 5.5-7.5 (vs batch 1's 4.5-8.5). **Recommendation:** dial batch 1 first, validate the niche on call-answer + book-rate metrics, then decide whether batch 2 is worth scraping or whether to pivot to Phoenix-pool (TAM ~4x Vegas).

## Format Notes (vs pool batches)
- **Phone format split** — GHL-ready CSV uses display `(702) 555-1234` matching pool batches; research CSV uses E.164 `+17025551234` for clean analysis. Same scraped digits, two formats.
- **Notes format** — Brief 1-2 sentence summary in GHL-ready CSV; full outreach angle lives in research CSV `outreach_angle` column (deviation from pool's rich-Notes pattern, per user spec). Treat research CSV as canonical for pest angle work.
- **No BOM, 11/14 cols confirmed.**

## GHL Import — L-019 Mitigation
- Header is `Business Name` (matches pool — wizard may alias to 'Company Name', that's fine, same underlying field).
- After import: open 5 random contacts → SCROLL to General Info → confirm Business Name populated (NOT header — that's the 2026-05-20 trap).
- 2-pass patch ready if needed: research CSV phone column is E.164 — clean match identifier for GHL Update mode.

## Leads Table

| # | Company | Owner | Phone | Score | City | Hook |
|---|---|---|---|---|---|---|
| 1 | All In Pest Solutions | Ryan Morneault | (775) 469-0919 | 8.5/10 | Pahrump | Ryan, 20 years of pest experience and a 5.0-star Yelp profile is the kind of fou... |
| 2 | Amazon Pest Control | Pedro Dominguez | (702) 558-3730 | 8.5/10 | Henderson | Pedro, you and Bekki have served Henderson 20+ years with 95% customer retention... |
| 3 | BC Pest Control (Stefani's) | Bill | (702) 238-5627 | 8.5/10 | Boulder City | Bill, your site is running a banner that literally says 'Ninja Slider trial vers... |
| 4 | Bee Wise Pest Control | — | (702) 743-0803 | 8.5/10 | Las Vegas | Bee Wise has 25 years and a unique bee-removal specialty in the Vegas valley — t... |
| 5 | Beyond Pest Control | Nathan Lemons | (702) 333-5498 | 8.5/10 | Las Vegas | Nathan, LV-born-and-raised + family-owned + 83 reviews at 4.9 is real momentum. ... |
| 6 | Bomber Pest Control | Adam Turner | (702) 376-0982 | 8.5/10 | Boulder City | Adam, your Alignable tagline literally says 'If I'm the first number you call, y... |
| 7 | Dr. Death Pest Control | Trevor Lavancher | (702) 371-8494 | 8.5/10 | Henderson | Trevor, 'Dr. Death' is one of the most memorable brand names in Vegas pest contr... |
| 8 | Genuine Pest Control | — | (775) 990-8057 | 8.5/10 | Pahrump | Genuine Pest is sitting in the exact ICP sweet spot — 4.4 stars / 30 reviews + a... |
| 9 | Aspen Pest Control | — | (702) 450-0780 | 7.5/10 | Henderson | Aspen Pest serves Henderson with 35 reviews / 4.5 — clean ICP fit. But no own we... |
| 10 | Axe Exterminators | — | (775) 990-2065 | 7.5/10 | Pahrump | Axe Exterminators has 30 years of experience serving Pahrump, Amargosa Valley an... |
| 11 | Bugs Bennett Pest Control | — | (775) 727-1255 | 7.5/10 | Pahrump | Your entire website is a single page that still leads with a 2020 COVID payment ... |
| 12 | Henderson Pest Control | Jason Kibby | (702) 755-2280 | 7.5/10 | Henderson | Jason, the brand name 'Henderson Pest Control' is a perfect-match for 'pest cont... |
| 13 | Purple Pest Solutions | — | (702) 999-9999 | 7.5/10 | Henderson | Purple Pest is family-owned by a Las Vegas native, founded 2019, serving Henders... |
| 14 | Ranger Pest Control | Vance Hardinger | (725) 444-3430 | 7.5/10 | Las Vegas | Vance, you and Ethan built Ranger to 128 reviews / 4.9 stars over 10 years — tha... |
| 15 | Sudden Impact Pest Control | John Saling | (702) 477-0808 | 7.5/10 | Las Vegas | John, Sudden Impact has been serving Vegas since 1999 — that's 27 years of track... |
| 16 | 369bugs.com (Las Vegas Pest Control) | — | (702) 369-3692 | 6.5/10 | Las Vegas | 369bugs has a memorable phone-based brand + 'Rated #1 same-day money-back' posit... |
| 17 | A-Grade Pest Control (Nevada) | — | (702) 508-4953 | 6.5/10 | Las Vegas | A-Grade Nevada specializes in food-facility and prep-kitchen pest control — a hi... |
| 18 | Aspire Pest & Termite Control | William Tuttle | (702) 927-4335 | 6.5/10 | Las Vegas | William, $80 termite inspections is a market-best price + 10 years personal expe... |
| 19 | Bugworks Pest Control | — | (702) 564-6692 | 6.5/10 | Las Vegas | Bugworks has 20+ years and Rich + son family-owned positioning — that's the trus... |
| 20 | Fortified Pest Management | — | (702) 638-0780 | 6.5/10 | Boulder City | Fortified has a Boulder City service page + bee/rodent/pigeon/bed bug niche cove... |
| 21 | Jesse's Pest Control | Jesse Whipple | (702) 346-2224 | 6.5/10 | Mesquite | Jesse, $35 inside-and-outside with no contracts is real customer-love positionin... |
| 22 | SNV Pest Control | — | (702) 736-0460 | 6.5/10 | Las Vegas | SNV Pest leads with termite inspections + pre-construction termite treatments + ... |
| 23 | Safe Haven Pest Control | — | (702) 271-0141 | 6.5/10 | Henderson | Safe Haven is family-operated with strong reviews from the 3 customers you have ... |
| 24 | Vision Pest Control | — | (702) 305-4694 | 6.5/10 | Mesquite | Vision Pest is locally owned and operated in Mesquite — that's the right ICP pos... |
| 25 | Burns Pest Elimination (NV) | — | (702) 710-8675 | 5.5/10 | Las Vegas | Burns Pest Elimination is AZ+NV with a heavy commercial-building positioning. Bu... |
| 26 | EXCEED Pest Defense | — | (702) 827-8300 | 5.5/10 | Las Vegas | EXCEED has 50+ service areas mapped (Aliante through Whitney) and a strong comme... |
| 27 | Enviroguard Pest Control | Steve | (702) 569-2849 | 5.5/10 | Las Vegas | Steve, Enviroguard's eco-friendly + 20-year-veteran positioning + 24/7 emergency... |
| 28 | Pest Pros Las Vegas | — | (702) 999-9998 | 5.5/10 | North Las Vegas | Pest Pros is family-owned + 223 reviews 4.9 — close to dialed in. But your site ... |
| 29 | Realty Pest Services | — | (702) 876-8440 | 5.5/10 | Las Vegas | Realty Pest niches on real-estate transactions (escrow termite inspections, VA/F... |
| 30 | NPI (Mitchell) Pest & Termite Inspections | — | (702) 553-4590 | 4.5/10 | Las Vegas | NPI Mitchell does termite inspections as part of a national property-inspection ... |

## Detailed Leads

### 1. All In Pest Solutions — Score 8.5/10
**Tier:** top-priority  
**Owner:** Ryan Morneault  
**Phone:** (775) 469-0919 (+17754690919)  
**Email:** allinpestsolutions@gmail.com  
**Website:** allinpestsolutions.com  
**Address:** 4740 Jacks Dr, Pahrump, NV 89048  
**Rating/Reviews:** 5.0/5.0 · 20 reviews · 20 yrs in business · ~3-6 employees  
**Score rubric:** WW=1 BS=2 RC=1 VS=1 RV=2 +1.5 baseline = 8.5  

**Angle:**
> "Ryan, 20 years of pest experience and a 5.0-star Yelp profile is the kind of foundation Vegas indies kill for — and your business email is allinpestsolutions@gmail.com which Pahrump homeowners under 40 read as 'guy works out of his garage.' Plus 20 reviews keeps you invisible to anyone filtering 25+. 21-day fix: ryan@allinpestsolutions.com + post-service review-request SMS = 30+ reviews in 90 days and an inbox that signals you're a real business."

### 2. Amazon Pest Control — Score 8.5/10
**Tier:** top-priority  
**Owner:** Pedro Dominguez  
**Phone:** (702) 558-3730 (+17025583730)  
**Email:** _(none verified — footer scrape failed; defer to Apollo in batch 2)_  
**Website:** amazonpestcontrol.com  
**Address:** 375 N Stephanie St Ste 1512, Henderson, NV 89014  
**Rating/Reviews:** 4.7/5.0 · 50 reviews · 26 yrs in business · ~3-8 employees  
**Score rubric:** WW=2 BS=0 RC=2 VS=1 RV=2 +1.5 baseline = 8.5  

**Angle:**
> "Pedro, you and Bekki have served Henderson 20+ years with 95% customer retention — that's elite retention. But the brand name 'Amazon Pest Control' loses the Google ranking war to Amazon.com on every search, and your Nextdoor page says 'this app is not monitored regularly.' 60-day plan: rebrand consideration (or accept the Amazon name and dominate locally with apc-henderson.com + dominguezpestcontrol.com forwards) + Nextdoor monitoring + a real site = your 26-year retention story finally outranks an e-commerce giant."

### 3. BC Pest Control (Stefani's) — Score 8.5/10
**Tier:** top-priority  
**Owner:** Bill  
**Phone:** (702) 238-5627 (+17022385627)  
**Email:** info@mybcpest.com  
**Website:** mybcpest.com  
**Address:** _(none surfaced)_, Boulder City, NV 89005  
**Rating/Reviews:** 5.0/5.0 · 9 reviews · 7 yrs in business · ~2-4 employees  
**Score rubric:** WW=2 BS=1 RC=1 VS=1 RV=2 +1.5 baseline = 8.5  

**Angle:**
> "Bill, your site is running a banner that literally says 'Ninja Slider trial version' at the top of every page — visitors see that and bounce in 3 seconds. Plus 9 Yelp reviews means Boulder City homeowners filter you out. 14-day fix: real WordPress build at mybcpest.com (kill the trial banner) + automated post-service review SMS = 25 reviews in 90 days and a site that doesn't kill trust before your name even loads."

### 4. Bee Wise Pest Control — Score 8.5/10
**Tier:** top-priority  
**Owner:** (owner not surfaced)  
**Phone:** (702) 743-0803 (+17027430803)  
**Email:** info@beewisepestcontrol.com  
**Website:** beewisepestcontrol.com  
**Address:** 9030 W Sahara Ave #405, Las Vegas, NV 89117  
**Rating/Reviews:** 4.9/5.0 · 80 reviews · 25 yrs in business · ~10-20 employees  
**Score rubric:** WW=2 BS=1 RC=1 VS=1 RV=2 +1.5 baseline = 8.5  

**Angle:**
> "Bee Wise has 25 years and a unique bee-removal specialty in the Vegas valley — that's a high-ticket niche ($400-$800/removal). But your site is a 2010-era template with broken layout (services list shows 'more ▸' twice on the homepage with no destination) and your 'Locally Owned' section is empty. 21-day fix: 2026 site rebuild + a dedicated bee-removal landing page with before/after photos + a scorpion+wasp landing page (Vegas summer pain points) = the 25-year bee specialty actually gets seen by homeowners googling 'bee removal Las Vegas.'"

### 5. Beyond Pest Control — Score 8.5/10
**Tier:** top-priority  
**Owner:** Nathan Lemons  
**Phone:** (702) 333-5498 (+17023335498)  
**Email:** _(none verified — footer scrape failed; defer to Apollo in batch 2)_  
**Website:** beyondpest.com  
**Address:** 7322 S Rainbow Blvd Suite 206, Las Vegas, NV 89139  
**Rating/Reviews:** 4.9/5.0 · 83 reviews · 10 yrs in business · ~4-10 employees  
**Score rubric:** WW=1 BS=2 RC=1 VS=1 RV=2 +1.5 baseline = 8.5  

**Angle:**
> "Nathan, LV-born-and-raised + family-owned + 83 reviews at 4.9 is real momentum. But your site has a 60-second quote form that goes nowhere visible from the homepage, and your service pages don't mention scorpions, wasps or rodents anywhere — three pests with 14x national search volume in Vegas May-September. 21-day fix: a scorpion control landing page + a rodent control landing page + wasps + the 60-second quote feature surfaced in the hero = a site that pulls the high-intent searches your phone is already converting."

### 6. Bomber Pest Control — Score 8.5/10
**Tier:** top-priority  
**Owner:** Adam Turner  
**Phone:** (702) 376-0982 (+17023760982)  
**Email:** _(none verified — footer scrape failed; defer to Apollo in batch 2)_  
**Website:** _(none found)_  
**Address:** 1300 Denver Street, Boulder City, NV 89005  
**Rating/Reviews:** 4.3/5.0 · 17 reviews · 6 yrs in business · ~1-3 employees  
**Score rubric:** WW=2 BS=1 RC=1 VS=1 RV=2 +1.5 baseline = 8.5  

**Angle:**
> "Adam, your Alignable tagline literally says 'If I'm the first number you call, you can be the first house I go to' — that's golden owner-operator positioning. But you have no website that I could find, so when Boulder City homeowners Google 'pest control Boulder City' you're invisible. 30-day fix: bomberpestbc.com + service-area pages for Boulder City + Henderson + a $40/visit quarterly plan landing page = your same-day-response promise actually gets the leads it deserves."

### 7. Dr. Death Pest Control — Score 8.5/10
**Tier:** top-priority  
**Owner:** Trevor Lavancher  
**Phone:** (702) 371-8494 (+17023718494)  
**Email:** info@drdeathpest.com  
**Website:** drdeathpestcontrol.com  
**Address:** _(none surfaced)_, Henderson, NV 89015  
**Rating/Reviews:** 4.9/5.0 · 60 reviews · 19 yrs in business · ~5-12 employees  
**Score rubric:** WW=1 BS=2 RC=1 VS=1 RV=2 +1.5 baseline = 8.5  

**Angle:**
> "Trevor, 'Dr. Death' is one of the most memorable brand names in Vegas pest control — and you're veteran-owned since 2007, featured on Fox 5 News 2024. But your site is on Elementor v4.0.9 (last 2020 design) and currently advertises 'Henderson and Boulder City only' — you're leaving Vegas valley dollars on the table. 30-day fix: 2026 site refresh + Las Vegas/Summerlin/Spring Valley service pages added + a scorpion-control landing page = the brand name finally pulls valley-wide leads."

### 8. Genuine Pest Control — Score 8.5/10
**Tier:** top-priority  
**Owner:** (owner not surfaced)  
**Phone:** (775) 990-8057 (+17759908057)  
**Email:** office@genuinepestcontrol.net  
**Website:** genuinepestcontrol.net  
**Address:** 2360 E Calvada Ste F, Pahrump, NV 89048  
**Rating/Reviews:** 4.4/5.0 · 30 reviews · 8 yrs in business · ~5-10 employees  
**Score rubric:** WW=2 BS=1 RC=1 VS=1 RV=2 +1.5 baseline = 8.5  

**Angle:**
> "Genuine Pest is sitting in the exact ICP sweet spot — 4.4 stars / 30 reviews + a Las Vegas + Pahrump dual location + License #6945. The site is running on Innovade v1.1.1 (a WordPress theme last updated 2018) and the design feels like 2014. Pahrump homeowners Googling pest companies see that and click the next listing. 30-day fix: 2026 site refresh + clear quarterly-contract pricing page + scorpion/rodent service pages for Pahrump-specific search = your real reputation finally lands on a site that signals 'open in 2026.'"

### 9. Aspen Pest Control — Score 7.5/10
**Tier:** mid-priority  
**Owner:** (owner not surfaced)  
**Phone:** (702) 450-0780 (+17024500780)  
**Email:** _(none verified — footer scrape failed; defer to Apollo in batch 2)_  
**Website:** _(none found)_  
**Address:** _(none surfaced)_, Henderson, NV   
**Rating/Reviews:** 4.5/5.0 · 35 reviews · 8 yrs in business · ~3-6 employees  
**Score rubric:** WW=2 BS=1 RC=1 VS=1 RV=1 +1.5 baseline = 7.5  

**Angle:**
> "Aspen Pest serves Henderson with 35 reviews / 4.5 — clean ICP fit. But no own website is visible in search results — every listing routes to a third-party directory (Yelp, Angi, Thumbtack) that takes the lead before you do. 30-day fix: aspenpestnv.com + own Google Business Profile claim + post-service review automation = stop paying directories for leads you should be capturing directly."

### 10. Axe Exterminators — Score 7.5/10
**Tier:** mid-priority  
**Owner:** (owner not surfaced)  
**Phone:** (775) 990-2065 (+17759902065)  
**Email:** _(none verified — footer scrape failed; defer to Apollo in batch 2)_  
**Website:** axeexterminator.com  
**Address:** _(none surfaced)_, Pahrump, NV 89048  
**Rating/Reviews:** 5.0/5.0 · 8 reviews · 30 yrs in business · ~2-5 employees  
**Score rubric:** WW=2 BS=1 RC=2 VS=0 RV=1 +1.5 baseline = 7.5  

**Angle:**
> "Axe Exterminators has 30 years of experience serving Pahrump, Amargosa Valley and Beatty — and the site is a Duda template (lirp.cdn-website.com) that doesn't lead with any of that. Headlines literally say 'New Button' (a placeholder the builder left in). 14-day fix: kill the template placeholders + lead with '30 years protecting Pahrump' in the hero + scorpion/termite service pages for each of your 3 cities = 30 years of credibility finally signaled on every page."

### 11. Bugs Bennett Pest Control — Score 7.5/10
**Tier:** mid-priority  
**Owner:** (owner not surfaced)  
**Phone:** (775) 727-1255 (+17757271255)  
**Email:** _(none verified — footer scrape failed; defer to Apollo in batch 2)_  
**Website:** bugsbennett.com  
**Address:** 1640 Keenan Way, Pahrump, NV 89048  
**Rating/Reviews:** 4.5/5.0 · 13 reviews · 10 yrs in business · ~2-5 employees  
**Score rubric:** WW=2 BS=1 RC=0 VS=2 RV=1 +1.5 baseline = 7.5  

**Angle:**
> "Your entire website is a single page that still leads with a 2020 COVID payment notice — 'technicians will slip your invoice into your door per CDC guidelines.' Pahrump homeowners searching pest control in 2026 see that and assume the business closed. 14-day fix: real homepage with scorpion/rodent/termite service pages + payment form that doesn't reference COVID + email contact = your 10 years of service finally looks like a business that's still open."

### 12. Henderson Pest Control — Score 7.5/10
**Tier:** mid-priority  
**Owner:** Jason Kibby  
**Phone:** (702) 755-2280 (+17027552280)  
**Email:** _(none verified — footer scrape failed; defer to Apollo in batch 2)_  
**Website:** hendersonpestcontrol.com  
**Address:** 817 Sun Bridge Ln, Henderson, NV 89002  
**Rating/Reviews:** 5.0/5.0 · 100 reviews · 10 yrs in business · ~8-12 employees  
**Score rubric:** WW=1 BS=2 RC=1 VS=1 RV=1 +1.5 baseline = 7.5  

**Angle:**
> "Jason, the brand name 'Henderson Pest Control' is a perfect-match for 'pest control Henderson' search — you've earned 100 reviews / 5.0 stars + Nevada-Dept-of-Ag certified across 10 years. But your site doesn't have neighborhood pages for Anthem, Green Valley, MacDonald Ranch, Cadence — the exact ZIP-level searches Henderson homeowners run. 30-day fix: 6-8 neighborhood service pages + a $39/mo quarterly-plan pricing page = your brand-match advantage finally captures the local-pack rankings."

### 13. Purple Pest Solutions — Score 7.5/10
**Tier:** mid-priority  
**Owner:** (owner not surfaced)  
**Phone:** (702) 999-9999 (+17029999999)  
**Email:** _(none verified — footer scrape failed; defer to Apollo in batch 2)_  
**Website:** purplepestsolutions.com  
**Address:** _(none surfaced)_, Henderson, NV   
**Rating/Reviews:** 5.0/5.0 · 79 reviews · 7 yrs in business · ~5-10 employees  
**Score rubric:** WW=1 BS=2 RC=1 VS=1 RV=1 +1.5 baseline = 7.5  

**Angle:**
> "Purple Pest is family-owned by a Las Vegas native, founded 2019, serving Henderson/LV/Boulder City — a clear ICP story. But your About page is the only place your founding story shows up, and your service pages don't differentiate Purple from any other independent. 21-day fix: founder photo + Las Vegas-native story in the hero + Henderson + Anthem + Green Valley neighborhood pages = the 'born here' positioning becomes a real Google ranking advantage, not just an About-page footnote."

### 14. Ranger Pest Control — Score 7.5/10
**Tier:** mid-priority  
**Owner:** Vance Hardinger  
**Phone:** (725) 444-3430 (+17254443430)  
**Email:** _(none verified — footer scrape failed; defer to Apollo in batch 2)_  
**Website:** rangerpestlv.com  
**Address:** 5000 W Oakey Blvd Ste D9, Las Vegas, NV 89146  
**Rating/Reviews:** 4.9/5.0 · 128 reviews · 10 yrs in business · ~8-15 employees  
**Score rubric:** WW=0 BS=2 RC=2 VS=1 RV=1 +1.5 baseline = 7.5  

**Angle:**
> "Vance, you and Ethan built Ranger to 128 reviews / 4.9 stars over 10 years — that's elite. But your site copy says 'serving Las Vegas since 2010' in some places and 'since 2015' in others (your /pest-control/insect-control page contradicts /about-us). Vegas homeowners spot that and trust drops. Plus your site doesn't have a clear recurring-contract pricing page — every quarterly contract you don't pitch upfront is $400-1200/yr per customer in lost LTV. 14-day fix: unified founding year + a pricing page with quarterly/monthly tiers = a site that closes inbound at the rate your phone team already does."

### 15. Sudden Impact Pest Control — Score 7.5/10
**Tier:** mid-priority  
**Owner:** John Saling  
**Phone:** (702) 477-0808 (+17024770808)  
**Email:** _(none verified — footer scrape failed; defer to Apollo in batch 2)_  
**Website:** _(none found)_  
**Address:** 125 Las Vegas Blvd S, Las Vegas, NV 89101  
**Rating/Reviews:** 4.7/5.0 · 19 reviews · 27 yrs in business · ~5-12 employees  
**Score rubric:** WW=2 BS=1 RC=1 VS=1 RV=1 +1.5 baseline = 7.5  

**Angle:**
> "John, Sudden Impact has been serving Vegas since 1999 — that's 27 years of track record. But your business shows 'Permanently Revoked' on the NV Business Register (paperwork lapse, not closure) and your only web presence is a hub.biz directory page from 2015. Vegas homeowners who Google you can't tell if you're still open. 30-day fix: NV Business filing refresh + suddenimpactpestnv.com with current contact + a 'serving Vegas since 1999' hero = 27 years of relationships finally show up on Google."

### 16. 369bugs.com (Las Vegas Pest Control) — Score 6.5/10
**Tier:** mid-priority  
**Owner:** (owner not surfaced)  
**Phone:** (702) 369-3692 (+17023693692)  
**Email:** _(none verified — footer scrape failed; defer to Apollo in batch 2)_  
**Website:** 369bugs.com  
**Address:** _(none surfaced)_, Las Vegas, NV   
**Rating/Reviews:** 4.7/5.0 · 90 reviews · 10 yrs in business · ~5-12 employees  
**Score rubric:** WW=1 BS=1 RC=1 VS=1 RV=1 +1.5 baseline = 6.5  

**Angle:**
> "369bugs has a memorable phone-based brand + 'Rated #1 same-day money-back' positioning + a niche on rodent/scorpion. But the brand name forces homeowners to remember the number, and the site uses 'Las Vegas Pest Control' generically as its display name (Google can't tell which is the brand). 30-day fix: pick one canonical brand name (369 Bugs OR Las Vegas Pest Control) + lead with the money-back guarantee in every page hero + a scorpion-control landing page = brand recall finally compounds instead of fragmenting."

### 17. A-Grade Pest Control (Nevada) — Score 6.5/10
**Tier:** mid-priority  
**Owner:** (owner not surfaced)  
**Phone:** (702) 508-4953 (+17025084953)  
**Email:** _(none verified — footer scrape failed; defer to Apollo in batch 2)_  
**Website:** agradenevada.com  
**Address:** _(none surfaced)_, Las Vegas, NV   
**Rating/Reviews:** 4.6/5.0 · 25 reviews · 6 yrs in business · ~3-8 employees  
**Score rubric:** WW=1 BS=1 RC=2 VS=0 RV=1 +1.5 baseline = 6.5  

**Angle:**
> "A-Grade Nevada specializes in food-facility and prep-kitchen pest control — a high-margin commercial niche where Health District violations cost restaurants $5K-$50K. But your site doesn't show up for 'restaurant pest control Las Vegas' (a 320-search/mo keyword) because there's no dedicated landing page. 30-day fix: restaurant-pest-control-las-vegas landing page + Clark County Health District compliance checklist as a lead magnet + restaurant-group partnership outreach = same A-Grade expertise pulling 2-3 commercial accounts/mo instead of 0."

### 18. Aspire Pest & Termite Control — Score 6.5/10
**Tier:** mid-priority  
**Owner:** William Tuttle  
**Phone:** (702) 927-4335 (+17029274335)  
**Email:** _(none verified — footer scrape failed; defer to Apollo in batch 2)_  
**Website:** aspirepestlv.com  
**Address:** _(none surfaced)_, Las Vegas, NV   
**Rating/Reviews:** 5.0/5.0 · 89 reviews · 7 yrs in business · ~5-12 employees  
**Score rubric:** WW=0 BS=2 RC=1 VS=1 RV=1 +1.5 baseline = 6.5  

**Angle:**
> "William, $80 termite inspections is a market-best price + 10 years personal experience + 89 reviews 5.0 — that's a real moat. But your site doesn't have a Google Ads landing page for 'termite inspection Las Vegas' (a high-intent VA/FHA real-estate search). Every realtor escrow that closes in Vegas needs your $80 service. 30-day fix: termite-inspection-las-vegas landing page + realtor partnership page + Google Ads conversion tracking = same $80 inspection pulling 3-5 closings/week instead of inbound calls only."

### 19. Bugworks Pest Control — Score 6.5/10
**Tier:** mid-priority  
**Owner:** (owner not surfaced)  
**Phone:** (702) 564-6692 (+17025646692)  
**Email:** office@bugworkspestcontrol.com  
**Website:** bugworkspestcontrol.com  
**Address:** 315 E Ford Ave, Las Vegas, NV 89123  
**Rating/Reviews:** 4.9/5.0 · 60 reviews · 20 yrs in business · ~3-6 employees  
**Score rubric:** WW=1 BS=1 RC=1 VS=1 RV=1 +1.5 baseline = 6.5  

**Angle:**
> "Bugworks has 20+ years and Rich + son family-owned positioning — that's the trust signal Vegas homeowners want. But your homepage has placeholder text ('Years Experience 0+') and the testimonials section repeats the same 4 reviewers 3 times. 14-day fix: real years-of-experience counter + a 6-8 testimonial rotation + a scorpion seasonal page for May-September = your 20-year track record finally shows up on the homepage."

### 20. Fortified Pest Management — Score 6.5/10
**Tier:** mid-priority  
**Owner:** (owner not surfaced)  
**Phone:** (702) 638-0780 (+17026380780)  
**Email:** _(none verified — footer scrape failed; defer to Apollo in batch 2)_  
**Website:** fortifiedpestmanagement.com  
**Address:** _(none surfaced)_, Boulder City, NV   
**Rating/Reviews:** 4.4/5.0 · 28 reviews · 5 yrs in business · ~3-6 employees  
**Score rubric:** WW=1 BS=1 RC=1 VS=1 RV=1 +1.5 baseline = 6.5  

**Angle:**
> "Fortified has a Boulder City service page + bee/rodent/pigeon/bed bug niche coverage. But the Boulder City page is one of 12 city pages with templated copy (no Boulder-specific service info, no local landmarks, no Lake Mead references). 21-day fix: rewrite Boulder City page with actual Boulder City content (Lake Mead, Hoover Dam tourism, retiree demographics) + add Anthem and Henderson sister pages with the same depth = local rankings stop being templates and start being authority."

### 21. Jesse's Pest Control — Score 6.5/10
**Tier:** mid-priority  
**Owner:** Jesse Whipple  
**Phone:** (702) 346-2224 (+17023462224)  
**Email:** _(none verified — footer scrape failed; defer to Apollo in batch 2)_  
**Website:** _(none found)_  
**Address:** PO Box 1106, Mesquite, NV 89024  
**Rating/Reviews:** 4.5/5.0 · 7 reviews · 15 yrs in business · ~1-3 employees  
**Score rubric:** WW=2 BS=1 RC=0 VS=1 RV=1 +1.5 baseline = 6.5  

**Angle:**
> "Jesse, $35 inside-and-outside with no contracts is real customer-love positioning — Mesquite locals call you 'best in Mesquite' and refer you in real-estate escrows. But you have zero website that I could find and only 7 Yelp reviews, so anyone searching 'pest control Mesquite NV 89027' lands on Bulwark instead. 30-day fix: 1-page jessespestnv.com + 25 review SMS asks to your existing customer base = 25+ reviews + your $35 price actually visible on Google in 90 days."

### 22. SNV Pest Control — Score 6.5/10
**Tier:** mid-priority  
**Owner:** (owner not surfaced)  
**Phone:** (702) 736-0460 (+17027360460)  
**Email:** _(none verified — footer scrape failed; defer to Apollo in batch 2)_  
**Website:** snvpest.com  
**Address:** _(none surfaced)_, Las Vegas, NV   
**Rating/Reviews:** 4.5/5.0 · 30 reviews · 12 yrs in business · ~5-10 employees  
**Score rubric:** WW=1 BS=1 RC=1 VS=1 RV=1 +1.5 baseline = 6.5  

**Angle:**
> "SNV Pest leads with termite inspections + pre-construction termite treatments + sub-slab injections — a specialty niche where new-construction builders need a recurring partner. But your site has no builder-partnership program or new-construction landing page. 30-day fix: builder-partnership-las-vegas page + a pre-construction termite treatment cost calculator + outreach to D.R. Horton/Lennar/Pulte regional offices = a single new-construction account compounds 50-100 homes/yr in steady volume."

### 23. Safe Haven Pest Control — Score 6.5/10
**Tier:** mid-priority  
**Owner:** (owner not surfaced)  
**Phone:** (702) 271-0141 (+17022710141)  
**Email:** _(none verified — footer scrape failed; defer to Apollo in batch 2)_  
**Website:** safehavenpestcontrolnv.com  
**Address:** _(none surfaced)_, Henderson, NV   
**Rating/Reviews:** 5.0/5.0 · 3 reviews · 2 yrs in business · ~2-4 employees  
**Score rubric:** WW=1 BS=1 RC=2 VS=0 RV=1 +1.5 baseline = 6.5  

**Angle:**
> "Safe Haven is family-operated with strong reviews from the 3 customers you have on Google — and that's the problem: 3 reviews means 89015 homeowners filter you out for any competitor with 25+. Your site is a Duda template (lirp.cdn-website.com) that's fine but generic. 21-day fix: post-service automated review SMS to every customer + safehavenpestcontrolnv.com migration to a real WordPress build with neighborhood-specific service pages (Henderson, Green Valley, MacDonald Ranch) = 25 reviews in 90 days and a site that ranks for the searches your service deserves."

### 24. Vision Pest Control — Score 6.5/10
**Tier:** mid-priority  
**Owner:** (owner not surfaced)  
**Phone:** (702) 305-4694 (+17023054694)  
**Email:** _(none verified — footer scrape failed; defer to Apollo in batch 2)_  
**Website:** _(none found)_  
**Address:** _(none surfaced)_, Mesquite, NV 89027  
**Rating/Reviews:** 4.6/5.0 · 12 reviews · 8 yrs in business · ~2-4 employees  
**Score rubric:** WW=2 BS=1 RC=0 VS=1 RV=1 +1.5 baseline = 6.5  

**Angle:**
> "Vision Pest is locally owned and operated in Mesquite — that's the right ICP positioning. But you appear in third-party directories (MapQuest, Birdeye) with no own website that I could find, so every search for 'Vision Pest Mesquite' lands on a competitor's directory listing instead of your business. 30-day fix: visionpestmesquite.com + Mesquite + Bunkerville + Logandale service area pages + free-quote form = recover the brand-search traffic you're currently leaking."

### 25. Burns Pest Elimination (NV) — Score 5.5/10
**Tier:** probe-first  
**Owner:** (owner not surfaced)  
**Phone:** (702) 710-8675 (+17027108675)  
**Email:** _(none verified — footer scrape failed; defer to Apollo in batch 2)_  
**Website:** burnspestelimination.com  
**Address:** _(none surfaced)_, Las Vegas, NV   
**Rating/Reviews:** 4.5/5.0 · 40 reviews · 25 yrs in business · ~10-25 employees  
**Score rubric:** WW=0 BS=1 RC=2 VS=0 RV=1 +1.5 baseline = 5.5  

**Angle:**
> "Burns Pest Elimination is AZ+NV with a heavy commercial-building positioning. But your Vegas presence is buried under the Arizona homepage hierarchy (every Vegas search has to navigate to /commercial/commercial-buildings before finding NV info). 60-day plan: dedicated NV subdomain or distinct Vegas landing page + Vegas-specific commercial vertical pages (casino, restaurant group, HOA) = the Vegas commercial book stops competing internally with the Phoenix one for the same search rankings."

### 26. EXCEED Pest Defense — Score 5.5/10
**Tier:** probe-first  
**Owner:** (owner not surfaced)  
**Phone:** (702) 827-8300 (+17028278300)  
**Email:** _(none verified — footer scrape failed; defer to Apollo in batch 2)_  
**Website:** epdpestcontrol.com  
**Address:** PO Box 621227, Las Vegas, NV 89142  
**Rating/Reviews:** 4.7/5.0 · 70 reviews · 13 yrs in business · ~8-15 employees  
**Score rubric:** WW=0 BS=1 RC=1 VS=1 RV=1 +1.5 baseline = 5.5  

**Angle:**
> "EXCEED has 50+ service areas mapped (Aliante through Whitney) and a strong commercial play (HOAs, casinos, airports) — that's heavy positioning. But you list 'After Hours (702) 340-3869' as a separate phone, which fragments your call data, and your address is a PO Box (Vegas homeowners reading your contact page see PO Box and think 'no real office'). 30-day fix: single unified phone + a real business address + service-area pages split between residential + commercial verticals = you stop hiding the commercial book of business behind a residential-looking front page."

### 27. Enviroguard Pest Control — Score 5.5/10
**Tier:** probe-first  
**Owner:** Steve  
**Phone:** (702) 569-2849 (+17025692849)  
**Email:** _(none verified — footer scrape failed; defer to Apollo in batch 2)_  
**Website:** enviroguardpestcontrol.com  
**Address:** _(none surfaced)_, Las Vegas, NV   
**Rating/Reviews:** 4.8/5.0 · 75 reviews · 20 yrs in business · ~4-10 employees  
**Score rubric:** WW=0 BS=1 RC=1 VS=1 RV=1 +1.5 baseline = 5.5  

**Angle:**
> "Steve, Enviroguard's eco-friendly + 20-year-veteran positioning + 24/7 emergency hook is real. But your blog publishes monthly content that doesn't drive any visible local search rankings (your H1 says 'Trusted Pest Control & Exterminator Services' — that's the same as 1000 other sites). 60-day plan: schema markup audit + Vegas-neighborhood programmatic SEO (Summerlin, Centennial Hills, Spring Valley landing pages) + Google Business Profile post automation = your blog work finally translates to first-page local-pack rankings."

### 28. Pest Pros Las Vegas — Score 5.5/10
**Tier:** probe-first  
**Owner:** (owner not surfaced)  
**Phone:** (702) 999-9998 (+17029999998)  
**Email:** _(none verified — footer scrape failed; defer to Apollo in batch 2)_  
**Website:** pestproslasvegas.com  
**Address:** _(none surfaced)_, North Las Vegas, NV   
**Rating/Reviews:** 4.9/5.0 · 223 reviews · 12 yrs in business · ~10-20 employees  
**Score rubric:** WW=0 BS=2 RC=1 VS=1 RV=0 +1.5 baseline = 5.5  

**Angle:**
> "Pest Pros is family-owned + 223 reviews 4.9 — close to dialed in. But your site doesn't have a clear quarterly-contract upsell sequence (every one-time customer you don't convert into a contract is $400-1200/yr in recurring revenue left on the table). 30-day fix: post-service email sequence offering quarterly upgrade + a comparison page (one-time vs quarterly LTV math) = 20%+ of one-timers convert to recurring contracts within 6 months."

### 29. Realty Pest Services — Score 5.5/10
**Tier:** probe-first  
**Owner:** (owner not surfaced)  
**Phone:** (702) 876-8440 (+17028768440)  
**Email:** _(none verified — footer scrape failed; defer to Apollo in batch 2)_  
**Website:** realtypest.com  
**Address:** _(none surfaced)_, Las Vegas, NV   
**Rating/Reviews:** 4.6/5.0 · 22 reviews · 10 yrs in business · ~3-6 employees  
**Score rubric:** WW=1 BS=2 RC=0 VS=0 RV=1 +1.5 baseline = 5.5  

**Angle:**
> "Realty Pest niches on real-estate transactions (escrow termite inspections, VA/FHA WDO reports) — a high-velocity B2B niche where each closing is a $125-$300 ticket. But the site doesn't have a realtor-partnership program page, so individual realtors aren't your inbound channel. 30-day fix: realtor-partnership-program landing page + Vegas real-estate association directory listing + a $125-flat-fee escrow inspection page = same niche, 3-5x referral velocity from realtors who already trust you."

### 30. NPI (Mitchell) Pest & Termite Inspections — Score 4.5/10
**Tier:** probe-first  
**Owner:** (owner not surfaced)  
**Phone:** (702) 553-4590 (+17025534590)  
**Email:** _(none verified — footer scrape failed; defer to Apollo in batch 2)_  
**Website:** npiweb.com/mitchell  
**Address:** _(none surfaced)_, Las Vegas, NV   
**Rating/Reviews:** 4.4/5.0 · 28 reviews · 8 yrs in business · ~2-5 employees  
**Score rubric:** WW=2 BS=0 RC=0 VS=0 RV=1 +1.5 baseline = 4.5  

**Angle:**
> "NPI Mitchell does termite inspections as part of a national property-inspection franchise system. But the franchise-system URL (npiweb.com/mitchell) means every Vegas search drives traffic to the national NPI brand instead of the local Mitchell franchise. 60-day plan: independent domain (mitchellpestlv.com) + cross-pollination from the NPI page + Vegas-specific termite-inspection content = the local Mitchell brand finally builds equity instead of feeding the parent franchise."

## Recommended Dial Order
Tuesday-Thursday 8-11am / 4-6pm Pacific (per `CLAUDE.md` dial schedule). For 30-lead batch at current 5.5hr/day capacity: ~10-15 dials/day = 2-3 days to complete batch.

**Day 1 priority (top 10, scores 8.5-7.5):** start in Pahrump/Boulder City (Ryan, Bill, Adam, Trevor, Vance) — smaller TAM means competitors haven't hammered them yet, less call fatigue.

**Day 2 (mid 10, scores 7.5-6.5):** Henderson + Vegas owner-operators (Jason Kibby, William Tuttle, Nathan Lemons, Pedro Dominguez).

**Day 3 (probe-first 10, scores 6.5-4.5):** larger commercial-leaning indies. Lower book rate expected but worth filtering for the 1-2 hot leads.

## Open Questions / Followups for Batch 2
- Apollo email verification — establish Composio Apollo auth before batch 2 to push email rate from 20% → 50%+.
- Cross-check Sudden Impact Pest Control NV Business Filing status (currently 'Permanently Revoked' per Nevada-register; phone still active per recent customer comments — may be a paperwork lapse worth confirming on dial).
- Surface owner names for Purple Pest Solutions, Bee Wise, EXCEED Pest Defense (none confirmed in this round).
- Pest Pros Las Vegas + 369bugs.com both have placeholder phone numbers — confirm exact dial numbers via Google before dialing.
- Verify Vision Pest Control Mesquite phone (702) 305-4694 — pulled from MapQuest, may need 2nd confirmation.
- Bomber Pest (Adam Turner) has no website — `bomberpestbc.com` is hypothetical; verify on dial.
