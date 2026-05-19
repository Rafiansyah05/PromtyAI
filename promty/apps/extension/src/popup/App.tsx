import React, { useState, useEffect } from 'react';
import { storage } from '../lib/storage';
import { QuizState, AIProviderType } from '@promty/shared-types';
import { QuizSolverUI } from './screens/QuizSolverUI';

export const App = () => {
  const [quizState, setQuizState] = useState<QuizState | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadState();
    
    // Listen for storage changes from background
    const listener = (changes: any, area: string) => {
      if (area === 'local' && changes.quizState) {
        setQuizState(changes.quizState.newValue);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  const loadState = async () => {
    const state = await storage.get('quizState');
    if (state) {
      setQuizState(state);
    }
    setIsLoading(false);
  };

  const handleStart = async (provider: AIProviderType) => {
    try {
      const newState: QuizState = {
        status: 'extracting',
        aiProvider: provider,
        questions: [],
        answers: {}
      };
      await storage.set('quizState', newState);
      setQuizState(newState);
      
      chrome.runtime.sendMessage({ type: 'START_QUIZ', payload: { provider } }, () => {
        if (chrome.runtime.lastError) {
          console.warn('[Popup] START_QUIZ failed (likely context invalidated, please refresh LMS page):', chrome.runtime.lastError.message);
        }
      });
    } catch (e) {
      console.error('[Popup] Exception starting quiz solver:', e);
    }
  };

  const handleStop = async () => {
    try {
      await storage.set('quizState', null);
      setQuizState(null);
      chrome.runtime.sendMessage({ type: 'STOP_QUIZ' }, () => {
        if (chrome.runtime.lastError) {
          console.warn('[Popup] STOP_QUIZ failed:', chrome.runtime.lastError.message);
        }
      });
    } catch (e) {
      console.error('[Popup] Exception stopping quiz solver:', e);
    }
  };

  if (isLoading) {
    return <div className="flex h-full items-center justify-center text-white bg-[#0F1420]">Loading...</div>;
  }

  return (
    <div className="h-full w-full flex flex-col bg-[#0F1420]">
      <QuizSolverUI 
        quizState={quizState} 
        onStart={handleStart} 
        onStop={handleStop}
      />
    </div>
  );
};
