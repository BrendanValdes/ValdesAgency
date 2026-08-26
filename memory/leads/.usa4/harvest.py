#!/usr/bin/env python3
# POOL USA 4 — wide SERP harvest: snack_pack + organic across an expanded pool-belt
# city map (USA3 metros retained for recall + new LA/OC, inland Bay, secondary
# warm-belt metros). Multiple query variants per city. No per-lead agents.
import subprocess, json, re, os, sys
from concurrent.futures import ThreadPoolExecutor, as_completed

OUT = os.path.join(os.path.dirname(__file__), "candidates.jsonl")

CITIES = {
 # --- Arizona ---
 "Phoenix AZ":"Phoenix AZ","Mesa AZ":"Phoenix AZ","Chandler AZ":"Phoenix AZ","Gilbert AZ":"Phoenix AZ",
 "Glendale AZ":"Phoenix AZ","Peoria AZ":"Phoenix AZ","Surprise AZ":"Phoenix AZ","Scottsdale AZ":"Phoenix AZ",
 "Tempe AZ":"Phoenix AZ","Goodyear AZ":"Phoenix AZ","Avondale AZ":"Phoenix AZ","Buckeye AZ":"Phoenix AZ",
 "Queen Creek AZ":"Phoenix AZ","Maricopa AZ":"Phoenix AZ","Casa Grande AZ":"Phoenix AZ",
 "San Tan Valley AZ":"Phoenix AZ","Apache Junction AZ":"Phoenix AZ","Fountain Hills AZ":"Phoenix AZ",
 "Tucson AZ":"Tucson AZ","Oro Valley AZ":"Tucson AZ","Marana AZ":"Tucson AZ","Yuma AZ":"Yuma AZ",
 "Prescott AZ":"Prescott AZ","Lake Havasu City AZ":"Lake Havasu AZ",
 # --- Texas: DFW ---
 "Dallas TX":"Dallas-Fort Worth TX","Fort Worth TX":"Dallas-Fort Worth TX","Plano TX":"Dallas-Fort Worth TX",
 "Frisco TX":"Dallas-Fort Worth TX","McKinney TX":"Dallas-Fort Worth TX","Arlington TX":"Dallas-Fort Worth TX",
 "Denton TX":"Dallas-Fort Worth TX","Mesquite TX":"Dallas-Fort Worth TX","Garland TX":"Dallas-Fort Worth TX",
 "Rockwall TX":"Dallas-Fort Worth TX","Allen TX":"Dallas-Fort Worth TX","Prosper TX":"Dallas-Fort Worth TX",
 "Grapevine TX":"Dallas-Fort Worth TX","Mansfield TX":"Dallas-Fort Worth TX","Flower Mound TX":"Dallas-Fort Worth TX",
 "Wylie TX":"Dallas-Fort Worth TX","Little Elm TX":"Dallas-Fort Worth TX","Keller TX":"Dallas-Fort Worth TX",
 # --- Texas: Houston ---
 "Houston TX":"Houston TX","Katy TX":"Houston TX","Sugar Land TX":"Houston TX","Spring TX":"Houston TX",
 "Cypress TX":"Houston TX","Pearland TX":"Houston TX","Conroe TX":"Houston TX","Humble TX":"Houston TX",
 "League City TX":"Houston TX","Richmond TX":"Houston TX","Tomball TX":"Houston TX","Friendswood TX":"Houston TX",
 "Missouri City TX":"Houston TX","Kingwood TX":"Houston TX","The Woodlands TX":"Houston TX","Rosenberg TX":"Houston TX",
 # --- Texas: Austin / SA / other ---
 "Austin TX":"Austin TX","Round Rock TX":"Austin TX","Cedar Park TX":"Austin TX","Georgetown TX":"Austin TX",
 "Pflugerville TX":"Austin TX","San Marcos TX":"Austin TX","Leander TX":"Austin TX","Kyle TX":"Austin TX",
 "Buda TX":"Austin TX","Dripping Springs TX":"Austin TX",
 "San Antonio TX":"San Antonio TX","New Braunfels TX":"San Antonio TX","Schertz TX":"San Antonio TX",
 "Boerne TX":"San Antonio TX","Cibolo TX":"San Antonio TX","Converse TX":"San Antonio TX",
 "El Paso TX":"El Paso TX","Corpus Christi TX":"Corpus Christi TX","Lubbock TX":"Lubbock TX",
 "Waco TX":"Waco TX","Killeen TX":"Killeen TX","Temple TX":"Killeen TX","Midland TX":"Midland-Odessa TX","Odessa TX":"Midland-Odessa TX",
 "McAllen TX":"Rio Grande Valley TX","Brownsville TX":"Rio Grande Valley TX","Laredo TX":"Laredo TX",
 "Tyler TX":"Tyler TX","Longview TX":"Tyler TX","Beaumont TX":"Beaumont TX","College Station TX":"College Station TX",
 "Bryan TX":"College Station TX","Abilene TX":"Abilene TX","San Angelo TX":"San Angelo TX","Amarillo TX":"Amarillo TX",
 "Galveston TX":"Houston TX","Victoria TX":"Victoria TX",
 # --- Florida ---
 "Tampa FL":"Tampa FL","Brandon FL":"Tampa FL","Riverview FL":"Tampa FL","Wesley Chapel FL":"Tampa FL",
 "Lutz FL":"Tampa FL","Clearwater FL":"Tampa FL","St Petersburg FL":"Tampa FL","Palm Harbor FL":"Tampa FL",
 "Plant City FL":"Tampa FL","Spring Hill FL":"Tampa FL","New Port Richey FL":"Tampa FL","Land O Lakes FL":"Tampa FL",
 "Orlando FL":"Orlando FL","Kissimmee FL":"Orlando FL","Winter Garden FL":"Orlando FL","Sanford FL":"Orlando FL",
 "Clermont FL":"Orlando FL","Oviedo FL":"Orlando FL","Apopka FL":"Orlando FL","Winter Park FL":"Orlando FL",
 "Deltona FL":"Orlando FL","Lake Mary FL":"Orlando FL","Ocoee FL":"Orlando FL","St Cloud FL":"Orlando FL",
 "Jacksonville FL":"Jacksonville FL","Orange Park FL":"Jacksonville FL","St Augustine FL":"Jacksonville FL",
 "Palm Coast FL":"Jacksonville FL","Fleming Island FL":"Jacksonville FL",
 "Miami FL":"Miami / South FL","Hialeah FL":"Miami / South FL","Fort Lauderdale FL":"Miami / South FL",
 "Hollywood FL":"Miami / South FL","Pembroke Pines FL":"Miami / South FL","Boca Raton FL":"Miami / South FL",
 "West Palm Beach FL":"Miami / South FL","Pompano Beach FL":"Miami / South FL","Coral Springs FL":"Miami / South FL",
 "Miramar FL":"Miami / South FL","Delray Beach FL":"Miami / South FL","Jupiter FL":"Miami / South FL",
 "Boynton Beach FL":"Miami / South FL","Wellington FL":"Miami / South FL","Homestead FL":"Miami / South FL",
 "Doral FL":"Miami / South FL","Coral Gables FL":"Miami / South FL","Weston FL":"Miami / South FL",
 "Cape Coral FL":"Fort Myers / Naples FL","Fort Myers FL":"Fort Myers / Naples FL","Naples FL":"Fort Myers / Naples FL",
 "Bonita Springs FL":"Fort Myers / Naples FL","Estero FL":"Fort Myers / Naples FL",
 "Sarasota FL":"Sarasota FL","Bradenton FL":"Sarasota FL","Venice FL":"Sarasota FL","Port Charlotte FL":"Sarasota FL",
 "Punta Gorda FL":"Sarasota FL",
 "Ocala FL":"Ocala FL","Gainesville FL":"Gainesville FL","Lakeland FL":"Lakeland FL","Melbourne FL":"Space Coast FL",
 "Palm Bay FL":"Space Coast FL","Titusville FL":"Space Coast FL","Port St Lucie FL":"Treasure Coast FL",
 "Vero Beach FL":"Treasure Coast FL","Fort Pierce FL":"Treasure Coast FL","Stuart FL":"Treasure Coast FL",
 "Daytona Beach FL":"Daytona FL","Pensacola FL":"Pensacola FL","Tallahassee FL":"Tallahassee FL",
 # --- California: LA basin / Orange County (NEW) ---
 "Los Angeles CA":"Los Angeles CA","Long Beach CA":"Los Angeles CA","Pasadena CA":"Los Angeles CA",
 "Glendale CA":"Los Angeles CA","Burbank CA":"Los Angeles CA","Torrance CA":"Los Angeles CA",
 "Pomona CA":"Los Angeles CA","Santa Clarita CA":"Los Angeles CA","Whittier CA":"Los Angeles CA",
 "West Covina CA":"Los Angeles CA","Downey CA":"Los Angeles CA","Norwalk CA":"Los Angeles CA",
 "El Monte CA":"Los Angeles CA","Lakewood CA":"Los Angeles CA","Cerritos CA":"Los Angeles CA",
 "Anaheim CA":"Orange County CA","Santa Ana CA":"Orange County CA","Irvine CA":"Orange County CA",
 "Huntington Beach CA":"Orange County CA","Fullerton CA":"Orange County CA","Orange CA":"Orange County CA",
 "Costa Mesa CA":"Orange County CA","Mission Viejo CA":"Orange County CA","Newport Beach CA":"Orange County CA",
 "Yorba Linda CA":"Orange County CA","Tustin CA":"Orange County CA","Lake Forest CA":"Orange County CA",
 "Thousand Oaks CA":"Ventura CA","Simi Valley CA":"Ventura CA","Ventura CA":"Ventura CA","Oxnard CA":"Ventura CA",
 # --- California: inland Bay + North (NEW) ---
 "San Jose CA":"San Jose CA","Fremont CA":"San Jose CA","Milpitas CA":"San Jose CA","Morgan Hill CA":"San Jose CA",
 "Livermore CA":"East Bay CA","Pleasanton CA":"East Bay CA","Dublin CA":"East Bay CA","Concord CA":"East Bay CA",
 "Antioch CA":"East Bay CA","Brentwood CA":"East Bay CA","Danville CA":"East Bay CA","San Ramon CA":"East Bay CA",
 "Tracy CA":"Central Valley CA","Manteca CA":"Central Valley CA","Vacaville CA":"Sacramento CA","Fairfield CA":"Sacramento CA",
 "Santa Rosa CA":"North Bay CA",
 # --- California: existing valleys / SD / IE / Coachella ---
 "Sacramento CA":"Sacramento CA","Roseville CA":"Sacramento CA","Elk Grove CA":"Sacramento CA",
 "Folsom CA":"Sacramento CA","Citrus Heights CA":"Sacramento CA","Rocklin CA":"Sacramento CA",
 "Fresno CA":"Fresno CA","Clovis CA":"Fresno CA","Visalia CA":"Fresno CA","Madera CA":"Fresno CA",
 "Tulare CA":"Fresno CA","Hanford CA":"Fresno CA","Porterville CA":"Fresno CA",
 "Bakersfield CA":"Bakersfield CA","Modesto CA":"Modesto CA","Turlock CA":"Modesto CA","Stockton CA":"Stockton CA","Merced CA":"Merced CA",
 "Riverside CA":"Riverside / IE","San Bernardino CA":"Riverside / IE","Fontana CA":"Riverside / IE",
 "Rancho Cucamonga CA":"Riverside / IE","Ontario CA":"Riverside / IE","Corona CA":"Riverside / IE",
 "Temecula CA":"Riverside / IE","Moreno Valley CA":"Riverside / IE","Murrieta CA":"Riverside / IE",
 "Redlands CA":"Riverside / IE","Chino CA":"Riverside / IE","Menifee CA":"Riverside / IE","Hemet CA":"Riverside / IE",
 "San Diego CA":"San Diego CA","Chula Vista CA":"San Diego CA","Escondido CA":"San Diego CA",
 "Oceanside CA":"San Diego CA","Carlsbad CA":"San Diego CA","El Cajon CA":"San Diego CA","Vista CA":"San Diego CA",
 "San Marcos CA":"San Diego CA","Poway CA":"San Diego CA","Santee CA":"San Diego CA","Encinitas CA":"San Diego CA",
 "Palm Springs CA":"Coachella Valley CA","Palm Desert CA":"Coachella Valley CA","Indio CA":"Coachella Valley CA",
 "La Quinta CA":"Coachella Valley CA","Cathedral City CA":"Coachella Valley CA","Rancho Mirage CA":"Coachella Valley CA",
 # --- Nevada (non-LV) ---
 "Reno NV":"Reno NV","Sparks NV":"Reno NV","Carson City NV":"Reno NV",
 # --- Carolinas / GA / TN / other Sunbelt ---
 "Charlotte NC":"Charlotte NC","Concord NC":"Charlotte NC","Gastonia NC":"Charlotte NC",
 "Huntersville NC":"Charlotte NC","Mooresville NC":"Charlotte NC","Kannapolis NC":"Charlotte NC","Matthews NC":"Charlotte NC",
 "Raleigh NC":"Raleigh NC","Durham NC":"Raleigh NC","Cary NC":"Raleigh NC","Apex NC":"Raleigh NC","Chapel Hill NC":"Raleigh NC",
 "Wilmington NC":"Wilmington NC","Greensboro NC":"Greensboro NC","Winston-Salem NC":"Greensboro NC","High Point NC":"Greensboro NC",
 "Fayetteville NC":"Fayetteville NC",
 "Columbia SC":"Columbia SC","Charleston SC":"Charleston SC","North Charleston SC":"Charleston SC",
 "Mount Pleasant SC":"Charleston SC","Summerville SC":"Charleston SC","Greenville SC":"Greenville SC",
 "Spartanburg SC":"Greenville SC","Rock Hill SC":"Rock Hill SC","Myrtle Beach SC":"Myrtle Beach SC",
 "Hilton Head Island SC":"Hilton Head SC","Florence SC":"Florence SC","Aiken SC":"Aiken SC",
 "Atlanta GA":"Atlanta GA","Marietta GA":"Atlanta GA","Alpharetta GA":"Atlanta GA","Roswell GA":"Atlanta GA",
 "Duluth GA":"Atlanta GA","Kennesaw GA":"Atlanta GA","Lawrenceville GA":"Atlanta GA","Cumming GA":"Atlanta GA",
 "Woodstock GA":"Atlanta GA","Canton GA":"Atlanta GA","Newnan GA":"Atlanta GA","McDonough GA":"Atlanta GA",
 "Savannah GA":"Savannah GA","Augusta GA":"Augusta GA","Columbus GA":"Columbus GA","Athens GA":"Athens GA",
 "Macon GA":"Macon GA","Warner Robins GA":"Macon GA","Valdosta GA":"Valdosta GA","Albany GA":"Albany GA",
 "Nashville TN":"Nashville TN","Franklin TN":"Nashville TN","Murfreesboro TN":"Nashville TN","Hendersonville TN":"Nashville TN",
 "Smyrna TN":"Nashville TN","Clarksville TN":"Nashville TN","Memphis TN":"Memphis TN",
 "Knoxville TN":"Knoxville TN","Chattanooga TN":"Chattanooga TN","Johnson City TN":"Tri-Cities TN","Kingsport TN":"Tri-Cities TN",
 "New Orleans LA":"New Orleans / Baton Rouge LA","Metairie LA":"New Orleans / Baton Rouge LA",
 "Baton Rouge LA":"New Orleans / Baton Rouge LA","Lafayette LA":"Lafayette LA","Lake Charles LA":"Lake Charles LA",
 "Shreveport LA":"Shreveport LA","Bossier City LA":"Shreveport LA",
 "Oklahoma City OK":"Oklahoma","Tulsa OK":"Oklahoma","Norman OK":"Oklahoma","Broken Arrow OK":"Oklahoma",
 "Edmond OK":"Oklahoma","Lawton OK":"Oklahoma",
 "Birmingham AL":"Birmingham AL","Hoover AL":"Birmingham AL","Huntsville AL":"Huntsville AL","Mobile AL":"Mobile AL",
 "Montgomery AL":"Montgomery AL","Tuscaloosa AL":"Tuscaloosa AL","Auburn AL":"Auburn AL","Dothan AL":"Dothan AL",
 "Little Rock AR":"Little Rock AR","Fort Smith AR":"NW Arkansas","Fayetteville AR":"NW Arkansas",
 "Springdale AR":"NW Arkansas","Rogers AR":"NW Arkansas","Bentonville AR":"NW Arkansas",
 "Jackson MS":"Jackson MS","Gulfport MS":"Gulf Coast MS","Biloxi MS":"Gulf Coast MS","Hattiesburg MS":"Hattiesburg MS",
 "Southaven MS":"Memphis TN",
 # --- New Mexico (NEW) ---
 "Albuquerque NM":"Albuquerque NM","Rio Rancho NM":"Albuquerque NM","Santa Fe NM":"Santa Fe NM","Las Cruces NM":"Las Cruces NM",
 # --- Utah: hot southern / Wasatch (dedup drops the tapped UT set) ---
 "St George UT":"St George UT","Washington UT":"St George UT","Ogden UT":"Salt Lake UT","Provo UT":"Provo UT",
 "Orem UT":"Provo UT","Sandy UT":"Salt Lake UT","West Jordan UT":"Salt Lake UT","Lehi UT":"Salt Lake UT",
 # --- Kentucky / Virginia / Missouri / Kansas / Colorado (NEW warm-belt fill) ---
 "Louisville KY":"Louisville KY","Lexington KY":"Lexington KY","Bowling Green KY":"Bowling Green KY",
 "Virginia Beach VA":"Hampton Roads VA","Chesapeake VA":"Hampton Roads VA","Norfolk VA":"Hampton Roads VA",
 "Newport News VA":"Hampton Roads VA","Suffolk VA":"Hampton Roads VA","Richmond VA":"Richmond VA","Chesterfield VA":"Richmond VA",
 "Kansas City MO":"Kansas City","Overland Park KS":"Kansas City","Olathe KS":"Kansas City","Lees Summit MO":"Kansas City",
 "St Louis MO":"St Louis MO","Springfield MO":"Springfield MO","Wichita KS":"Wichita KS",
 "Denver CO":"Denver CO","Aurora CO":"Denver CO","Centennial CO":"Denver CO","Parker CO":"Denver CO",
 "Highlands Ranch CO":"Denver CO","Colorado Springs CO":"Colorado Springs CO",
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
