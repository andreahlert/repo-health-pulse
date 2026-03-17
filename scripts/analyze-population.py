#!/usr/bin/env python3
"""Analyze population data from collect-population.ts output."""

import csv
import sys
from collections import defaultdict

def load(path):
    repos = []
    with open(path) as f:
        reader = csv.DictReader(f)
        for row in reader:
            try:
                r = {
                    'repo': row['repo'],
                    'stars': int(row['stars']),
                    'size_kb': int(row['size_kb']),
                    'age_days': int(row['age_days']),
                    'issues': int(row['open_issues']),
                    'language': row['language'],
                    'ci': float(row['ci_pass_pct']) if row['ci_pass_pct'] else None,
                    'ci_total': int(row['ci_total']),
                    'pr_hrs': float(row['pr_merge_hours']) if row['pr_merge_hours'] else None,
                    'pr_count': int(row['pr_merged_count']),
                    'rel_wk': float(row['releases_per_week']),
                    'rel_90d': int(row['release_count_90d']),
                    'has_ci': row['has_actions'] == '1',
                }
                repos.append(r)
            except (ValueError, KeyError):
                continue
    return repos

def percentile(values, p):
    if not values: return None
    s = sorted(values)
    k = (len(s) - 1) * p / 100
    f = int(k)
    c = f + 1 if f + 1 < len(s) else f
    return s[f] + (k - f) * (s[c] - s[f])

def stats(label, values):
    if not values:
        print(f"  {label:22s}  (no data)")
        return
    values = [v for v in values if v is not None]
    if not values:
        print(f"  {label:22s}  (no data)")
        return
    p10 = percentile(values, 10)
    p25 = percentile(values, 25)
    p50 = percentile(values, 50)
    p75 = percentile(values, 75)
    p90 = percentile(values, 90)
    avg = sum(values) / len(values)
    print(f"  {label:22s}  n={len(values):4d}  p10={p10:8.1f}  p25={p25:8.1f}  p50={p50:8.1f}  p75={p75:8.1f}  p90={p90:8.1f}  avg={avg:8.1f}")

def segment_stats(label, repos):
    print(f"\n  {label} ({len(repos)} repos)")
    cis = [r['ci'] for r in repos if r['ci'] is not None and r['has_ci']]
    prs = [r['pr_hrs'] for r in repos if r['pr_hrs'] is not None and r['pr_count'] > 0]
    rels = [r['rel_wk'] for r in repos if True]
    print(f"    CI pass %:    n={len(cis):3d}  p25={percentile(cis,25) or 0:.0f}%  p50={percentile(cis,50) or 0:.0f}%  p75={percentile(cis,75) or 0:.0f}%")
    print(f"    PR merge hrs: n={len(prs):3d}  p25={percentile(prs,25) or 0:.1f}  p50={percentile(prs,50) or 0:.1f}  p75={percentile(prs,75) or 0:.1f}")
    print(f"    Releases/wk:  n={len(rels):3d}  p25={percentile(rels,25) or 0:.2f}  p50={percentile(rels,50) or 0:.2f}  p75={percentile(rels,75) or 0:.2f}")

def main():
    repos = load('data/population.csv')
    print(f"Total repos loaded: {len(repos)}")

    # Filter: only repos with some activity
    active = [r for r in repos if r['has_ci'] or r['pr_count'] > 0 or r['rel_90d'] > 0]
    print(f"Active repos (has CI, PRs, or releases): {len(active)}")

    # --- OVERALL POPULATION ---
    print("\n" + "=" * 70)
    print("OVERALL POPULATION (active repos)")
    print("=" * 70)

    stats("CI Pass %", [r['ci'] for r in active if r['ci'] is not None])
    stats("PR Merge (hrs)", [r['pr_hrs'] for r in active if r['pr_hrs'] is not None and r['pr_count'] >= 3])
    stats("Releases/wk", [r['rel_wk'] for r in active])
    stats("Stars", [r['stars'] for r in active])
    stats("Size (KB)", [r['size_kb'] for r in active])
    stats("Age (days)", [r['age_days'] for r in active])

    # Distribution of activity
    has_ci = sum(1 for r in active if r['has_ci'])
    has_pr = sum(1 for r in active if r['pr_count'] > 0)
    has_rel = sum(1 for r in active if r['rel_90d'] > 0)
    print(f"\n  Has CI:       {has_ci}/{len(active)} ({100*has_ci/len(active):.0f}%)")
    print(f"  Has merged PR: {has_pr}/{len(active)} ({100*has_pr/len(active):.0f}%)")
    print(f"  Has releases:  {has_rel}/{len(active)} ({100*has_rel/len(active):.0f}%)")

    # --- BY STAR COUNT (proxy for project size/importance) ---
    print("\n" + "=" * 70)
    print("BY STAR COUNT")
    print("=" * 70)

    mega = [r for r in active if r['stars'] >= 50000]
    large = [r for r in active if 10000 <= r['stars'] < 50000]
    mid = [r for r in active if 5000 <= r['stars'] < 10000]
    small = [r for r in active if r['stars'] < 5000]

    segment_stats("Mega (50k+ stars)", mega)
    segment_stats("Large (10k-50k stars)", large)
    segment_stats("Mid (5k-10k stars)", mid)
    segment_stats("Small (1k-5k stars)", small)

    # --- BY REPO SIZE ---
    print("\n" + "=" * 70)
    print("BY REPO SIZE (disk)")
    print("=" * 70)

    tiny = [r for r in active if r['size_kb'] < 10000]
    medium = [r for r in active if 10000 <= r['size_kb'] < 100000]
    big = [r for r in active if 100000 <= r['size_kb'] < 500000]
    huge = [r for r in active if r['size_kb'] >= 500000]

    segment_stats("Tiny (<10MB)", tiny)
    segment_stats("Medium (10-100MB)", medium)
    segment_stats("Big (100-500MB)", big)
    segment_stats("Huge (500MB+)", huge)

    # --- BY AGE ---
    print("\n" + "=" * 70)
    print("BY REPO AGE")
    print("=" * 70)

    young = [r for r in active if r['age_days'] < 1095]  # <3y
    growing = [r for r in active if 1095 <= r['age_days'] < 2555]  # 3-7y
    mature = [r for r in active if 2555 <= r['age_days'] < 4015]  # 7-11y
    old = [r for r in active if r['age_days'] >= 4015]  # 11y+

    segment_stats("Young (<3 years)", young)
    segment_stats("Growing (3-7 years)", growing)
    segment_stats("Mature (7-11 years)", mature)
    segment_stats("Old (11+ years)", old)

    # --- BY LANGUAGE ---
    print("\n" + "=" * 70)
    print("BY LANGUAGE (top 10)")
    print("=" * 70)

    by_lang = defaultdict(list)
    for r in active:
        by_lang[r['language']].append(r)

    top_langs = sorted(by_lang.items(), key=lambda x: -len(x[1]))[:10]
    for lang, group in top_langs:
        segment_stats(f"{lang}", group)

    # --- PROPOSED COHORT REFERENCE VALUES ---
    print("\n" + "=" * 70)
    print("PROPOSED COHORT REFERENCE VALUES (p50 = 'normal')")
    print("=" * 70)

    def ref(label, group):
        cis = [r['ci'] for r in group if r['ci'] is not None and r['has_ci']]
        prs = [r['pr_hrs'] for r in group if r['pr_hrs'] is not None and r['pr_count'] >= 3]
        rels = [r['rel_wk'] for r in group]
        ci_p50 = percentile(cis, 50) if cis else None
        pr_p50 = percentile(prs, 50) if prs else None
        rel_p50 = percentile(rels, 50) if rels else None
        ci_str = f"{ci_p50:.0f}%" if ci_p50 else "N/A"
        pr_str = f"{pr_p50:.1f}h" if pr_p50 else "N/A"
        rel_str = f"{rel_p50:.2f}/wk" if rel_p50 else "N/A"
        print(f"  {label:30s}  CI={ci_str:>5s}  PR={pr_str:>8s}  Rel={rel_str:>8s}")

    ref("ALL (population median)", active)
    ref("Mega repos (50k+ stars)", mega)
    ref("Large repos (10k-50k)", large)
    ref("Mid repos (5k-10k)", mid)
    ref("Small repos (1k-5k)", small)
    ref("Tiny codebase (<10MB)", tiny)
    ref("Huge codebase (500MB+)", huge)
    ref("Young (<3y)", young)
    ref("Old (11y+)", old)

if __name__ == '__main__':
    main()
