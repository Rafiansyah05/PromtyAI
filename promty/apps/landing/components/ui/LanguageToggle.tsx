"use client";

import React from 'react';
import { useLanguage } from '../../hooks/useLanguage';

export const LanguageToggle = () => {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex items-center space-x-1 rounded-lg border border-borderWhite bg-card p-1">
      <button
        onClick={() => setLanguage('en')}
        className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
          language === 'en' ? 'bg-accent text-white' : 'text-textMuted hover:text-white'
        }`}
      >
        EN
      </button>
      <button
        onClick={() => setLanguage('id')}
        className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
          language === 'id' ? 'bg-accent text-white' : 'text-textMuted hover:text-white'
        }`}
      >
        ID
      </button>
    </div>
  );
};
