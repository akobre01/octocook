#!/usr/bin/env python3
"""Generate parity fixtures: run the Python CP-SAT scheduler on sample meals
built from the *bundled web recipes* and save the reference schedules.

The offline TS scheduler (web/src/lib/scheduler.ts) is then diffed against these
by scripts/check_parity.mjs. Run this whenever the recipes, kitchen, or the
Python scheduler change:

    .venv/bin/python scripts/gen_parity_fixtures.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from scheduler import (  # noqa: E402
    Inventory,
    Step,
    SubstitutionGraph,
    schedule_to_dict,
    solve,
)

RECIPES_DIR = ROOT / "web" / "src" / "recipes"
OUT_DIR = ROOT / "web" / "src" / "lib" / "__fixtures__" / "parity"
INV = ROOT / "server" / "presets" / "default" / "inventory.yaml"
SUBS = ROOT / "server" / "presets" / "default" / "substitutions.yaml"

# Sample meals (by recipe `name`), single cook.
MEALS = {
    "muhammara_cucumber": ["Muhammara", "Smashed Cucumber Salad"],
    "soup_cucumber": ["Butternut Squash & Red Lentil Soup", "Smashed Cucumber Salad"],
    "two_pilafs": [
        "Winter Pilaf — Farro, Sausage & Parsnips",
        "Fall Pilaf — Wild Rice & Winter Squash",
    ],
    "cake_muhammara_cucumber": ["Olive Oil Cake", "Muhammara", "Smashed Cucumber Salad"],
}


def load_recipes() -> dict:
    by_name = {}
    for p in RECIPES_DIR.glob("*.json"):
        r = json.loads(p.read_text())
        by_name[r["name"]] = r
    return by_name


def build_steps(recipes: list[dict]) -> list[Step]:
    steps = []
    for i, recipe in enumerate(recipes):
        for cs in recipe["cookSteps"]:
            steps.append(
                Step(
                    id=f"{i}:{cs['id']}",
                    recipe=recipe["name"],
                    description=cs["description"],
                    duration_min=cs["duration_min"],
                    active=cs["active"],
                    tools=list(cs.get("tools", [])),
                    depends_on=[f"{i}:{d}" for d in cs.get("depends_on", [])],
                    ingredients=list(cs.get("ingredients", [])),
                )
            )
    return steps


def main() -> None:
    by_name = load_recipes()
    inv = Inventory.from_yaml(INV)
    subs = SubstitutionGraph.from_yaml(SUBS)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for key, names in MEALS.items():
        missing = [n for n in names if n not in by_name]
        if missing:
            print(f"  SKIP {key}: missing {missing}")
            continue
        steps = build_steps([by_name[n] for n in names])
        schedule = solve(steps, inv, subs, num_cooks=1)
        out = {"recipes": names, "schedule": schedule_to_dict(schedule)}
        (OUT_DIR / f"{key}.json").write_text(json.dumps(out, indent=2))
        print(f"  {key}: makespan {schedule.makespan_min}m ({len(steps)} steps)")

    print(f"Wrote fixtures to {OUT_DIR}")


if __name__ == "__main__":
    main()
