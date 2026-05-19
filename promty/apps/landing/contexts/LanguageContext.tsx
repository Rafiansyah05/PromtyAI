"use client";

import React, { createContext, useState, ReactNode, useEffect } from 'react';
import { id, Translations } from '../locales/id';
import { en } from '../locales/en';

export type Language = 'id' | 'en';

interface LanguageContextProps {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: keyof Translations) => string;
}

export const LanguageContext = createContext<LanguageContextProps | undefined>(undefined);

export const LanguageProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguage] = useState<Language>('id');

  // Hydration fix for SSR
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedLang = localStorage.getItem('promty-lang') as Language;
    if (savedLang && (savedLang === 'id' || savedLang === 'en')) {
      setLanguage(savedLang);
    }
  }, []);

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang);
    localStorage.setItem('promty-lang', lang);
  };

  const t = (key: keyof Translations): string => {
    const translations = language === 'en' ? en : id;
    return translations[key] || key;
  };

  if (!mounted) {
    // Return default ID render during SSR to prevent hydration mismatch
    return (
      <LanguageContext.Provider value={{ language: 'id', setLanguage: handleSetLanguage, t: (k) => id[k] || k }}>
        {children}
      </LanguageContext.Provider>
    );
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage: handleSetLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};
