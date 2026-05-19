import React, { useState } from 'react';
import { QuizState, AIProviderType } from '@promty/shared-types';

interface Props {
  quizState: QuizState | null;
  onStart: (provider: AIProviderType) => void;
  onStop: () => void;
}

export const QuizSolverUI: React.FC<Props> = ({ quizState, onStart, onStop }) => {
  const [selectedProvider, setSelectedProvider] = useState<AIProviderType>('chatgpt');

  if (!quizState || quizState.status === 'idle') {
    return (
      <div className="flex flex-col h-full p-6 text-white space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
            Promty AI
          </h1>
          <p className="text-sm text-gray-400 mt-1">LMS Quiz Agent</p>
        </div>

        <div className="flex-1">
          <p className="text-sm mb-4">
            Select the AI you want to use to answer the quiz. Make sure you are logged into the AI provider in your browser.
          </p>

          <div className="space-y-3">
            {[
              { id: 'chatgpt', name: 'ChatGPT' },
              { id: 'claude', name: 'Claude AI' },
              { id: 'gemini', name: 'Google Gemini' },
              { id: 'deepseek', name: 'DeepSeek' }
            ].map((p) => (
              <label 
                key={p.id} 
                className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedProvider === p.id 
                    ? 'border-blue-500 bg-blue-500/10' 
                    : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800'
                }`}
              >
                <input 
                  type="radio" 
                  name="provider" 
                  value={p.id} 
                  checked={selectedProvider === p.id}
                  onChange={(e) => setSelectedProvider(e.target.value as AIProviderType)}
                  className="mr-3"
                />
                <span className="font-medium">{p.name}</span>
              </label>
            ))}
          </div>
        </div>

        <button 
          onClick={() => onStart(selectedProvider)}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors"
        >
          Start Quiz Agent
        </button>
      </div>
    );
  }

  const renderAnswersList = () => {
    if (!quizState.answers || Object.keys(quizState.answers).length === 0) return null;

    return (
      <div className="mt-4 p-3 bg-gray-950/60 rounded-lg border border-gray-800/80 max-h-48 overflow-y-auto space-y-2">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 border-b border-gray-800 pb-1">
          Rekomendasi Jawaban AI
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 font-mono text-xs">
          {quizState.questions.map((q, idx) => {
            const qNum = idx + 1;
            const selectedVal = quizState.answers[q.id];
            if (!selectedVal) return null;

            const isTextInput = q.options.length === 1 && q.options[0].text === '[isian]';
            let displayAnswer = '';

            if (isTextInput) {
              displayAnswer = selectedVal;
            } else {
              const optIdx = q.options.findIndex(opt => opt.id === selectedVal);
              if (optIdx !== -1) {
                displayAnswer = String.fromCharCode(65 + optIdx);
              } else {
                displayAnswer = selectedVal.split('_').pop()?.toUpperCase() || selectedVal;
              }
            }

            return (
              <div key={q.id} className="flex justify-between py-0.5 border-b border-gray-900/50">
                <span className="text-gray-500">{qNum}.</span>
                <span className="text-green-400 font-bold truncate max-w-[80px]" title={displayAnswer}>
                  {displayAnswer}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full p-6 text-white space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
          Agent Running
        </h1>
        <p className="text-sm text-gray-400 mt-1 capitalize">Status: {quizState.status}</p>
      </div>

      <div className="flex-1 bg-gray-900 rounded-lg p-4 font-mono text-sm overflow-y-auto space-y-2 border border-gray-800">
        <p className="text-blue-400">&gt; Provider: {quizState.aiProvider}</p>
        <p className="text-yellow-400">&gt; Questions Extracted: {quizState.questions.length}</p>
        <p className="text-green-400">&gt; Answers Ready: {Object.keys(quizState.answers).length}</p>
        
        {quizState.status === 'extracting' && (
          <p className="text-gray-400 animate-pulse">&gt; Scraping LMS page...</p>
        )}
        {quizState.status === 'waiting_ai' && (
          <p className="text-gray-400 animate-pulse">&gt; Waiting for AI response...</p>
        )}
        {quizState.status === 'filling' && (
          <p className="text-gray-400 animate-pulse">&gt; Filling answers into LMS...</p>
        )}
        {quizState.status === 'done' && (
          <p className="text-green-400 font-bold">&gt; Finished!</p>
        )}

        {renderAnswersList()}
      </div>

      <button 
        onClick={onStop}
        className="w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors"
      >
        Stop Agent
      </button>
    </div>
  );
};
