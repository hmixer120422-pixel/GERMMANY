import { WordExplanation } from '../types';

export const COMMON_GERMAN_DICTIONARY: Record<string, WordExplanation> = {
  // A
  ausbildung: {
    word: 'Ausbildung',
    lemma: 'Ausbildung',
    partOfSpeech: 'Nomen',
    contextMeaningArabic: 'تدريب مهني / تأهيل عملي',
    otherMeaningsArabic: ['تكوين مهني', 'تعليم عملي'],
    pronunciationArabic: 'أوسبيلدونغ',
    ipa: '[ˈaʊ̯sˌbɪldʊŋ]',
    nounInfo: { article: 'die', singular: 'die Ausbildung', plural: 'die Ausbildungen' },
    exampleGerman: 'Ich mache eine duale Ausbildung in Deutschland.',
    exampleArabic: 'أقوم بتدريب مهني مزدوج في ألمانيا.',
  },
  arbeit: {
    word: 'Arbeit',
    lemma: 'Arbeit',
    partOfSpeech: 'Nomen',
    contextMeaningArabic: 'عمل / شغل / وظيفة',
    otherMeaningsArabic: ['جهد', 'مهمة عمل'],
    pronunciationArabic: 'أربايت',
    ipa: '[ˈaʁbaɪ̯t]',
    nounInfo: { article: 'die', singular: 'die Arbeit', plural: 'die Arbeiten' },
    exampleGerman: 'Die Arbeit im Team macht mir großen Spaß.',
    exampleArabic: 'العمل ضمن الفريق يسعدني كثيراً.',
  },
  arbeitsklima: {
    word: 'Arbeitsklima',
    lemma: 'Arbeitsklima',
    partOfSpeech: 'Nomen',
    contextMeaningArabic: 'بيئة العمل / مناخ العمل',
    otherMeaningsArabic: ['أجواء العمل في الشركة'],
    pronunciationArabic: 'أربايتس كليما',
    ipa: '[ˈaʁbaɪ̯tsˌkliːma]',
    nounInfo: { article: 'das', singular: 'das Arbeitsklima', plural: 'die Arbeitsklimata' },
    exampleGerman: 'Ein gutes Arbeitsklima motiviert alle Mitarbeiter.',
    exampleArabic: 'بيئة العمل الإيجابية تحفز جميع الموظفين.',
  },
  arbeiten: {
    word: 'arbeiten',
    lemma: 'arbeiten',
    partOfSpeech: 'Verb',
    contextMeaningArabic: 'يعمل / يشتغل',
    pronunciationArabic: 'أربايتن',
    ipa: '[ˈaʁbaɪ̯tn̩]',
    verbInfo: {
      infinitiv: 'arbeiten',
      praesens: 'arbeitet',
      praeteritum: 'arbeitete',
      perfekt: 'hat gearbeitet',
      auxiliary: 'haben',
      isSeparable: false,
    },
    exampleGerman: 'Er arbeitet als Ingenieur bei einer Firma.',
    exampleArabic: 'هو يعمل كمهندس في إحدى الشركات.',
  },
  alltag: {
    word: 'Alltag',
    lemma: 'Alltag',
    partOfSpeech: 'Nomen',
    contextMeaningArabic: 'الحياة اليومية / الروتين اليومي',
    pronunciationArabic: 'ألتاغ',
    ipa: '[ˈalˌtaːk]',
    nounInfo: { article: 'der', singular: 'der Alltag', plural: 'die Alltage' },
    exampleGerman: 'Im Alltag spreche ich viel Deutsch.',
    exampleArabic: 'في الحياة اليومية أتحدث الألمانية كثيراً.',
  },
  // B
  beruf: {
    word: 'Beruf',
    lemma: 'Beruf',
    partOfSpeech: 'Nomen',
    contextMeaningArabic: 'مهنة / عمل تخصصي',
    pronunciationArabic: 'بيروف',
    ipa: '[bəˈʁuːf]',
    nounInfo: { article: 'der', singular: 'der Beruf', plural: 'die Berufe' },
    exampleGerman: 'Mein Beruf bietet mir hervorragende Zukunftschancen.',
    exampleArabic: 'مهنتي توفر لي فرصاً مستقبلية ممتازة.',
  },
  deutschland: {
    word: 'Deutschland',
    lemma: 'Deutschland',
    partOfSpeech: 'Nomen',
    contextMeaningArabic: 'ألمانيا',
    pronunciationArabic: 'دويتشلاند',
    ipa: '[ˈdɔɪ̯t͡ʃlant]',
    nounInfo: { article: 'das', singular: 'Deutschland', plural: '—' },
    exampleGerman: 'Ich lebe und arbeite in Deutschland.',
    exampleArabic: 'أنا أعيش وأعمل في ألمانيا.',
  },
  deutsch: {
    word: 'Deutsch',
    lemma: 'Deutsch',
    partOfSpeech: 'Nomen',
    contextMeaningArabic: 'اللغة الألمانية',
    pronunciationArabic: 'دويتش',
    ipa: '[dɔɪ̯t͡ʃ]',
    nounInfo: { article: 'das', singular: 'das Deutsch', plural: '—' },
    exampleGerman: 'Ich lerne jeden Tag Deutsch.',
    exampleArabic: 'أتعلم الألمانية كل يوم.',
  },
  familie: {
    word: 'Familie',
    lemma: 'Familie',
    partOfSpeech: 'Nomen',
    contextMeaningArabic: 'عائلة / أسرة',
    pronunciationArabic: 'فاميليِه',
    ipa: '[faˈmiːli̯ə]',
    nounInfo: { article: 'die', singular: 'die Familie', plural: 'die Familien' },
    exampleGerman: 'Meine Familie unterstützt mich sehr.',
    exampleArabic: 'عائلتي تدعمني كثيراً.',
  },
  freunde: {
    word: 'Freunde',
    lemma: 'Freund',
    partOfSpeech: 'Nomen',
    contextMeaningArabic: 'أصدقاء',
    pronunciationArabic: 'فروينده',
    ipa: '[ˈfʁɔɪ̯ndə]',
    nounInfo: { article: 'die', singular: 'der Freund', plural: 'die Freunde' },
    exampleGerman: 'Ich treffe mich am Wochenende mit Freunden.',
    exampleArabic: 'ألتقي بأصدقائي في نهاية الأسبوع.',
  },
  haus: {
    word: 'Haus',
    lemma: 'Haus',
    partOfSpeech: 'Nomen',
    contextMeaningArabic: 'منزل / بيت',
    pronunciationArabic: 'هاوس',
    ipa: '[haʊ̯s]',
    nounInfo: { article: 'das', singular: 'das Haus', plural: 'die Häuser' },
    exampleGerman: 'Das Haus hat einen schönen Garten.',
    exampleArabic: 'المنزل يحتوي على حديقة جميلة.',
  },
  wohnung: {
    word: 'Wohnung',
    lemma: 'Wohnung',
    partOfSpeech: 'Nomen',
    contextMeaningArabic: 'شقة سكنية',
    pronunciationArabic: 'فوهنونغ',
    ipa: '[ˈvoːnʊŋ]',
    nounInfo: { article: 'die', singular: 'die Wohnung', plural: 'die Wohnungen' },
    exampleGerman: 'Ich suche eine helle Wohnung in München.',
    exampleArabic: 'أبحث عن شقة مضيئة في ميونخ.',
  },
  leben: {
    word: 'leben',
    lemma: 'leben',
    partOfSpeech: 'Verb',
    contextMeaningArabic: 'يعيش / يحيا',
    pronunciationArabic: 'ليبن',
    ipa: '[ˈleːbn̩]',
    verbInfo: {
      infinitiv: 'leben',
      praesens: 'lebt',
      praeteritum: 'lebte',
      perfekt: 'hat gelebt',
      auxiliary: 'haben',
      isSeparable: false,
    },
    exampleGerman: 'Viele Menschen leben gerne in Großstädten.',
    exampleArabic: 'كثير من الناس يحبون العيش في المدن الكبرى.',
  },
  lernen: {
    word: 'lernen',
    lemma: 'lernen',
    partOfSpeech: 'Verb',
    contextMeaningArabic: 'يتعلم / يدرس',
    pronunciationArabic: 'ليرنن',
    ipa: '[ˈlɛʁnən]',
    verbInfo: {
      infinitiv: 'lernen',
      praesens: 'lernt',
      praeteritum: 'lernte',
      perfekt: 'hat gelernt',
      auxiliary: 'haben',
      isSeparable: false,
    },
    exampleGerman: 'Wir lernen Deutsch für den Beruf.',
    exampleArabic: 'نحن نتعلم الألمانية من أجل العمل.',
  },
  verstehen: {
    word: 'verstehen',
    lemma: 'verstehen',
    partOfSpeech: 'Verb',
    contextMeaningArabic: 'يفهم / يستوعب',
    pronunciationArabic: 'فيرشتيهن',
    ipa: '[fɛɐ̯ˈʃteːən]',
    verbInfo: {
      infinitiv: 'verstehen',
      praesens: 'versteht',
      praeteritum: 'verstand',
      perfekt: 'hat verstanden',
      auxiliary: 'haben',
      isSeparable: false,
    },
    exampleGerman: 'Wir verstehen uns im Team sehr gut.',
    exampleArabic: 'نحن نتفاهم جيداً في الفريق.',
  },
  unterstützen: {
    word: 'unterstützen',
    lemma: 'unterstützen',
    partOfSpeech: 'Verb',
    contextMeaningArabic: 'يساند / يدعم / يساعد',
    pronunciationArabic: 'أونتر شتوتسن',
    ipa: '[ʊntɐˈʃtʏtsn̩]',
    verbInfo: {
      infinitiv: 'unterstützen',
      praesens: 'unterstützt',
      praeteritum: 'unterstützte',
      perfekt: 'hat unterstützt',
      auxiliary: 'haben',
      isSeparable: false,
    },
    exampleGerman: 'Kollegen unterstützen sich gegenseitig.',
    exampleArabic: 'الزملاء يساندون بعضهم البعض.',
  },
  wichtig: {
    word: 'wichtig',
    lemma: 'wichtig',
    partOfSpeech: 'Adjektiv',
    contextMeaningArabic: 'مهم / ضروري',
    pronunciationArabic: 'فيشتيش',
    ipa: '[ˈvɪçtɪç]',
    adjectiveInfo: {
      base: 'wichtig',
      comparative: 'wichtiger',
      superlative: 'am wichtigsten',
    },
    exampleGerman: 'Pünktlichkeit ist in Deutschland sehr wichtig.',
    exampleArabic: 'الانضباط في المواعيد مهم جداً في ألمانيا.',
  },
  gut: {
    word: 'gut',
    lemma: 'gut',
    partOfSpeech: 'Adjektiv',
    contextMeaningArabic: 'جيد / طيب',
    pronunciationArabic: 'غوت',
    ipa: '[ɡuːt]',
    adjectiveInfo: {
      base: 'gut',
      comparative: 'besser',
      superlative: 'am besten',
    },
    exampleGerman: 'Das ist eine sehr gute Möglichkeit.',
    exampleArabic: 'هذه فرصة جيدة جداً.',
  },
  groß: {
    word: 'groß',
    lemma: 'groß',
    partOfSpeech: 'Adjektiv',
    contextMeaningArabic: 'كبير / عظيم',
    pronunciationArabic: 'غروس',
    ipa: '[ɡʁoːs]',
    adjectiveInfo: {
      base: 'groß',
      comparative: 'größer',
      superlative: 'am größten',
    },
    exampleGerman: 'Berlin ist eine große Stadt.',
    exampleArabic: 'برلين مدينة كبيرة.',
  },
  chance: {
    word: 'Chance',
    lemma: 'Chance',
    partOfSpeech: 'Nomen',
    contextMeaningArabic: 'فرصة / إمكانية نجاح',
    pronunciationArabic: 'شانسِه',
    ipa: '[ˈʃɑ̃ːsə]',
    nounInfo: { article: 'die', singular: 'die Chance', plural: 'die Chancen' },
    exampleGerman: 'Jeder Mensch verdient eine faire Chance.',
    exampleArabic: 'كل إنسان يستحق فرصة عادلة.',
  },
  zukunft: {
    word: 'Zukunft',
    lemma: 'Zukunft',
    partOfSpeech: 'Nomen',
    contextMeaningArabic: 'المستقبل',
    pronunciationArabic: 'تسوكونفت',
    ipa: '[ˈt͡suːˌkʊnft]',
    nounInfo: { article: 'die', singular: 'die Zukunft', plural: 'die Zukünfte' },
    exampleGerman: 'Wir investieren in eine grüne Zukunft.',
    exampleArabic: 'نحن نستثمر في مستقبل أخضر.',
  },
  gesundheit: {
    word: 'Gesundheit',
    lemma: 'Gesundheit',
    partOfSpeech: 'Nomen',
    contextMeaningArabic: 'الصحة / عافية',
    pronunciationArabic: 'غيزوند هايت',
    ipa: '[ɡəˈzʊnthaɪ̯t]',
    nounInfo: { article: 'die', singular: 'die Gesundheit', plural: '—' },
    exampleGerman: 'Gesundheit ist das Wichtigste im Leben.',
    exampleArabic: 'الصحة هي أهم شيء في الحياة.',
  },
  reisen: {
    word: 'reisen',
    lemma: 'reisen',
    partOfSpeech: 'Verb',
    contextMeaningArabic: 'يسافر / يرحل',
    pronunciationArabic: 'رايزن',
    ipa: '[ˈʁaɪ̯zn̩]',
    verbInfo: {
      infinitiv: 'reisen',
      praesens: 'reist',
      praeteritum: 'reiste',
      perfekt: 'ist gereist',
      auxiliary: 'sein',
      isSeparable: false,
    },
    exampleGerman: 'Ich reise gerne mit dem Zug.',
    exampleArabic: 'أحب السفر بالقطار.',
  },
  sprache: {
    word: 'Sprache',
    lemma: 'Sprache',
    partOfSpeech: 'Nomen',
    contextMeaningArabic: 'لغة / كلام',
    pronunciationArabic: 'شبراخه',
    ipa: '[ˈʃpʁaːxə]',
    nounInfo: { article: 'die', singular: 'die Sprache', plural: 'die Sprachen' },
    exampleGerman: 'Die deutsche Sprache ist logisch aufgebaut.',
    exampleArabic: 'اللغة الألمانية مبنية بشكل منطقي.',
  },
};

/**
 * Intelligent local German morphological analyzer
 * Generates accurate phonetic Arabic transcription, gender heuristics, and conjugations
 * without requiring any network or API quota!
 */
export function analyzeGermanWordLocally(rawWord: string, contextSentence: string = ''): WordExplanation {
  const clean = rawWord.trim().replace(/[.,!?;:„"“»«()]/g, '');
  const lower = clean.toLowerCase();

  if (COMMON_GERMAN_DICTIONARY[lower]) {
    return COMMON_GERMAN_DICTIONARY[lower];
  }

  // Phonetic Arabic approximation generator for German spelling
  const phoneticArabic = generateArabicPhonetics(clean);

  const isCapitalized = /^[A-ZÄÖÜ]/.test(clean);

  // Noun heuristic
  if (isCapitalized) {
    let article = 'das';
    if (/(ung|heit|keit|schaft|tion|tät|ie|enz|anz|ur|ik)$/i.test(clean)) {
      article = 'die';
    } else if (/(er|ismus|ist|ling|or)$/i.test(clean)) {
      article = 'der';
    } else if (/(chen|lein|ment|tum|um|nis)$/i.test(clean)) {
      article = 'das';
    } else if (/(e)$/i.test(clean)) {
      article = 'die';
    }

    return {
      word: clean,
      lemma: clean,
      partOfSpeech: 'Nomen',
      contextMeaningArabic: `كلمة اسمية ألمانية (${clean})`,
      otherMeaningsArabic: [],
      pronunciationArabic: phoneticArabic,
      ipa: `[${clean.toLowerCase()}]`,
      nounInfo: {
        article,
        singular: `${article} ${clean}`,
        plural: `die ${clean}${clean.endsWith('e') ? 'n' : clean.endsWith('ung') ? 'en' : 's'}`,
      },
      exampleGerman: contextSentence || `Das Wort "${clean}" wird im Deutschen verwendet.`,
      exampleArabic: 'تُستخدم هذه الكلمة في سياق الجملة الألمانية أعلاه.',
    };
  }

  // Verb heuristic
  if (/(en|eln|ern)$/i.test(clean)) {
    const stem = clean.replace(/(en|eln|ern)$/i, '');
    return {
      word: clean,
      lemma: clean,
      partOfSpeech: 'Verb',
      contextMeaningArabic: `فعل ألماني (${clean})`,
      pronunciationArabic: phoneticArabic,
      ipa: `[${clean}]`,
      verbInfo: {
        infinitiv: clean,
        praesens: `${stem}t`,
        praeteritum: `${stem}te`,
        perfekt: `hat ge${stem}t`,
        auxiliary: 'haben',
        isSeparable: false,
      },
      exampleGerman: contextSentence || `Ich möchte dieses Verb (${clean}) lernen.`,
      exampleArabic: 'استخدام الفعل في السياق التعليمي.',
    };
  }

  // Adjective / Adverb / Other
  return {
    word: clean,
    lemma: clean,
    partOfSpeech: /(ig|lich|isch|bar|sam|haft|los)$/i.test(clean) ? 'Adjektiv' : 'Wort',
    contextMeaningArabic: `مفردة ألمانية (${clean})`,
    pronunciationArabic: phoneticArabic,
    ipa: `[${clean}]`,
    exampleGerman: contextSentence || `Dieses Wort (${clean}) ist wichtig für das Textverständnis.`,
    exampleArabic: 'هذه المفردة مهمة لفهم سياق النص.',
  };
}

function generateArabicPhonetics(word: string): string {
  let s = word.toLowerCase();
  // Compound German diphthongs and clusters
  s = s.replace(/sch/g, 'ش');
  s = s.replace(/ch/g, 'خ');
  s = s.replace(/ei/g, 'اي');
  s = s.replace(/ie/g, 'ي');
  s = s.replace(/eu|äu/g, 'أوي');
  s = s.replace(/au/g, 'أو');
  s = s.replace(/ä/g, 'إيه');
  s = s.replace(/ö/g, 'أو');
  s = s.replace(/ü/g, 'أو');
  s = s.replace(/ß/g, 'س');
  s = s.replace(/sp/g, 'شب');
  s = s.replace(/st/g, 'شت');
  s = s.replace(/z/g, 'تس');
  s = s.replace(/v/g, 'ف');
  s = s.replace(/w/g, 'ف');
  s = s.replace(/j/g, 'ي');
  s = s.replace(/b/g, 'ب');
  s = s.replace(/d/g, 'د');
  s = s.replace(/f/g, 'ف');
  s = s.replace(/g/g, 'غ');
  s = s.replace(/h/g, 'هـ');
  s = s.replace(/k/g, 'ك');
  s = s.replace(/l/g, 'ل');
  s = s.replace(/m/g, 'م');
  s = s.replace(/n/g, 'ن');
  s = s.replace(/p/g, 'ب');
  s = s.replace(/r/g, 'ر');
  s = s.replace(/s/g, 'س');
  s = s.replace(/t/g, 'ت');
  s = s.replace(/a/g, 'ا');
  s = s.replace(/e/g, 'ـِ');
  s = s.replace(/i/g, 'ي');
  s = s.replace(/o/g, 'و');
  s = s.replace(/u/g, 'و');

  return s.replace(/[^ء-ي\sـ]/g, '');
}
