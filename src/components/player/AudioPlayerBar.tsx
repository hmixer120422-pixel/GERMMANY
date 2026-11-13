import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  RotateCcw,
  Gauge,
  Sparkles,
  Repeat,
  Repeat1,
  Maximize2,
  Cloud,
  HardDrive,
  Volume2,
  AlertCircle,
  X,
} from 'lucide-react';
import { AudioSourceStatus, ReadingSettings, VoiceGender } from '../../types';
import {
  audioEngine,
  ConsentPromptRequest,
  PlaybackState,
} from '../../services/audioEngine';
import {
  DEFAULT_ELEVENLABS_MODEL,
  VERIFIED_ELEVENLABS_VOICES,
} from '../../services/puterTtsService';

interface AudioPlayerBarProps {
  totalSentences: number;
  currentSentenceIndex: number;
  settings: ReadingSettings;
  onUpdateSettings: (newSettings: Partial<ReadingSettings>) => void;
  onToggleConcentrationMode?: () => void;
}

export const AudioPlayerBar: React.FC<AudioPlayerBarProps> = ({
  totalSentences,
  currentSentenceIndex,
  settings,
  onUpdateSettings,
  onToggleConcentrationMode,
}) => {
  const [playbackState, setPlaybackState] = useState<PlaybackState>('idle');
  const [sourceStatus, setSourceStatus] = useState<AudioSourceStatus>(
    audioEngine.getSourceStatus()
  );
  const [liveSentenceIndex, setLiveSentenceIndex] = useState<number>(currentSentenceIndex);
  const [consentRequest, setConsentRequest] = useState<ConsentPromptRequest | null>(null);
  const [noticeText, setNoticeText] = useState<string | null>(null);
  const [showSpeedMenu, setShowSpeedMenu] = useState<boolean>(false);
  const [showVoiceMenu, setShowVoiceMenu] = useState<boolean>(false);
  const [genderFilter, setGenderFilter] = useState<VoiceGender>(
    settings.voiceGender || 'female'
  );

  useEffect(() => {
    setLiveSentenceIndex(currentSentenceIndex);
  }, [currentSentenceIndex]);

  useEffect(() => {
    const unsubState = audioEngine.onStateChange((st) => {
      setPlaybackState(st);
    });
    const unsubSource = audioEngine.onSourceChange((src) => {
      setSourceStatus(src);
    });
    const unsubSentence = audioEngine.onSentenceChange((idx) => {
      setLiveSentenceIndex(idx);
    });
    const unsubConsent = audioEngine.onConsentRequired((req) => {
      setConsentRequest(req);
    });
    const unsubNotice = audioEngine.onNotice((msg) => {
      setNoticeText(msg);
    });

    setPlaybackState(audioEngine.getState());
    setSourceStatus(audioEngine.getSourceStatus());

    return () => {
      unsubState();
      unsubSource();
      unsubSentence();
      unsubConsent();
      unsubNotice();
    };
  }, []);

  useEffect(() => {
    if (!noticeText) return;
    const t = setTimeout(() => setNoticeText(null), 5500);
    return () => clearTimeout(t);
  }, [noticeText]);

  const speeds = [0.5, 0.75, 0.85, 1.0, 1.15, 1.25, 1.5, 2.0];

  const handlePlayPause = () => {
    if (playbackState === 'playing') {
      audioEngine.pause();
    } else if (playbackState === 'paused') {
      audioEngine.resume();
    } else {
      audioEngine.play(liveSentenceIndex >= 0 ? liveSentenceIndex : 0);
    }
  };

  const handleStop = () => {
    audioEngine.stop();
  };

  const handlePrev = () => {
    audioEngine.prevSentence();
  };

  const handleNext = () => {
    audioEngine.nextSentence();
  };

  const handleRepeatSentence = () => {
    audioEngine.repeatCurrentSentence();
  };

  const toggleRepeatMode = () => {
    const modes: ReadingSettings['repeatMode'][] = ['none', 'sentence', 'all'];
    const currentIdx = modes.indexOf(settings.repeatMode);
    const nextMode = modes[(currentIdx + 1) % modes.length];
    onUpdateSettings({ repeatMode: nextMode });
  };

  const getSourceBadgeStyle = (status: AudioSourceStatus) => {
    switch (status) {
      case 'Shared Cloud Audio':
        return {
          cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
          icon: <Cloud className="w-3 h-3" />,
        };
      case 'Local Cached Audio':
        return {
          cls: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800',
          icon: <HardDrive className="w-3 h-3" />,
        };
      case 'Newly Generated ElevenLabs Audio':
        return {
          cls: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800',
          icon: <Sparkles className="w-3 h-3" />,
        };
      case 'Free Browser Voice':
      default:
        return {
          cls: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
          icon: <Volume2 className="w-3 h-3" />,
        };
    }
  };

  const badge = getSourceBadgeStyle(sourceStatus);
  const currentDisplayIndex =
    totalSentences > 0 ? Math.min(liveSentenceIndex + 1, totalSentences) : 0;
  const progressPercent = totalSentences > 0 ? (currentDisplayIndex / totalSentences) * 100 : 0;

  const filteredVoices = VERIFIED_ELEVENLABS_VOICES.filter((v) => v.gender === genderFilter);
  const activeVoiceLabel =
    settings.voice === 'Browser'
      ? 'صوت المتصفح'
      : VERIFIED_ELEVENLABS_VOICES.find((v) => v.voiceId === settings.elevenLabsVoiceId)?.name.split(
          ' '
        )[0] ||
        settings.voice.split(' ')[0] ||
        'Rachel';

  return (
    <>
      {/* Notice Toast above bar */}
      {noticeText && (
        <div
          className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 bg-slate-900 text-white text-xs px-4 py-3 rounded-2xl shadow-xl border border-slate-700 flex items-center justify-between gap-3"
          dir="rtl"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{noticeText}</span>
          </div>
          <button
            onClick={() => setNoticeText(null)}
            className="text-slate-400 hover:text-white"
            aria-label="إغلاق التنبيه"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Puter User-Pays Consent Modal */}
      {consentRequest && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs"
          dir="rtl"
        >
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-base text-slate-900 dark:text-white">
                  توليد صوت ElevenLabs جديد عبر Puter
                </h3>
                <p className="text-[11px] text-slate-400">
                  {consentRequest.approvedForShared
                    ? 'النص معتمد للمشاركة السحابية وسيُحفظ لإعادة استخدامه مجاناً للجميع'
                    : 'نص خاص — سيتم حفظه في متصفحك المحلي فقط'}
                </p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
              Generating new audio may use your Puter account allowance or require an upgrade.
              Existing cached audio is free to reuse through this application.
            </div>

            {consentRequest.textPreview && (
              <p
                className="font-german text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl truncate"
                dir="ltr"
              >
                &ldquo;{consentRequest.textPreview}&rdquo;
              </p>
            )}

            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={() => audioEngine.respondToConsent(true)}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
              >
                توليد الصوت هذه المرة عبر ElevenLabs
              </button>
              <button
                onClick={() => {
                  onUpdateSettings({ puterConsentGranted: true });
                  audioEngine.respondToConsent(true);
                }}
                className="w-full py-2.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs font-bold"
              >
                الموافقة دائماً في هذا المتصفح
              </button>
              <button
                onClick={() => audioEngine.respondToConsent(false)}
                className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold"
              >
                استخدام صوت المتصفح المجاني بدلاً من ذلك
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 shadow-2xl transition-all"
        dir="rtl"
      >
        {/* Visual Progress Line */}
        <div className="w-full bg-slate-100 dark:bg-slate-800 h-1 relative overflow-hidden">
          <div
            className="bg-blue-600 h-full transition-all duration-300 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 sm:py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Left Side: Sentence Tracker & Audio Source Status */}
          <div className="flex items-center gap-3 min-w-[200px]">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  الجملة {currentDisplayIndex} من {totalSentences}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  {playbackState === 'playing' && 'جارٍ القراءة...'}
                  {playbackState === 'loading' && 'جارٍ جلب الصوت...'}
                  {playbackState === 'paused' && 'متوقف مؤقتاً'}
                  {playbackState === 'stopped' && 'جاهز للاستماع'}
                  {playbackState === 'idle' && 'جاهز'}
                  {playbackState === 'error' && 'خطأ في الصوت'}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${badge.cls}`}
                  title="مصدر الصوت النشط"
                >
                  {badge.icon}
                  <span>{sourceStatus}</span>
                </span>
              </div>
            </div>

            {/* Repeat mode badge */}
            <button
              onClick={toggleRepeatMode}
              className={`p-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1 ${
                settings.repeatMode !== 'none'
                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
              title={
                settings.repeatMode === 'sentence'
                  ? 'تكرار الجملة الحالية مفعّل'
                  : settings.repeatMode === 'all'
                  ? 'تكرار النص بالكامل مفعّل'
                  : 'بدون تكرار'
              }
            >
              {settings.repeatMode === 'sentence' ? (
                <Repeat1 className="w-4 h-4" />
              ) : (
                <Repeat className="w-4 h-4" />
              )}
              <span className="hidden sm:inline text-[11px]">
                {settings.repeatMode === 'sentence'
                  ? 'تكرار الجملة'
                  : settings.repeatMode === 'all'
                  ? 'تكرار النص'
                  : 'تكرار'}
              </span>
            </button>
          </div>

          {/* Center: Main Playback Controls */}
          <div className="flex items-center gap-1 sm:gap-2 mx-auto">
            <button
              onClick={handlePrev}
              disabled={liveSentenceIndex <= 0}
              className="p-2 sm:p-2.5 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
              title="الجملة السابقة"
            >
              <SkipForward className="w-5 h-5" />
            </button>

            <button
              onClick={handleRepeatSentence}
              disabled={totalSentences === 0}
              className="p-2 sm:p-2.5 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
              title="إعادة نطق الجملة الحالية"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={handlePlayPause}
              disabled={totalSentences === 0}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg transition-transform active:scale-95 ${
                playbackState === 'playing'
                  ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/25 ring-4 ring-amber-100 dark:ring-amber-950/40'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/30 ring-4 ring-blue-100 dark:ring-blue-950/40'
              }`}
              title={playbackState === 'playing' ? 'إيقاف مؤقت' : 'تشغيل القراءة جملة تلو الأخرى'}
            >
              {playbackState === 'playing' ? (
                <Pause className="w-6 h-6 fill-current" />
              ) : (
                <Play className="w-6 h-6 fill-current translate-x-[-1px]" />
              )}
            </button>

            <button
              onClick={handleStop}
              disabled={playbackState === 'stopped' || playbackState === 'idle'}
              className="p-2 sm:p-2.5 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
              title="إيقاف كامل"
            >
              <Square className="w-4 h-4 fill-current" />
            </button>

            <button
              onClick={handleNext}
              disabled={liveSentenceIndex >= totalSentences - 1}
              className="p-2 sm:p-2.5 rounded-xl text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
              title="الجملة التالية"
            >
              <SkipBack className="w-5 h-5" />
            </button>
          </div>

          {/* Right Side: Speed, Voice & Concentration Mode */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Speed Selector Dropdown */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowSpeedMenu(!showSpeedMenu);
                  setShowVoiceMenu(false);
                }}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 flex items-center gap-1.5 transition-colors"
                title="سرعة القراءة (لا تؤثر على الكاش)"
              >
                <Gauge className="w-3.5 h-3.5 text-blue-500" />
                <span>{settings.speed}x</span>
              </button>

              {showSpeedMenu && (
                <div className="absolute bottom-full mb-2 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-1.5 min-w-[140px] z-50 animate-in fade-in">
                  <span className="text-[11px] font-bold text-slate-400 px-2 py-1 block">
                    سرعة التشغيل:
                  </span>
                  {speeds.map((spd) => (
                    <button
                      key={spd}
                      onClick={() => {
                        onUpdateSettings({ speed: spd });
                        setShowSpeedMenu(false);
                      }}
                      className={`w-full text-right px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors ${
                        settings.speed === spd
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span>{spd}x</span>
                      <span className="text-[10px] text-slate-400">
                        {spd === 1.0 ? 'طبيعي' : spd < 1.0 ? 'تعليمي بطيء' : 'سريع'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Voice Selector Dropdown (ElevenLabs Female/Male + Browser Fallback) */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowVoiceMenu(!showVoiceMenu);
                  setShowSpeedMenu(false);
                }}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 flex items-center gap-1.5 transition-colors"
                title="اختيار الصوت الألماني (ElevenLabs / المتصفح)"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                <span className="hidden sm:inline">{activeVoiceLabel}</span>
                <span className="text-[10px] text-slate-400 font-normal sm:hidden">صوت</span>
              </button>

              {showVoiceMenu && (
                <div className="absolute bottom-full mb-2 left-0 sm:right-auto sm:left-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-2.5 min-w-[290px] z-50 animate-in fade-in space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-bold text-slate-400">
                      أصوات ElevenLabs المشتركة:
                    </span>
                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg">
                      <button
                        onClick={() => setGenderFilter('female')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          genderFilter === 'female'
                            ? 'bg-white dark:bg-slate-700 text-blue-600'
                            : 'text-slate-500'
                        }`}
                      >
                        أنثى
                      </button>
                      <button
                        onClick={() => setGenderFilter('male')}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          genderFilter === 'male'
                            ? 'bg-white dark:bg-slate-700 text-blue-600'
                            : 'text-slate-500'
                        }`}
                      >
                        ذكر
                      </button>
                    </div>
                  </div>

                  {filteredVoices.map((v) => {
                    const isSelected =
                      settings.voice !== 'Browser' && settings.elevenLabsVoiceId === v.voiceId;
                    return (
                      <button
                        key={v.voiceId}
                        onClick={() => {
                          onUpdateSettings({
                            voice: v.name,
                            voiceGender: v.gender,
                            elevenLabsVoiceId: v.voiceId,
                            elevenLabsModel: DEFAULT_ELEVENLABS_MODEL,
                          });
                          setShowVoiceMenu(false);
                        }}
                        className={`w-full text-right p-2 rounded-lg text-xs font-semibold block transition-colors ${
                          isSelected
                            ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold">{v.labelArabic}</span>
                          {v.isDefaultShared && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                              أفضل توفير
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 font-normal block">
                          {v.description}
                        </span>
                      </button>
                    );
                  })}

                  <div className="border-t border-slate-100 dark:border-slate-700 pt-1.5">
                    <button
                      onClick={() => {
                        onUpdateSettings({ voice: 'Browser' });
                        setShowVoiceMenu(false);
                      }}
                      className={`w-full text-right p-2 rounded-lg text-xs font-semibold block transition-colors ${
                        settings.voice === 'Browser'
                          ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span className="block font-bold">
                        صوت المتصفح المجاني (Web Speech API)
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal block">
                        يعمل مجاناً بدون حصة Puter أو تخزين سحابي
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Concentration Mode button */}
            {onToggleConcentrationMode && (
              <button
                onClick={onToggleConcentrationMode}
                className={`p-2 rounded-xl border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  settings.concentrationMode
                    ? 'bg-indigo-600 text-white border-indigo-700'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                }`}
                title="وضع التركيز والاستماع الممتد (Konzentrationsmodus)"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="hidden md:inline text-xs">وضع التركيز</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};
