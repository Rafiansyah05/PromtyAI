"use client";

import React, { useState } from 'react';
import { useLanguage } from '../../hooks/useLanguage';
import { Button } from '../ui/Button';
import { LanguageToggle } from '../ui/LanguageToggle';
import { EmailGate } from '../ui/EmailGate';

export const Navbar = () => {
  const { t } = useLanguage();
  const [isEmailGateOpen, setEmailGateOpen] = useState(false);

  return (
    <>
      <nav className="sticky top-0 z-40 w-full border-b border-borderWhite bg-card/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center space-x-2">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="8" fill="#2166E9" />
              <path d="M11 16H21M16 11V21" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-xl font-bold tracking-tight text-white">Promty<span className="text-accent">.</span></span>
          </div>

          <div className="hidden md:flex items-center space-x-8">
            <a href="#features" className="text-sm font-medium text-textMuted hover:text-white transition-colors">{t('nav.features')}</a>
            <a href="#how-it-works" className="text-sm font-medium text-textMuted hover:text-white transition-colors">{t('nav.howItWorks')}</a>
            <a href="#faq" className="text-sm font-medium text-textMuted hover:text-white transition-colors">{t('nav.faq')}</a>
          </div>

          <div className="flex items-center space-x-4">
            <LanguageToggle />
            <Button onClick={() => setEmailGateOpen(true)} size="sm">
              {t('nav.download')}
            </Button>
          </div>
        </div>
      </nav>

      <EmailGate isOpen={isEmailGateOpen} onClose={() => setEmailGateOpen(false)} />
    </>
  );
};
