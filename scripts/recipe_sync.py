#!/usr/bin/env python3
"""
recipe_sync.py - bulk tools for the Recipes / Grocery Notion databases.

Three jobs, all DRY-RUN by default (nothing is written unless you pass --apply):

  1. trim   : strip reviews, images, nutrition, publisher data etc. from the
              JSON recipe block on each page. Keeps ingredients, full steps,
              times, and the cookSteps plan.
  2. times  : fill "Time (min)" from the recipe's totalTime, only where empty.
  3. match  : group every ingredient in the unlinked recipes into one row per
              distinct ingredient and write them to a CSV to review.
     apply-links : read the reviewed CSV, create any items marked "create",
              and link every recipe that uses those ingredients.

Setup
  pip install requests
  export NOTION_TOKEN="secret_..."        # your integration key
  (share the "Food" page with the integration in Notion first)

Examples
  python recipe_sync.py trim                      # preview
  python recipe_sync.py trim --apply              # write
  python recipe_sync.py times --apply
  python recipe_sync.py match --out decisions.csv # always safe, only writes CSV
  python recipe_sync.py apply-links decisions.csv         # preview
  python recipe_sync.py apply-links decisions.csv --apply # write
  Add --limit 5 to any command to try it on a few recipes first.
"""
import argparse
import csv
import html
import json
import os
import re
import sys
import time

import requests

# ---------------------------------------------------------------- config
RECIPES_DS = "8a5c1662-302a-446e-ade2-ebeba2e80e3f"
RECIPES_DB = "af8a076a6c0d4f34b5ec2ffa63a6c64d"
GROCERY_DS = "203d580d-0390-80bc-bcb0-000b2b052f23"
GROCERY_DB = "203d580d039080e9b571f35877f6c18c"

API = "https://api.notion.com/v1"
NOTION_VERSION = "2025-09-03"          # data-source API version
LEGACY_VERSION = "2022-06-28"          # fallback for database queries

KEEP_KEYS = [
    "@type", "name", "author", "url", "isPartOf", "description",
    "recipeYield", "prepTime", "cookTime", "totalTime",
    "recipeCategory", "recipeCuisine", "suitableForDiet",
    "recipeIngredient", "recipeInstructions", "cookSteps",
]
JUNK_KEYS = {"review", "image", "nutrition", "aggregateRating", "publisher",
             "copyrightHolder", "video", "@id", "@context", "creator",
             "keywords", "datePublished", "dateModified", "copyrightYear",
             "isAccessibleForFree", "mainEntityOfPage"}

# Ingredient lines that are never linked (after quantities/descriptions removed)
STAPLES = {
    "salt", "kosher salt", "sea salt", "fine sea salt", "flaky salt",
    "pepper", "black pepper", "ground black pepper",
    "freshly ground black pepper", "salt and pepper",
    "salt and black pepper", "kosher salt and black pepper",
    "sea salt and black pepper", "fine sea salt and black pepper",
    "water", "hot water", "cold water", "boiling water", "ice",
    "oil", "olive oil", "extra-virgin olive oil", "extra virgin olive oil",
    "vegetable oil", "neutral oil", "canola oil", "avocado oil",
    "cooking spray", "cooking oil spray", "nonstick spray",
}
OPTIONAL_RE = re.compile(r"\b(optional|for serving|to serve|for garnish|garnish)\b")

# Ordered: specific patterns first. Each match "consumes" its text so that
# e.g. "garlic powder" doesn't also count as "garlic".
# Target may be a list for combo ingredients.
ALIASES = [
    (r"ginger[\s-]*garlic paste", ["Frozen Ginger", "Garlic"]),
    (r"garlic powder", "Garlic Powder"),
    (r"garlic", "Garlic"),
    (r"ground ginger", None),                       # not in Grocery yet
    (r"ginger", "Frozen Ginger"),
    (r"sweet potato", "Sweet Potatoes"),
    (r"(baby|fingerling|new)\b[\w ]{0,12}potato", "Baby potatoes"),
    (r"potato", "Potatoes"),
    (r"butternut|winter squash", "Butternut Squash"),
    (r"peanut butter", "Peanut butter"),
    (r"peanut", "Peanuts"),
    (r"cashew", "Raw cashews"),
    (r"walnut", "Walnut"),
    (r"pecan", "Pecans"),
    (r"butter beans?", "Canellini Beans"),
    (r"\bghee\b", "Ghee"),
    (r"\bbutter\b", "Butter"),
    (r"coconut milk", "Coconut Milk"),
    (r"coconut cream", "Coconut cream"),
    (r"heavy cream|whipping cream|double cream", "Heavy Cream"),
    (r"sour cream", "Sour Cream"),
    (r"labneh|labane", "Labane"),
    (r"yogh?urt", "Fage (yogurt)"),
    (r"oat milk|almond milk|non-?dairy milk|plant milk", "Oat Milk"),
    (r"\bmilk\b", "Milk"),
    (r"parmesan|parmigiano|pecorino", "Parmesan"),
    (r"mozzarella", "Mozzarella"),
    (r"\bfeta\b", "Feta"),
    (r"paneer", "Paneer"),
    (r"dried (?:raw )?chickpeas|\bchana\b|garbanzo beans?, dried", "Dried Chickpeas"),
    (r"chickpeas?|garbanzo", "Canned Chickpeas"),
    (r"dried black beans", "Dried Black beans"),
    (r"black beans", "Canned Black Beans"),
    (r"cannellini|white beans?|great northern", "Canellini Beans"),
    (r"navy beans?", "Navy Beans"),
    (r"toor dal|arhar dal|pigeon peas", "Toor dal"),
    (r"moong dal", "Moong Dal"),
    (r"red lentils?|masoor", "Red Lentils"),
    (r"black lentils?|beluga", "Black Lentils"),
    (r"lentils?", "Lentils (brown)"),
    (r"red onion", "Red onion"),
    (r"shallots?", "Shallots"),
    (r"scallions?|green onions?|spring onions?", "Scallion"),
    (r"onions?", "Onions"),
    (r"leeks?", "Leeks"),
    (r"fennel seeds?", "Fennel seeds"),
    (r"fennel", "Fennel"),
    (r"kashmiri(?: red)?(?: chil+[ie]s?)?(?: powder)?|red chil+i powder", "Kashmiri chili"),
    (r"chil[ie] powder|cayenne", "Chile Powder"),
    (r"red[- ]pepper flakes|crushed red pepper|chil[ie] flakes|pepper flakes", "Red pepper flakes"),
    (r"aleppo", "Aleppo pepper"),
    (r"dried red chil", "Red Chile"),
    (r"bell peppers?|red peppers?", "Red pepper"),
    (r"green peppers?", "Green pepper"),
    (r"jalape", "Jalapeno"),
    (r"serrano", "Serrano chiles"),
    (r"fresno", "Fresno chiles"),
    (r"green chil", "Green Chili"),
    (r"garam masala", "Garam masala"),
    (r"coriander (powder)|ground coriander", "Ground Coriander"),
    (r"coriander seeds?", "Coriander seeds"),
    (r"coriander leaves|cilantro", "Cilantro"),
    (r"cumin seeds?|jeera", "Cumin seeds"),
    (r"cumin", "Cumin powder"),
    (r"turmeric", "Turmeric"),
    (r"cinnamon sticks?", "Cinnamon sticks"),
    (r"cinnamon", "Cinnamon"),
    (r"smoked paprika", "Smoked paprika"),
    (r"paprika", "Sweet paprika"),
    (r"kasuri methi|dried fenugreek", "Kasuri methi"),
    (r"\bhing\b|asafoetida", "Hing"),
    (r"allspice", "Allspice Berries"),
    (r"mustard seeds?", "Mustard seeds"),
    (r"curry powder", "Curry Powder"),
    (r"five[- ]spice|5[- ]spice", "5 spice powder"),
    (r"tomato paste", "Tomato Paste"),
    (r"crushed tomatoes", "Crushed Tomatoes"),
    (r"diced tomatoes", "Diced Tomatoes"),
    (r"stewed tomatoes", "Stewed Tomatoes"),
    (r"strained tomatoes|passata", "Strained Tomatoes"),
    (r"whole peeled tomatoes|canned tomatoes", "Canned Whole Tomatoes"),
    (r"sun[- ]?dried tomato", "Sun dried tomatoes in oil"),
    (r"(cherry|grape) tomato", "Cherry tomatoes"),
    (r"tomato sauce", "Tomato Sauce"),
    (r"tomato", "Tomato"),
    (r"broth|stock", "Vegetable Stock"),
    (r"soy sauce|tamari|shoyu", "Soy Sauce"),
    (r"sesame oil", "Toasted Sesame Oil"),
    (r"sesame seeds?", "Sesame Seeds"),
    (r"gochujang|gojuchang", "Gojuchang"),
    (r"harissa", "Harissa (homemade)"),
    (r"kimchi", "Kimchi"),
    (r"preserved lemon", "Preserved lemons"),
    (r"chil[ie] crisp", "Chili crisp"),
    (r"maple syrup", "Maple syrup"),
    (r"honey", "Honey"),
    (r"molasses", "Molasses"),
    (r"sugar", "Sugar"),
    (r"bread flour", "Bread flour"),
    (r"all[- ]purpose flour|\bflour\b", "All purpose flour"),
    (r"baking powder", "Baking Powder"),
    (r"panko|bread ?crumbs", "Bread Crumbs"),
    (r"apple cider vinegar", "Apple Cider Vinegar"),
    (r"red wine vinegar", "Red Wine Vinegar"),
    (r"white wine vinegar", "White wine vinegar"),
    (r"rice vinegar", "Rice Vinegar"),
    (r"dijon", "Dijon Mustard"),
    (r"spinach", "Spinach"),
    (r"\bkale\b", "Kale"),
    (r"arugula|rocket", "Arugula"),
    (r"mustard greens", "Mustard Greens"),
    (r"broccoli", "Broccoli"),
    (r"mushroom", "Mushrooms"),
    (r"carrots?", "Carrots"),
    (r"celery", "Celery"),
    (r"lemons?", "Lemon"),
    (r"limes?", "Limes"),
    (r"\bdill\b", "Dill"),
    (r"thyme", "Thyme"),
    (r"rosemary", "Rosemary"),
    (r"\bsage\b", "Sage powder"),
    (r"oregano", "Oregano"),
    (r"basil", "Basil"),
    (r"parsley", "Parsley"),
    (r"brown rice", "Brown rice"),
    (r"\brice\b", "Rice"),
    (r"bulgur|bulghur", "Bulgur"),
    (r"orzo|pastina|small pasta|ditalini", "Small Pasta"),
    (r"spaghetti", "Spaghetti"),
    (r"penne", "Penne Pasta"),
    (r"tofu", "Tofu"),
    (r"seitan", "Seitan (homemade)"),
    (r"nutritional yeast", "Nutritional Yeast"),
    (r"vital wheat gluten", "Vital Wheat Gluten"),
    (r"phyllo|filo", "Phyllo dough"),
    (r"kalamata|olives", "Kalamata Olives"),
    (r"pickle", "Pickles"),
]
ALIASES = [(re.compile(p), t) for p, t in ALIASES]

# ---------------------------------------------------------------- API layer
TOKEN = os.environ.get("NOTION_TOKEN")
S = requests.Session()


def call(method, path, body=None, version=NOTION_VERSION, params=None):
    headers = {"Authorization": f"Bearer {TOKEN}",
               "Notion-Version": version,
               "Content-Type": "application/json"}
    for attempt in range(6):
        r = S.request(method, API + path, headers=headers, json=body,
                      params=params, timeout=60)
        if r.status_code == 429 or r.status_code >= 500:
            wait = float(r.headers.get("Retry-After", 2 ** attempt))
            time.sleep(wait)
            continue
        time.sleep(0.35)  # stay under ~3 requests/second
        if r.status_code >= 400:
            raise RuntimeError(f"{method} {path} -> {r.status_code}: {r.text[:300]}")
        return r.json()
    raise RuntimeError(f"{method} {path}: too many retries")


def query_all(ds_id, db_id):
    """All pages in a database (data-source API, with legacy fallback)."""
    pages, cursor = [], None
    try:
        while True:
            body = {"page_size": 100}
            if cursor:
                body["start_cursor"] = cursor
            res = call("POST", f"/data_sources/{ds_id}/query", body)
            pages += res["results"]
            if not res.get("has_more"):
                return pages
            cursor = res["next_cursor"]
    except RuntimeError as e:
        print(f"  data-source query failed ({e}); trying legacy API", file=sys.stderr)
        pages, cursor = [], None
        while True:
            body = {"page_size": 100}
            if cursor:
                body["start_cursor"] = cursor
            res = call("POST", f"/databases/{db_id}/query", body, version=LEGACY_VERSION)
            pages += res["results"]
            if not res.get("has_more"):
                return pages
            cursor = res["next_cursor"]


def title_of(page):
    for prop in page["properties"].values():
        if prop["type"] == "title":
            return "".join(t["plain_text"] for t in prop["title"]).strip()
    return ""


def children(block_id):
    out, cursor = [], None
    while True:
        params = {"page_size": 100}
        if cursor:
            params["start_cursor"] = cursor
        res = call("GET", f"/blocks/{block_id}/children", params=params)
        out += res["results"]
        if not res.get("has_more"):
            return out
        cursor = res["next_cursor"]


def recipe_json_block(page_id):
    """Return (block, parsed_json) for the first JSON code block, or (None, None)."""
    for b in children(page_id):
        if b["type"] != "code":
            continue
        text = "".join(t["plain_text"] for t in b["code"]["rich_text"])
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict) and ("recipeIngredient" in data or "cookSteps" in data):
            return b, data
    return None, None


def code_block(text):
    chunks = [text[i:i + 2000] for i in range(0, len(text), 2000)]
    if len(chunks) > 100:
        raise ValueError("recipe JSON too large for one block")
    return {"object": "block", "type": "code",
            "code": {"language": "json",
                     "rich_text": [{"type": "text", "text": {"content": c}} for c in chunks]}}


ERRORS = []


def note_error(where, exc):
    ERRORS.append({"item": where, "error": str(exc)[:300]})
    print(f"  ! {where}: {str(exc)[:160]}", flush=True)


def report_errors():
    if not ERRORS:
        return
    path = "errors.csv"
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["item", "error"])
        w.writeheader()
        w.writerows(ERRORS)
    print(f"\n{len(ERRORS)} item(s) had problems and were skipped; details in {path}")


def progress(i, n, page):
    print(f"[{i}/{n}] {title_of(page)[:50]}", flush=True)


# ---------------------------------------------------------------- trimming
def clean(obj):
    """Recursively unescape HTML entities and drop per-step urls/images."""
    if isinstance(obj, str):
        return html.unescape(obj).strip()
    if isinstance(obj, list):
        return [clean(x) for x in obj]
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if k in ("url", "image", "video"):
                continue
            if k == "name" and obj.get("@type") == "HowToStep":
                continue  # duplicate of "text"
            out[k] = clean(v)
        return out
    return obj


def trim(data):
    out = {}
    for k in KEEP_KEYS:
        if k not in data:
            continue
        v = data[k]
        if k == "author":
            items = v if isinstance(v, list) else [v]
            names = [a.get("name", "") if isinstance(a, dict) else str(a) for a in items]
            v = ", ".join(n for n in names if n) or None
        elif k == "url":
            if not isinstance(v, str):
                continue
            v = "https:" + v if v.startswith("//") else v
        elif k == "isPartOf" and isinstance(v, dict):
            continue  # website article reference, not a book
        elif k == "suitableForDiet":
            v = [d.replace("https://schema.org/", "") for d in (v if isinstance(v, list) else [v])]
        elif k in ("recipeIngredient", "recipeInstructions", "description"):
            v = clean(v)
        if v not in (None, "", []):
            out[k] = v
    if "url" not in out:
        mep = data.get("mainEntityOfPage")
        link = mep.get("@id") if isinstance(mep, dict) else mep
        if isinstance(link, str) and link:
            out["url"] = "https:" + link if link.startswith("//") else link
    return out


def needs_trim(data):
    return any(k in data for k in JUNK_KEYS)


# ---------------------------------------------------------------- times
def iso_minutes(s):
    if not isinstance(s, str):
        return None
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:\d+S)?", s.strip())
    if not m:
        return None
    d, h, mi = (int(x) if x else 0 for x in m.groups())
    total = d * 1440 + h * 60 + mi
    return total or None


# ---------------------------------------------------------------- matching
def core_text(line):
    t = line.lower()
    t = re.sub(r"\(.*?\)", " ", t)
    t = t.split(",")[0]
    t = re.sub(r"[\d½¼¾⅓⅔⅛/.\-–]+", " ", t)
    t = re.sub(r"\b(cups?|tablespoons?|tbsps?|teaspoons?|tsps?|ounces?|oz|pounds?|lbs?|"
               r"grams?|g|ml|l|pinch(es)?|dash(es)?|handful|large|small|medium|"
               r"generous|about|plus|more|to taste|freshly|fresh|finely|ground)\b", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def match_line(line, grocery):
    """Return list of (grocery_name, grocery_id, match_type)."""
    low = line.lower()
    if OPTIONAL_RE.search(low):
        return [("", "", "skipped: optional/garnish")]
    if core_text(line) in STAPLES:
        return [("", "", "skipped: staple")]

    def run(text):
        text = re.sub(r"\(.*?\)", " ", text)
        found = []
        for rx, target in ALIASES:
            m = rx.search(text)
            if not m:
                continue
            text = text[:m.start()] + " " * (m.end() - m.start()) + text[m.end():]
            if target is None:
                found.append(("", "", f"missing: '{m.group(0)}' not in Grocery"))
                continue
            for name in (target if isinstance(target, list) else [target]):
                gid = grocery.get(name.lower())
                found.append((name, gid or "",
                              "alias" if gid else "alias target not in Grocery"))
        return found

    # "cilantro or parsley": prefer the first option
    first = re.split(r"\s+or\s+(?!\d)", low, maxsplit=1)[0]
    found = run(first) or run(low)
    if found:
        return found

    # fallback: longest Grocery name that appears as a whole word
    best = None
    for name, gid in grocery.items():
        if len(name) >= 4 and re.search(rf"\b{re.escape(name)}\b", low):
            if not best or len(name) > len(best[0]):
                best = (name, gid)
    if best:
        return [(grocery_names[best[1]], best[1], "fallback (check)")]
    return [("", "", "missing: no Grocery match")]


grocery_names = {}


def load_grocery():
    items = query_all(GROCERY_DS, GROCERY_DB)
    lookup, dupes = {}, set()
    for p in items:
        name = title_of(p)
        if not name:
            continue
        if name.lower() in lookup:
            dupes.add(name)
        lookup[name.lower()] = p["id"]
        grocery_names[p["id"]] = name
    print(f"Loaded {len(lookup)} Grocery items")
    if dupes:
        print(f"  note: duplicate Grocery names (the last one wins): "
              f"{', '.join(sorted(dupes))}")
    return lookup


def has_ingredients(page):
    prop = page["properties"].get("Ingredients")
    return bool(prop and prop.get("relation"))


# ---------------------------------------------------------------- commands
def cmd_trim(args, recipes):
    changed = 0
    pages = recipes[:args.limit]
    for i, page in enumerate(pages, 1):
        progress(i, len(pages), page)
        try:
            block, data = recipe_json_block(page["id"])
            if not data or not needs_trim(data):
                continue
            new = trim(data)
            if not new.get("recipeIngredient") and not new.get("cookSteps"):
                note_error(title_of(page), "trim would drop everything; left untouched")
                continue
            text = json.dumps(new, ensure_ascii=False, indent=2)
            before = len(json.dumps(data))
            print(f"  trim {title_of(page)!r}: {before:,} -> {len(text):,} chars")
            changed += 1
            if args.apply:
                # write the new block first; only delete the old one if that worked
                call("PATCH", f"/blocks/{page['id']}/children",
                     {"children": [code_block(text)]})
                try:
                    call("DELETE", f"/blocks/{block['id']}")
                except Exception as e:
                    note_error(title_of(page),
                               f"new block added but old one left in place: {e}")
        except Exception as e:
            note_error(title_of(page), e)
    print(f"{changed} pages {'trimmed' if args.apply else 'would be trimmed'}")


def cmd_times(args, recipes):
    changed = 0
    pages = recipes[:args.limit]
    for i, page in enumerate(pages, 1):
        progress(i, len(pages), page)
        try:
            prop = page["properties"].get("Time (min)")
            if prop is None or prop.get("number") is not None:
                continue
            _, data = recipe_json_block(page["id"])
            if not data:
                continue
            mins = iso_minutes(data.get("totalTime"))
            src = "totalTime"
            if not mins:
                steps = data.get("cookSteps") or []
                mins = sum(st.get("duration_min", 0) for st in steps
                           if isinstance(st, dict)) or None
                src = "sum of steps"
            if not mins or not 1 <= mins <= 3000:
                continue
            print(f"  time {title_of(page)!r}: {mins} min ({src})")
            changed += 1
            if args.apply:
                call("PATCH", f"/pages/{page['id']}",
                     {"properties": {"Time (min)": {"number": mins}}})
        except Exception as e:
            note_error(title_of(page), e)
    print(f"{changed} times {'set' if args.apply else 'would be set'}")


NOISE = {"cans", "can", "jar", "jars", "package", "packages", "block", "blocks",
         "bunch", "bunches", "container", "cloves", "clove", "sprigs", "sprig",
         "head", "heads", "stalks", "stalk", "ribs", "rib", "piece", "pieces",
         "packed", "loosely", "firmly", "chopped", "sliced", "diced", "minced",
         "grated", "peeled", "rinsed", "drained", "trimmed", "of", "the", "a"}


def decision_key(line):
    """Normalized key so 'garlic cloves' and '4 cloves garlic' group together."""
    core = core_text(str(line)) or str(line).lower().strip()
    words = sorted(w for w in re.findall(r"[a-z']+", core) if w not in NOISE)
    return " ".join(words) or core


def create_grocery_item(name):
    body = {"parent": {"data_source_id": GROCERY_DS},
            "properties": {"Name": {"title": [{"text": {"content": name}}]}}}
    try:
        return call("POST", "/pages", body)["id"]
    except RuntimeError:
        body["parent"] = {"database_id": GROCERY_DB}
        return call("POST", "/pages", body, version=LEGACY_VERSION)["id"]


def cmd_match(args, recipes):
    """Group identical ingredients so each one is decided once."""
    grocery = load_grocery()
    todo = [p for p in recipes if not has_ingredients(p)][:args.limit]
    groups, no_data = {}, []
    for i, page in enumerate(todo, 1):
        progress(i, len(todo), page)
        try:
            _, data = recipe_json_block(page["id"])
        except Exception as e:
            note_error(title_of(page), e)
            continue
        if not data or not data.get("recipeIngredient"):
            no_data.append(title_of(page))
            continue
        for line in data["recipeIngredient"]:
            key = decision_key(line)
            matches = match_line(str(line), grocery)
            names = [m[0] for m in matches if m[0]]
            kind = matches[0][2]
            g = groups.setdefault(key, {"count": 0, "example": str(line),
                                        "names": names, "kind": kind,
                                        "recipes": set()})
            g["count"] += 1
            g["recipes"].add(title_of(page))
            if not g["names"] and names:
                g["names"], g["kind"] = names, kind

    rows = []
    for key, g in sorted(groups.items(), key=lambda kv: -kv[1]["count"]):
        kind = g["kind"]
        action = ("link" if kind == "alias" else
                  "skip" if kind.startswith("skipped") else "")
        rows.append({
            "ingredient": key,
            "example_line": g["example"],
            "used_in": g["count"],
            "match_type": kind,
            "action": action,                      # link | skip | create
            "grocery_item": "; ".join(g["names"]),
            "example_recipes": ", ".join(sorted(g["recipes"])[:3]),
        })
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["ingredient", "example_line", "used_in",
                                          "match_type", "action", "grocery_item",
                                          "example_recipes"])
        w.writeheader()
        w.writerows(rows)

    todo_rows = [r for r in rows if not r["action"]]
    print(f"\n{len(rows)} distinct ingredients across {len(todo) - len(no_data)} recipes "
          f"-> {args.out}")
    print(f"  {sum(1 for r in rows if r['action'] == 'link')} auto-linked, "
          f"{sum(1 for r in rows if r['action'] == 'skip')} auto-skipped, "
          f"{len(todo_rows)} need your decision")
    print("\nIn the CSV set action to one of:")
    print("  link   - link to the item named in grocery_item")
    print("  skip   - never link this ingredient")
    print("  create - add grocery_item to Grocery as a new item, then link it")
    print("Edit grocery_item when the suggestion is wrong; use '; ' for two items.")
    if no_data:
        print(f"\n{len(no_data)} recipes have no ingredient data (need photos/text):")
        for n in no_data:
            print("  -", n)


def cmd_apply_links(args, recipes):
    grocery = load_grocery()
    decisions, bad_rows = {}, []
    try:
        with open(args.csv, encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            required = {"ingredient", "action", "grocery_item"}
            have = set(reader.fieldnames or [])
            if not required <= have:
                sys.exit(f"{args.csv} is missing columns: "
                         f"{', '.join(sorted(required - have))}. "
                         f"Re-run 'match' to regenerate it.")
            for n, row in enumerate(reader, 2):
                action = (row.get("action") or "").strip().lower()
                names = [x.strip() for x in (row.get("grocery_item") or "").split(";")
                         if x.strip()]
                if action in ("", "skip", "n", "no"):
                    continue
                if action not in ("link", "create", "y", "yes"):
                    bad_rows.append(f"line {n}: unknown action {action!r}")
                    continue
                if action in ("y", "yes"):
                    action = "link"
                if not names:
                    bad_rows.append(f"line {n}: action={action} but grocery_item is empty")
                    continue
                decisions[(row.get("ingredient") or "").strip()] = (action, names)
    except FileNotFoundError:
        sys.exit(f"Can't find {args.csv}. Run 'match' first, or check the file name.")
    except csv.Error as e:
        sys.exit(f"Could not read {args.csv}: {e}")
    print(f"{len(decisions)} ingredient decisions loaded")
    if bad_rows:
        print(f"{len(bad_rows)} row(s) ignored:")
        for b in bad_rows[:10]:
            print("  -", b)
        if len(bad_rows) > 10:
            print(f"  ... and {len(bad_rows) - 10} more")
        if not args.ignore_bad_rows:
            sys.exit("Fix those rows, or rerun with --ignore-bad-rows to skip them.")

    created, missing, unresolved, linked = {}, set(), {}, 0
    todo = [p for p in recipes if not has_ingredients(p) or args.force]
    todo = todo[:args.limit] if args.limit else todo

    for i, page in enumerate(todo, 1):
        try:
            _, data = recipe_json_block(page["id"])
        except Exception as e:
            note_error(title_of(page), e)
            continue
        if not data or not data.get("recipeIngredient"):
            continue
        ids, names_used, unknown = [], [], []
        for line in data["recipeIngredient"]:
            key = decision_key(line)
            if key not in decisions:
                if match_line(str(line), grocery)[0][2].startswith("skipped"):
                    continue
                unknown.append(str(line))
                continue
            action, names = decisions[key]
            for name in names:
                gid = grocery.get(name.lower()) or created.get(name.lower())
                if not gid and action == "create":
                    if args.apply:
                        try:
                            gid = create_grocery_item(name)
                        except Exception as e:
                            note_error(f"create Grocery item {name!r}", e)
                            continue
                        created[name.lower()] = gid
                        grocery_names[gid] = name
                        print(f"  + created Grocery item: {name}")
                    else:
                        print(f"  + would create Grocery item: {name}")
                        created[name.lower()] = "(new)"
                        gid = "(new)"
                if not gid:
                    missing.add(name)
                    continue
                if gid not in ids:
                    ids.append(gid)
                    names_used.append(name)
        if unknown:
            unresolved[title_of(page)] = unknown
        if not ids:
            continue
        print(f"[{i}/{len(todo)}] {title_of(page)[:40]}: {', '.join(names_used)}")
        if args.apply and "(new)" not in ids:
            try:
                call("PATCH", f"/pages/{page['id']}",
                     {"properties": {"Ingredients":
                                     {"relation": [{"id": g} for g in ids]}}})
                linked += 1
            except Exception as e:
                note_error(title_of(page), e)

    if missing:
        print(f"\n{len(missing)} named items are not in Grocery "
              f"(set action=create to add them): {', '.join(sorted(missing))}")
    if unresolved:
        n = sum(len(v) for v in unresolved.values())
        print(f"\n{n} ingredient lines in {len(unresolved)} recipes have no decision yet. "
              f"Rerun 'match' to pick them up, e.g.:")
        for name, lines in list(unresolved.items())[:5]:
            print(f"  {name}: {lines[0][:60]}")
    if args.apply:
        print(f"\nLinked {linked} recipes, created {len(created)} Grocery items.")
    else:
        print("\nDry run. Add --apply to write.")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("trim", "times"):
        p = sub.add_parser(name)
        p.add_argument("--apply", action="store_true")
        p.add_argument("--limit", type=int)
    p = sub.add_parser("match")
    p.add_argument("--out", default="decisions.csv")
    p.add_argument("--limit", type=int)
    p = sub.add_parser("apply-links")
    p.add_argument("csv")
    p.add_argument("--apply", action="store_true")
    p.add_argument("--force", action="store_true")
    p.add_argument("--ignore-bad-rows", action="store_true")
    p.add_argument("--limit", type=int)
    args = ap.parse_args()

    if not TOKEN:
        sys.exit("Set NOTION_TOKEN first (see the top of this file).")

    if args.cmd == "apply-links" and not os.path.exists(args.csv):
        sys.exit(f"Can't find {args.csv}. Run 'match' first, or check the file name.")

    print("Connecting to Notion...", flush=True)
    try:
        recipes = query_all(RECIPES_DS, RECIPES_DB)
    except requests.exceptions.RequestException as e:
        sys.exit(f"Could not reach Notion: {e}\nCheck your internet connection "
                 f"and try again.")
    except RuntimeError as e:
        msg = str(e)
        if "401" in msg:
            sys.exit("Notion rejected the token (401). Check NOTION_TOKEN.")
        if "404" in msg:
            sys.exit("Notion returned 404. Share the Food page with your "
                     "integration (Food page > ... > Connections).")
        sys.exit(f"Notion error while loading recipes: {msg}")
    print(f"Loaded {len(recipes)} recipes", flush=True)
    if not recipes:
        sys.exit("No recipes found. Make sure the Food page is shared with your "
                 "integration (Food page > ... > Connections).")
    if getattr(args, "apply", None) is False and args.cmd != "match":
        print("DRY RUN: nothing will be written. Add --apply to save changes.", flush=True)
    cmd = {"trim": cmd_trim, "times": cmd_times, "match": cmd_match,
           "apply-links": cmd_apply_links}[args.cmd]
    try:
        cmd(args, recipes)
    except KeyboardInterrupt:
        print("\nStopped. Changes already written stay in Notion; "
              "rerun the same command to continue where it left off.")
    finally:
        report_errors()


if __name__ == "__main__":
    main()
