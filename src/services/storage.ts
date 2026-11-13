import { GermanTextPassage, ReadingSettings, SavedWord, ListeningStats, CEFRLevel } from '../types';

const STORAGE_KEYS = {
  TEXTS: 'deutsch_meister_texts_v1',
  ACTIVE_TEXT_ID: 'deutsch_meister_active_text_id',
  SAVED_WORDS: 'deutsch_meister_saved_words_v1',
  SETTINGS: 'deutsch_meister_settings_v1',
  STATS: 'deutsch_meister_stats_v1',
};

export const DEFAULT_SETTINGS: ReadingSettings = {
  voice: 'Rachel (ElevenLabs Shared)',
  voiceGender: 'female',
  elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM',
  elevenLabsModel: 'eleven_multilingual_v2',
  speed: 1.0,
  pitch: 0,
  defaultLevel: 'A2',
  readingMode: 'continuous',
  autoResumeAfterWord: false,
  autoScroll: true,
  sentencePauseMs: 350,
  paragraphPauseMs: 750,
  repeatMode: 'none',
  concentrationMode: false,
  timerMinutes: 0,
  theme: 'light',
  puterConsentGranted: false,
};

export const INITIAL_TEXTS: GermanTextPassage[] = [
  {
    id: 'seed-a2-work',
    title: 'Mein Beruf und mein Team',
    authorInfo: 'Erman Akay, 30 Jahre, München',
    level: 'A2',
    germanText:
      '„Ich bin Kfz-Ingenieur. In meiner Firma arbeiten viele Menschen aus verschiedenen Ländern. Wir verstehen uns sehr gut und unterstützen uns gegenseitig. Für mich ist ein gutes Arbeitsklima besonders wichtig. Ich finde, dass jeder Mensch die gleichen Chancen bekommen sollte.“',
    sentences: [
      '„Ich bin Kfz-Ingenieur.',
      'In meiner Firma arbeiten viele Menschen aus verschiedenen Ländern.',
      'Wir verstehen uns sehr gut und unterstützen uns gegenseitig.',
      'Für mich ist ein gutes Arbeitsklima besonders wichtig.',
      'Ich finde, dass jeder Mensch die gleichen Chancen bekommen sollte.“',
    ],
    arabicSummary:
      'أنا مهندس سيارات. في شركتي يعمل الكثير من الأشخاص من مختلف البلدان. نحن نتفاهم جيداً وندعم بعضنا البعض. بالنسبة لي بيئة العمل الجيدة مهمة جداً. أعتقد أنه ينبغي أن يحصل كل إنسان على نفس الفرص.',
    keyVocabulary: [
      {
        german: 'das Arbeitsklima',
        arabic: 'بيئة العمل / مناخ العمل',
        pos: 'Nomen',
        article: 'das',
        pronunciationArabic: 'داس أربايتس كليما',
      },
      {
        german: 'unterstützen',
        arabic: 'يدعم / يساند',
        pos: 'Verb',
        pronunciationArabic: 'أونتر شتوتسن',
      },
      {
        german: 'die Chance',
        arabic: 'الفرصة',
        pos: 'Nomen',
        article: 'die',
        plural: 'die Chancen',
        pronunciationArabic: 'دي شانسيه',
      },
      {
        german: 'gegenseitig',
        arabic: 'متبادل / بعضنا بعضاً',
        pos: 'Adjektiv',
        pronunciationArabic: 'غايغنزايتيش',
      },
    ],
    wordCount: 42,
    style: 'Personal Story',
    topic: 'Arbeit und Beruf',
    createdAt: '2026-11-12T08:00:00.000Z',
    isFavorite: true,
    approvedForShared: true,
  },
  {
    id: 'seed-b1-ausbildung',
    title: 'Ausbildung und Zukunftschancen',
    authorInfo: 'Sarah Lindemann, 24 Jahre, Hamburg',
    level: 'B1',
    germanText:
      '„Ich interessiere mich schon seit längerer Zeit für eine Ausbildung in Deutschland. Besonders wichtig ist mir, einen Beruf zu finden, der gute Zukunftsmöglichkeiten bietet. Deshalb informiere ich mich regelmäßig über verschiedene Ausbildungsberufe und deren Voraussetzungen. Außerdem möchte ich meine Deutschkenntnisse stetig verbessern, damit ich mich im Alltag und bei der Arbeit sicher verständigen kann.“',
    sentences: [
      '„Ich interessiere mich schon seit längerer Zeit für eine Ausbildung in Deutschland.',
      'Besonders wichtig ist mir, einen Beruf zu finden, der gute Zukunftsmöglichkeiten bietet.',
      'Deshalb informiere ich mich regelmäßig über verschiedene Ausbildungsberufe und deren Voraussetzungen.',
      'Außerdem möchte ich meine Deutschkenntnisse stetig verbessern, damit ich mich im Alltag und bei der Arbeit sicher verständigen kann.“',
    ],
    arabicSummary:
      'أنا مهتمة منذ فترة طويلة بالتدريب المهني في ألمانيا. من المهم جداً بالنسبة لي العثور على مهنة توفر فرصاً جيدة للمستقبل. لذلك أستعلم بانتظام عن مختلف المهن وشروطها. بالإضافة إلى ذلك أرغب في تحسين لغتي الألمانية باستمرار حتى أتمكن من التواصل بثقة في الحياة اليومية والعمل.',
    keyVocabulary: [
      {
        german: 'die Ausbildung',
        arabic: 'التدريب المهني',
        pos: 'Nomen',
        article: 'die',
        plural: 'die Ausbildungen',
        pronunciationArabic: 'دي أوسبيلدونغ',
      },
      {
        german: 'die Voraussetzung',
        arabic: 'الشرط / المتطلب',
        pos: 'Nomen',
        article: 'die',
        plural: 'die Voraussetzungen',
        pronunciationArabic: 'دي فور أوس زيتسونغ',
      },
      {
        german: 'sich verständigen',
        arabic: 'يتفاهم / يتواصل',
        pos: 'Verb',
        pronunciationArabic: 'زيش فيرشتنديغن',
      },
    ],
    wordCount: 56,
    style: 'Educational Passage',
    topic: 'Ausbildung in Deutschland',
    createdAt: '2026-11-11T14:30:00.000Z',
    isFavorite: false,
    approvedForShared: true,
  },
  {
    id: 'seed-b2-digitalisierung',
    title: 'Künstliche Intelligenz und moderne Arbeitswelt',
    authorInfo: 'Dr. Jonas Becker, 38 Jahre, Frankfurt am Main',
    level: 'B2',
    germanText:
      '„Die Digitalisierung und der zunehmende Einsatz künstlicher Intelligenz transformieren nahezu sämtliche Wirtschaftszweige in rasantem Tempo. Während manche Beschäftigte den Verlust traditioneller Arbeitsplätze befürchten, betonen Experten vielmehr das Entstehen innovativer Tätigkeitsfelder. Entscheidend wird künftig sein, lebenslanges Lernen als selbstverständlichen Bestandteil der beruflichen Entwicklung zu begreifen.“',
    sentences: [
      '„Die Digitalisierung und der zunehmende Einsatz künstlicher Intelligenz transformieren nahezu sämtliche Wirtschaftszweige in rasantem Tempo.',
      'Während manche Beschäftigte den Verlust traditioneller Arbeitsplätze befürchten, betonen Experten vielmehr das Entstehen innovativer Tätigkeitsfelder.',
      'Entscheidend wird künftig sein, lebenslanges Lernen als selbstverständlichen Bestandteil der beruflichen Entwicklung zu begreifen.“',
    ],
    arabicSummary:
      'يؤدي التحول الرقمي والاستخدام المتزايد للذكاء الاصطناعي إلى تحول جميع القطاعات الاقتصادية تقريباً بوتيرة متسارعة. بينما يخشى بعض الموظفين فقدان الوظائف التقليدية، يؤكد الخبراء بدلاً من ذلك على ظهور مجالات عمل مبتكرة. سيكون من الحاسم في المستقبل اعتبار التعلم مدى الحياة جزءاً طبيعياً من التطور المهني.',
    keyVocabulary: [
      {
        german: 'die Digitalisierung',
        arabic: 'التحول الرقمي',
        pos: 'Nomen',
        article: 'die',
        pronunciationArabic: 'دي ديغيتاليزيرونغ',
      },
      {
        german: 'befürchten',
        arabic: 'يخشى / يتخوف',
        pos: 'Verb',
        pronunciationArabic: 'بي فورشتن',
      },
      {
        german: 'der Bestandteil',
        arabic: 'جزء لا يتجزأ / عنصر',
        pos: 'Nomen',
        article: 'der',
        plural: 'die Bestandteile',
        pronunciationArabic: 'دير بيشتاند تايل',
      },
    ],
    wordCount: 54,
    style: 'Opinion',
    topic: 'Künstliche Intelligenz',
    createdAt: '2026-11-10T11:15:00.000Z',
    isFavorite: false,
    approvedForShared: true,
  },
];

export const INITIAL_SAVED_WORDS: SavedWord[] = [
  {
    id: 'word-1',
    germanWord: 'Ausbildung',
    article: 'die',
    plural: 'Ausbildungen',
    arabicMeaning: 'تدريب مهني / تأهيل عملي',
    ipa: '[ˈaʊ̯sˌbɪldʊŋ]',
    arabicPronunciation: 'أوسبيلدونغ',
    partOfSpeech: 'Nomen',
    exampleGerman: 'Ich mache eine Ausbildung zum Mechatroniker.',
    exampleArabic: 'أقوم بتدريب مهني في ميكاترونيك.',
    level: 'B1',
    dateSaved: '2026-11-11T12:00:00.000Z',
    sourceTitle: 'Ausbildung und Zukunftschancen',
    mastery: 'learning',
  },
  {
    id: 'word-2',
    germanWord: 'unterstützen',
    arabicMeaning: 'يساند / يدعم / يساعد',
    ipa: '[ʊntɐˈʃtʏtsn̩]',
    arabicPronunciation: 'أونتر شتوتسن',
    partOfSpeech: 'Verb',
    exampleGerman: 'Wir unterstützen uns bei der täglichen Arbeit.',
    exampleArabic: 'نحن نساند بعضنا في العمل اليومي.',
    level: 'A2',
    dateSaved: '2026-11-12T08:30:00.000Z',
    sourceTitle: 'Mein Beruf und mein Team',
    mastery: 'mastered',
  },
  {
    id: 'word-3',
    germanWord: 'Arbeitsklima',
    article: 'das',
    plural: 'Arbeitsklimata',
    arabicMeaning: 'جو العمل / بيئة العمل',
    ipa: '[ˈaʁbaɪ̯tsˌkliːma]',
    arabicPronunciation: 'أربايتس كليما',
    partOfSpeech: 'Nomen',
    exampleGerman: 'Ein gutes Arbeitsklima motiviert alle Mitarbeiter.',
    exampleArabic: 'بيئة العمل الجيدة تحفز جميع الموظفين.',
    level: 'A2',
    dateSaved: '2026-11-12T09:00:00.000Z',
    sourceTitle: 'Mein Beruf und mein Team',
    mastery: 'review',
  },
];

export function getStoredTexts(): GermanTextPassage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.TEXTS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.TEXTS, JSON.stringify(INITIAL_TEXTS));
      return INITIAL_TEXTS;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading stored texts', e);
    return INITIAL_TEXTS;
  }
}

export function saveStoredTexts(texts: GermanTextPassage[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.TEXTS, JSON.stringify(texts));
  } catch (e) {
    console.error('Error saving texts', e);
  }
}

export function addTextPassage(passage: GermanTextPassage): void {
  const texts = getStoredTexts();
  const exists = texts.findIndex((t) => t.id === passage.id);
  if (exists >= 0) {
    texts[exists] = passage;
  } else {
    texts.unshift(passage);
  }
  saveStoredTexts(texts);
  setActiveTextId(passage.id);
}

export function getActiveTextId(): string {
  return localStorage.getItem(STORAGE_KEYS.ACTIVE_TEXT_ID) || INITIAL_TEXTS[0].id;
}

export function setActiveTextId(id: string): void {
  localStorage.setItem(STORAGE_KEYS.ACTIVE_TEXT_ID, id);
}

export function getStoredSavedWords(): SavedWord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SAVED_WORDS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.SAVED_WORDS, JSON.stringify(INITIAL_SAVED_WORDS));
      return INITIAL_SAVED_WORDS;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error('Error loading saved words', e);
    return INITIAL_SAVED_WORDS;
  }
}

export function saveStoredWords(words: SavedWord[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SAVED_WORDS, JSON.stringify(words));
  } catch (e) {
    console.error('Error saving words', e);
  }
}

export function addSavedWord(word: Omit<SavedWord, 'id' | 'dateSaved'>): SavedWord {
  const words = getStoredSavedWords();
  const existingIdx = words.findIndex(
    (w) => w.germanWord.toLowerCase() === word.germanWord.toLowerCase()
  );

  const newWord: SavedWord = {
    ...word,
    id: existingIdx >= 0 ? words[existingIdx].id : 'word-' + Date.now(),
    dateSaved: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    words[existingIdx] = newWord;
  } else {
    words.unshift(newWord);
  }

  saveStoredWords(words);
  updateStats({ wordsLookedUp: 1 });
  return newWord;
}

export function removeSavedWord(id: string): void {
  const words = getStoredSavedWords().filter((w) => w.id !== id);
  saveStoredWords(words);
}

export function getStoredSettings(): ReadingSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) {
      return DEFAULT_SETTINGS;
    }
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    return DEFAULT_SETTINGS;
  }
}

export function saveStoredSettings(settings: ReadingSettings): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    if (settings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  } catch (e) {
    console.error('Error saving settings', e);
  }
}

export function getStoredStats(): ListeningStats {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.STATS);
    if (!raw) {
      const initial: ListeningStats = {
        totalMinutesListened: 45,
        sentencesRead: 112,
        wordsLookedUp: 28,
        textsCompleted: 6,
      };
      localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(initial));
      return initial;
    }
    return JSON.parse(raw);
  } catch (e) {
    return { totalMinutesListened: 0, sentencesRead: 0, wordsLookedUp: 0, textsCompleted: 0 };
  }
}

export function updateStats(delta: Partial<ListeningStats>): void {
  const current = getStoredStats();
  const updated: ListeningStats = {
    totalMinutesListened: current.totalMinutesListened + (delta.totalMinutesListened || 0),
    sentencesRead: current.sentencesRead + (delta.sentencesRead || 0),
    wordsLookedUp: current.wordsLookedUp + (delta.wordsLookedUp || 0),
    textsCompleted: current.textsCompleted + (delta.textsCompleted || 0),
  };
  localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(updated));
}

export function exportWordsToCSV(words: SavedWord[]): void {
  const headers = ['الكلمة الألمانية', 'الأداة', 'الجمع', 'المعنى بالعربية', 'النطق بالعربية', 'IPA', 'نوع الكلمة', 'المستوى', 'مثال بالألماني', 'ترجمة المثال'];
  const rows = words.map((w) => [
    `"${w.germanWord}"`,
    `"${w.article || ''}"`,
    `"${w.plural || ''}"`,
    `"${w.arabicMeaning.replace(/"/g, '""')}"`,
    `"${w.arabicPronunciation || ''}"`,
    `"${w.ipa || ''}"`,
    `"${w.partOfSpeech || ''}"`,
    `"${w.level}"`,
    `"${(w.exampleGerman || '').replace(/"/g, '""')}"`,
    `"${(w.exampleArabic || '').replace(/"/g, '""')}"`,
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `deutsch_meister_vocabulary_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
