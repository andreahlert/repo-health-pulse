(function () {
  "use strict";

  var DATA_URL = "repos.json";

  /* ── Language colors (subset) ──────────────────── */
  var LANG_COLORS = {
    JavaScript: "#f1e05a",
    TypeScript: "#3178c6",
    Python: "#3572A5",
    Go: "#00ADD8",
    Rust: "#dea584",
    Java: "#b07219",
    "C++": "#f34b7d",
    C: "#555555",
    "C#": "#178600",
    Ruby: "#701516",
    PHP: "#4F5D95",
    Shell: "#89e051",
    Dart: "#00B4AB",
    Kotlin: "#A97BFF",
    Swift: "#F05138",
    Vue: "#41b883",
    "Jupyter Notebook": "#DA5B0B",
    unknown: "#6b7280",
  };

  /* ── State ─────────────────────────────────────── */
  var allRepos = [];
  var activeState = "all";
  var activeStars = "all";

  /* ── DOM refs ──────────────────────────────────── */
  var grid = document.getElementById("repo-grid");
  var stateFilters = document.getElementById("state-filters");
  var starFilters = document.getElementById("star-filters");
  var languageFilter = document.getElementById("language-filter");
  var searchInput = document.getElementById("search-input");
  var sortSelect = document.getElementById("sort-select");

  /* ── Helpers ───────────────────────────────────── */
  function owner(repo) {
    return repo.split("/")[0];
  }

  function formatNum(n) {
    if (n == null) return "N/A";
    if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
    if (n >= 1000) return (n / 1000).toFixed(n >= 100000 ? 0 : 1) + "k";
    return String(n);
  }

  function formatHours(h) {
    if (h == null || isNaN(h)) return "N/A";
    if (h < 1) return "<1h";
    if (h < 24) return h.toFixed(1) + "h";
    return (h / 24).toFixed(1) + "d";
  }

  function median(arr) {
    if (!arr.length) return 0;
    var sorted = arr.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function starsInRange(stars, range) {
    switch (range) {
      case "all": return true;
      case "1k-5k": return stars >= 1000 && stars < 5000;
      case "5k-10k": return stars >= 5000 && stars < 10000;
      case "10k-50k": return stars >= 10000 && stars < 50000;
      case "50k+": return stars >= 50000;
      default: return true;
    }
  }

  function stateColor(state) {
    var map = { healthy: "#4ade80", stressed: "#eab308", critical: "#ef4444", flatline: "#6b7280" };
    return map[state] || "#6b7280";
  }

  function truncate(str, max) {
    if (!str) return "";
    return str.length > max ? str.slice(0, max) + "..." : str;
  }

  /* ── Metric bar color logic ────────────────────── */
  function ciBarColor(val) {
    if (val == null) return "#6b7280";
    if (val >= 90) return "#4ade80";
    if (val >= 70) return "#eab308";
    return "#ef4444";
  }

  function prBarColor(hours) {
    if (hours == null) return "#6b7280";
    if (hours <= 24) return "#4ade80";
    if (hours <= 72) return "#eab308";
    return "#ef4444";
  }

  function releaseBarColor(rpw) {
    if (rpw == null) return "#6b7280";
    if (rpw >= 0.5) return "#4ade80";
    if (rpw > 0) return "#eab308";
    return "#ef4444";
  }

  function responseBarColor(hours) {
    if (hours == null) return "#6b7280";
    if (hours <= 24) return "#4ade80";
    if (hours <= 72) return "#eab308";
    return "#ef4444";
  }

  /* ── Normalize values to 0-100 for bar width ──── */
  function ciPct(val) {
    return val != null ? Math.min(100, Math.max(0, val)) : 0;
  }

  function prPct(hours) {
    if (hours == null) return 0;
    // Inverse: lower is better. Cap at 168h (1 week)
    return Math.max(0, Math.min(100, 100 - (hours / 168) * 100));
  }

  function releasePct(rpw) {
    if (rpw == null) return 0;
    // Cap at 5 releases/week
    return Math.min(100, (rpw / 5) * 100);
  }

  function responsePct(hours) {
    if (hours == null) return 0;
    // Inverse: lower is better. Cap at 168h (1 week)
    return Math.max(0, Math.min(100, 100 - (hours / 168) * 100));
  }

  /* ── SVG icons ─────────────────────────────────── */
  var starSvg = '<svg viewBox="0 0 16 16"><path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/></svg>';
  var forkSvg = '<svg viewBox="0 0 16 16"><path d="M5 3.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0 2.122a2.25 2.25 0 10-1.5 0v.878A2.25 2.25 0 005.75 8.5h1.5v2.128a2.251 2.251 0 101.5 0V8.5h1.5a2.25 2.25 0 002.25-2.25v-.878a2.25 2.25 0 10-1.5 0v.878a.75.75 0 01-.75.75h-4.5A.75.75 0 015 6.25v-.878zm3.75 7.378a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3-8.75a.75.75 0 100-1.5.75.75 0 000 1.5z"/></svg>';

  /* ── Render stats banner ───────────────────────── */
  function renderStats(repos) {
    var counts = { healthy: 0, stressed: 0, critical: 0, flatline: 0 };
    repos.forEach(function (r) { if (counts[r.state] !== undefined) counts[r.state]++; });

    document.getElementById("stat-total").textContent = repos.length;
    document.getElementById("stat-healthy").textContent = counts.healthy;
    document.getElementById("stat-stressed").textContent = counts.stressed;
    document.getElementById("stat-critical").textContent = counts.critical;
    document.getElementById("stat-flatline").textContent = counts.flatline;
    document.getElementById("stat-median").textContent = Math.round(median(repos.map(function (r) { return r.score; })));
  }

  /* ── Build a metric bar row ────────────────────── */
  function metricBarHtml(label, pct, color, displayVal) {
    return '' +
      '<div class="metric-bar-row">' +
        '<span class="metric-bar-label">' + label + '</span>' +
        '<div class="metric-bar-track">' +
          '<div class="metric-bar-fill" style="width:' + pct + '%;background:' + color + '"></div>' +
        '</div>' +
        '<span class="metric-bar-value">' + displayVal + '</span>' +
      '</div>';
  }

  /* ── Build a card ──────────────────────────────── */
  function createCard(repo) {
    var o = owner(repo.repo);
    var langColor = LANG_COLORS[repo.language] || LANG_COLORS.unknown;
    var repoType = repo.type || "code";
    var isNonCode = repoType !== "code";
    var desc = repo.description ? truncate(repo.description, 80) : "";

    var card = document.createElement("div");
    card.className = "card";
    card.setAttribute("data-state", repo.state);
    card.addEventListener("click", function () {
      window.location.href = "detail.html?repo=" + encodeURIComponent(repo.repo);
    });

    // Metric bar values
    var ciVal = repo.ci != null ? repo.ci + "%" : "N/A";
    var prVal = formatHours(repo.pr_hours);
    var relVal = repo.releases_per_week != null ? repo.releases_per_week.toFixed(1) + "/w" : "0/w";
    var respVal = formatHours(repo.response_hours);

    var typeTag = isNonCode
      ? '<span class="card-type-tag">' + repoType + '</span>'
      : '';

    var descHtml = desc
      ? '<div class="card-description" title="' + (repo.description || '').replace(/"/g, '&quot;') + '">' + desc + '</div>'
      : '';

    var langHtml = repo.language
      ? '<span class="card-lang"><span class="lang-dot" style="background:' + langColor + '"></span>' + repo.language + '</span>'
      : '';

    card.innerHTML =
      '<div class="card-body">' +
        /* Header: avatar + name + stars/forks */
        '<div class="card-header">' +
          '<img src="https://github.com/' + o + '.png?size=40" class="card-avatar" loading="lazy" alt="">' +
          '<span class="card-name" title="' + repo.repo + '">' + repo.repo + '</span>' +
          (typeTag ? ' ' + typeTag : '') +
          '<span class="meta-item" style="margin-left:auto">' + starSvg + formatNum(repo.stars) + '</span>' +
          '<span class="meta-item">' + forkSvg + formatNum(repo.forks) + '</span>' +
        '</div>' +

        /* Description */
        descHtml +

        /* Metric bars */
        '<div class="metric-bars">' +
          metricBarHtml('CI', ciPct(repo.ci), ciBarColor(repo.ci), ciVal) +
          metricBarHtml('PR', prPct(repo.pr_hours), prBarColor(repo.pr_hours), prVal) +
          metricBarHtml('REL', releasePct(repo.releases_per_week), releaseBarColor(repo.releases_per_week), relVal) +
          (repo.response_hours != null ? metricBarHtml('RESP', responsePct(repo.response_hours), responseBarColor(repo.response_hours), respVal) : '') +
        '</div>' +

        /* Score badge + language */
        '<div class="card-bottom">' +
          '<div class="card-bottom-left">' +
            langHtml +
          '</div>' +
          '<span class="badge ' + repo.state + '" style="font-size:0.625rem;padding:3px 10px">' + repo.score + ' ' + repo.state.toUpperCase() + '</span>' +
        '</div>' +
      '</div>';

    return card;
  }

  /* ── Filter + Sort + Render ────────────────────── */
  function render() {
    var query = searchInput.value.toLowerCase().trim();
    var lang = languageFilter.value;
    var sortKey = sortSelect.value;

    var filtered = allRepos.filter(function (r) {
      if (activeState !== "all" && r.state !== activeState) return false;
      if (lang !== "all" && r.language !== lang) return false;
      if (!starsInRange(r.stars, activeStars)) return false;
      if (query && r.repo.toLowerCase().indexOf(query) === -1) return false;
      return true;
    });

    filtered.sort(function (a, b) {
      switch (sortKey) {
        case "score": return b.score - a.score;
        case "stars": return b.stars - a.stars;
        case "pr_hours": return (a.pr_hours || 99999) - (b.pr_hours || 99999);
        case "ci": return (b.ci || 0) - (a.ci || 0);
        case "name": return a.repo.localeCompare(b.repo);
        default: return 0;
      }
    });

    grid.innerHTML = "";

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="empty-state"><p>No repos match the current filters</p><span>Try adjusting your search or filter criteria</span></div>';
      return;
    }

    var fragment = document.createDocumentFragment();
    filtered.forEach(function (repo) {
      fragment.appendChild(createCard(repo));
    });
    grid.appendChild(fragment);
  }

  /* ── Populate language dropdown ────────────────── */
  function populateLanguages(repos) {
    var langs = {};
    repos.forEach(function (r) {
      if (r.language) langs[r.language] = (langs[r.language] || 0) + 1;
    });

    Object.keys(langs).sort().forEach(function (lang) {
      var opt = document.createElement("option");
      opt.value = lang;
      opt.textContent = lang + " (" + langs[lang] + ")";
      languageFilter.appendChild(opt);
    });
  }

  /* ── Check if any non-code repos exist, show legend ── */
  function maybeShowLegend(repos) {
    var hasNonCode = repos.some(function (r) { return r.type && r.type !== "code"; });
    if (hasNonCode) {
      var legend = document.getElementById("legend-bar");
      if (legend) legend.style.display = "flex";
    }
  }

  /* ── Wire up events ────────────────────────────── */
  function setupToggleGroup(container, setter) {
    container.addEventListener("click", function (e) {
      var btn = e.target.closest(".toggle-btn");
      if (!btn) return;
      container.querySelectorAll(".toggle-btn").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      setter(btn);
      render();
    });
  }

  setupToggleGroup(stateFilters, function (btn) { activeState = btn.dataset.state; });
  setupToggleGroup(starFilters, function (btn) { activeStars = btn.dataset.stars; });

  languageFilter.addEventListener("change", render);
  sortSelect.addEventListener("change", render);

  var debounceTimer;
  searchInput.addEventListener("input", function () {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, 150);
  });

  /* ── Load data ─────────────────────────────────── */
  fetch(DATA_URL)
    .then(function (res) {
      if (!res.ok) throw new Error("Failed to load repos.json");
      return res.json();
    })
    .then(function (data) {
      allRepos = data;
      populateLanguages(data);
      renderStats(data);
      maybeShowLegend(data);
      render();
    })
    .catch(function (err) {
      grid.innerHTML = '<div class="empty-state"><p>Error loading data</p><span>' + err.message + '</span></div>';
      console.error(err);
    });
})();
