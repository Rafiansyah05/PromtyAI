"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '../../hooks/useLanguage';
import { AccordionItem } from '../ui/AccordionItem';

export const FAQ = () => {
  const { t } = useLanguage();

  const faqs = [
    { q: t('faq.1.q'), a: t('faq.1.a') },
    { q: t('faq.2.q'), a: t('faq.2.a') },
    { q: t('faq.3.q'), a: t('faq.3.a') },
    { q: t('faq.4.q'), a: t('faq.4.a') },
    { q: t('faq.5.q'), a: t('faq.5.a') },
  ];

  return (
    <section id="faq" className="py-24 px-6 max-w-3xl mx-auto border-t border-borderWhite">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-12"
      >
        <h2 className="text-3xl font-bold text-white sm:text-4xl">{t('faq.headline')}</h2>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="bg-card border border-borderWhite rounded-2xl p-4 sm:p-8"
      >
        {faqs.map((faq, index) => (
          <AccordionItem
            key={index}
            question={faq.q}
            answer={faq.a}
            isOpen={index === 0}
          />
        ))}
      </motion.div>
    </section>
  );
};
