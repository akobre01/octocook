#!/usr/bin/env python3
"""CLI: enrich every recipe in the Notion database that doesn't yet have cookSteps.

Walks the recipes database, skips anything that already has structured
cookSteps, and runs the enrichment pipeline on the rest. Errors on
individual recipes are reported and survived — the script keeps going so
one bad page doesn't block the rest. A summary is printed at the end.

A recipe with no JSON-LD code block at all (older pages from before the
structured-body workflow) is recovered the same way the live app does it:
scrape the page's Link URL and embed JSON-LD before enriching. Recipes
without a Link can't be recovered automatically — they're listed in the
summary so the user can re-add them via add_recipe.py.
"""

from __future__ import annotations

import argparse
import sys
import time
import traceback

from dotenv import load_dotenv

from notion_client_wrapper import (
    append_json_ld_block,
    find_recipe_json_ld_block,
    get_client,
    list_recipes,
    mark_recipe_enriched,
    update_json_ld_block,
)
from recipe_enrichment import enrich_recipe
from scraper import scrape_recipe


def _load_json_ld(page_id: str) -> tuple[str | None, dict | None]:
    """Return (block_id, json_ld) for a page, or (None, None) if missing."""
    try:
        return find_recipe_json_ld_block(page_id)
    except LookupError:
        return None, None


def _page_url_property(page_id: str) -> str | None:
    """Read the `Link` URL property off a page, if any."""
    client = get_client()
    page = client.pages.retrieve(page_id=page_id)
    link_prop = page.get("properties", {}).get("Link", {}) or {}
    return link_prop.get("url")


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Run cookSteps enrichment on every Notion recipe that doesn't have "
            "it yet. Already-enriched recipes are skipped."
        ),
    )
    parser.add_argument(
        "--inventory", default="inventory.yaml",
        help="Path to inventory YAML (default: inventory.yaml).",
    )
    parser.add_argument(
        "--substitutions", default="substitutions.yaml",
        help="Path to substitutions YAML (default: substitutions.yaml).",
    )
    parser.add_argument(
        "--limit", type=int, default=None,
        help="Process at most this many unenriched recipes (handy for testing).",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="List which recipes would be enriched without calling Claude or writing Notion.",
    )
    parser.add_argument(
        "-y", "--yes", action="store_true",
        help="Skip the confirmation prompt and start enriching immediately.",
    )
    parser.add_argument(
        "--backfill-only", action="store_true",
        help=(
            "Don't call Claude. Only set the Octocook checkbox on recipes "
            "that already have cookSteps but aren't flagged yet. Use this "
            "once after adding the Octocook property to your Notion DB."
        ),
    )
    args = parser.parse_args()

    load_dotenv()

    print("Listing recipes…")
    try:
        recipes = list_recipes()
    except Exception as e:
        print(f"Failed to list recipes: {e}", file=sys.stderr)
        return 1

    print(f"  {len(recipes)} recipes in database. Checking enrichment status…")

    targets: list[tuple[dict, str | None, dict | None]] = []  # (recipe, block_id, json_ld)
    backfill: list[dict] = []  # has cookSteps but Octocook checkbox isn't set
    already_flagged = 0
    for r in recipes:
        block_id, json_ld = _load_json_ld(r["page_id"])
        has_steps = bool(json_ld and json_ld.get("cookSteps"))
        if has_steps:
            if r.get("enriched"):
                already_flagged += 1
            else:
                backfill.append(r)
            continue
        targets.append((r, block_id, json_ld))

    print(
        f"  {already_flagged} already flagged, "
        f"{len(backfill)} need Octocook flag backfilled, "
        f"{len(targets)} need enrichment."
    )

    if args.backfill_only:
        targets = []  # skip Claude calls entirely

    if args.limit is not None:
        targets = targets[: args.limit]
        print(f"  --limit {args.limit}: processing the first {len(targets)}.")

    if not targets and not backfill:
        print("Nothing to do.")
        return 0

    if backfill:
        print("\nRecipes to flag (no Claude call needed):")
        for r in backfill:
            print(f"  - {r['title']}")
    if targets:
        print("\nRecipes to enrich (one Claude call each):")
        for r, _, _ in targets:
            print(f"  - {r['title']}")

    if args.dry_run:
        print("\nDry run — no Notion writes, no Claude calls.")
        return 0

    if not args.yes:
        prompt_bits = []
        if backfill:
            prompt_bits.append(f"flag {len(backfill)} recipe(s)")
        if targets:
            prompt_bits.append(f"enrich {len(targets)} recipe(s) via Claude")
        try:
            answer = input(f"\nProceed to {' and '.join(prompt_bits)}? [y/N]: ").strip().lower()
        except EOFError:
            answer = ""
        if answer not in ("y", "yes"):
            print("Aborted.")
            return 0

    backfilled_titles: list[str] = []
    for r in backfill:
        print(f"\nFlagging: {r['title']}")
        try:
            mark_recipe_enriched(r["page_id"])
            backfilled_titles.append(r["title"])
        except Exception as e:
            print(f"  ✗ failed: {e}")

    enriched_titles: list[str] = []
    failed: list[tuple[str, str]] = []  # (title, reason)
    unrecoverable: list[str] = []  # no JSON-LD and no URL to scrape

    for i, (r, block_id, json_ld) in enumerate(targets, start=1):
        title = r["title"]
        page_id = r["page_id"]
        print(f"\n[{i}/{len(targets)}] {title}")

        try:
            # Recover a missing JSON-LD body by scraping the source URL, same
            # as the /recipes/{id}/enrich endpoint does.
            if json_ld is None:
                print("  No JSON-LD block — looking for source URL…")
                url = _page_url_property(page_id)
                if not url:
                    print("  No source URL. Skipping (re-add via add_recipe.py).")
                    unrecoverable.append(title)
                    continue
                print(f"  Scraping {url}")
                recipe_data = scrape_recipe(url)
                json_ld = recipe_data.json_ld
                block_id = append_json_ld_block(page_id, json_ld)

            print("  Calling Claude…")
            cook_steps = enrich_recipe(
                json_ld,
                inventory_path=args.inventory,
                substitutions_path=args.substitutions,
            )
            json_ld["cookSteps"] = cook_steps
            assert block_id is not None  # set above (existing or appended)
            update_json_ld_block(block_id, json_ld)
            mark_recipe_enriched(page_id)
            print(f"  ✓ wrote {len(cook_steps)} steps")
            enriched_titles.append(title)
        except KeyboardInterrupt:
            print("\nInterrupted by user.")
            break
        except Exception as e:
            print(f"  ✗ failed: {e}")
            traceback.print_exc(limit=2)
            failed.append((title, str(e)))

        # Light pacing — Notion is ~3 req/s sustained and Claude calls take
        # several seconds anyway, so this mostly just smooths things out.
        time.sleep(0.5)

    print("\n" + "=" * 60)
    print(f"Flagged (backfill): {len(backfilled_titles)}")
    print(f"Enriched:           {len(enriched_titles)}")
    print(f"Failed:             {len(failed)}")
    print(f"Skipped (no URL):   {len(unrecoverable)}")
    if failed:
        print("\nFailures:")
        for title, reason in failed:
            print(f"  - {title}: {reason}")
    if unrecoverable:
        print("\nNeed manual re-add (no JSON-LD body, no Link property):")
        for title in unrecoverable:
            print(f"  - {title}")

    return 0 if not failed else 2


if __name__ == "__main__":
    sys.exit(main())
