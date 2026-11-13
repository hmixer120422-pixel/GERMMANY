import { ElevenLabsVoiceOption } from '../types';

declare global {
  interface Window {
    puter?: {
      ai?: {
        txt2speech: (
          text: string,
          options?: {
            provider?: 'elevenlabs' | 'openai' | 'aws-polly';
            model?: string;
            voice?: string;
            output_format?: string;
            test_mode?: boolean;
            language?: string;
          }
        ) => Promise<HTMLAudioElement>;
      };
      auth?: {
        isSignedIn?: () => boolean;
        signIn?: () => Promise<any>;
        getUser?: () => Promise<any>;
      };
    };
  }
}

export const DEFAULT_ELEVENLABS_MODEL = 'eleven_multilingual_v2';
export const DEFAULT_ELEVENLABS_OUTPUT_FORMAT = 'mp3_44100_128';
export const DEFAULT_FEMALE_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel (Multilingual v2 supports German cleanly)
export const DEFAULT_MALE_VOICE_ID = 'ErXwobaYiN019PkySvjV'; // Antoni (Multilingual v2)

/**
 * Verified ElevenLabs Multilingual v2 voices compatible with Puter.js txt2speech.
 * Using one default shared female voice maximizes cache reuse across all learners.
 */
export const VERIFIED_ELEVENLABS_VOICES: ElevenLabsVoiceOption[] = [
  {
    voiceId: '21m00Tcm4TlvDq8ikWAM',
    name: 'Rachel (Default Shared Female)',
    labelArabic: 'Rachel (صوت أنثوي قياسي — الافتراضي المشترك)',
    gender: 'female',
    description: 'نطق واضح ومتزن للمناهج الألمانية (eleven_multilingual_v2)',
    model: DEFAULT_ELEVENLABS_MODEL,
    isDefaultShared: true,
  },
  {
    voiceId: 'EXAVITQu4vr4xnSDxMaL',
    name: 'Bella / Sarah (Soft Female)',
    labelArabic: 'Bella (صوت أنثوي دافئ وهادئ)',
    gender: 'female',
    description: 'مناسب لنصوص القراءة الطويلة والمستويات المتقدمة',
    model: DEFAULT_ELEVENLABS_MODEL,
  },
  {
    voiceId: 'AZnzlk1XvdvUeBnXmlld',
    name: 'Domi (Clear Female)',
    labelArabic: 'Domi (صوت أنثوي قوي وواضح)',
    gender: 'female',
    description: 'نبرة واضحة لنطق المفردات والأمثلة النحوية',
    model: DEFAULT_ELEVENLABS_MODEL,
  },
  {
    voiceId: 'ErXwobaYiN019PkySvjV',
    name: 'Antoni (Clear Male)',
    labelArabic: 'Antoni (صوت ذكوري واضح وهادئ)',
    gender: 'male',
    description: 'مناسب للحوارات والمقالات الرسمية',
    model: DEFAULT_ELEVENLABS_MODEL,
  },
  {
    voiceId: 'pNInz6obpgDQGcFmaJgB',
    name: 'Adam (Deep Male)',
    labelArabic: 'Adam (صوت ذكوري عميق ورصين)',
    gender: 'male',
    description: 'مثالي للنصوص الإخبارية والمستويات B2–C2',
    model: DEFAULT_ELEVENLABS_MODEL,
  },
  {
    voiceId: 'TxGEqnHWrfWFTfGW9XjX',
    name: 'Josh (Young Male)',
    labelArabic: 'Josh (صوت ذكوري شاب)',
    gender: 'male',
    description: 'مناسب لمحادثات الحياة اليومية',
    model: DEFAULT_ELEVENLABS_MODEL,
  },
];

export interface PuterGenerationResult {
  audioElement: HTMLAudioElement;
  blob: Blob | null;
  corsBlocked: boolean;
  duration: number;
  errorMessage?: string;
}

export function isPuterAvailable(): boolean {
  return typeof window !== 'undefined' && Boolean(window.puter?.ai?.txt2speech);
}

export function getPuterAuthStatus(): { available: boolean; signedIn: boolean | null } {
  if (typeof window === 'undefined' || !window.puter) {
    return { available: false, signedIn: null };
  }
  const signedIn =
    typeof window.puter.auth?.isSignedIn === 'function' ? window.puter.auth.isSignedIn() : null;
  return { available: Boolean(window.puter.ai?.txt2speech), signedIn };
}

export async function ensurePuterSignedInIfSupported(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.puter?.auth) return false;
  try {
    if (window.puter.auth.isSignedIn?.()) return true;
    if (typeof window.puter.auth.signIn === 'function') {
      await window.puter.auth.signIn();
      return Boolean(window.puter.auth.isSignedIn?.());
    }
  } catch (err) {
    console.warn('Puter auth sign-in cancelled or unavailable:', err);
  }
  return false;
}

/**
 * Generates ElevenLabs audio via official Puter.js v2 SDK and safely verifies
 * whether its src can be converted into a downloadable MP3 Blob without bypassing CORS.
 */
export async function generateElevenLabsViaPuter(options: {
  text: string;
  voiceId: string;
  model?: string;
  outputFormat?: string;
  testMode?: boolean;
}): Promise<PuterGenerationResult> {
  if (!isPuterAvailable()) {
    throw new Error('Puter.js SDK is not loaded yet or unavailable in this browser.');
  }

  const trimmed = options.text.trim();
  if (!trimmed) {
    throw new Error('Cannot generate TTS for empty text.');
  }
  if (trimmed.length > 3000) {
    throw new Error('Text exceeds Puter 3,000-character per-request limit; chunk text first.');
  }

  const audioEl = await window.puter!.ai!.txt2speech!(trimmed, {
    provider: 'elevenlabs',
    model: options.model || DEFAULT_ELEVENLABS_MODEL,
    voice: options.voiceId,
    output_format: options.outputFormat || DEFAULT_ELEVENLABS_OUTPUT_FORMAT,
    ...(options.testMode ? { test_mode: true } : {}),
  });

  if (!audioEl || !audioEl.src) {
    throw new Error('Puter txt2speech returned an invalid or empty HTMLAudioElement.');
  }

  const src = audioEl.src;
  let blob: Blob | null = null;
  let corsBlocked = false;
  let errorMessage: string | undefined;

  // Attempt legal browser-permitted Blob extraction (blob:, data:, or CORS-allowed URL)
  try {
    const response = await fetch(src, { mode: src.startsWith('http') ? 'cors' : 'same-origin' });
    if (response.ok) {
      const fetchedBlob = await response.blob();
      if (fetchedBlob && fetchedBlob.size >= 128) {
        blob =
          fetchedBlob.type && fetchedBlob.type.includes('audio')
            ? fetchedBlob
            : new Blob([fetchedBlob], { type: 'audio/mpeg' });
      } else {
        errorMessage = 'Generated audio Blob is empty or too small.';
      }
    } else {
      corsBlocked = true;
      errorMessage = `Audio fetch returned HTTP ${response.status}; cloud caching skipped.`;
    }
  } catch (fetchErr: any) {
    corsBlocked = true;
    errorMessage =
      fetchErr?.message ||
      'Remote audio source blocked Blob fetch via CORS; playing locally without shared cloud upload.';
  }

  // Wait briefly for audio metadata to measure duration if available
  const duration = await new Promise<number>((resolve) => {
    if (Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
      resolve(audioEl.duration);
      return;
    }
    const timer = setTimeout(() => resolve(0), 600);
    audioEl.addEventListener(
      'loadedmetadata',
      () => {
        clearTimeout(timer);
        resolve(Number.isFinite(audioEl.duration) ? audioEl.duration : 0);
      },
      { once: true }
    );
  });

  return {
    audioElement: audioEl,
    blob,
    corsBlocked,
    duration,
    errorMessage,
  };
}
