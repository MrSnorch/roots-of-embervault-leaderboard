#!/usr/bin/env python3
"""Fetch all pages of the ROE leaderboard and write /tmp/leaderboard_raw.json."""

import json
import sys
import urllib.request
import urllib.error

BASE_URL = "https://roe-prod-20fe6d199715.herokuapp.com/api/leaderboard/global"
LIMIT = 100
OUTPUT = "/tmp/leaderboard_raw.json"


def fetch_page(page: int) -> list:
    url = f"{BASE_URL}?page={page}&limit={LIMIT}"
    print(f"Fetching page {page}: {url}")
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            data = json.load(resp)
    except urllib.error.URLError as e:
        print(f"ERROR: request failed: {e}", file=sys.stderr)
        sys.exit(1)

    if not data.get("success"):
        print(f"ERROR: API returned success=false on page {page}", file=sys.stderr)
        sys.exit(1)

    players = data.get("data", [])
    print(f"  -> {len(players)} players")
    return players


all_players = []
page = 1

while True:
    players = fetch_page(page)
    all_players.extend(players)
    if len(players) < LIMIT:
        break
    page += 1

print(f"Total players fetched: {len(all_players)}")

with open(OUTPUT, "w") as f:
    json.dump({"success": True, "data": all_players}, f)

print(f"Written to {OUTPUT}")
