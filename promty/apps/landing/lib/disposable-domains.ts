export const disposableDomains = [
  '10minutemail.com',
  'mailinator.com',
  'guerrillamail.com',
  'yopmail.com',
  'tempmail.com',
  'trashmail.com',
  'throwawaymail.com',
  'temp-mail.org',
  'nada.email',
  // ... kita bisa menambahkan lebih banyak nanti
];

export const isDisposableEmail = (email: string): boolean => {
  const domain = email.split('@')[1];
  if (!domain) return true;
  return disposableDomains.includes(domain.toLowerCase());
};
