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
  'dispostable.com',
  'getairmail.com',
  'guerrillamailblock.com',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamail.biz',
  'pokemail.net',
  'temporary-mail.net',
  'mailtothis.com',
  'tempmail.net',
  'sharklasers.com',
  'guerrillamail.de',
  'spam4.me',
  'grr.la',
  'sidmail.me',
  'temp-mail.io'
];

export const isDisposableEmail = (email: string): boolean => {
  const domain = email.split('@')[1];
  if (!domain) return true;
  return disposableDomains.includes(domain.toLowerCase());
};

export const isSpamOrGibberish = (email: string): boolean => {
  const localPart = email.split('@')[0]?.toLowerCase();
  const domain = email.split('@')[1]?.toLowerCase();
  
  if (!localPart || !domain) return true;

  // 1. Obvious spam keywords
  const spamKeywords = ['test', 'testing', 'scam', 'asdf', 'qwer', 'zxcv', '12345', 'dummy', 'sembarangan', 'palsu'];
  if (spamKeywords.some(keyword => localPart.includes(keyword))) {
    return true;
  }

  // 2. Gibberish check: repeated characters like aaaaa@, bbbbb@, asdfgh@
  if (/^(.)\1{4,}/.test(localPart)) return true; // e.g. "aaaaa"
  if (localPart === 'abcdef' || localPart === 'abcdefg') return true;

  // 3. Strict length checks for major providers
  // Google's minimum length for Gmail user registration is 6 characters.
  if (domain === 'gmail.com' && localPart.length < 6) {
    return true;
  }
  // Yahoo requires at least 4 characters
  if (domain === 'yahoo.com' && localPart.length < 4) {
    return true;
  }

  return false;
};
