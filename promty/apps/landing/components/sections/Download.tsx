"use client";

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '../../hooks/useLanguage';
import { Button } from '../ui/Button';
import { EmailGate } from '../ui/EmailGate';
import { IconBrandChrome, IconPlus, IconKey } from '@tabler/icons-react';

export const Download = () => {
  const { t } = useLanguage();
  const [isEmailGateOpen, setEmailGateOpen] = useState(false);

  const steps = [
    { icon: <IconBrandChrome className="h-6 w-6" />, text: t('dl.step1') },
    { icon: <IconPlus className="h-6 w-6" />, text: t('dl.step2') },
    { icon: <IconKey className="h-6 w-6" />, text: t('dl.step3') },
  ];

  return (
    <section className="bg-surface py-24 border-y border-borderWhite">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl font-bold text-white sm:text-4xl mb-12">{t('dl.headline')}</h2>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-4 mb-16">
            {steps.map((step, index) => (
              <React.Fragment key={index}>
                <div className="flex flex-col items-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-card border border-borderWhite text-textMuted mb-4">
                    {step.icon}
                  </div>
                  <span className="text-sm font-medium text-white max-w-[120px]">{step.text}</span>
                </div>
                {index < steps.length - 1 && (
                  <div className="hidden sm:block w-12 h-px bg-borderWhite mt-[-32px]" />
                )}
              </React.Fragment>
            ))}
          </div>

          <div className="max-w-md mx-auto">
            <Button onClick={() => setEmailGateOpen(true)} size="lg" className="w-full mb-6">
              {t('dl.cta')}
            </Button>
            <p className="text-sm text-textMuted">{t('dl.note')}</p>
          </div>
        </motion.div>
      </div>

      <EmailGate isOpen={isEmailGateOpen} onClose={() => setEmailGateOpen(false)} />
    </section>
  );
};
