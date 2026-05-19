"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '../../hooks/useLanguage';
import { IconBrandWhatsapp, IconMail } from '@tabler/icons-react';

export const Contact = () => {
  const { t } = useLanguage();

  const waNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER || '6281234567890';
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@promty.id';

  return (
    <section className="py-24 px-6 border-t border-borderWhite bg-surface">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="max-w-2xl mx-auto text-center"
      >
        <h2 className="text-3xl font-bold text-white sm:text-4xl mb-4">{t('contact.headline')}</h2>
        <p className="text-lg text-textMuted mb-10">{t('contact.sub')}</p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href={`https://wa.me/${waNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-[#2AC346] px-8 py-4 font-bold text-white transition-transform hover:scale-[1.02] shadow-[0_0_20px_rgba(42,195,70,0.3)]"
          >
            <IconBrandWhatsapp className="h-6 w-6" />
            WhatsApp
          </a>
          
          <a
            href={`mailto:${supportEmail}`}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg border border-borderWhite bg-card px-8 py-4 font-bold text-white transition-colors hover:bg-surface"
          >
            <IconMail className="h-6 w-6" />
            Email Support
          </a>
        </div>
      </motion.div>
    </section>
  );
};
