/** Shared, deliberately narrow DTOs for the Jules integration (no API keys). */
export const JULES_LIMITS = { title: 120, prompt: 12_000, message: 8_000 } as const;

export interface JulesStatus {
  enabled: boolean;
  apiKeyConfigured: boolean;
  strictAuth: boolean;
  repository: string;
  startingBranch: string;
  ready: boolean;
  problems: string[];
  authenticated: boolean;
  accountReady: boolean;
}

export interface JulesSource {
  name: string;
  id: string;
  githubRepo: {
    owner: string;
    repo: string;
    isPrivate: boolean;
    defaultBranch?: { displayName: string };
    branches: { displayName: string }[];
  };
}

export interface JulesSession {
  name: string;
  /** Canonical ID derived from name, not the optional upstream id field. */
  id: string;
  title: string;
  prompt: string;
  state: string;
  url?: string;
  createTime?: string;
  updateTime?: string;
  sourceContext?: {
    source: string;
    githubRepoContext?: { startingBranch: string };
  };
  outputs: { pullRequest: { url: string; title: string; description: string } }[];
}

export interface JulesPlan {
  id: string;
  createTime?: string;
  steps: { id: string; index: number; title: string; description: string }[];
}

export interface JulesArtifact {
  changeSet?: {
    source: string;
    gitPatch: { baseCommitId: string; unidiffPatch: string; suggestedCommitMessage: string };
  };
  bashOutput?: { command: string; output: string; exitCode?: number };
}

export interface JulesActivity {
  name: string;
  id: string;
  originator: string;
  description: string;
  createTime?: string;
  planGenerated?: { plan: JulesPlan };
  planApproved?: { planId: string };
  userMessaged?: { userMessage: string };
  agentMessaged?: { agentMessage: string };
  progressUpdated?: { title: string; description: string };
  sessionCompleted?: Record<string, never>;
  sessionFailed?: { reason: string };
  artifacts: JulesArtifact[];
}

export interface JulesSourcesPage {
  sources: JulesSource[];
  nextPageToken?: string;
}
export interface JulesSessionsPage {
  sessions: JulesSession[];
  nextPageToken?: string;
}
export interface JulesActivitiesPage {
  activities: JulesActivity[];
  nextPageToken?: string;
}

export interface JulesCreateInput {
  title: string;
  prompt: string;
  source: string;
  startingBranch: string;
  privacyAcknowledged: boolean;
  requestId: string;
}
