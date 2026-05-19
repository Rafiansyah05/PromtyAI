import { WorkflowStep } from '@promty/shared-types';

export type Message =
  | { type: 'EXECUTE_STEP'; payload: WorkflowStep }
  | { type: 'STEP_RESULT'; payload: { stepIndex: number; status: 'done' | 'error'; error?: string } }
  | { type: 'GET_PAGE_CONTEXT'; payload: null }
  | { type: 'PAGE_CONTEXT'; payload: { url: string; title: string; forms: string[] } }
  | { type: 'CANCEL_EXECUTION'; payload: null };
