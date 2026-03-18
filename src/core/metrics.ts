import { RawMetrics } from './types';

interface OctokitLike {
  rest: {
    actions: {
      listWorkflowRunsForRepo(params: any): Promise<any>;
    };
    pulls: {
      list(params: any): Promise<any>;
    };
    repos: {
      get(params: any): Promise<any>;
      listReleases(params: any): Promise<any>;
      listTags(params: any): Promise<any>;
      getCommit(params: any): Promise<any>;
    };
    issues: {
      listComments(params: any): Promise<any>;
    };
    search: {
      issuesAndPullRequests(params: any): Promise<any>;
    };
    [key: string]: any;
  };
  request?(route: string, params?: any): Promise<any>;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function hoursBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60);
}

function daysBetween(a: string, b: string): number {
  return hoursBetween(a, b) / 24;
}

export async function collectMetrics(
  octokit: OctokitLike,
  owner: string,
  repo: string
): Promise<RawMetrics> {
  // Fetch repo info for size (used by cohort scoring)
  let sizeKb = 0;
  try {
    const { data: repoInfo } = await octokit.rest.repos.get({ owner, repo });
    sizeKb = repoInfo.size || 0;
  } catch {}

  const [ci, prs, releases, issues] = await Promise.all([
    collectCi(octokit, owner, repo),
    collectPrs(octokit, owner, repo),
    collectReleases(octokit, owner, repo),
    collectIssueResponse(octokit, owner, repo),
  ]);

  return { ...ci, ...prs, ...releases, ...issues, sizeKb };
}

async function collectCi(
  octokit: OctokitLike,
  owner: string,
  repo: string
): Promise<Pick<RawMetrics, 'ciPassRate' | 'ciTotalRuns'>> {
  try {
    const { data } = await octokit.rest.actions.listWorkflowRunsForRepo({
      owner,
      repo,
      per_page: 30,
      status: 'completed',
    });

    const allRuns = data.workflow_runs || [];
    // Only count runs that actually executed (exclude skipped/cancelled)
    const runs = allRuns.filter((r: any) =>
      r.conclusion === 'success' || r.conclusion === 'failure'
    );
    if (runs.length === 0) return { ciPassRate: null, ciTotalRuns: 0 };

    const success = runs.filter((r: any) => r.conclusion === 'success').length;
    return {
      ciPassRate: Math.round((success / runs.length) * 100),
      ciTotalRuns: runs.length,
    };
  } catch {
    return { ciPassRate: null, ciTotalRuns: 0 };
  }
}

async function collectPrs(
  octokit: OctokitLike,
  owner: string,
  repo: string
): Promise<Pick<RawMetrics, 'prMergeTimeHours' | 'prMergedCount' | 'lastPrMergedDate'>> {
  try {
    const { data } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: 'closed',
      sort: 'updated',
      direction: 'desc',
      per_page: 30,
    });

    const merged = data.filter((pr: any) => pr.merged_at);
    if (merged.length === 0) return { prMergeTimeHours: null, prMergedCount: 0, lastPrMergedDate: null };

    // Sort by merge date to find the most recent
    const sortedByMerge = [...merged].sort((a: any, b: any) =>
      new Date(b.merged_at).getTime() - new Date(a.merged_at).getTime()
    );

    const times = merged.map((pr: any) => hoursBetween(pr.created_at, pr.merged_at));
    return {
      prMergeTimeHours: Math.round((median(times) ?? 0) * 10) / 10,
      prMergedCount: merged.length,
      lastPrMergedDate: sortedByMerge[0].merged_at,
    };
  } catch {
    return { prMergeTimeHours: null, prMergedCount: 0, lastPrMergedDate: null };
  }
}

async function collectReleases(
  octokit: OctokitLike,
  owner: string,
  repo: string
): Promise<Pick<RawMetrics, 'releasesPerWeek' | 'releaseCount' | 'releasePeriodDays' | 'lastReleaseDate'>> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const empty = { releasesPerWeek: 0, releaseCount: 0, releasePeriodDays: 0, lastReleaseDate: null };

  // Try GitHub Releases first
  try {
    const { data } = await octokit.rest.repos.listReleases({ owner, repo, per_page: 30 });

    if (data.length > 0) {
      const recent = data.filter((r: any) => r.published_at && r.published_at >= ninetyDaysAgo);
      const periodDays = daysBetween(data[data.length - 1].published_at, data[0].published_at);

      if (recent.length > 0) {
        return {
          releasesPerWeek: Math.round((recent.length / (90 / 7)) * 100) / 100,
          releaseCount: recent.length,
          releasePeriodDays: Math.round(periodDays),
          lastReleaseDate: data[0].published_at,
        };
      }
    }
  } catch {}

  // Fallback: count recent tags (many projects use tags instead of Releases)
  try {
    const { data: tags } = await (octokit as any).rest.repos.listTags({ owner, repo, per_page: 30 });

    if (tags.length > 0) {
      // Get commit dates for the tags to filter by recency
      const tagDates: string[] = [];
      // Check first and last tag to estimate frequency (avoid too many API calls)
      for (const tag of tags.slice(0, 10)) {
        try {
          const { data: commit } = await (octokit as any).rest.repos.getCommit({
            owner, repo, ref: tag.commit.sha,
          });
          tagDates.push(commit.commit.committer.date);
        } catch { break; }
      }

      if (tagDates.length > 0) {
        const recentTags = tagDates.filter(d => d >= ninetyDaysAgo);
        if (recentTags.length > 0 || tagDates.length > 0) {
          const latestDate = tagDates[0];
          const count = recentTags.length;
          return {
            releasesPerWeek: Math.round((count / (90 / 7)) * 100) / 100,
            releaseCount: count,
            releasePeriodDays: tagDates.length > 1
              ? Math.round(daysBetween(tagDates[tagDates.length - 1], tagDates[0]))
              : 90,
            lastReleaseDate: latestDate,
          };
        }
      }
    }
  } catch {}

  return empty;
}

async function collectIssueResponse(
  octokit: OctokitLike,
  owner: string,
  repo: string
): Promise<Pick<RawMetrics, 'responseTimeHours' | 'responseIsBotOnly'>> {
  try {
    // Use search API to find only real issues (not PRs) with comments
    // Use search to filter real issues (not PRs) with comments
    const searchParams = { q: `repo:${owner}/${repo} is:issue is:closed comments:>0 sort:updated`, per_page: 10 };
    const { data } = await octokit.rest.search.issuesAndPullRequests(searchParams);

    const realIssues = data.items || [];
    if (realIssues.length === 0) return { responseTimeHours: null, responseIsBotOnly: false };

    const sample = realIssues.slice(0, 5);
    const responseTimes: number[] = [];
    let botCount = 0;

    for (const issue of sample) {
      try {
        const { data: comments } = await octokit.rest.issues.listComments({
          owner,
          repo,
          issue_number: issue.number,
          per_page: 1,
        });

        if (comments.length > 0) {
          const hours = hoursBetween(issue.created_at, comments[0].created_at);
          responseTimes.push(hours);

          const author = comments[0].user?.login || '';
          if (author.includes('bot') || author.includes('[bot]') || hours < 0.01) {
            botCount++;
          }
        }
      } catch {
        continue;
      }
    }

    return {
      responseTimeHours: median(responseTimes),
      responseIsBotOnly: botCount >= responseTimes.length * 0.8,
    };
  } catch {
    return { responseTimeHours: null, responseIsBotOnly: false };
  }
}
