import { Workflow, WorkflowRun, ActionLog, BrowserSession, AIProviderType, WorkflowStep, QuizState } from '@promty/shared-types';

export interface StorageSchema {
  // Konfigurasi user
  'config:apiKey': string;
  'config:aiProvider': AIProviderType;
  'config:email': string;
  'config:setupComplete': boolean;

  // Active Execution State for background/popup sync
  'currentRun': {
    prompt?: string;
    steps?: WorkflowStep[];
    logs: Record<number, ActionLog>;
    status: 'running' | 'completed' | 'error';
  } | null;

  // LMS Quiz State
  'quizState': QuizState | null;

  // Daftar workflow (array of UUIDs)
  'workflows:list': string[];
  
  // Per workflow
  [key: `workflow:${string}`]: Workflow;

  // Per run
  [key: `runs:${string}`]: WorkflowRun[];

  // Per action log
  [key: `logs:${string}`]: ActionLog[];

  // Per browser session
  [key: `sessions:${string}`]: BrowserSession[];
}
