"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '../../hooks/useLanguage';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { EmailGate } from '../ui/EmailGate';

export const Hero = () => {
  const { t } = useLanguage();
  const [isEmailGateOpen, setEmailGateOpen] = useState(false);

  return (
    <section className="relative overflow-hidden pt-24 pb-32">
      {/* Subtle Dot Pattern BG */}
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:24px_24px]" />
      
      <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex justify-center mb-6"
        >
          <Badge>{t('hero.badge')}</Badge>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-6 text-4xl font-extrabold tracking-tight text-white sm:text-6xl"
        >
          {t('hero.headline')}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mb-10 text-lg text-textMuted sm:text-xl max-w-2xl mx-auto leading-relaxed"
        >
          {t('hero.subheadline')}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
        >
          <Button onClick={() => setEmailGateOpen(true)} size="lg" className="w-full sm:w-auto">
            {t('hero.cta.primary')}
          </Button>
          <Button onClick={() => document.getElementById('video')?.scrollIntoView({ behavior: 'smooth' })} variant="secondary" size="lg" className="w-full sm:w-auto">
            {t('hero.cta.secondary')}
          </Button>
        </motion.div>
      </div>

      <EmailGate isOpen={isEmailGateOpen} onClose={() => setEmailGateOpen(false)} />
    </section>
  );
};
