# Repo Health Pulse

Real-time repository vital signs, visualized as a cardiac monitor.

---

## Monitor View (800x220)

Full dashboard with ECG waveform + vital signs panel.

### Healthy — `owner/repo-name` — Score 90/100

Normal sinus rhythm. CI passing, fast PR reviews, regular releases, quick issue response.

![healthy](assets/monitor-healthy.svg)

---

### Stressed — `owner/legacy-api` — Score 66/100

Elevated heart rate. Flaky CI, slow PR reviews, declining release frequency.

![stressed](assets/monitor-stressed.svg)

---

### Critical — `owner/payment-service` — Score 30/100

Arrhythmia. CI failing, PRs stalling for days, almost no releases, issues going unanswered.

![critical](assets/monitor-critical.svg)

---

### Flatline — `owner/abandoned-project` — Score 5/100

No heartbeat. No CI runs, no PRs, no releases, no activity.

![flatline](assets/monitor-flatline.svg)

---

## Minimal View (480x80)

Clean, compact. Just the ECG line, repo name, and score.

### Healthy

![mini-healthy](assets/minimal/mini-healthy.svg)

### Stressed

![mini-stressed](assets/minimal/mini-stressed.svg)

### Critical

![mini-critical](assets/minimal/mini-critical.svg)

### Flatline

![mini-flatline](assets/minimal/mini-flatline.svg)

---

## Badge View (280x32)

Inline badges, shields-style form factor.

| State | Badge |
|---|---|
| Healthy | ![healthy](assets/badge-healthy.svg) |
| Stressed | ![stressed](assets/badge-stressed.svg) |
| Critical | ![critical](assets/badge-critical.svg) |
| Flatline | ![flatline](assets/badge-flatline.svg) |

---

## Vital Signs Reference

| Metric | Label | What it measures | Data source |
|---|---|---|---|
| HR | Heart Rate | Composite health score (controls ECG speed) | Aggregate of all metrics |
| CI | CI Status | Build pass rate, avg build time, consecutive failures | GitHub Actions API |
| PR | PR Review Time | Median time from open to merge | Pull Requests API |
| RF | Release Frequency | Releases per week (rolling 30 days) | Releases/Tags API |
| IR | Issue Response | Median first response time on new issues | Issues API |

## How the ECG Changes

| Score | BPM | Waveform | Color |
|---|---|---|---|
| 80-100 | 60-80 | Normal sinus rhythm, clean PQRST | Green `#4ade80` |
| 60-79 | 80-100 | Faster rhythm, elevated T-waves | Amber `#eab308` |
| 20-59 | 100-130 | Irregular intervals, distorted waves | Red `#ef4444` |
| 0-19 | Flatline | Straight line with noise | Gray `#6b7280` |

## Usage (planned)

```markdown
<!-- Full monitor -->
![health](https://repopulse.dev/monitor/owner/repo)

<!-- Minimal -->
![health](https://repopulse.dev/mini/owner/repo)

<!-- Compact badge -->
![health](https://repopulse.dev/badge/owner/repo)
```
