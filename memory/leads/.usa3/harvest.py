#!/usr/bin/env python3
# Wide SERP harvest: snack_pack + organic across a big Sunbelt/pool-belt city map,
# multiple query variants per city. No per-lead agents.
import subprocess, json, re, os, sys
from concurrent.futures import ThreadPoolExecutor, as_completed

OUT = os.path.join(os.path.dirname(__file__), "candidates.jsonl")

CITIES = {
 # --- Arizona ---
 "Phoenix AZ":"Phoenix AZ","Mesa AZ":"Phoenix AZ","Chandler AZ":"Phoenix AZ","Gilbert AZ":"Phoenix AZ",
 "Glendale AZ":"Phoenix AZ","Peoria AZ":"Phoenix AZ","Surprise AZ":"Phoenix AZ","Scottsdale AZ":"Phoenix AZ",
 "Tempe AZ":"Phoenix AZ","Goodyear AZ":"Phoenix AZ","Avondale AZ":"Phoenix AZ","Buckeye AZ":"Phoenix AZ",
 "Queen Creek AZ":"Phoenix AZ","Maricopa AZ":"Phoenix AZ","Casa Grande AZ":"Phoenix AZ",
 "Tucson AZ":"Tucson AZ","Oro Valley AZ":"Tucson AZ","Marana AZ":"Tucson AZ","Yuma AZ":"Yuma AZ",
 "Prescott AZ":"Prescott AZ","Lake Havasu City AZ":"Lake Havasu AZ",
 # --- Texas: DFW ---
 "Dallas TX":"Dallas-Fort Worth TX","Fort Worth TX":"Dallas-Fort Worth TX","Plano TX":"Dallas-Fort Worth TX",
 "Frisco TX":"Dallas-Fort Worth TX","McKinney TX":"Dallas-Fort Worth TX","Arlington TX":"Dallas-Fort Worth TX",
 "Denton TX":"Dallas-Fort Worth TX","Mesquite TX":"Dallas-Fort Worth TX","Garland TX":"Dallas-Fort Worth TX",
 "Rockwall TX":"Dallas-Fort Worth TX","Allen TX":"Dallas-Fort Worth TX","Prosper TX":"Dallas-Fort Worth TX",
 "Grapevine TX":"Dallas-Fort Worth TX","Mansfield TX":"Dallas-Fort Worth TX","Flower Mound TX":"Dallas-Fort Worth TX",
 # --- Texas: Houston ---
 "Houston TX":"Houston TX","Katy TX":"Houston TX","Sugar Land TX":"Houston TX","Spring TX":"Houston TX",
 "Cypress TX":"Houston TX","Pearland TX":"Houston TX","Conroe TX":"Houston TX","Humble TX":"Houston TX",
 "League City TX":"Houston TX","Richmond TX":"Houston TX","Tomball TX":"Houston TX","Friendswood TX":"Houston TX",
 # --- Texas: Austin / SA / other ---
 "Austin TX":"Austin TX","Round Rock TX":"Austin TX","Cedar Park TX":"Austin TX","Georgetown TX":"Austin TX",
 "Pflugerville TX":"Austin TX","San Marcos TX":"Austin TX","Leander TX":"Austin TX","Kyle TX":"Austin TX",
 "San Antonio TX":"San Antonio TX","New Braunfels TX":"San Antonio TX","Schertz TX":"San Antonio TX",
 "Boerne TX":"San Antonio TX","Cibolo TX":"San Antonio TX",
 "El Paso TX":"El Paso TX","Corpus Christi TX":"Corpus Christi TX","Lubbock TX":"Lubbock TX",
 "Waco TX":"Waco TX","Killeen TX":"Killeen TX","Midland TX":"Midland-Odessa TX","Odessa TX":"Midland-Odessa TX",
 "McAllen TX":"Rio Grande Valley TX","Brownsville TX":"Rio Grande Valley TX","Laredo TX":"Laredo TX",
 # --- Florida ---
 "Tampa FL":"Tampa FL","Brandon FL":"Tampa FL","Riverview FL":"Tampa FL","Wesley Chapel FL":"Tampa FL",
 "Lutz FL":"Tampa FL","Clearwater FL":"Tampa FL","St Petersburg FL":"Tampa FL","Palm Harbor FL":"Tampa FL",
 "Orlando FL":"Orlando FL","Kissimmee FL":"Orlando FL","Winter Garden FL":"Orlando FL","Sanford FL":"Orlando FL",
 "Clermont FL":"Orlando FL","Oviedo FL":"Orlando FL","Apopka FL":"Orlando FL","Winter Park FL":"Orlando FL",
 "Jacksonville FL":"Jacksonville FL","Orange Park FL":"Jacksonville FL","St Augustine FL":"Jacksonville FL",
 "Miami FL":"Miami / South FL","Hialeah FL":"Miami / South FL","Fort Lauderdale FL":"Miami / South FL",
 "Hollywood FL":"Miami / South FL","Pembroke Pines FL":"Miami / South FL","Boca Raton FL":"Miami / South FL",
 "West Palm Beach FL":"Miami / South FL","Pompano Beach FL":"Miami / South FL","Coral Springs FL":"Miami / South FL",
 "Miramar FL":"Miami / South FL","Delray Beach FL":"Miami / South FL","Jupiter FL":"Miami / South FL",
 "Cape Coral FL":"Fort Myers / Naples FL","Fort Myers FL":"Fort Myers / Naples FL","Naples FL":"Fort Myers / Naples FL",
 "Bonita Springs FL":"Fort Myers / Naples FL","Estero FL":"Fort Myers / Naples FL",
 "Sarasota FL":"Sarasota FL","Bradenton FL":"Sarasota FL","Venice FL":"Sarasota FL","Port Charlotte FL":"Sarasota FL",
 "Ocala FL":"Ocala FL","Gainesville FL":"Gainesville FL","Lakeland FL":"Lakeland FL","Melbourne FL":"Space Coast FL",
 "Palm Bay FL":"Space Coast FL","Port St Lucie FL":"Treasure Coast FL","Vero Beach FL":"Treasure Coast FL",
 "Daytona Beach FL":"Daytona FL","Pensacola FL":"Pensacola FL","Tallahassee FL":"Tallahassee FL",
 # --- California ---
 "Sacramento CA":"Sacramento CA","Roseville CA":"Sacramento CA","Elk Grove CA":"Sacramento CA",
 "Folsom CA":"Sacramento CA","Citrus Heights CA":"Sacramento CA","Rocklin CA":"Sacramento CA",
 "Fresno CA":"Fresno CA","Clovis CA":"Fresno CA","Visalia CA":"Fresno CA","Madera CA":"Fresno CA",
 "Bakersfield CA":"Bakersfield CA","Modesto CA":"Modesto CA","Stockton CA":"Stockton CA","Merced CA":"Merced CA",
 "Riverside CA":"Riverside / IE","San Bernardino CA":"Riverside / IE","Fontana CA":"Riverside / IE",
 "Rancho Cucamonga CA":"Riverside / IE","Ontario CA":"Riverside / IE","Corona CA":"Riverside / IE",
 "Temecula CA":"Riverside / IE","Moreno Valley CA":"Riverside / IE","Murrieta CA":"Riverside / IE",
 "San Diego CA":"San Diego CA","Chula Vista CA":"San Diego CA","Escondido CA":"San Diego CA",
 "Oceanside CA":"San Diego CA","Carlsbad CA":"San Diego CA","El Cajon CA":"San Diego CA","Vista CA":"San Diego CA",
 "Palm Springs CA":"Coachella Valley CA","Palm Desert CA":"Coachella Valley CA","Indio CA":"Coachella Valley CA",
 # --- Nevada (non-LV) ---
 "Reno NV":"Reno NV","Sparks NV":"Reno NV","Carson City NV":"Reno NV",
 # --- Carolinas / GA / TN / other Sunbelt ---
 "Charlotte NC":"Charlotte NC","Concord NC":"Charlotte NC","Gastonia NC":"Charlotte NC",
 "Huntersville NC":"Charlotte NC","Raleigh NC":"Raleigh NC","Durham NC":"Raleigh NC","Cary NC":"Raleigh NC",
 "Wilmington NC":"Wilmington NC","Greensboro NC":"Greensboro NC",
 "Columbia SC":"Columbia SC","Charleston SC":"Charleston SC","Greenville SC":"Greenville SC","Myrtle Beach SC":"Myrtle Beach SC",
 "Atlanta GA":"Atlanta GA","Marietta GA":"Atlanta GA","Alpharetta GA":"Atlanta GA","Roswell GA":"Atlanta GA",
 "Duluth GA":"Atlanta GA","Kennesaw GA":"Atlanta GA","Lawrenceville GA":"Atlanta GA","Savannah GA":"Savannah GA",
 "Augusta GA":"Augusta GA","Columbus GA":"Columbus GA",
 "Nashville TN":"Nashville TN","Franklin TN":"Nashville TN","Murfreesboro TN":"Nashville TN","Memphis TN":"Memphis TN",
 "Knoxville TN":"Knoxville TN","Chattanooga TN":"Chattanooga TN",
 "New Orleans LA":"New Orleans / Baton Rouge LA","Metairie LA":"New Orleans / Baton Rouge LA",
 "Baton Rouge LA":"New Orleans / Baton Rouge LA","Lafayette LA":"Lafayette LA",
 "Oklahoma City OK":"Oklahoma","Tulsa OK":"Oklahoma","Norman OK":"Oklahoma",
 "Birmingham AL":"Birmingham AL","Huntsville AL":"Huntsville AL","Mobile AL":"Mobile AL","Montgomery AL":"Montgomery AL",
 "Little Rock AR":"Little Rock AR","Jackson MS":"Jackson MS",
 # --- Denver / mountain / other ---
 "Denver CO":"Denver CO","Aurora CO":"Denver CO","Centennial CO":"Denver CO","Colorado Springs CO":"Colorado Springs CO",
 "Henderson NV":"Las Vegas NV",
}

DIRECTORY = re.compile(r'(yelp|angi|angieslist|thumbtack|homeadvisor|bbb\.org|mapquest|facebook|yellowpages|'
  r'nextdoor|houzz|porch|expertise|threebestrated|birdeye|manta|chamberofcommerce|indeed|ziprecruiter|'
  r'google\.com|bing\.com|reddit|youtube|tripadvisor|wikipedia|instagram|linkedin|glassdoor|'
  r'poolcorp|pinchapenny|leslies|clark|nerdwallet|forbes|apartments|zillow|realtor|amazon|ebay|'
  r'\.gov|\.edu|craigslist|justdial|superpages|citysearch|foursquare)', re.I)

VARIANTS = ["pool service", "pool cleaning", "pool maintenance", "swimming pool repair"]

def run_query(city, metro, phrase):
    q = f"{phrase} {city}"
    try:
        p = subprocess.run(["bdata","search",q,"--zone","mcp_unlocker","--json"],
                           capture_output=True, text=True, timeout=120)
        raw = p.stdout
        i = raw.find('{')
        if i < 0: return []
        d = json.loads(raw[i:])
    except Exception as e:
        sys.stderr.write(f"[fail] {q}: {e}\n"); return []
    out = []
    for b in d.get("snack_pack",[]) or []:
        out.append({"name":b.get("name"),"website":b.get("site"),"city":city,"metro":metro,
                    "src":"snack","maps":b.get("maps_link")})
    for o in d.get("organic",[]) or []:
        link = o.get("link") or ""
        if not link or DIRECTORY.search(link): continue
        out.append({"name":o.get("title"),"website":link,"city":city,"metro":metro,"src":"organic","maps":None})
    return out

def main():
    jobs = [(c,m,v) for c,m in CITIES.items() for v in VARIANTS]
    allc = []
    with ThreadPoolExecutor(max_workers=12) as ex:
        futs = {ex.submit(run_query,c,m,v):(c,v) for c,m,v in jobs}
        done = 0
        for f in as_completed(futs):
            done += 1
            r = f.result()
            allc.extend(r)
            if done % 50 == 0 or done == len(jobs):
                print(f"[{done}/{len(jobs)}] total={len(allc)}", flush=True)
    with open(OUT,"w") as fh:
        for c in allc: fh.write(json.dumps(c)+"\n")
    print("RAW CANDIDATES:", len(allc), "->", OUT)
    print("cities:", len(CITIES), "| queries:", len(jobs))

if __name__ == "__main__": main()
