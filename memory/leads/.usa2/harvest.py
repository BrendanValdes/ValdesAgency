#!/usr/bin/env python3
import subprocess, json, re, os, sys
from concurrent.futures import ThreadPoolExecutor, as_completed

OUT = os.path.join(os.path.dirname(__file__), "candidates.jsonl")

# city -> metro label (POOL USA 1 style). Sunbelt / pool ICP only.
CITIES = {
 # Phoenix AZ
 "Phoenix AZ":"Phoenix AZ","Mesa AZ":"Phoenix AZ","Chandler AZ":"Phoenix AZ","Gilbert AZ":"Phoenix AZ",
 "Glendale AZ":"Phoenix AZ","Peoria AZ":"Phoenix AZ","Surprise AZ":"Phoenix AZ","Scottsdale AZ":"Phoenix AZ",
 "Tempe AZ":"Phoenix AZ","Goodyear AZ":"Phoenix AZ","Tucson AZ":"Tucson AZ",
 # DFW
 "Dallas TX":"Dallas-Fort Worth TX","Fort Worth TX":"Dallas-Fort Worth TX","Plano TX":"Dallas-Fort Worth TX",
 "Frisco TX":"Dallas-Fort Worth TX","McKinney TX":"Dallas-Fort Worth TX","Arlington TX":"Dallas-Fort Worth TX",
 "Denton TX":"Dallas-Fort Worth TX","Mesquite TX":"Dallas-Fort Worth TX","Garland TX":"Dallas-Fort Worth TX",
 "Rockwall TX":"Dallas-Fort Worth TX","Allen TX":"Dallas-Fort Worth TX",
 # Houston
 "Houston TX":"Houston TX","Katy TX":"Houston TX","Sugar Land TX":"Houston TX","Spring TX":"Houston TX",
 "Cypress TX":"Houston TX","Pearland TX":"Houston TX","Conroe TX":"Houston TX","Humble TX":"Houston TX",
 "League City TX":"Houston TX",
 # Austin
 "Austin TX":"Austin TX","Round Rock TX":"Austin TX","Cedar Park TX":"Austin TX","Georgetown TX":"Austin TX",
 "Pflugerville TX":"Austin TX","San Marcos TX":"Austin TX","Leander TX":"Austin TX","Kyle TX":"Austin TX",
 # San Antonio
 "San Antonio TX":"San Antonio TX","New Braunfels TX":"San Antonio TX","Schertz TX":"San Antonio TX",
 "Boerne TX":"San Antonio TX",
 # Tampa
 "Tampa FL":"Tampa FL","Brandon FL":"Tampa FL","Riverview FL":"Tampa FL","Wesley Chapel FL":"Tampa FL",
 "Lutz FL":"Tampa FL","Clearwater FL":"Tampa FL","St Petersburg FL":"Tampa FL",
 # Orlando
 "Orlando FL":"Orlando FL","Kissimmee FL":"Orlando FL","Winter Garden FL":"Orlando FL","Sanford FL":"Orlando FL",
 "Clermont FL":"Orlando FL","Oviedo FL":"Orlando FL","Apopka FL":"Orlando FL",
 # Jacksonville
 "Jacksonville FL":"Jacksonville FL","Orange Park FL":"Jacksonville FL","St Augustine FL":"Jacksonville FL",
 # South FL
 "Miami FL":"Miami / South FL","Hialeah FL":"Miami / South FL","Fort Lauderdale FL":"Miami / South FL",
 "Hollywood FL":"Miami / South FL","Pembroke Pines FL":"Miami / South FL","Boca Raton FL":"Miami / South FL",
 "West Palm Beach FL":"Miami / South FL","Pompano Beach FL":"Miami / South FL","Coral Springs FL":"Miami / South FL",
 # SW FL
 "Cape Coral FL":"Fort Myers / Naples FL","Fort Myers FL":"Fort Myers / Naples FL","Naples FL":"Fort Myers / Naples FL",
 "Sarasota FL":"Sarasota FL","Bradenton FL":"Sarasota FL",
 # Sacramento
 "Sacramento CA":"Sacramento CA","Roseville CA":"Sacramento CA","Elk Grove CA":"Sacramento CA",
 "Folsom CA":"Sacramento CA","Citrus Heights CA":"Sacramento CA",
 # Fresno
 "Fresno CA":"Fresno CA","Clovis CA":"Fresno CA","Visalia CA":"Fresno CA",
 # IE
 "Riverside CA":"Riverside / IE","San Bernardino CA":"Riverside / IE","Fontana CA":"Riverside / IE",
 "Rancho Cucamonga CA":"Riverside / IE","Ontario CA":"Riverside / IE","Corona CA":"Riverside / IE",
 "Temecula CA":"Riverside / IE","Moreno Valley CA":"Riverside / IE",
 # San Diego
 "San Diego CA":"San Diego CA","Chula Vista CA":"San Diego CA","Escondido CA":"San Diego CA",
 "Oceanside CA":"San Diego CA","Carlsbad CA":"San Diego CA",
 "Bakersfield CA":"Bakersfield CA",
 # Carolinas
 "Charlotte NC":"Charlotte NC","Concord NC":"Charlotte NC","Gastonia NC":"Charlotte NC",
 "Huntersville NC":"Charlotte NC","Raleigh NC":"Raleigh NC","Durham NC":"Raleigh NC","Cary NC":"Raleigh NC",
 # GA
 "Atlanta GA":"Atlanta GA","Marietta GA":"Atlanta GA","Alpharetta GA":"Atlanta GA","Roswell GA":"Atlanta GA",
 "Duluth GA":"Atlanta GA","Kennesaw GA":"Atlanta GA","Savannah GA":"Savannah GA",
 # TN
 "Nashville TN":"Nashville TN","Franklin TN":"Nashville TN","Murfreesboro TN":"Nashville TN","Memphis TN":"Memphis TN",
 # LA / OK
 "New Orleans LA":"New Orleans / Baton Rouge LA","Metairie LA":"New Orleans / Baton Rouge LA",
 "Baton Rouge LA":"New Orleans / Baton Rouge LA","Oklahoma City OK":"Oklahoma","Tulsa OK":"Oklahoma",
 # NV extra (Henderson only; LV heavily tapped)
 "Henderson NV":"Las Vegas NV",
}

DIRECTORY = re.compile(r'(yelp|angi|angieslist|thumbtack|homeadvisor|bbb\.org|mapquest|facebook|yellowpages|'
  r'nextdoor|houzz|porch|expertise|threebestrated|birdeye|manta|chamberofcommerce|indeed|ziprecruiter|'
  r'google\.com|bing\.com|reddit|youtube|tripadvisor|wikipedia|instagram|linkedin|glassdoor|'
  r'poolcorp|pinchapenny|leslies|clark|nerdwallet|forbes)', re.I)

def run_query(city, metro):
    q = f"pool service {city}"
    try:
        p = subprocess.run(["bdata","search",q,"--zone","mcp_unlocker","--json"],
                           capture_output=True, text=True, timeout=90)
        raw = p.stdout
        i = raw.find('{')
        if i<0: return []
        d = json.loads(raw[i:])
    except Exception as e:
        sys.stderr.write(f"[fail] {city}: {e}\n"); return []
    out=[]
    for b in d.get("snack_pack",[]) or []:
        out.append({"name":b.get("name"),"website":b.get("site"),"rating":b.get("rating"),
                    "reviews":b.get("reviews_cnt"),"city":city,"metro":metro,
                    "src":"snack","maps":b.get("maps_link")})
    for o in d.get("organic",[]) or []:
        link=o.get("link") or ""
        if not link or DIRECTORY.search(link): continue
        ext=o.get("extensions") or {}
        rating=None; rev=None
        if isinstance(ext,dict):
            rating=ext.get("rating"); rev=ext.get("reviews_cnt")
        out.append({"name":o.get("title"),"website":link,"rating":rating,"reviews":rev,
                    "city":city,"metro":metro,"src":"organic","maps":None})
    return out

def main():
    items=list(CITIES.items())
    allc=[]
    with ThreadPoolExecutor(max_workers=10) as ex:
        futs={ex.submit(run_query,c,m):c for c,m in items}
        done=0
        for f in as_completed(futs):
            done+=1
            r=f.result()
            allc.extend(r)
            print(f"[{done}/{len(items)}] {futs[f]}: +{len(r)}  total={len(allc)}", flush=True)
    with open(OUT,"w") as fh:
        for c in allc: fh.write(json.dumps(c)+"\n")
    print("RAW CANDIDATES:",len(allc),"->",OUT)

if __name__=="__main__": main()
