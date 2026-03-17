import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import * as path from 'path';
import { collectMetrics } from '../core/metrics';
import { calculateScore } from '../core/scoring';
import { renderSvg } from '../svg/render';
import { RenderFormat } from '../core/types';

async function run(): Promise<void> {
  try {
    const token = core.getInput('token', { required: true });
    const format = (core.getInput('format') || 'monitor') as RenderFormat;
    const outputPath = core.getInput('output-path') || '.github/health-pulse.svg';

    const octokit = github.getOctokit(token);
    const { owner, repo } = github.context.repo;

    core.info(`Collecting metrics for ${owner}/${repo}...`);
    const raw = await collectMetrics(octokit as any, owner, repo);

    core.info(`Calculating health score...`);
    const result = calculateScore(raw);

    core.info(`Score: ${result.score}/100 (${result.state})`);
    core.info(`  CI Pass Rate: ${raw.ciPassRate ?? 'N/A'}%`);
    core.info(`  PR Merge Time: ${raw.prMergeTimeHours ?? 'N/A'}h`);
    core.info(`  Releases/week: ${raw.releasesPerWeek}`);
    core.info(`  Response Time: ${raw.responseTimeHours ?? 'N/A'}h`);

    const svg = renderSvg(format, result, owner, repo);

    const dir = path.dirname(outputPath);
    if (dir && dir !== '.') {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, svg, 'utf-8');
    core.info(`SVG written to ${outputPath}`);

    core.setOutput('score', result.score);
    core.setOutput('state', result.state);
    core.setOutput('bpm', result.bpm);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('Unknown error');
    }
  }
}

run();
