"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '../../hooks/useLanguage';
import { IconPlayerPlayFilled } from '@tabler/icons-react';

export const VideoSection = () => {
  const { t } = useLanguage();

  return (
    <section id="video" className="py-24 px-6 max-w-5xl mx-auto border-t border-borderWhite">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-12"
      >
        <h2 className="text-3xl font-bold text-white sm:text-4xl mb-4">{t('video.headline')}</h2>
        <p className="text-lg text-textMuted">{t('video.sub')}</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="relative aspect-video w-full overflow-hidden rounded-2xl border border-borderSubtle bg-surface shadow-2xl flex flex-col items-center justify-center group cursor-pointer"
      >
        <div className="absolute inset-0 bg-accent/5 opacity-0 transition-opacity group-hover:opacity-100" />
        
        <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-accent/20 border border-accent/40 backdrop-blur-sm transition-transform group-hover:scale-110">
          <IconPlayerPlayFilled className="h-8 w-8 text-accent ml-1" />
        </div>
        <p className="text-white font-medium tracking-wide">{t('video.comingSoon')}</p>
      </motion.div>
    </section>
  );
};
