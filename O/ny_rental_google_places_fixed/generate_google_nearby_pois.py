import csv
import json
import math
import os
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
BUILDINGS_CSV = BASE_DIR / "buildings.csv"
OUTPUT_CSV = BASE_DIR / "building_google_nearby_pois_500m.csv"
RAW_DIR = BASE_DIR / "google_places_raw"
RADIUS_METERS = 500
MAX_RESULTS = 10

SEARCHES = [
    ("restaurant", ["restaurant"]),
    ("grocery", ["supermarket", "grocery_store", "convenience_store"]),
    ("coffee", ["cafe", "coffee_shop"]),
    ("subway", ["subway_station"]),
]

FIELDS = [
    "poi_id",
    "building_id",
    "building_name",
    "poi_type",
    "name",
    "address",
    "distance_meters",
    "lat",
    "lng",
    "google_place_id",
    "rating",
    "user_rating_count",
    "primary_type",
    "source",
    "source_last_checked",
]


def haversine_meters(lat1, lng1, lat2, lng2):
    radius = 6371000
    to_rad = math.pi / 180
    d_lat = (lat2 - lat1) * to_rad
    d_lng = (lng2 - lng1) * to_rad
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(lat1 * to_rad)
        * math.cos(lat2 * to_rad)
        * math.sin(d_lng / 2) ** 2
    )
    return 2 * radius * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def nearby_search(api_key, lat, lng, included_types):
    body = {
        "includedTypes": included_types,
        "maxResultCount": MAX_RESULTS,
        "rankPreference": "DISTANCE",
        "locationRestriction": {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": RADIUS_METERS,
            }
        },
    }
    request = urllib.request.Request(
        "https://places.googleapis.com/v1/places:searchNearby",
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": (
                "places.id,"
                "places.displayName,"
                "places.formattedAddress,"
                "places.location,"
                "places.primaryType,"
                "places.rating,"
                "places.userRatingCount"
            ),
        },
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.loads(response.read().decode("utf-8"))


def subway_canonical_name(name):
    text = re.sub(r"\s+", " ", name.strip())
    text = re.sub(r"\s+Station$", "", text, flags=re.I)
    text = text.replace(" - ", "-")
    return text.lower()


def is_real_subway_place(name, primary_type):
    lower = name.lower()
    if primary_type == "subway_station":
        return True
    if "station" in lower and not any(token in lower for token in ["bus", "parking", "yard"]):
        return True
    return False


def main():
    api_key = os.environ.get("GOOGLE_PLACES_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("Set GOOGLE_PLACES_API_KEY before running this script.")
    RAW_DIR.mkdir(exist_ok=True)

    with BUILDINGS_CSV.open("r", encoding="utf-8-sig", newline="") as file:
        buildings = [
            row for row in csv.DictReader(file)
            if row.get("building_id") and row.get("lat") and row.get("lng")
        ]

    rows = []
    today = time.strftime("%Y-%m-%d")
    for building in buildings:
        building_id = building["building_id"]
        building_name = building.get("building_name", building_id)
        lat = float(building["lat"])
        lng = float(building["lng"])

        for poi_type, included_types in SEARCHES:
            try:
                payload = nearby_search(api_key, lat, lng, included_types)
            except urllib.error.HTTPError as error:
                detail = error.read().decode("utf-8", errors="replace")
                raise RuntimeError(f"{building_id} {poi_type}: HTTP {error.code} {detail}") from error

            (RAW_DIR / f"{building_id}_{poi_type}.json").write_text(
                json.dumps(payload, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

            seen = set()
            count = 0
            places = []
            for place in payload.get("places", []):
                place_id = place.get("id", "")
                location = place.get("location") or {}
                place_lat = location.get("latitude")
                place_lng = location.get("longitude")
                display = place.get("displayName") or {}
                name = display.get("text", "")
                primary_type = place.get("primaryType", "")
                if not place_id or not name or place_lat is None or place_lng is None:
                    continue
                if poi_type == "subway":
                    if not is_real_subway_place(name, primary_type):
                        continue
                    dedupe_key = subway_canonical_name(name)
                else:
                    dedupe_key = place_id
                if dedupe_key in seen:
                    continue
                seen.add(dedupe_key)
                places.append((haversine_meters(lat, lng, place_lat, place_lng), place, place_lat, place_lng))

            places.sort(key=lambda item: item[0])
            if poi_type == "subway":
                places = places[:4]

            for distance, place, place_lat, place_lng in places:
                count += 1
                display = place.get("displayName") or {}
                rows.append({
                    "poi_id": f"{building_id}_{poi_type}_{count}",
                    "building_id": building_id,
                    "building_name": building_name,
                    "poi_type": poi_type,
                    "name": display.get("text", ""),
                    "address": place.get("formattedAddress", ""),
                    "distance_meters": round(distance),
                    "lat": f"{place_lat:.7f}",
                    "lng": f"{place_lng:.7f}",
                    "google_place_id": place.get("id", ""),
                    "rating": place.get("rating", ""),
                    "user_rating_count": place.get("userRatingCount", ""),
                    "primary_type": place.get("primaryType", ""),
                    "source": "Google Places API Nearby Search",
                    "source_last_checked": today,
                })
            time.sleep(0.05)

    with OUTPUT_CSV.open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)

    by_type = {}
    for row in rows:
        by_type[row["poi_type"]] = by_type.get(row["poi_type"], 0) + 1
    print(json.dumps({"buildings": len(buildings), "rows": len(rows), "by_type": by_type}, indent=2))


if __name__ == "__main__":
    main()
