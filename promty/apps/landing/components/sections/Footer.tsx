"use client";

import React from 'react';
import { useLanguage } from '../../hooks/useLanguage';
import { IconBrandTwitter, IconBrandGithub, IconBrandInstagram } from '@tabler/icons-react';

export const Footer = () => {
  const { t } = useLanguage();

  return (
    <footer className="border-t border-borderWhite bg-bgMain py-12 px-6">
      <div className="mx-auto max-w-7xl flex flex-col md:flex-row justify-between items-center gap-8">
        
        {/* Left: Logo & Tagline */}
        <div className="flex flex-col items-center md:items-start">
          <div className="flex items-center space-x-2 mb-2">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="8" fill="#2166E9" />
              <path d="M11 16H21M16 11V21" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-xl font-bold tracking-tight text-white">Promty.</span>
          </div>
          <p className="text-textMuted text-sm">{t('footer.tagline')}</p>
        </div>

        {/* Middle: Links */}
        <div className="flex items-center space-x-6 text-sm font-medium text-textMuted">
          <a href="#features" className="hover:text-white transition-colors">{t('nav.features')}</a>
          <a href="#how-it-works" className="hover:text-white transition-colors">{t('nav.howItWorks')}</a>
          <a href="#faq" className="hover:text-white transition-colors">{t('nav.faq')}</a>
        </div>

        {/* Right: Socials */}
        <div className="flex items-center space-x-4">
          <a href="#" className="text-textMuted hover:text-white transition-colors"><IconBrandTwitter className="h-5 w-5" /></a>
          <a href="#" className="text-textMuted hover:text-white transition-colors"><IconBrandGithub className="h-5 w-5" /></a>
          <a href="#" className="text-textMuted hover:text-white transition-colors"><IconBrandInstagram className="h-5 w-5" /></a>
        </div>
      </div>
      
      <div className="mt-12 text-center text-sm text-textMuted border-t border-borderWhite/50 pt-8">
        {t('footer.copy')}
      </div>
    </footer>
  );
};
