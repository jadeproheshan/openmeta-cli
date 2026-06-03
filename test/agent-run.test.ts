import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import * as infra from '../src/infra/index.js';
import { AgentOrchestrator } from '../src/orchestration/agent.js';
import { issueRankingService } from '../src/services/index.js';
import type { AppConfig, RankedIssue } from '../src/types/index.js';
import { createRankedIssue } from './helpers/factories.js';

interface AgentRunInternals {
  run(options?: {
    headless?: boolean;
    force?: boolean;
    schedulerRun?: boolean;
    runChecks?: boolean;
    draftOnly?: boolean;
    refresh?: boolean;
    dryRun?: boolean;
  }): Promise<void>;
  confirmManualHeadlessRun(config: AppConfig): Promise<void>;
  initializeClients(config: AppConfig, options?: { validateLlm?: boolean }): Promise<void>;
  promptForIssue(issues: RankedIssue[]): Promise<RankedIssue>;
}

function createConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    userProfile: {
      techStack: ['typescript', 'react'],
      proficiency: 'intermediate',
      focusAreas: ['frontend'],
    },
    github: {
      pat: 'ghp_test_token',
      username: 'octocat',
    },
    llm: {
      provider: 'custom',
      apiBaseUrl: 'https://example.com/v1',
      apiKey: 'sk-test',
      modelName: 'test-model',
      apiHeaders: {},
    },
    automation: {
      enabled: true,
      scheduleTime: '09:00',
      timezone: 'UTC',
      contentType: 'issue-report',
      scheduler: 'manual',
      minMatchScore: 75,
      skipIfAlreadyGeneratedToday: false,
    },
    commitTemplate: 'feat: {{title}}',
    ...overrides,
  };
}

function muteUi(): void {
  spyOn(infra.ui, 'hero').mockImplementation(() => {});
  spyOn(infra.ui, 'stepper').mockImplementation(() => {});
  spyOn(infra.ui, 'section').mockImplementation(() => {});
  spyOn(infra.ui, 'recordList').mockImplementation(() => {});
  spyOn(infra.ui, 'card').mockImplementation(() => {});
  spyOn(infra.ui, 'stats').mockImplementation(() => {});
  spyOn(infra.ui, 'keyValues').mockImplementation(() => {});
  spyOn(infra.ui, 'callout').mockImplementation(() => {});
  spyOn(infra.ui, 'emptyState').mockImplementation(() => {});
  spyOn(infra.ui, 'banner').mockImplementation(() => {});
  spyOn(infra.ui, 'timeline').mockImplementation(() => {});
  spyOn(infra.ui, 'task').mockImplementation(async (_options, task) => task({
    setMessage() {},
  } as never));
}

beforeEach(() => {
  muteUi();
});

afterEach(() => {
  mock.restore();
});

describe('AgentOrchestrator run flow', () => {
  test('confirms manual headless runs before returning when no ranked issues are found', async () => {
    const orchestrator = new AgentOrchestrator() as unknown as AgentRunInternals;
    const config = createConfig();
    const emptyStateSpy = spyOn(infra.ui, 'emptyState').mockImplementation(() => {});
    const confirmSpy = spyOn(orchestrator as object as { confirmManualHeadlessRun: AgentRunInternals['confirmManualHeadlessRun'] }, 'confirmManualHeadlessRun')
      .mockResolvedValue(undefined);
    spyOn(infra.configService, 'get').mockResolvedValue(config);
    spyOn(orchestrator as object as { initializeClients: AgentRunInternals['initializeClients'] }, 'initializeClients').mockResolvedValue(undefined);
    spyOn(issueRankingService, 'loadRankedIssues').mockResolvedValue([]);

    await orchestrator.run({ headless: true });

    expect(confirmSpy).toHaveBeenCalledWith(config);
    expect(emptyStateSpy).toHaveBeenCalledWith(
      'OpenMeta Agent',
      'No viable issues found',
      'No issues met the current technical match threshold. Broaden your profile or try again later.',
    );
  });

  test('returns early when automation cannot select an issue above the threshold', async () => {
    const orchestrator = new AgentOrchestrator() as unknown as AgentRunInternals;
    const issue = createRankedIssue();
    const emptyStateSpy = spyOn(infra.ui, 'emptyState').mockImplementation(() => {});
    spyOn(infra.configService, 'get').mockResolvedValue(createConfig());
    spyOn(orchestrator as object as { initializeClients: AgentRunInternals['initializeClients'] }, 'initializeClients').mockResolvedValue(undefined);
    spyOn(issueRankingService, 'loadRankedIssues').mockResolvedValue([issue]);
    spyOn(issueRankingService, 'selectIssueForAutomation').mockReturnValue(undefined);

    await orchestrator.run({ headless: true, schedulerRun: true });

    expect(emptyStateSpy).toHaveBeenCalledWith(
      'OpenMeta Agent',
      'No issue met the automation threshold',
      'Top opportunities were below 75/100. Lower the threshold or widen your profile.',
    );
  });
});
