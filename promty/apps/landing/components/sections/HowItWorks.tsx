"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '../../hooks/useLanguage';
import { IconKeyboard, IconLayoutNavbar, IconRobot, IconRocket } from '@tabler/icons-react';

export const HowItWorks = () => {
  const { t } = useLanguage();

  const steps = [
    {
      icon: <IconKeyboard className="h-8 w-8 text-accent" />,
      title: t('how.step1.title'),
      desc: t('how.step1.desc'),
    },
    {
      icon: <IconLayoutNavbar className="h-8 w-8 text-accent" />,
      title: t('how.step2.title'),
      desc: t('how.step2.desc'),
    },
    {
      icon: <IconRobot className="h-8 w-8 text-accent" />,
      title: t('how.step3.title'),
      desc: t('how.step3.desc'),
    },
    {
      icon: <IconRocket className="h-8 w-8 text-accent" />,
      title: t('how.step4.title'),
      desc: t('how.step4.desc'),
    },
  ];

  return (
    <section id="how-it-works" className="py-24 px-6 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-16"
      >
        <h2 className="text-3xl font-bold text-white sm:text-4xl">{t('how.headline')}</h2>
      </motion.div>

      <div className="flex overflow-x-auto pb-8 snap-x snap-mandatory hide-scrollbar md:grid md:grid-cols-4 md:gap-8 md:overflow-visible md:pb-0">
        {steps.map((step, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.1 }}
            className="flex-none w-[85vw] sm:w-[300px] md:w-auto snap-center mr-6 md:mr-0 rounded-2xl border border-borderWhite bg-card p-8"
          >
            <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-xl bg-accent/10 border border-borderSubtle">
              {step.icon}
            </div>
            <h3 className="mb-3 text-xl font-bold text-white">{step.title}</h3>
            <p className="text-textMuted leading-relaxed">{step.desc}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
};
