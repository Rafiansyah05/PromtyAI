import { Translations } from './id';

export const en: Translations = {
  // Navigation
  'nav.features': 'Features',
  'nav.howItWorks': 'How It Works',
  'nav.faq': 'FAQ',
  'nav.download': 'Download Extension',
  
  // Hero
  'hero.badge': '✦ Automatic Telkom University LMS Quiz Assistant',
  'hero.headline': 'Solve CeLOE LMS Quizzes Effortlessly With AI Assistance',
  'hero.subheadline': 'Promty automatically reads your Telkom University LMS quiz questions, analyzes the best answers using your preferred AI (ChatGPT, Claude, Gemini, or DeepSeek), and fills them in seconds.',
  'hero.cta.primary': 'Download Extension',
  'hero.cta.secondary': 'Watch Demo',

  // HowItWorks
  'how.headline': 'Simple, Fast, and Automatic',
  'how.step1.title': 'Choose Your Favorite AI',
  'how.step1.desc': 'Select ChatGPT, Claude, Gemini, or DeepSeek directly from the Promty extension popup.',
  'how.step2.title': 'Extract LMS Questions',
  'how.step2.desc': 'Promty automatically scans all questions and answer choices from the CeLOE LMS quiz page.',
  'how.step3.title': 'AI Answer Resolution',
  'how.step3.desc': 'The agent opens your selected AI tab, asks for highly accurate solutions in JSON format, and copies them.',
  'how.step4.title': 'Fulfill & Complete',
  'how.step4.desc': 'Promty returns to the LMS, fills all the answers on each page, and automatically clicks Finish Attempt.',

  // Features
  'feat.headline': 'Key Features of Promty LMS Quiz Agent',
  'feat.1.title': 'Pure Web Scraping (No API Key)',
  'feat.1.desc': 'No paid API keys needed. Directly leverage your active, free browser sessions of ChatGPT, Claude, Gemini, or DeepSeek.',
  'feat.2.title': 'Telkom University LMS Specialized',
  'feat.2.desc': 'Specially designed for lms.telkomuniversity.ac.id quiz pages with highly precise DOM selectors.',
  'feat.3.title': 'Automatic Multi-Page Navigation',
  'feat.3.desc': 'Promty automatically clicks the "Next page" button to scan all quiz questions from start to finish.',
  'feat.4.title': 'Smart Answer Fulfillment',
  'feat.4.desc': 'Supports multiple-choice questions by programmatically clicking radio inputs or checkboxes securely.',
  'feat.5.title': 'Completion & Finish Detection',
  'feat.5.desc': 'On the last page of the quiz, Promty automatically stops page navigation and clicks "Finish attempt" to complete.',
  'feat.6.title': 'Real-Time Progress Logs',
  'feat.6.desc': 'An interactive terminal-like display inside the popup showing the number of questions scraped and filling status.',

  // Video Section
  'video.headline': 'See Promty in Action',
  'video.sub': 'Watch how Promty solves LMS quizzes automatically',
  'video.comingSoon': 'Demo Video Coming Soon',

  // Download
  'dl.headline': 'Start Automatic Quizzes Now',
  'dl.step1': 'Download Promty Extension',
  'dl.step2': 'Login to Your Preferred AI in Browser',
  'dl.step3': 'Open LMS Quiz Page & Run',
  'dl.cta': 'Download Chrome Extension — Free',
  'dl.note': 'For Google Chrome only. Optimized specifically for lms.telkomuniversity.ac.id.',

  // Testimonials
  'testi.headline': 'What Students Say',
  'testi.verified': 'Telkom University Student',
  'testi.1.name': 'Rizky Aditya',
  'testi.1.role': 'Informatics Engineering, Class of 2022',
  'testi.1.text': 'Weekly quizzes on CeLOE LMS are now finished in seconds. Just select DeepSeek and let Promty do its magic!',
  'testi.2.name': 'Sarah Chen',
  'testi.2.role': 'Information Systems, Class of 2023',
  'testi.2.text': 'So practical! I no longer need to copy-paste questions one by one into ChatGPT. This extension is a true lifesaver.',
  'testi.3.name': 'Budi Santoso',
  'testi.3.role': 'Electrical Engineering, Class of 2021',
  'testi.3.text': 'The auto-filling is extremely smooth. Answer accuracy is superb since we can directly choose top AI models like Claude.',

  // FAQ
  'faq.headline': 'Frequently Asked Questions',
  'faq.1.q': 'Is Promty LMS Quiz Agent free?',
  'faq.1.a': 'Yes, 100% free! You don\'t need any paid AI API keys. Promty leverages your active browser sessions to communicate with AI models.',
  'faq.2.q': 'How does it work without an API Key?',
  'faq.2.a': 'The agent uses a local browser tab automation system. The extension copies all questions, opens a tab for your selected AI (e.g., ChatGPT), injects the prompt, waits for the response, copies the output, and returns to fill the LMS.',
  'faq.3.q': 'Is it safe to use?',
  'faq.3.a': 'Highly secure. Promty operates entirely locally inside your browser. Answer filling and page navigation mimic natural human clicks.',
  'faq.4.q': 'Which LMS platforms are supported?',
  'faq.4.a': 'It is currently optimized specifically for Moodle-based CeLOE LMS Telkom University (lms.telkomuniversity.ac.id).',
  'faq.5.q': 'Which AI models are supported?',
  'faq.5.a': 'Promty supports ChatGPT (OpenAI), Claude AI (Anthropic), Google Gemini, and DeepSeek. You only need to ensure you are logged into them in your browser.',

  // Contact
  'contact.headline': 'Have Questions or Issues?',
  'contact.sub': 'Our team is ready to help you resolve any technical issues',
  
  // Footer
  'footer.tagline': 'Telkom University LMS Quiz Automation with AI.',
  'footer.copy': '© 2026 Promty. Made with ♥ for Telkom University Students.',

  // Email Gate
  'email.title': 'Download Promty',
  'email.desc': 'Enter your student email address to start using the extension.',
  'email.placeholder': 'nim@student.telkomuniversity.ac.id',
  'email.submit': 'Continue',
  'email.error.format': 'Invalid email format',
  'email.error.disposable': 'Please use your primary email address',
  'email.error.mx': 'Email address cannot receive messages',
  'email.loading': 'Validating...',
};
