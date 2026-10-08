export type AutonomyMode = 'SAFE' | 'ASSISTED' | 'AUTONOMOUS';

export type RiskLevel = 'SAFE' | 'ASSISTED' | 'CRITICAL';

export interface AgentDNA {
  id: string;
  name: string;
  role: string;
  archetype: 'Orchestrator' | 'BrowserWorker' | 'FactChecker' | 'WindowsExecutive' | 'DataSpecialist' | 'VisionInspector' | 'SecurityGate';
  icon: string;
  model: string;
  capabilities: string[];
  limitations: string[];
  tools: string[];
  confidenceRequired: number;
  currentConfidence?: number;
  status: 'idle' | 'working' | 'verifying' | 'done' | 'error';
  activeStepTitle?: string;
  processedTasksCount: number;
}

export interface TaskStep {
  id: string;
  title: string;
  agentId: string;
  tool: string;
  toolArgs: string;
  dependsOn: string[];
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  verificationCheck: string;
  status: 'pending' | 'running' | 'waiting_approval' | 'completed' | 'failed';
  resultData?: any;
  logs?: string[];
  evidence?: {
    claim: string;
    source: string;
    confidence: number;
    hasDiscrepancy?: boolean;
    discrepancyNote?: string;
  };
  executionTimeMs?: number;
}

export interface ClaimEvidence {
  id: string;
  claim: string;
  source: string;
  confidence: number;
  agentId: string;
  timestamp: string;
  verified: boolean;
  counterEvidence?: string;
  hasDiscrepancy?: boolean;
  resolvedDiscrepancy?: string;
}

export interface ConflictItem {
  id: string;
  topic: string;
  agentA: { name: string; claim: string; source: string; confidence: number };
  agentB: { name: string; claim: string; source: string; confidence: number };
  status: 'detecting' | 'resolving' | 'resolved';
  resolution?: {
    rootCause: string;
    verifiedClaim: string;
    finalConfidence: number;
    recommendation: string;
  };
}

export interface BlackboardState {
  facts: string[];
  hypotheses: string[];
  claims: ClaimEvidence[];
  conflicts: ConflictItem[];
  activeTasksCount: number;
}

export interface MemorySystem {
  working: string[];
  conversation: { id: string; role: 'user' | 'orchestrator' | 'agent'; text: string; timestamp: string }[];
  episodic: { id: string; goal: string; date: string; agentsInvolved: number; success: boolean; duration: string }[];
  semantic: { key: string; value: string; category: 'Windows OS' | 'Browser' | 'Hardware' | 'User Preference' }[];
  procedural: { name: string; trigger: string; toolsChain: string[]; successRate: number; lastExecuted: string }[];
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  agentId: string;
  agentName: string;
  tool: string;
  riskLevel: RiskLevel;
  status: 'SUCCESS' | 'BLOCKED' | 'FLAGGED' | 'VERIFIED';
  details: string;
  confidence: number;
}

export interface ProductPriceItem {
  id: string;
  brand: string;
  retailer: string;
  price: string;
  vram: string;
  availability: string;
  confidence: number;
  verifiedSource: string;
}
