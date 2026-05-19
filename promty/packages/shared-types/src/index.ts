// shared-types/src/index.ts

export type Result<T, E = Error> = 
  | { ok: true; data: T } 
  | { ok: false; error: E };

export type AIProviderType = 'gemini' | 'openai' | 'anthropic' | 'chatgpt' | 'claude' | 'deepseek';

export interface UserConfig {
  apiKey: string;
  aiProvider: AIProviderType;
  email: string;
}

export interface WorkflowPlan {
  summary?: string;
  estimatedDuration?: string;
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  index: number;
  actionType: ActionType;
  target: string;
  value?: string;
  description: string;
}

export type ActionType =
  | 'navigate'
  | 'click'
  | 'type'
  | 'scroll'
  | 'wait'
  | 'extract'
  | 'submit'
  | 'switch_tab'
  | 'new_tab'
  | 'close_tab'
  | 'done';

export interface AgentAction {
  thought?: string;
  actionType: ActionType;
  target?: string;
  value?: string;
  description: string;
}

export interface AgentMemory {
  [key: string]: any;
}

export interface Workflow {
  id: string;
  name: string;
  prompt: string;
  planJson: WorkflowStep[];
  status: 'draft' | 'approved' | 'running' | 'completed' | 'error';
  createdAt: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  status: 'running' | 'completed' | 'error' | 'cancelled';
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface ActionLog {
  id: string;
  runId: string;
  stepIndex: number;
  actionType: ActionType;
  thought?: string;
  target: string;
  value?: string;
  description?: string;
  status: 'pending' | 'running' | 'done' | 'error';
  timestamp: string;
}

export interface BrowserSession {
  id: string;
  runId: string;
  tabId: number;
  tabUrl: string;
  tabTitle: string;
  accessedAt: string;
}

export interface BrowserContext {
  activeTabUrl: string;
  activeTabTitle: string;
  availableTabs: { id: number; url: string; title: string }[];
}

export interface QuizQuestion {
  id: string;
  text: string;
  options: {
    id: string;
    text: string;
  }[];
}

export interface QuizState {
  status: 'idle' | 'extracting' | 'waiting_ai' | 'filling' | 'done';
  aiProvider: AIProviderType;
  questions: QuizQuestion[];
  answers: Record<string, string>;
  currentLmsTabId?: number;
  currentAiTabId?: number;
}
