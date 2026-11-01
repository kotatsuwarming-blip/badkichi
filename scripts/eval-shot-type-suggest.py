#!/usr/bin/env python3
"""種別候補の推定 (app/utils/annotation/suggest.ts) の精度を、注釈済みのショットで測る。

使い方:
  1. 注釈済みショットを JSON で書き出す (検証環境、読み取り専用):
       supabase db query --linked -o json "<下の SQL>" > shots.json
  2. python3 scripts/eval-shot-type-suggest.py shots.json

書き出し SQL:
  select m.name as match_name, s.set_number, r.rally_number, r.end_reason, r.land_x, r.land_y,
         sh.shot_number, sh.shot_type, sh.hit_x, sh.hit_y, sh.hit_player_id,
         sh.video_timestamp_ms, sh.annotated_timestamp_ms
  from matches m
  join sets s on s.match_id = m.id and s.deleted_at is null
  join rallies r on r.set_id = s.id and r.deleted_at is null and r.is_let = false
  join shots sh on sh.rally_id = r.id and sh.deleted_at is null
  where m.deleted_at is null and sh.shot_type is not null
  order by m.name, s.set_number, r.rally_number, sh.shot_number

suggest.ts のゾーン閾値と対応表をここに写している。suggest.ts を変えたら、ここも合わせる。
出すもの: 候補に正解が含まれる割合 (coverage)、候補の先頭が正解の割合、候補外になった組み合わせ、
同じ特徴量で多数決したときの 1 位正解率 (leave-one-out)、種別ごとの次打までの時間。
"""
import sys
import json
from collections import Counter, defaultdict

ROWS = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "shots.json"))
ROWS = ROWS["rows"] if isinstance(ROWS, dict) else ROWS

FRONT_MAX, REAR_MIN = 0.15, 0.32
ZONE = {
    "rear": {"rear": ["clear_high", "clear_driven"],
             "mid": ["smash", "clear_driven", "cut", "reverse_cut", "drive"],
             "front": ["drop", "cut", "reverse_cut"],
             "unknown": ["clear_high", "clear_driven", "smash", "drop", "cut", "reverse_cut"]},
    "mid": {"rear": ["drive", "lob_high", "lob_low"],
            "mid": ["drive", "half", "push"],
            "front": ["half", "hairpin", "drop"],
            "unknown": ["drive", "half", "push"]},
    "front": {"rear": ["lob_high", "lob_low", "push"],
              "mid": ["push", "drive", "half", "lob_low"],
              "front": ["hairpin"],
              "unknown": ["hairpin", "lob_high", "lob_low", "push"]},
}
RECEIVE_TRIGGERS = {"smash", "push", "drive"}


def zone(y):
    d = min(0.5, abs(y - 0.5))
    return "front" if d < FRONT_MAX else "rear" if d > REAR_MIN else "mid"


def suggest(shot_number, hit_y, dest_y, prev_type):
    if shot_number == 1:
        return []
    out = []
    if hit_y is not None:
        out += ZONE[zone(hit_y)][zone(dest_y) if dest_y is not None else "unknown"]
    if prev_type in RECEIVE_TRIGGERS:
        out += ["receive_long", "receive_drive", "receive_short"]
    seen, uniq = set(), []
    for t in out:
        if t not in seen:
            seen.add(t); uniq.append(t)
    return uniq


# group by rally, in shot order
rallies = defaultdict(list)
for r in ROWS:
    rallies[(r["match_name"], r["set_number"], r["rally_number"])].append(r)
for k in rallies:
    rallies[k].sort(key=lambda r: r["shot_number"])

samples = []  # evaluated shots (shot_number >= 2, type known, not 'unknown')
for key, shots in rallies.items():
    for i, s in enumerate(shots):
        if s["shot_number"] == 1 or s["shot_type"] in (None, "unknown"):
            continue
        prev = shots[i - 1] if i > 0 else None
        nxt = shots[i + 1] if i + 1 < len(shots) else None
        dest_y = nxt["hit_y"] if nxt else s["land_y"]
        t_prev = prev["video_timestamp_ms"] if prev else None
        t_next = nxt["video_timestamp_ms"] if nxt else None
        samples.append({
            "match": s["match_name"], "truth": s["shot_type"],
            "hit_y": s["hit_y"], "dest_y": dest_y,
            "prev_type": prev["shot_type"] if prev else None,
            "cands": suggest(s["shot_number"], s["hit_y"], dest_y, prev["shot_type"] if prev else None),
            "from": zone(s["hit_y"]) if s["hit_y"] is not None else None,
            "to": zone(dest_y) if dest_y is not None else "unknown",
            "recv": (prev["shot_type"] in RECEIVE_TRIGGERS) if prev else False,
            "dt_next": (t_next - s["video_timestamp_ms"]) if (t_next is not None and s["video_timestamp_ms"] is not None) else None,
            "dt_prev": (s["video_timestamp_ms"] - t_prev) if (t_prev is not None and s["video_timestamp_ms"] is not None) else None,
        })

print(f"evaluated shots: {len(samples)} (serve and 'unknown' excluded)")

def report(name, subset):
    n = len(subset)
    cov = sum(x["truth"] in x["cands"] for x in subset)
    top1 = sum(x["cands"] and x["cands"][0] == x["truth"] for x in subset)
    size = sum(len(x["cands"]) for x in subset) / n if n else 0
    print(f"{name:40s} n={n:4d}  coverage={cov/n:6.1%}  first-candidate={top1/n:6.1%}  avg candidates={size:.1f}")

print("\n== current logic: is the true type in the highlighted candidates? ==")
report("all", samples)
for m in sorted(set(x["match"] for x in samples)):
    report(m, [x for x in samples if x["match"] == m])

print("\n== misses by (from zone -> to zone, receive ctx): true type not in candidates ==")
miss = Counter()
for x in samples:
    if x["truth"] not in x["cands"]:
        miss[(x["from"], x["to"], x["recv"], x["truth"])] += 1
for k, v in miss.most_common(15):
    print(f"  {k[0]}->{k[1]} recv={k[2]!s:5s} truth={k[3]:14s} {v}")

print("\n== candidate set size distribution ==")
print(Counter(len(x["cands"]) for x in samples))

# --- data-driven top-1: majority type per cell, leave-one-out
def loo_top1(keyfn, label):
    cells = defaultdict(Counter)
    for x in samples:
        cells[keyfn(x)][x["truth"]] += 1
    hit = 0
    for x in samples:
        c = cells[keyfn(x)].copy(); c[x["truth"]] -= 1
        if not c or sum(c.values()) == 0:
            continue
        pred = c.most_common(1)[0][0]
        hit += pred == x["truth"]
    print(f"{label:60s} top-1 (leave-one-out) = {hit/len(samples):6.1%}")
    return cells

def dt_bin(ms):
    if ms is None: return "na"
    return "<=500" if ms <= 500 else "<=800" if ms <= 800 else "<=1200" if ms <= 1200 else ">1200"

print("\n== how good could a prediction be with the same features? (majority vote per cell, leave-one-out) ==")
loo_top1(lambda x: (x["from"], x["to"], x["recv"]), "zone from x to x receive-context")
loo_top1(lambda x: (x["from"], x["to"], x["prev_type"]), "zone from x to x previous type")
loo_top1(lambda x: (x["from"], x["to"], x["recv"], dt_bin(x["dt_next"])), "zone from x to x receive x time to next hit")
loo_top1(lambda x: (x["from"], x["to"], x["prev_type"], dt_bin(x["dt_next"])), "zone from x to x previous type x time to next hit")
loo_top1(lambda x: (x["from"], x["to"], x["prev_type"], dt_bin(x["dt_next"]), dt_bin(x["dt_prev"])), "+ time from previous hit")

print("\n== time to next hit by true type (median ms, n) — does timing separate types? ==")
by = defaultdict(list)
for x in samples:
    if x["dt_next"] is not None: by[x["truth"]].append(x["dt_next"])
for t, v in sorted(by.items(), key=lambda kv: -len(kv[1])):
    v.sort(); print(f"  {t:14s} n={len(v):4d} median={v[len(v)//2]:5d}ms  p25={v[len(v)//4]:5d} p75={v[3*len(v)//4]:5d}")
