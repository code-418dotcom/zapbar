#!/usr/bin/env python3
"""After ios-testflight.sh: wait for BUILD to process, set the What to Test notes, add it to Testers, submit beta review. Usage: tf_post.py BUILD (edit NOTES first)."""
import sys, time
import pathlib; sys.path.insert(0, str(pathlib.Path(__file__).parent))
from ios_profile import call
from ios_listing import APP_ID
BUILD, GROUP = sys.argv[1], "b88c3f4c-48bc-42bc-b76d-84869f67111c"
NOTES = ("1.3.1: tester fixes. Music/Movies only show on soundbars, and the subwoofer slider only where a subwoofer is connected. "
         "Stereo pairs show the pair's name instead of the left speaker's. Settings, Inputs and Add a soundbar have a back button. "
         "Receivers (Marantz SR6013 and similar) get more time to connect. "
         "Please test: connecting to a receiver, the name of a stereo pair, and grouping as before. Send a screenshot if anything looks off.")
for _ in range(60):
    d = call("GET", f"/v1/builds?filter[app]={APP_ID}&filter[version]={BUILD}")["data"]
    if d and d[0]["attributes"]["processingState"] == "VALID": break
    time.sleep(30)
else: sys.exit("build not VALID after 30 min")
bid = d[0]["id"]; print("build", BUILD, "VALID", bid)
locs = call("GET", f"/v1/builds/{bid}/betaBuildLocalizations")["data"]
if locs: call("PATCH", f"/v1/betaBuildLocalizations/{locs[0]['id']}", {"data": {"type": "betaBuildLocalizations", "id": locs[0]["id"], "attributes": {"whatsNew": NOTES}}})
else: call("POST", "/v1/betaBuildLocalizations", {"data": {"type": "betaBuildLocalizations", "attributes": {"locale": "en-US", "whatsNew": NOTES}, "relationships": {"build": {"data": {"type": "builds", "id": bid}}}}})
call("POST", f"/v1/builds/{bid}/relationships/betaGroups", {"data": [{"type": "betaGroups", "id": GROUP}]})
call("POST", "/v1/betaAppReviewSubmissions", {"data": {"type": "betaAppReviewSubmissions", "relationships": {"build": {"data": {"type": "builds", "id": bid}}}}})
b = call("GET", f"/v1/builds/{bid}?include=betaAppReviewSubmission,betaGroups")
for x in b.get("included", []): print(x["type"], x["attributes"].get("betaReviewState") or x["attributes"].get("name"))
print("notes:", call("GET", f"/v1/builds/{bid}/betaBuildLocalizations")["data"][0]["attributes"]["whatsNew"][:60])
