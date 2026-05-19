"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '../../hooks/useLanguage';
import { IconMessageChatbot, IconLayoutNavbar, IconListCheck, IconShieldCheck, IconBrowser, IconClipboardList } from '@tabler/icons-react';

export const Features = () => {
  const { t } = useLanguage();

  const features = [
    {
      icon: <IconMessageChatbot className="h-6 w-6 text-accent" />,
      title: t('feat.1.title'),
      desc: t('feat.1.desc'),
    },
    {
      icon: <IconLayoutNavbar className="h-6 w-6 text-accent" />,
      title: t('feat.2.title'),
      desc: t('feat.2.desc'),
    },
    {
      icon: <IconListCheck className="h-6 w-6 text-accent" />,
      title: t('feat.3.title'),
      desc: t('feat.3.desc'),
    },
    {
      icon: <IconShieldCheck className="h-6 w-6 text-accent" />,
      title: t('feat.4.title'),
      desc: t('feat.4.desc'),
    },
    {
      icon: <IconBrowser className="h-6 w-6 text-accent" />,
      title: t('feat.5.title'),
      desc: t('feat.5.desc'),
    },
    {
      icon: <IconClipboardList className="h-6 w-6 text-accent" />,
      title: t('feat.6.title'),
      desc: t('feat.6.desc'),
    },
  ];

  return (
    <section id="features" className="py-24 px-6 max-w-7xl mx-auto border-t border-borderWhite">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-16 max-w-2xl mx-auto"
      >
        <h2 className="text-3xl font-bold text-white sm:text-4xl">{t('feat.headline')}</h2>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.1 }}
            className="rounded-2xl border border-borderWhite bg-card p-6 transition-colors hover:border-accent/30"
          >
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 border border-borderSubtle">
              {feature.icon}
            </div>
            <h3 className="mb-2 text-xl font-bold text-white">{feature.title}</h3>
            <p className="text-textMuted leading-relaxed">{feature.desc}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
};
