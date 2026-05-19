"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '../../hooks/useLanguage';
import { IconStarFilled, IconRosetteDiscountCheckFilled } from '@tabler/icons-react';

export const Testimonials = () => {
  const { t } = useLanguage();

  const testimonials = [
    {
      name: t('testi.1.name'),
      role: t('testi.1.role'),
      text: t('testi.1.text'),
    },
    {
      name: t('testi.2.name'),
      role: t('testi.2.role'),
      text: t('testi.2.text'),
    },
    {
      name: t('testi.3.name'),
      role: t('testi.3.role'),
      text: t('testi.3.text'),
      rating: 4,
    },
  ];

  return (
    <section className="py-24 px-6 max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-16"
      >
        <h2 className="text-3xl font-bold text-white sm:text-4xl">{t('testi.headline')}</h2>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {testimonials.map((testi, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.1 }}
            className="rounded-2xl border border-borderSubtle bg-card p-8 flex flex-col h-full"
          >
            <div className="flex items-center gap-1 mb-6 text-warning">
              {[...Array(5)].map((_, i) => (
                <IconStarFilled key={i} className={`h-5 w-5 ${i >= (testi.rating || 5) ? 'opacity-30' : ''}`} />
              ))}
            </div>
            <p className="text-white text-lg leading-relaxed flex-grow mb-8">&quot;{testi.text}&quot;</p>
            
            <div className="flex items-center gap-4 mt-auto">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-white font-bold text-xl">
                {testi.name.charAt(0)}
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <h4 className="font-bold text-white">{testi.name}</h4>
                  <IconRosetteDiscountCheckFilled className="h-4 w-4 text-accent" />
                </div>
                <p className="text-sm text-textMuted">{testi.role}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
};
