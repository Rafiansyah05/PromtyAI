"use client";

import React, { useState } from 'react';
import { IconChevronDown } from '@tabler/icons-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from './Button';

interface AccordionItemProps {
  question: string;
  answer: string;
  isOpen?: boolean;
}

export const AccordionItem = ({ question, answer, isOpen = false }: AccordionItemProps) => {
  const [open, setOpen] = useState(isOpen);

  return (
    <div className="border-b border-borderWhite py-4">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-left focus:outline-none"
      >
        <span className="text-lg font-medium text-textMain">{question}</span>
        <IconChevronDown
          className={cn(
            "h-5 w-5 text-accent transition-transform duration-300",
            open ? "rotate-180" : "rotate-0"
          )}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="pt-4 text-textMuted leading-relaxed">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
