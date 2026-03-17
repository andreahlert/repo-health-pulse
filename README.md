# Repo Health Pulse

Real-time repository vital signs, visualized as a cardiac monitor.

All data below is **real**, collected via GitHub API on 2026-03-17.

---

## Monitor View

Full dashboard with ECG waveform + vital signs panel.

### microsoft/vscode — HEALTHY (92/100)

100% CI pass rate. PRs merge in 1.2 hours (median). Weekly releases. Issues triaged almost instantly.

![vscode](assets/monitor-healthy.svg)

### facebook/react — STRESSED (58/100)

CI is solid, but PRs take 3.3 days to merge and releases happen roughly once a month. Issue response time averages 67 hours.

![react](assets/monitor-stressed.svg)

### kubernetes/kubernetes — CRITICAL (35/100)

30% CI failure rate. PRs take 8.3 days to merge. The fast issue response time is misleading: it's automated bot replies, not humans.

![kubernetes](assets/monitor-critical.svg)

### expressjs/express — FLATLINE (15/100)

Zero releases in 106 days (last: 2025-12-01). Only 4 PRs merged in recent history. CI at 87% but nothing is shipping.

![express](assets/monitor-flatline.svg)

---

## Minimal View

Just the ECG line, repo name, and score.

![vscode](assets/minimal/mini-healthy.svg)

![react](assets/minimal/mini-stressed.svg)

![kubernetes](assets/minimal/mini-critical.svg)

![express](assets/minimal/mini-flatline.svg)

---

## Badge View

| State | Badge |
|---|---|
| Healthy | ![healthy](assets/badge-healthy.svg) |
| Stressed | ![stressed](assets/badge-stressed.svg) |
| Critical | ![critical](assets/badge-critical.svg) |
| Flatline | ![flatline](assets/badge-flatline.svg) |

---

## How Scoring Works

Data comes from GitHub API. Each metric maps to a 0-100 sub-score, then gets weighted into a composite.

| Metric | What it measures | Source | Scoring |
|---|---|---|---|
| CI Pass Rate | % of successful workflow runs (last 30) | Actions API | 100% = 100, 90% = 75, 80% = 50, <70% = 25 |
| PR Merge Time | Median time from open to merge | Pulls API | <4h = 100, <24h = 75, <3d = 50, <7d = 25, >7d = 0 |
| Releases | Releases per week (rolling 90 days) | Releases API | >2/wk = 100, ~weekly = 80, biweekly = 60, monthly = 40, none = 0 |
| Response Time | Median first response on new issues | Issues API | <2h = 100, <12h = 75, <48h = 50, <7d = 25, >7d = 0 |

### ECG Mapping

The composite score controls the visual:

| Score | Waveform | Speed | Color |
|---|---|---|---|
| 80-100 | Normal sinus rhythm | 4s cycle (calm) | Green `#4ade80` |
| 60-79 | Faster rhythm, taller T-waves | 2.5s cycle | Amber `#eab308` |
| 20-59 | Irregular intervals, distorted QRS | 3.5s cycle (erratic) | Red `#ef4444` |
| 0-19 | Flatline with noise | 6s cycle (fading) | Gray `#6b7280` |

### Caveats

- **Bot replies inflate response time scores.** Kubernetes shows <1min response, but it's all automated triage bots.
- **Monorepo workflows skew CI.** Large repos may have many workflow files, some experimental.
- **GitHub-only metrics.** Linux kernel uses LKML for patches and Bugzilla for bugs. From GitHub API, it looks "dead." It isn't.
- **Release strategy varies.** Some projects use tags instead of GitHub Releases, or publish from a separate CI pipeline.

## Usage (planned)

```markdown
<!-- Full monitor -->
![health](https://repopulse.dev/monitor/owner/repo)

<!-- Minimal -->
![health](https://repopulse.dev/mini/owner/repo)

<!-- Compact badge -->
![health](https://repopulse.dev/badge/owner/repo)
```
