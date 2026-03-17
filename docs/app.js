(function () {
  "use strict";

  const DATA_URL = "repos.json";
  const SVG_BASE = "mini/";

  /* ── Language colors (subset) ──────────────────── */
  const LANG_COLORS = {
    JavaScript: "#f1e05a",
    TypeScript: "#3178c6",
    Python: "#3572A5",
    Go: "#00ADD8",
    Rust: "#dea584",
    Java: "#b07219",
    "C++": "#f34b7d",
    C: "#555555",
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
  let allRepos = [];
  let activeState = "all";
  let activeStars = "all";

  /* ── DOM refs ──────────────────────────────────── */
  const grid = document.getElementById("repo-grid");
  const stateFilters = document.getElementById("state-filters");
  const starFilters = document.getElementById("star-filters");
  const languageFilter = document.getElementById("language-filter");
  const searchInput = document.getElementById("search-input");
  const sortSelect = document.getElementById("sort-select");

  /* ── Helpers ───────────────────────────────────── */
  function slug(repo) {
    return repo.replace("/", "-");
  }

  function formatStars(n) {
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
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
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
    const map = { healthy: "#4ade80", stressed: "#eab308", critical: "#ef4444", flatline: "#6b7280" };
    return map[state] || "#6b7280";
  }

  /* ── Render stats banner ───────────────────────── */
  function renderStats(repos) {
    const counts = { healthy: 0, stressed: 0, critical: 0, flatline: 0 };
    repos.forEach(function (r) { if (counts[r.state] !== undefined) counts[r.state]++; });

    document.getElementById("stat-total").textContent = repos.length;
    document.getElementById("stat-healthy").textContent = counts.healthy;
    document.getElementById("stat-stressed").textContent = counts.stressed;
    document.getElementById("stat-critical").textContent = counts.critical;
    document.getElementById("stat-flatline").textContent = counts.flatline;
    document.getElementById("stat-median").textContent = Math.round(median(repos.map(function (r) { return r.score; })));
  }

  /* ── Build a card ──────────────────────────────── */
  function createCard(repo) {
    var s = slug(repo.repo);
    var langColor = LANG_COLORS[repo.language] || LANG_COLORS.unknown;

    var card = document.createElement("div");
    card.className = "card";
    card.innerHTML =
      '<div class="card-svg">' +
        '<img src="' + SVG_BASE + s + '.svg" alt="' + repo.repo + ' health pulse" loading="lazy" onerror="this.parentElement.innerHTML=\'<span style=&quot;color:#6b7280;font-size:0.75rem&quot;>SVG not found</span>\'">' +
      '</div>' +
      '<div class="card-body">' +
        '<div class="card-header">' +
          '<span class="card-name" title="' + repo.repo + '">' + repo.repo + '</span>' +
          '<span class="card-score" style="color:' + stateColor(repo.state) + '">' +
            repo.score +
            '<span class="badge ' + repo.state + '">' + repo.state + '</span>' +
          '</span>' +
        '</div>' +
        '<div class="card-metrics">' +
          '<div class="metric"><span class="metric-value">' + (repo.ci != null ? repo.ci + "%" : "N/A") + '</span><span class="metric-label">CI pass</span></div>' +
          '<div class="metric"><span class="metric-value">' + formatHours(repo.pr_hours) + '</span><span class="metric-label">PR merge</span></div>' +
          '<div class="metric"><span class="metric-value">' + (repo.releases_per_week != null ? repo.releases_per_week.toFixed(1) : "0") + '/w</span><span class="metric-label">Releases</span></div>' +
        '</div>' +
        '<div class="card-footer">' +
          '<span class="card-lang"><span class="lang-dot" style="background:' + langColor + '"></span>' + repo.language + '</span>' +
          '<span class="card-stars">' + formatStars(repo.stars) + ' &#9733;</span>' +
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

    /* Sort */
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

    /* Clear and draw */
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

    var sorted = Object.keys(langs).sort();
    sorted.forEach(function (lang) {
      var opt = document.createElement("option");
      opt.value = lang;
      opt.textContent = lang + " (" + langs[lang] + ")";
      languageFilter.appendChild(opt);
    });
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
      render();
    })
    .catch(function (err) {
      grid.innerHTML = '<div class="empty-state"><p>Error loading data</p><span>' + err.message + '</span></div>';
      console.error(err);
    });
})();
