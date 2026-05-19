"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../../hooks/useLanguage';
import { Button } from './Button';
import { IconX } from '@tabler/icons-react';

interface EmailGateProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EmailGate = ({ isOpen, onClose }: EmailGateProps) => {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 1. Regex check
    const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!regex.test(email)) {
      setError(t('email.error.format'));
      return;
    }

    setLoading(true);

    try {
      // 2. Validate email via API (MX + disposable check)
      const validateRes = await fetch('/api/validate-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const validateData = await validateRes.json();

      if (!validateData.valid) {
        if (validateData.reason === 'disposable') {
          setError(t('email.error.disposable'));
        } else {
          setError(t('email.error.mx'));
        }
        setLoading(false);
        return;
      }

      // 3. Register download
      const registerRes = await fetch('/api/register-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const registerData = await registerRes.json();

      if (!registerData.ok) {
        setError('Failed to register. Please try again.');
        setLoading(false);
        return;
      }

      // 4. Success -> Redirect
      const downloadUrl = process.env.NEXT_PUBLIC_EXTENSION_DOWNLOAD_URL || '#';
      window.location.href = downloadUrl;
    } catch (err: unknown) {
      console.error('EmailGate error:', err);
      setError('A network error occurred. Please try again.');
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-bgMain/80 backdrop-blur-sm"
            onClick={onClose}
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-borderWhite bg-card p-6 shadow-2xl sm:p-8"
          >
            <button
              onClick={onClose}
              className="absolute right-4 top-4 text-textMuted hover:text-white"
            >
              <IconX className="h-5 w-5" />
            </button>

            <h2 className="mb-2 text-2xl font-bold text-textMain">
              {t('email.title')}
            </h2>
            <p className="mb-6 text-textMuted">
              {t('email.desc')}
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('email.placeholder')}
                  className="w-full rounded-lg border border-borderWhite bg-bgMain px-4 py-3 text-white placeholder-textMuted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  required
                />
                {error && (
                  <p className="mt-2 text-sm text-danger">{error}</p>
                )}
              </div>
              
              <Button
                type="submit"
                className="w-full"
                isLoading={loading}
              >
                {loading ? t('email.loading') : t('email.submit')}
              </Button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};
