#!/usr/bin/env python3
"""
Classifies repos in population.csv as 'code' or 'non-code'.
Non-code repos (awesome lists, tutorials, books) should be excluded
from scoring or scored differently.

Heuristics:
1. Language is 'Markdown' or 'unknown' with small size = likely non-code
2. Name contains keywords: awesome, interview, tutorial, guide, learn, book, etc.
3. No CI + no releases + low PR count = likely non-code
4. Language is a real programming language = likely code

Outputs: data/population-classified.csv with an extra 'type' column.
"""

import csv
import sys

NON_CODE_NAME_KEYWORDS = {
    'awesome', 'interview', 'tutorial', 'guide', 'learn', 'book',
    'roadmap', 'cheatsheet', 'bootcamp', '100-days', 'beginners',
    'free-programming', 'project-based', 'secret-knowledge', 'design-primer',
    'design-patterns-for-humans', 'cheat-sheet', 'resources', 'curated',
    'papers-we-love', 'coding-interview', 'tech-interview', 'system-design',
    'study-plan', 'reading-list', 'weekly', '500lines', 'cookbook',
    'protips', 'es6features', 'every-programmer', 'hacker-scripts',
}

CODE_LANGUAGES = {
    'JavaScript', 'TypeScript', 'Python', 'Go', 'Rust', 'Java', 'C', 'C++',
    'C#', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'Dart', 'Scala', 'Elixir',
    'Haskell', 'Lua', 'Perl', 'R', 'Julia', 'Shell', 'Objective-C',
    'Zig', 'Nim', 'OCaml', 'Clojure', 'Erlang', 'Fortran', 'VHDL',
    'Assembly', 'Vim Script', 'Emacs Lisp', 'Vue', 'Svelte', 'Nix',
    'Dockerfile', 'Makefile', 'PowerShell', 'Jupyter Notebook', 'HTML', 'CSS',
    'SCSS', 'Less', 'Starlark', 'HCL',
}

def classify(row):
    name = row['repo'].lower()
    lang = row['language']
    size_kb = int(row['size_kb'] or 0)
    ci = row['ci_pass_pct']
    pr_count = int(row['pr_merged_count'] or 0)
    has_ci = row['has_actions'] == '1'

    # Strong non-code signals
    name_match = any(kw in name for kw in NON_CODE_NAME_KEYWORDS)

    if lang == 'Markdown':
        return 'non-code'

    if name_match and lang in ('unknown', '', 'Markdown'):
        return 'non-code'

    if name_match and not has_ci and pr_count <= 5:
        return 'non-code'

    # Language unknown + no CI + tiny = likely non-code
    if lang in ('unknown', '') and not has_ci and size_kb < 50000:
        return 'non-code'

    # Strong code signals
    if lang in CODE_LANGUAGES and has_ci:
        return 'code'

    if lang in CODE_LANGUAGES:
        return 'code'

    # Ambiguous but has CI = probably code
    if has_ci:
        return 'code'

    # Default: if it has merged PRs, it's probably code
    if pr_count >= 5:
        return 'code'

    return 'non-code'

def main():
    with open('data/population.csv') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames + ['type']
        rows = list(reader)

    code_count = 0
    noncode_count = 0

    for row in rows:
        row['type'] = classify(row)
        if row['type'] == 'code':
            code_count += 1
        else:
            noncode_count += 1

    with open('data/population-classified.csv', 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f"Total: {len(rows)} repos")
    print(f"Code: {code_count} ({100*code_count/len(rows):.0f}%)")
    print(f"Non-code: {noncode_count} ({100*noncode_count/len(rows):.0f}%)")
    print()

    # Show non-code repos
    print("Non-code repos:")
    for row in sorted(rows, key=lambda r: -int(r['stars'])):
        if row['type'] == 'non-code':
            print(f"  {row['repo']:50s} lang={row['language']:12s} stars={row['stars']:>7s}")

if __name__ == '__main__':
    main()
