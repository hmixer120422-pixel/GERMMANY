import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import mammoth from 'mammoth';
import { COMMON_GERMAN_DICTIONARY, analyzeGermanWordLocally } from './src/data/germanDictionary';
import { computeAudioHash, normalizeGermanText } from './src/utils/audioHash';
import {
  DEFAULT_ELEVENLABS_MODEL,
  DEFAULT_FEMALE_VOICE_ID,
  DEFAULT_MALE_VOICE_ID,
  VERIFIED_ELEVENLABS_VOICES,
} from './src/services/puterTtsService';
import type { VoiceGender } from './src/types';
import { isEncryptionKeyConfigured } from './server/cryptoTokens';
import {
  checkFirestoreServerConnectivity,
  claimGenerationLock,
  completeAudioUploadMetadata,
  getAllAudioEntries,
  getAudioEntry,
  getStatsAndConfig,
  markAudioEntryMissing,
  recordTelemetryEvent,
  releaseGenerationLock,
  removeAudioEntry,
  removeExpiredOrFailedEntries,
  syncStatsToFirestore,
  touchSharedHit,
  updateServerConfig,
  upsertRebuiltEntry,
  VerifiedFirebaseUser,
  verifyFirebaseIdToken,
} from './server/firestoreRest';
import {
  completeDriveOAuthCallback,
  deleteAppAudioFileFromDrive,
  disconnectDriveAccount,
  downloadAudioFromDrive,
  generateDriveConnectUrl,
  getDriveStatusSummary,
  getMissingDriveSecrets,
  getOAuthRedirectUri,
  isValidMp3Buffer,
  listDriveAudioFiles,
  ROOT_FOLDER_NAME,
  testDriveUploadDownload,
  uploadAudioToDrive,
  validateOAuthState,
} from './server/driveService';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

// Security headers (preserve iframe embed compatibility for AI Studio preview)
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Support JSON payloads up to 25MB (for doc imports and audio)
app.use(express.json({ limit: '25mb' }));

// Simple sliding-window in-memory rate limiter
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
function createRateLimiter(bucketName: string, maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${bucketName}:${ip}`;
    const now = Date.now();
    const existing = rateBuckets.get(key);
    if (!existing || now > existing.resetAt) {
      rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (existing.count >= maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'Too many requests. Please slow down and try again shortly.',
      });
    }
    existing.count += 1;
    return next();
  };
}

const ttsReadLimiter = createRateLimiter('tts-read', 180, 60_000);
const ttsWriteLimiter = createRateLimiter('tts-write', 60, 60_000);
const adminLimiter = createRateLimiter('admin', 90, 60_000);

const VALID_HASH_REGEX = /^[a-f0-9]{64}$/i;

function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  return null;
}

interface AuthenticatedRequest extends Request {
  firebaseUser?: VerifiedFirebaseUser;
}

async function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (token) {
    const verified = await verifyFirebaseIdToken(token);
    if (verified) req.firebaseUser = verified;
  }
  next();
}

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required (missing Bearer token).' });
  }
  const verified = await verifyFirebaseIdToken(token);
  if (!verified) {
    return res.status(401).json({ success: false, error: 'Invalid or expired Firebase authentication token.' });
  }
  if (!verified.emailVerified) {
    return res.status(403).json({ success: false, error: 'Verified email address is required.' });
  }
  req.firebaseUser = verified;
  return next();
}

async function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({ success: false, error: 'Administrator authentication required.' });
  }
  const verified = await verifyFirebaseIdToken(token);
  if (!verified) {
    return res.status(401).json({ success: false, error: 'Invalid or expired Firebase authentication token.' });
  }
  if (!verified.isAdmin) {
    return res.status(403).json({ success: false, error: 'Forbidden: Administrator permissions required.' });
  }
  req.firebaseUser = verified;
  return next();
}

// In-memory audio and dictionary cache
const audioCache = new Map<string, { audioBase64: string; format: string; createdAt: number }>();
const wordCache = new Map<string, any>();
const sentenceCache = new Map<string, any>();
const textGenerationCache = new Map<string, any>();

// Shared Gemini AI client (server-side only)
function getGenAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set. Please configure it in Settings > Secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getCacheKey(text: string, voice: string, speed: number, pitch?: number): string {
  return crypto.createHash('sha256').update(`${text.trim()}|${voice}|${speed}|${pitch || 0}`).digest('hex');
}

// -------------------------------------------------------------
// INTELLIGENT GERMAN SENTENCE SPLITTER
// -------------------------------------------------------------
export function splitGermanSentences(text: string): string[] {
  if (!text || !text.trim()) return [];

  // Protect common German abbreviations and titles before splitting
  const protectedText = text
    .replace(/(z\.B\.|d\.h\.|bzw\.|u\.a\.|usw\.|ca\.|Dr\.|Prof\.|Hr\.|Fr\.|Nr\.|Std\.|Min\.|Abs\.|vgl\.|evtl\.|inkl\.|ggf\.|str\.)/gi, (match) => {
      return match.replace(/\./g, '__DOT__');
    })
    .replace(/(\d+)\.(\d+)/g, '$1__DOT__$2'); // decimal numbers

  // Split on sentence terminators followed by whitespace or quote or end of string
  const rawParts = protectedText.split(/([.!?]+["»”„]?\s+|\n+)/g);
  const sentences: string[] = [];
  let current = '';

  for (let i = 0; i < rawParts.length; i++) {
    const part = rawParts[i];
    if (!part) continue;

    if (part.includes('\n')) {
      if (current.trim()) {
        sentences.push(current.replace(/__DOT__/g, '.').trim());
        current = '';
      }
    } else if (/[.!?]/.test(part)) {
      current += part;
      if (current.trim()) {
        sentences.push(current.replace(/__DOT__/g, '.').trim());
        current = '';
      }
    } else {
      current += part;
    }
  }

  if (current.trim()) {
    sentences.push(current.replace(/__DOT__/g, '.').trim());
  }

  return sentences.filter((s) => s.length > 0);
}

// -------------------------------------------------------------
// API: Generate German Reading Passage (CEFR A1–C2)
// -------------------------------------------------------------
app.post('/api/ai/generate-text', async (req: Request, res: Response) => {
  try {
    const {
      topic = 'Arbeit und Alltag in Deutschland',
      level = 'A2',
      style = 'Educational Passage',
      length = 'default',
      formality = 'everyday',
      customNote = '',
    } = req.body;

    const cacheKey = `${topic.trim().toLowerCase()}|${level}|${style}|${formality}`;
    if (textGenerationCache.has(cacheKey)) {
      return res.json({
        success: true,
        data: textGenerationCache.get(cacheKey),
      });
    }

    const ai = getGenAI();

    // CEFR Specifications
    const levelGuide: Record<string, string> = {
      A1: 'Level A1 (Beginner): 50-70 words. Use basic vocabulary, short simple sentences, present tense, basic articles (der/die/das), simple questions, everyday topics. Keep grammar accessible to total beginners.',
      A2: 'Level A2 (Elementary): 70-100 words. Use common vocabulary, modal verbs (können, müssen, möchten, wollen), separable verbs, Perfekt tense, simple Nebensätze with "weil" and "dass", basic comparisons.',
      B1: 'Level B1 (Intermediate): 100-140 words. Use realistic everyday German, personal opinions, Nebensätze with "weil", "obwohl", "wenn", "während", relative clauses, common Präteritum (war, hatte, ging), future intentions.',
      B2: 'Level B2 (Upper Intermediate): 140-180 words. Rich vocabulary, complex sentence structures, passive voice (wird gemacht), Konjunktiv II (hätte, wäre, würde), formal & professional arguments, nuanced opinions.',
      C1: 'Level C1 (Advanced): 180-220 words. Sophisticated language, advanced connectors (infolgedessen, wenngleich, ungeachtet), idiomatic phrasing, academic/professional discourse, stylistic nuance.',
      C2: 'Level C2 (Proficient): 220-280 words. Near-native eloquence, subtle shades of meaning, advanced idioms, complex argumentation, stylistic elegance, refined literary or professional register.',
    };

    const targetGuide = levelGuide[level] || levelGuide['A2'];

    const prompt = `You are a master German language educator and curriculum author creating authentic, high-quality German reading texts for students learning German.

USER TOPIC: "${topic}" (The user can enter this in Arabic, German, English, or French - interpret it accurately).
TARGET LEVEL: ${level}
INSTRUCTIONS FOR LEVEL:
${targetGuide}
TEXT STYLE: ${style}
FORMALITY: ${formality}
${customNote ? `SPECIAL NOTE: ${customNote}` : ''}

CRITICAL RULES:
1. The German reading text MUST NOT contain Arabic words or explanations inside the German text itself.
2. Structure format:
   - First line / metadata: A realistic fictional German-speaking persona's name, age, and German city (e.g., "Erman Akay, 30 Jahre, München" or "Sarah Lindemann, 28 Jahre, Hamburg" or "Dr. Markus Weber, 42 Jahre, Berlin").
   - Title: Short descriptive German title.
   - Reading text: First-person narrative or dialogue or article enclosed in authentic German quotation marks „...“ or structured paragraphs.
3. Natural German grammar, correct German punctuation, authentic compound words, and appropriate CEFR level complexity.
4. Provide a list of key vocabulary words (5-8 words) found in the text with Arabic translations, parts of speech, and articles for nouns.
5. Provide a fluent, natural Arabic summary / translation of the passage for the learner.

Return valid JSON adhering to the required schema.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: 'Descriptive German title' },
            authorInfo: { type: Type.STRING, description: 'Persona info, e.g. "Erman Akay, 30 Jahre, München"' },
            level: { type: Type.STRING, description: 'CEFR level e.g. A2' },
            germanText: { type: Type.STRING, description: 'The complete German reading passage in pure German' },
            wordCount: { type: Type.INTEGER, description: 'Word count of the germanText' },
            arabicSummary: { type: Type.STRING, description: 'Natural Arabic translation of the full passage' },
            keyVocabulary: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  german: { type: Type.STRING },
                  arabic: { type: Type.STRING },
                  pos: { type: Type.STRING, description: 'noun, verb, adjective, etc.' },
                  article: { type: Type.STRING, description: 'der, die, das or empty' },
                  plural: { type: Type.STRING },
                  pronunciationArabic: { type: Type.STRING, description: 'Phonetic pronunciation written in Arabic letters' },
                },
                required: ['german', 'arabic', 'pos'],
              },
            },
          },
          required: ['title', 'authorInfo', 'level', 'germanText', 'wordCount', 'arabicSummary', 'keyVocabulary'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    const sentences = splitGermanSentences(parsed.germanText || '');

    const resultData = {
      ...parsed,
      sentences,
      topic,
      style,
      createdAt: new Date().toISOString(),
    };

    textGenerationCache.set(cacheKey, resultData);

    return res.json({
      success: true,
      data: resultData,
    });
  } catch (error: any) {
    console.error('Error generating German text:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'فشل في توليد النص الألماني، يرجى المحاولة بعد لحظات.',
    });
  }
});

// -------------------------------------------------------------
// API: Compare Same Topic Across All 6 Levels (A1–C2)
// -------------------------------------------------------------
app.post('/api/ai/compare-levels', async (req: Request, res: Response) => {
  try {
    const { topic = 'Familie und Alltag', style = 'Educational Passage' } = req.body;
    const ai = getGenAI();

    const prompt = `You are an expert German CEFR curriculum author.
Create 6 genuinely different, authentic German reading passages on the same topic: "${topic}".
Each level (A1, A2, B1, B2, C1, C2) MUST exhibit distinct grammatical structures, sentence length, and vocabulary difficulty appropriate to its official CEFR specifications.

- A1 (50-70 words): Present tense, basic vocabulary, short sentences.
- A2 (70-100 words): Perfekt, modal verbs, separable verbs, simple "weil" clauses.
- B1 (100-140 words): Varied Nebensätze, opinions, reasons, relative clauses.
- B2 (140-180 words): Passive voice, Konjunktiv II, formal expressions, detailed viewpoints.
- C1 (180-220 words): Advanced connectors, sophisticated vocabulary, idiomatic nuance.
- C2 (220-280 words): Native-level eloquence, stylistic elegance, subtle distinctions.

For each level, provide:
- level (A1, A2, B1, B2, C1, C2)
- authorInfo (e.g. "Lena Meyer, 24 Jahre, Berlin")
- germanText (pure German reading passage)
- wordCount (integer)
- arabicSummary (Arabic translation)
- grammarFocus (short explanation in Arabic of what grammar is emphasized at this level)

Return JSON.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            topic: { type: Type.STRING },
            levels: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  level: { type: Type.STRING },
                  authorInfo: { type: Type.STRING },
                  germanText: { type: Type.STRING },
                  wordCount: { type: Type.INTEGER },
                  arabicSummary: { type: Type.STRING },
                  grammarFocus: { type: Type.STRING },
                },
                required: ['level', 'authorInfo', 'germanText', 'wordCount', 'arabicSummary', 'grammarFocus'],
              },
            },
          },
          required: ['topic', 'levels'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    if (parsed.levels && Array.isArray(parsed.levels)) {
      parsed.levels = parsed.levels.map((lvl: any) => ({
        ...lvl,
        sentences: splitGermanSentences(lvl.germanText || ''),
      }));
    }

    return res.json({ success: true, data: parsed });
  } catch (error: any) {
    console.error('Error generating level comparison:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// -------------------------------------------------------------
// API: Word Dictionary & Grammatical Analysis (Click-to-Translate)
// -------------------------------------------------------------
app.post('/api/ai/explain-word', async (req: Request, res: Response) => {
  const { word, sentence = '', level = 'A2' } = req.body;
  if (!word || !word.trim()) {
    return res.status(400).json({ success: false, error: 'Word is required' });
  }

  const cleanWord = word.trim().replace(/[.,!?;:„"“»«()]/g, '');
  const lower = cleanWord.toLowerCase();
  const cacheKey = `${lower}|${sentence.slice(0, 50)}`;

  // 1. Check offline local dictionary first (instant, 0 quota used)
  if (COMMON_GERMAN_DICTIONARY[lower]) {
    return res.json({ success: true, data: COMMON_GERMAN_DICTIONARY[lower] });
  }

  // 2. Check in-memory cache
  if (wordCache.has(cacheKey)) {
    return res.json({ success: true, data: wordCache.get(cacheKey) });
  }

  // 3. Attempt Gemini API with low thinking latency
  try {
    const ai = getGenAI();
    const prompt = `You are a German-Arabic lexicographer and educator.
Analyze this German word as it is used in the context of the sentence:
WORD: "${cleanWord}"
CONTEXT SENTENCE: "${sentence}"
LEARNER LEVEL: ${level}

Provide accurate, comprehensive linguistic details for an Arabic speaker learning German:
1. German base word (lemma / Infinitiv / Grundform).
2. Word type (Nomen, Verb, Adjektiv, Adverb, Präposition, Konjunktion, Pronomen, etc.).
3. Contextual Arabic meaning (the exact meaning in this specific sentence).
4. Other common Arabic meanings.
5. Phonetic pronunciation in Arabic letters (e.g. Haus -> "هاوس", Ausbildung -> "أوسبيلدونغ", arbeiten -> "أربايتن").
6. IPA transcription (e.g. [ˈaʊ̯sbɪldʊŋ]).
7. For Nouns:
   - Article: der, die, or das (mandatory!)
   - Singular form
   - Plural form (with article e.g. "die Häuser")
8. For Verbs:
   - Infinitiv
   - Präsens 3rd person (er/sie/es)
   - Präteritum
   - Perfekt (with auxiliary e.g. "hat gearbeitet" or "ist gegangen")
   - Auxiliary verb: "haben" or "sein"
   - Separable / Inseparable status (trennbare / untrennbare Verben)
9. For Adjectives:
   - Positive form
   - Comparative form
   - Superlative form
10. Authentic example sentence in German using this word.
11. Arabic translation of the example sentence.

Return JSON according to the schema.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            word: { type: Type.STRING },
            lemma: { type: Type.STRING },
            partOfSpeech: { type: Type.STRING, description: 'Nomen, Verb, Adjektiv, etc.' },
            contextMeaningArabic: { type: Type.STRING },
            otherMeaningsArabic: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            pronunciationArabic: { type: Type.STRING, description: 'Written in Arabic letters' },
            ipa: { type: Type.STRING },
            nounInfo: {
              type: Type.OBJECT,
              properties: {
                article: { type: Type.STRING, description: 'der, die, or das' },
                singular: { type: Type.STRING },
                plural: { type: Type.STRING },
              },
            },
            verbInfo: {
              type: Type.OBJECT,
              properties: {
                infinitiv: { type: Type.STRING },
                praesens: { type: Type.STRING },
                praeteritum: { type: Type.STRING },
                perfekt: { type: Type.STRING },
                auxiliary: { type: Type.STRING, description: 'haben or sein' },
                isSeparable: { type: Type.BOOLEAN },
              },
            },
            adjectiveInfo: {
              type: Type.OBJECT,
              properties: {
                base: { type: Type.STRING },
                comparative: { type: Type.STRING },
                superlative: { type: Type.STRING },
              },
            },
            exampleGerman: { type: Type.STRING },
            exampleArabic: { type: Type.STRING },
          },
          required: [
            'word',
            'lemma',
            'partOfSpeech',
            'contextMeaningArabic',
            'pronunciationArabic',
            'ipa',
            'exampleGerman',
            'exampleArabic',
          ],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    wordCache.set(cacheKey, parsed);
    return res.json({ success: true, data: parsed });
  } catch (apiErr: any) {
    // 4. Graceful offline fallback: if rate-limited (429) or offline, use our smart morphological engine
    console.warn(`Gemini word analysis API rate limit or error (${apiErr.message}), using smart offline morphological analyzer.`);
    const fallbackData = analyzeGermanWordLocally(cleanWord, sentence);
    wordCache.set(cacheKey, fallbackData);
    return res.json({ success: true, data: fallbackData, fallback: true });
  }
});

// -------------------------------------------------------------
// API: Sentence Translation & Grammar Insights
// -------------------------------------------------------------
app.post('/api/ai/explain-sentence', async (req: Request, res: Response) => {
  const { sentence, context = '' } = req.body;
  if (!sentence || !sentence.trim()) {
    return res.status(400).json({ success: false, error: 'Sentence is required' });
  }

  const cacheKey = sentence.trim();
  if (sentenceCache.has(cacheKey)) {
    return res.json({ success: true, data: sentenceCache.get(cacheKey) });
  }

  try {
    const ai = getGenAI();
    const prompt = `You are a German language teacher for Arabic speakers.
Analyze this German sentence:
SENTENCE: "${sentence}"
${context ? `PARAGRAPH CONTEXT: "${context}"` : ''}

Provide:
1. Precise, natural Arabic translation.
2. Grammar breakdown in Arabic (tense, clause structure e.g. Hauptsatz / Nebensatz, connectors, case endings).
3. 2-4 important vocabulary words in this sentence with their Arabic meaning.

Return JSON.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            germanSentence: { type: Type.STRING },
            arabicTranslation: { type: Type.STRING },
            grammarNotes: { type: Type.STRING },
            keyWords: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  german: { type: Type.STRING },
                  arabic: { type: Type.STRING },
                  article: { type: Type.STRING },
                },
                required: ['german', 'arabic'],
              },
            },
          },
          required: ['germanSentence', 'arabicTranslation', 'grammarNotes', 'keyWords'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    sentenceCache.set(cacheKey, parsed);
    return res.json({ success: true, data: parsed });
  } catch (apiErr: any) {
    console.warn(`Gemini sentence explanation error (${apiErr.message}), returning fallback.`);
    const words = sentence
      .split(/\s+/)
      .map((w: string) => w.replace(/[.,!?;:„"“»«()]/g, ''))
      .filter((w: string) => w.length > 3)
      .slice(0, 4);

    const fallback = {
      germanSentence: sentence,
      arabicTranslation: 'هذه الجملة تتضمن تعبيراً ألمانياً تعليمياً في السياق المعروض أعلاه.',
      grammarNotes: 'تحليل تركيبي: تتكون الجملة من فعل وفاعل وتراكيب لغوية نموذجية للمستوى المختار.',
      keyWords: words.map((w: string) => ({
        german: w,
        arabic: COMMON_GERMAN_DICTIONARY[w.toLowerCase()]?.contextMeaningArabic || 'مفردة مهمة في السياق',
        article: /^[A-ZÄÖÜ]/.test(w) ? 'das/die/der' : undefined,
      })),
    };
    return res.json({ success: true, data: fallback, fallback: true });
  }
});

// -------------------------------------------------------------
// API: German Female Text-to-Speech (Google Cloud TTS / Native Fallback)
// -------------------------------------------------------------
app.post('/api/tts/generate', async (req: Request, res: Response) => {
  try {
    const {
      text,
      voice = 'Kore',
      speed = 1.0,
      pitch = 0,
    } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, error: 'Text is required for TTS' });
    }

    const trimmed = text.trim();
    const cacheKey = getCacheKey(trimmed, voice, speed, pitch);

    if (audioCache.has(cacheKey)) {
      const cached = audioCache.get(cacheKey)!;
      return res.json({
        success: true,
        data: {
          audioBase64: cached.audioBase64,
          format: cached.format,
          cached: true,
          voice,
        },
      });
    }

    // Google Cloud Text-to-Speech if configured via env or header
    const cloudTtsKey = process.env.GOOGLE_CLOUD_TTS_API_KEY || (req.headers['x-google-cloud-tts-key'] as string);
    if (cloudTtsKey) {
      try {
        const cloudVoiceName = voice.startsWith('de-DE-') ? voice : 'de-DE-Neural2-F';
        const cloudRes = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${cloudTtsKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text: trimmed },
            voice: {
              languageCode: 'de-DE',
              name: cloudVoiceName,
              ssmlGender: 'FEMALE',
            },
            audioConfig: {
              audioEncoding: 'MP3',
              speakingRate: speed,
              pitch: pitch,
            },
          }),
        });

        if (cloudRes.ok) {
          const cloudData = await cloudRes.json();
          if (cloudData.audioContent) {
            audioCache.set(cacheKey, {
              audioBase64: cloudData.audioContent,
              format: 'audio/mp3',
              createdAt: Date.now(),
            });
            return res.json({
              success: true,
              data: {
                audioBase64: cloudData.audioContent,
                format: 'audio/mp3',
                provider: 'google-cloud-neural2',
                voice: cloudVoiceName,
              },
            });
          }
        }
      } catch (cloudErr) {
        console.warn('Google Cloud TTS failed, falling back to browser synthesis:', cloudErr);
      }
    }

    // Default & Zero-Latency Reliable Speech Engine:
    // Inform client to execute high-fidelity browser German female speech synthesis seamlessly
    return res.json({
      success: true,
      data: {
        fallbackToBrowser: true,
        voice: 'German Female Browser Synthesis',
        message: 'استخدام المحرك الصوتي النسائي عالي الجودة المدمج في المتصفح',
      },
    });
  } catch (error: any) {
    console.error('TTS endpoint error:', error);
    return res.json({
      success: true,
      data: {
        fallbackToBrowser: true,
        voice: 'German Female Browser Synthesis',
      },
    });
  }
});

// -------------------------------------------------------------
// API: Parse Uploaded Documents (TXT, DOCX)
// -------------------------------------------------------------
app.post('/api/parse-document', async (req: Request, res: Response) => {
  try {
    const { fileName, fileContentBase64, fileType } = req.body;

    if (!fileContentBase64) {
      return res.status(400).json({ success: false, error: 'File content is required' });
    }

    const buffer = Buffer.from(fileContentBase64, 'base64');
    let extractedText = '';

    if (fileType === 'docx' || (fileName && fileName.endsWith('.docx'))) {
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value;
    } else if (fileType === 'txt' || (fileName && fileName.endsWith('.txt'))) {
      extractedText = buffer.toString('utf-8');
    } else if (fileType === 'pdf' || (fileName && fileName.endsWith('.pdf'))) {
      const rawStr = buffer.toString('utf-8');
      const textMatches = rawStr.match(/\((.*?)\)\s*Tj/g) || rawStr.match(/\[(.*?)\]\s*TJ/g);
      if (textMatches && textMatches.length > 0) {
        extractedText = textMatches
          .map((m) => m.replace(/^[(\[]|[)\]]\s*T[jJ]$/g, ''))
          .join(' ')
          .replace(/\\([()\\])/g, '$1');
      } else {
        extractedText = buffer.toString('utf-8').replace(/[^\x20-\x7E\xC0-\xFF\n\r\t]/g, ' ');
      }
    } else {
      extractedText = buffer.toString('utf-8');
    }

    // Clean text while preserving German characters and meaningful punctuation
    const cleanedText = extractedText
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      .trim();

    const sentences = splitGermanSentences(cleanedText);

    return res.json({
      success: true,
      data: {
        text: cleanedText,
        sentences,
        sentenceCount: sentences.length,
        wordCount: cleanedText.split(/\s+/).filter(Boolean).length,
      },
    });
  } catch (error: any) {
    console.error('Error parsing document:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// =============================================================
// SHARED CLOUD AUDIO LIBRARY APIs (Google Drive + Firestore + Puter/ElevenLabs)
// =============================================================

// Current authenticated Firebase user & admin role check
app.get('/api/auth/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const u = req.firebaseUser!;
  return res.json({
    success: true,
    data: {
      uid: u.uid,
      email: u.email,
      emailVerified: u.emailVerified,
      displayName: u.displayName || null,
      isAdmin: u.isAdmin,
    },
  });
});

// Non-sensitive shared library status & voice defaults for learners
app.get('/api/tts/library-status', ttsReadLimiter, async (_req: Request, res: Response) => {
  const { config } = getStatsAndConfig();
  const driveStatus = await getDriveStatusSummary();
  return res.json({
    success: true,
    data: {
      sharedLibraryAvailable: driveStatus.connected,
      rootFolderName: ROOT_FOLDER_NAME,
      config,
    },
  });
});

// Discover curated & configured ElevenLabs German voices
app.get('/api/tts/voices', ttsReadLimiter, async (_req: Request, res: Response) => {
  const { config } = getStatsAndConfig();
  return res.json({
    success: true,
    data: {
      provider: 'elevenlabs',
      model: config.defaultModel || DEFAULT_ELEVENLABS_MODEL,
      defaultFemaleVoiceId: config.defaultFemaleVoiceId || DEFAULT_FEMALE_VOICE_ID,
      defaultMaleVoiceId: config.defaultMaleVoiceId || DEFAULT_MALE_VOICE_ID,
      defaultCourseVoiceId: config.defaultCourseVoiceId || DEFAULT_FEMALE_VOICE_ID,
      voices: VERIFIED_ELEVENLABS_VOICES,
    },
  });
});

// Admin: Update default shared ElevenLabs voices & model
app.post('/api/admin/tts/config', adminLimiter, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { defaultModel, defaultFemaleVoiceId, defaultMaleVoiceId, defaultCourseVoiceId } = req.body || {};
    const updated = await updateServerConfig(
      {
        ...(typeof defaultModel === 'string' && defaultModel.trim() ? { defaultModel: defaultModel.trim() } : {}),
        ...(typeof defaultFemaleVoiceId === 'string' && defaultFemaleVoiceId.trim()
          ? { defaultFemaleVoiceId: defaultFemaleVoiceId.trim() }
          : {}),
        ...(typeof defaultMaleVoiceId === 'string' && defaultMaleVoiceId.trim()
          ? { defaultMaleVoiceId: defaultMaleVoiceId.trim() }
          : {}),
        ...(typeof defaultCourseVoiceId === 'string' && defaultCourseVoiceId.trim()
          ? { defaultCourseVoiceId: defaultCourseVoiceId.trim() }
          : {}),
      },
      req.firebaseUser?.idToken
    );
    return res.json({ success: true, data: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to update TTS config' });
  }
});

// Admin: Google Drive connection status + missing secrets checklist
app.get('/api/admin/drive/status', adminLimiter, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const driveStatus = await getDriveStatusSummary();
  const firestoreConnected = await checkFirestoreServerConnectivity(req.firebaseUser?.idToken);
  const missingSecrets = getMissingDriveSecrets();
  const redirectUri = getOAuthRedirectUri();
  const encryptionKeyConfigured = isEncryptionKeyConfigured();

  await updateServerConfig({ driveConnected: driveStatus.connected }, req.firebaseUser?.idToken).catch(() => {});

  return res.json({
    success: true,
    data: {
      ...driveStatus,
      firestoreConnected,
      missingSecrets,
      redirectUri,
      encryptionKeyConfigured,
    },
  });
});

// Admin: Start Google Drive OAuth 2.0 flow (returns Google URL for popup)
app.get('/api/admin/drive/connect', adminLimiter, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const { authUrl, redirectUri } = generateDriveConnectUrl(req.firebaseUser!.uid);
    return res.json({ success: true, data: { authUrl, redirectUri } });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      error: err?.message || 'Unable to start Google Drive OAuth.',
    });
  }
});

// OAuth Callback (handles both /callback and /callback/ per iframe popup guidelines)
async function handleDriveOAuthCallback(req: Request, res: Response) {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const oauthError = typeof req.query.error === 'string' ? req.query.error : '';

  if (oauthError) {
    return res.status(400).send(`
      <!doctype html><html><body style="font-family:sans-serif;padding:24px;text-align:center;">
        <h3>Google Drive Authorization Cancelled</h3>
        <p>${oauthError.replace(/[<>&"]/g, '')}</p>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'DRIVE_OAUTH_ERROR', error: ${JSON.stringify(oauthError)} }, '*');
            setTimeout(() => window.close(), 1200);
          }
        </script>
      </body></html>
    `);
  }

  if (!code || !validateOAuthState(state)) {
    return res.status(400).send(`
      <!doctype html><html><body style="font-family:sans-serif;padding:24px;text-align:center;">
        <h3>Invalid or Expired OAuth State</h3>
        <p>Please close this window and retry connecting Google Drive from Settings.</p>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'DRIVE_OAUTH_ERROR', error: 'Invalid or expired OAuth state parameter.' }, '*');
          }
        </script>
      </body></html>
    `);
  }

  try {
    const result = await completeDriveOAuthCallback(code);
    await updateServerConfig({ driveConnected: true });
    return res.send(`
      <!doctype html><html><body style="font-family:sans-serif;padding:24px;text-align:center;">
        <h3>Google Drive Connected Successfully</h3>
        <p>Created ${ROOT_FOLDER_NAME} and verified access. Closing window...</p>
        <script>
          if (window.opener) {
            window.opener.postMessage({
              type: 'DRIVE_OAUTH_SUCCESS',
              email: ${JSON.stringify(result.email)},
              rootFolderId: ${JSON.stringify(result.rootFolderId)}
            }, '*');
            window.close();
          } else {
            window.location.href = '/';
          }
        </script>
      </body></html>
    `);
  } catch (err: any) {
    const msg = err?.message || 'OAuth token exchange failed';
    return res.status(500).send(`
      <!doctype html><html><body style="font-family:sans-serif;padding:24px;text-align:center;">
        <h3>Google Drive Connection Failed</h3>
        <p>${String(msg).replace(/[<>&"]/g, '')}</p>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'DRIVE_OAUTH_ERROR', error: ${JSON.stringify(msg)} }, '*');
          }
        </script>
      </body></html>
    `);
  }
}

app.get(['/api/admin/drive/callback', '/api/admin/drive/callback/'], handleDriveOAuthCallback);

// Admin: Safely disconnect Google Drive (preserves Firestore metadata)
app.post('/api/admin/drive/disconnect', adminLimiter, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await disconnectDriveAccount();
    await updateServerConfig({ driveConnected: false }, req.firebaseUser?.idToken);
    return res.json({ success: true, data: { disconnected: true } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Disconnect failed' });
  }
});

// Admin: Real upload/download/delete verification test inside GermanLearningAudioLibrary
app.post('/api/admin/drive/test', adminLimiter, requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await testDriveUploadDownload();
    return res.status(result.ok ? 200 : 400).json({ success: result.ok, data: result, error: result.error });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Drive test failed' });
  }
});

// Claim generation lock OR return ready shared audio metadata (Part 4 & Part 5)
app.post('/api/tts/claim', ttsWriteLimiter, optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      text,
      language = 'de-DE',
      provider = 'elevenlabs',
      model = DEFAULT_ELEVENLABS_MODEL,
      voiceId = DEFAULT_FEMALE_VOICE_ID,
      voiceGender = 'female',
      audioFormat = 'mp3',
      cacheVersion = 1,
      approvedForShared = false,
    } = req.body || {};

    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ success: false, error: 'Text is required.' });
    }
    if (text.trim().length > 3500) {
      return res.status(400).json({ success: false, error: 'Chunk text exceeds maximum allowed length.' });
    }

    const { audioHash, normalizedText } = await computeAudioHash({
      text,
      language,
      provider,
      model,
      voiceId,
      audioFormat,
      cacheVersion,
    });

    const requesterId = req.firebaseUser?.uid || req.ip || 'anonymous';
    const claim = await claimGenerationLock({
      audioHash,
      originalText: text.trim(),
      normalizedText,
      language,
      provider,
      model,
      voiceId,
      voiceGender: voiceGender === 'male' ? 'male' : 'female',
      audioFormat,
      cacheVersion,
      requesterId,
      approvedForShared: Boolean(approvedForShared),
      userToken: req.firebaseUser?.idToken,
    });

    return res.json({
      success: true,
      data: {
        outcome: claim.outcome,
        audioHash,
        normalizedText,
        lockToken: claim.lockToken,
        entry: claim.entry,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Claim failed' });
  }
});

// Poll generation lock / cache entry status
app.get('/api/tts/status/:hash', ttsReadLimiter, optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  const hash = String(req.params.hash || '').trim().toLowerCase();
  if (!VALID_HASH_REGEX.test(hash)) {
    return res.status(400).json({ success: false, error: 'Invalid audioHash format.' });
  }
  const entry = getAudioEntry(hash);
  if (!entry) {
    return res.status(404).json({ success: false, error: 'Audio entry not found.' });
  }
  return res.json({ success: true, data: entry });
});

// Stream private Google Drive MP3 audio to authorized learner (Part 12)
app.get('/api/tts/audio/:hash', ttsReadLimiter, optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  const hash = String(req.params.hash || '').trim().toLowerCase();
  if (!VALID_HASH_REGEX.test(hash)) {
    return res.status(400).json({ success: false, error: 'Invalid audio hash parameter.' });
  }

  const entry = getAudioEntry(hash);
  if (!entry || entry.status !== 'ready' || !entry.driveFileId) {
    return res.status(404).json({ success: false, error: 'Shared audio is not ready in library.' });
  }

  try {
    const dl = await downloadAudioFromDrive(entry.driveFileId);
    if (!dl.found || !dl.buffer) {
      // File was deleted externally from Google Drive -> mark missing for controlled regeneration
      markAudioEntryMissing(hash);
      return res.status(410).json({
        success: false,
        code: 'DRIVE_FILE_MISSING',
        error: 'Audio file is missing from Google Drive and has been flagged for regeneration.',
      });
    }

    touchSharedHit(hash);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(dl.buffer.length));
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('ETag', `"${hash}"`);
    return res.send(dl.buffer);
  } catch (err: any) {
    const msg = err?.message || 'Drive stream error';
    if (msg === 'GOOGLE_DRIVE_NOT_CONNECTED') {
      return res.status(503).json({
        success: false,
        code: 'DRIVE_DISCONNECTED',
        error: 'Google Drive is currently disconnected.',
      });
    }
    return res.status(502).json({ success: false, error: msg });
  }
});

// Upload validated ElevenLabs MP3 audio to private Google Drive & index in Firestore
app.post('/api/tts/upload', ttsWriteLimiter, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      audioHash,
      lockToken,
      audioBase64,
      mimeType,
      text,
      language = 'de-DE',
      provider = 'elevenlabs',
      model = DEFAULT_ELEVENLABS_MODEL,
      voiceId = DEFAULT_FEMALE_VOICE_ID,
      voiceGender = 'female',
      audioFormat = 'mp3',
      cacheVersion = 1,
      duration = 0,
      approvedForShared = false,
    } = req.body || {};

    const hash = String(audioHash || '').trim().toLowerCase();
    if (!VALID_HASH_REGEX.test(hash)) {
      return res.status(400).json({ success: false, error: 'Invalid audioHash format.' });
    }
    if (typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ success: false, error: 'Original text is required.' });
    }

    // Recompute hash server-side to guarantee hash integrity & prevent tampering
    const computed = await computeAudioHash({
      text,
      language,
      provider,
      model,
      voiceId,
      audioFormat,
      cacheVersion,
    });
    if (computed.audioHash !== hash) {
      return res.status(400).json({ success: false, error: 'Audio hash mismatch with normalized text/settings.' });
    }

    // Enforce Part 7: Only approved educational content (or admin) may be uploaded to shared Drive library
    const isAdmin = Boolean(req.firebaseUser?.isAdmin);
    if (!approvedForShared && !isAdmin) {
      return res.status(403).json({
        success: false,
        error: 'Private custom learner text cannot be uploaded to the shared Google Drive library without admin approval.',
      });
    }

    // Check duplicate ready entry
    const existing = getAudioEntry(hash);
    if (existing && existing.status === 'ready' && existing.driveFileId && !isAdmin) {
      return res.status(409).json({
        success: false,
        error: 'Shared audio already exists and cannot be overwritten.',
        data: existing,
      });
    }

    // Validate MIME type
    const allowedMimes = ['audio/mpeg', 'audio/mp3', 'audio/mpeg3'];
    if (mimeType && !allowedMimes.includes(String(mimeType).toLowerCase())) {
      return res.status(400).json({ success: false, error: 'Invalid audio MIME type; only MP3 is permitted.' });
    }

    if (typeof audioBase64 !== 'string' || !audioBase64.trim()) {
      return res.status(400).json({ success: false, error: 'Audio payload is required.' });
    }

    const cleanBase64 = audioBase64.replace(/^data:audio\/[a-z0-9.+-]+;base64,/i, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    if (buffer.length > 15 * 1024 * 1024) {
      return res.status(413).json({ success: false, error: 'Audio file exceeds 15MB maximum upload limit.' });
    }
    if (!isValidMp3Buffer(buffer)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or corrupted MP3 file signature. Empty or fake audio files are rejected.',
      });
    }

    const gender: VoiceGender = voiceGender === 'male' ? 'male' : 'female';
    const driveRes = await uploadAudioToDrive({
      audioHash: hash,
      buffer,
      gender,
      voiceId,
      model,
    });

    const saveRes = await completeAudioUploadMetadata({
      audioHash: hash,
      lockToken,
      driveFileId: driveRes.fileId,
      driveFolderId: driveRes.folderId,
      fileSize: buffer.length,
      duration: Number(duration) || 0,
      originalText: normalizeGermanText(text),
      normalizedText: computed.normalizedText,
      language,
      provider,
      model,
      voiceId,
      voiceGender: gender,
      audioFormat,
      cacheVersion,
      approvedForShared: Boolean(approvedForShared || isAdmin),
      isAdmin,
      userToken: req.firebaseUser?.idToken,
    });

    if (!saveRes.ok) {
      return res.status(409).json({ success: false, error: saveRes.error, data: saveRes.entry });
    }

    return res.json({ success: true, data: saveRes.entry });
  } catch (err: any) {
    const hash = String(req.body?.audioHash || '').trim().toLowerCase();
    if (VALID_HASH_REGEX.test(hash)) {
      await releaseGenerationLock({
        audioHash: hash,
        lockToken: req.body?.lockToken,
        status: 'failed',
        userToken: req.firebaseUser?.idToken,
      }).catch(() => {});
    }
    const msg = err?.message || 'Upload failed';
    const status = msg === 'GOOGLE_DRIVE_NOT_CONNECTED' ? 503 : 500;
    return res.status(status).json({ success: false, error: msg });
  }
});

// Release failed/aborted generation lock
app.post('/api/tts/release-lock', ttsWriteLimiter, optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { audioHash, lockToken, status = 'failed' } = req.body || {};
  const hash = String(audioHash || '').trim().toLowerCase();
  if (!VALID_HASH_REGEX.test(hash)) {
    return res.status(400).json({ success: false, error: 'Invalid audioHash.' });
  }
  await releaseGenerationLock({
    audioHash: hash,
    lockToken,
    status: status === 'expired' || status === 'missing' ? status : 'failed',
    userToken: req.firebaseUser?.idToken,
  });
  return res.json({ success: true });
});

// Record playback telemetry events (local hit, browser fallback, failure)
app.post('/api/tts/record-event', ttsWriteLimiter, optionalAuth, (req: Request, res: Response) => {
  const { eventType } = req.body || {};
  if (
    eventType === 'local_hit' ||
    eventType === 'fallback_used' ||
    eventType === 'failed_generation' ||
    eventType === 'elevenlabs_local_generation'
  ) {
    recordTelemetryEvent(eventType);
  }
  return res.json({ success: true });
});

// Admin: 12-metric Audio Library Statistics
app.get('/api/admin/tts/statistics', adminLimiter, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const driveStatus = await getDriveStatusSummary();
  const firestoreConnected = await checkFirestoreServerConnectivity(req.firebaseUser?.idToken);
  const { stats } = getStatsAndConfig();
  const allReady = getAllAudioEntries(undefined, 'ready');
  const totalCloudAudioBytes = allReady.reduce((sum, item) => sum + (item.fileSize || 0), 0);

  // Conservative estimate: ~$0.0025 per cached replay saved vs regenerating ~40-char average phrase
  const totalReplaysSaved = stats.sharedCacheHitsCount + stats.localCacheHitsCount;
  const estimatedSavingsUsd = Number((totalReplaysSaved * 0.0025).toFixed(4));

  await syncStatsToFirestore(req.firebaseUser?.idToken).catch(() => {});

  return res.json({
    success: true,
    data: {
      driveConnected: driveStatus.connected,
      googleAccountEmail: driveStatus.googleAccountEmail,
      googleAccountName: driveStatus.googleAccountName,
      rootFolderName: driveStatus.rootFolderName,
      rootFolderId: driveStatus.rootFolderId,
      sharedAudioFilesCount: allReady.length,
      totalCloudAudioBytes,
      elevenLabsGenerationsCount: stats.elevenLabsGenerationsCount,
      sharedCacheHitsCount: stats.sharedCacheHitsCount,
      localCacheHitsCount: stats.localCacheHitsCount,
      fallbackVoiceUsesCount: stats.fallbackVoiceUsesCount,
      failedGenerationsCount: stats.failedGenerationsCount,
      estimatedSavingsUsd,
      firestoreConnected,
      missingSecrets: getMissingDriveSecrets(),
      encryptionKeyConfigured: isEncryptionKeyConfigured(),
      redirectUri: getOAuthRedirectUri(),
      storageAvailable: driveStatus.storageAvailable,
      storageQuotaBytes: driveStatus.storageQuotaBytes,
      storageUsedBytes: driveStatus.storageUsedBytes,
    },
  });
});

// Admin: List & search shared audio entries
app.get('/api/admin/tts/files', adminLimiter, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : 'all';
  const items = getAllAudioEntries(q, status);
  return res.json({ success: true, data: items });
});

// Admin: Delete a single audio file (restricted strictly to GermanLearningAudioLibrary)
app.delete('/api/admin/tts/files/:hash', adminLimiter, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const hash = String(req.params.hash || '').trim().toLowerCase();
  if (!VALID_HASH_REGEX.test(hash)) {
    return res.status(400).json({ success: false, error: 'Invalid audioHash.' });
  }
  const entry = getAudioEntry(hash);
  if (!entry) {
    return res.status(404).json({ success: false, error: 'Audio entry not found.' });
  }

  try {
    if (entry.driveFileId) {
      await deleteAppAudioFileFromDrive(entry.driveFileId);
    }
    await removeAudioEntry(hash, req.firebaseUser?.idToken);
    return res.json({ success: true, data: { deletedHash: hash } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Failed to delete shared audio file.' });
  }
});

// Admin: Remove failed / expired / abandoned lock entries
app.post('/api/admin/tts/remove-expired', adminLimiter, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const removed = await removeExpiredOrFailedEntries(req.firebaseUser?.idToken);
  return res.json({ success: true, data: { removedCount: removed } });
});

// Admin: Rebuild metadata index from Google Drive GermanLearningAudioLibrary folder
app.post('/api/admin/tts/rebuild-index', adminLimiter, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const driveFiles = await listDriveAudioFiles();
    const nowIso = new Date().toISOString();
    let indexedCount = 0;

    for (const f of driveFiles) {
      if (!VALID_HASH_REGEX.test(f.audioHash)) continue;
      const existing = getAudioEntry(f.audioHash);
      upsertRebuiltEntry({
        audioHash: f.audioHash,
        language: 'de-DE',
        originalText: existing?.originalText || `[Drive Audio ${f.audioHash.slice(0, 8)}]`,
        normalizedText: existing?.normalizedText || `[Drive Audio ${f.audioHash.slice(0, 8)}]`,
        provider: 'elevenlabs',
        model: f.model || existing?.model || DEFAULT_ELEVENLABS_MODEL,
        voiceId: f.voiceId || existing?.voiceId || DEFAULT_FEMALE_VOICE_ID,
        voiceGender: f.gender,
        audioFormat: 'mp3',
        driveFileId: f.fileId,
        driveFolderId: f.folderId,
        status: 'ready',
        fileSize: f.size,
        duration: existing?.duration || 0,
        createdAt: existing?.createdAt || f.createdTime || nowIso,
        updatedAt: nowIso,
        lastAccessedAt: existing?.lastAccessedAt || nowIso,
        cacheVersion: 1,
        approvedForShared: true,
      });
      indexedCount += 1;
    }

    return res.json({ success: true, data: { scannedDriveFiles: driveFiles.length, indexedCount } });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Index rebuild failed.' });
  }
});

// Admin: Export audio metadata as JSON
app.get('/api/admin/tts/export', adminLimiter, requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  const items = getAllAudioEntries();
  const { stats, config } = getStatsAndConfig();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="deutsch_meister_audio_metadata_${new Date().toISOString().slice(0, 10)}.json"`
  );
  return res.send(JSON.stringify({ exportedAt: new Date().toISOString(), config, stats, entries: items }, null, 2));
});

// -------------------------------------------------------------
// Vite Middleware / Static Server
// -------------------------------------------------------------
async function setupServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[Deutsch Meister Server] Running on http://0.0.0.0:${port} (${isProd ? 'Production' : 'Development'})`);
  });
}

setupServer();
