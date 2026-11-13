import React, { useState, useEffect, useCallback } from 'react';
import type { User } from 'firebase/auth';
import {
  Settings,
  Volume2,
  Gauge,
  Layers,
  Check,
  Clock,
  Key,
  Info,
  Shield,
  RotateCcw,
  HardDrive,
  Trash2,
  LogIn,
  LogOut,
  UserCheck,
} from 'lucide-react';
import { ReadingSettings, VoiceGender } from '../../types';
import {
  DEFAULT_ELEVENLABS_MODEL,
  VERIFIED_ELEVENLABS_VOICES,
} from '../../services/puterTtsService';
import { audioEngine } from '../../services/audioEngine';
import { indexedDbCache, IndexedDbAudioRecord } from '../../services/indexedDbCache';
import { signInWithGoogle, signOutUser } from '../../services/firebase';
import { formatBytes } from '../../utils/audioHash';
import { AudioLibraryDashboard } from '../admin/AudioLibraryDashboard';

interface SettingsViewProps {
  settings: ReadingSettings;
  onUpdateSettings: (newSettings: Partial<ReadingSettings>) => void;
  onResetSettings: () => void;
  isAdmin: boolean;
  firebaseUser: User | null;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  onResetSettings,
  isAdmin,
  firebaseUser,
}) => {
  const [cloudApiKey, setCloudApiKey] = useState('');
  const [savedKeyMessage, setSavedKeyMessage] = useState(false);
  const [genderTab, setGenderTab] = useState<VoiceGender>(settings.voiceGender || 'female');
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedBrowserUri, setSelectedBrowserUri] = useState<string>('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Local IndexedDB cache state
  const [localStats, setLocalStats] = useState<{ count: number; totalBytes: number }>({
    count: 0,
    totalBytes: 0,
  });
  const [localEntries, setLocalEntries] = useState<Omit<IndexedDbAudioRecord, 'blob'>[]>([]);
  const [confirmClearLocal, setConfirmClearLocal] = useState(false);

  const speeds = [0.5, 0.75, 0.85, 1.0, 1.15, 1.25, 1.5, 2.0];
  const timerOptions = [
    { value: 0, label: 'بدون مؤقت (مفتوح)' },
    { value: 10, label: '10 دقائق' },
    { value: 20, label: '20 دقيقة' },
    { value: 30, label: '30 دقيقة' },
    { value: 45, label: '45 دقيقة' },
    { value: 60, label: '60 دقيقة (جلسة كاملة)' },
  ];

  const loadLocalCache = useCallback(async () => {
    const [s, list] = await Promise.all([
      indexedDbCache.getStats(),
      indexedDbCache.listEntries(),
    ]);
    setLocalStats(s);
    setLocalEntries(list);
  }, []);

  useEffect(() => {
    loadLocalCache();
    setBrowserVoices(audioEngine.getGermanBrowserVoices());
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      const handler = () => setBrowserVoices(audioEngine.getGermanBrowserVoices());
      window.speechSynthesis.addEventListener?.('voiceschanged', handler);
      return () => window.speechSynthesis.removeEventListener?.('voiceschanged', handler);
    }
  }, [loadLocalCache]);

  const handleSaveCloudKey = () => {
    if (typeof window !== 'undefined' && cloudApiKey) {
      localStorage.setItem('google_cloud_tts_key', cloudApiKey);
      setSavedKeyMessage(true);
      setTimeout(() => setSavedKeyMessage(false), 3000);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (err: any) {
      setAuthError(err?.message || 'تعذر تسجيل الدخول بحساب Google.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignOut = async () => {
    setAuthLoading(true);
    try {
      await signOutUser();
    } finally {
      setAuthLoading(false);
    }
  };

  const handleClearLocalCache = async () => {
    await indexedDbCache.clearAll();
    setConfirmClearLocal(false);
    await loadLocalCache();
  };

  const handleDeleteLocalEntry = async (audioHash: string) => {
    await indexedDbCache.deleteAudio(audioHash);
    await loadLocalCache();
  };

  const filteredVoices = VERIFIED_ELEVENLABS_VOICES.filter((v) => v.gender === genderTab);

  return (
    <div className="space-y-8 animate-in fade-in max-w-4xl" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold mb-1">
            <Settings className="w-3.5 h-3.5" />
            <span>تفضيلات الاستوديو</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            إعدادات التطبيق والصوت
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            تخصيص المحرك الصوتي، سرعة القراءة، خيارات التمرير، وحساب Google والمكتبة السحابية.
          </p>
        </div>

        <button
          onClick={onResetSettings}
          className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>استعادة الافتراضي</span>
        </button>
      </div>

      <div className="space-y-6">
        {/* Account & Admin Authentication Card */}
        <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                {firebaseUser ? <UserCheck className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span>الحساب والمزامنة السحابية (Google Sign-In)</span>
                  {isAdmin && (
                    <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 text-[11px] font-black">
                      Admin
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {firebaseUser
                    ? `مسجل الدخول: ${firebaseUser.email || firebaseUser.displayName}`
                    : 'سجّل الدخول بحساب Google للمساهمة في المكتبة الصوتية المشتركة أو للوصول إلى لوحة المدير.'}
                </p>
              </div>
            </div>

            {firebaseUser ? (
              <button
                onClick={handleGoogleSignOut}
                disabled={authLoading}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-1.5"
              >
                <LogOut className="w-4 h-4" />
                <span>تسجيل الخروج</span>
              </button>
            ) : (
              <button
                onClick={handleGoogleSignIn}
                disabled={authLoading}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
              >
                <LogIn className="w-4 h-4" />
                <span>{authLoading ? 'جارٍ تسجيل الدخول...' : 'تسجيل الدخول عبر Google'}</span>
              </button>
            )}
          </div>

          {authError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 text-xs">
              {authError}
            </div>
          )}
        </section>

        {/* Voice & Audio Engine Settings Card */}
        <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Volume2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  أصوات اللغة الألمانية (ElevenLabs & Web Speech)
                </h2>
                <p className="text-xs text-slate-400">
                  استخدام الصوت الافتراضي المشترك يزيد نسبة الاستفادة من الكاش السحابي المشترك للجميع
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button
                onClick={() => setGenderTab('female')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  genderTab === 'female'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-xs'
                    : 'text-slate-500'
                }`}
              >
                أصوات نسائية
              </button>
              <button
                onClick={() => setGenderTab('male')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  genderTab === 'male'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 shadow-xs'
                    : 'text-slate-500'
                }`}
              >
                أصوات ذكورية
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredVoices.map((v) => {
              const selected =
                settings.voice !== 'Browser' && settings.elevenLabsVoiceId === v.voiceId;
              return (
                <div
                  key={v.voiceId}
                  onClick={() =>
                    onUpdateSettings({
                      voice: v.name,
                      voiceGender: v.gender,
                      elevenLabsVoiceId: v.voiceId,
                      elevenLabsModel: DEFAULT_ELEVENLABS_MODEL,
                    })
                  }
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-3 ${
                    selected
                      ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/30'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 ${
                      selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300'
                    }`}
                  >
                    {selected && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-sm text-slate-900 dark:text-white block">
                      {v.labelArabic}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 block mt-0.5 leading-relaxed">
                      {v.description}
                    </span>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                        ElevenLabs Multilingual v2
                      </span>
                      {v.isDefaultShared && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
                          أعلى نسبة تطابق للكاش المشترك
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Browser Fallback */}
            <div
              onClick={() => onUpdateSettings({ voice: 'Browser' })}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-3 md:col-span-2 ${
                settings.voice === 'Browser'
                  ? 'border-blue-600 bg-blue-50/40 dark:bg-blue-950/30'
                  : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 ${
                  settings.voice === 'Browser'
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300'
                }`}
              >
                {settings.voice === 'Browser' && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
              <div className="flex-1 space-y-2">
                <div>
                  <span className="font-bold text-sm text-slate-900 dark:text-white block">
                    أصوات المتصفح المجانية المدمجة (Web Speech API Fallback)
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400 block mt-0.5">
                    خيار بديل مجاني تماماً يعمل محلياً في متصفحك بدون استخدام رصيد Puter أو الرفع إلى Google Drive.
                  </span>
                </div>
                {browserVoices.length > 0 && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <select
                      value={selectedBrowserUri}
                      onChange={(e) => {
                        setSelectedBrowserUri(e.target.value);
                        audioEngine.setBrowserVoiceUri(e.target.value);
                      }}
                      className="w-full sm:w-auto px-3 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                      dir="ltr"
                    >
                      <option value="">Auto-select German voice (de-DE)</option>
                      {browserVoices.map((bv) => (
                        <option key={bv.voiceURI} value={bv.voiceURI}>
                          {bv.name} ({bv.lang})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Speed slider & options */}
          <div className="space-y-3 pt-3">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Gauge className="w-4 h-4 text-blue-500" />
                سرعة التشغيل الافتراضية (تُطبق مباشرة بدون إعادة توليد الصوت):
              </span>
              <span className="font-bold text-blue-600 dark:text-blue-400 text-sm">
                {settings.speed}x
              </span>
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {speeds.map((spd) => (
                <button
                  key={spd}
                  onClick={() => onUpdateSettings({ speed: spd })}
                  className={`py-2 px-1 text-center rounded-xl border text-xs font-bold transition-all ${
                    settings.speed === spd
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-400'
                  }`}
                >
                  {spd}x
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Reading Engine Behaviors */}
        <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6">
          <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">سلوك محرك القراءة</h2>
              <p className="text-xs text-slate-400">
                التحكم في التمرير الآلي، وضع الاستئناف، والموافقة على توليد Puter
              </p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Reading Mode */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div>
                <span className="font-bold text-sm text-slate-900 dark:text-white block">
                  نمط القراءة الافتراضي:
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {settings.readingMode === 'continuous'
                    ? 'قراءة مستمرة جملة تلو الأخرى دون توقف تلقائي'
                    : 'التوقف بعد كل جملة لإتاحة التكرار وقراءة الترجمة'}
                </span>
              </div>
              <div className="flex items-center bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => onUpdateSettings({ readingMode: 'continuous' })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    settings.readingMode === 'continuous'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  قراءة مستمرة (افتراضي)
                </button>
                <button
                  onClick={() => onUpdateSettings({ readingMode: 'sentence-step' })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    settings.readingMode === 'sentence-step'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300'
                  }`}
                >
                  خطوة بخطوة (تعليمي)
                </button>
              </div>
            </div>

            {/* Puter User-Pays Automatic Consent */}
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div>
                <span className="font-bold text-sm text-slate-900 dark:text-white block">
                  الموافقة المسبقة على توليد أصوات جديدة عبر Puter ElevenLabs:
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  عند إيقافها سيظهر لك إشعار تأكيد قبل كل توليد غير موجود في الكاش، بينما إعادة تشغيل الكاش مجانية دائماً.
                </span>
              </div>
              <button
                onClick={() =>
                  onUpdateSettings({ puterConsentGranted: !settings.puterConsentGranted })
                }
                className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                  settings.puterConsentGranted ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 bottom-0.5 w-5 rounded-full bg-white transition-transform ${
                    settings.puterConsentGranted ? 'left-0.5' : 'right-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Auto resume after word pronunciation */}
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div>
                <span className="font-bold text-sm text-slate-900 dark:text-white block">
                  استئناف القراءة تلقائياً بعد نطق الكلمة الفردية:
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  عند النقر على كلمة، يتم نطقها فقط. هل ترغب باستئناف قراءة النص بعدها تلقائياً؟ (الافتراضي: إيقاف)
                </span>
              </div>
              <button
                onClick={() =>
                  onUpdateSettings({ autoResumeAfterWord: !settings.autoResumeAfterWord })
                }
                className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                  settings.autoResumeAfterWord ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 bottom-0.5 w-5 rounded-full bg-white transition-transform ${
                    settings.autoResumeAfterWord ? 'left-0.5' : 'right-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Auto scroll */}
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
              <div>
                <span className="font-bold text-sm text-slate-900 dark:text-white block">
                  التمرير التلقائي للجملة النشطة:
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  تمرير الشاشة تلقائياً بحيث تكون الجملة التي يتم قراءتها دائماً في منتصف الشاشة.
                </span>
              </div>
              <button
                onClick={() => onUpdateSettings({ autoScroll: !settings.autoScroll })}
                className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                  settings.autoScroll ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`absolute top-0.5 bottom-0.5 w-5 rounded-full bg-white transition-transform ${
                    settings.autoScroll ? 'left-0.5' : 'right-0.5'
                  }`}
                />
              </button>
            </div>

            {/* Session Timer preset */}
            <div className="space-y-2 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-indigo-500" />
                مؤقت جلسات الاستماع والتركيز:
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {timerOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => onUpdateSettings({ timerMinutes: opt.value })}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-center ${
                      settings.timerMinutes === opt.value
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Local Browser Cache (IndexedDB) Management */}
        <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  الكاش المحلي في المتصفح (IndexedDB)
                </h2>
                <p className="text-xs text-slate-400">
                  {localStats.count} مقطع صوتي محفوظ محلياً • الحجم: {formatBytes(localStats.totalBytes)}
                </p>
              </div>
            </div>

            {localStats.count > 0 && (
              <div>
                {confirmClearLocal ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleClearLocalCache}
                      className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-bold"
                    >
                      تأكيد المسح بالكامل
                    </button>
                    <button
                      onClick={() => setConfirmClearLocal(false)}
                      className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold"
                    >
                      إلغاء
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmClearLocal(true)}
                    className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>مسح الكاش المحلي</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {localEntries.length === 0 ? (
            <p className="text-xs text-slate-400">
              لا توجد مقاطع صوتية مخزنة في متصفحك بعد. عند استماعك لأي كلمة أو جملة يتم حفظها هنا للوصول الفوري دون اتصال.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-56 overflow-y-auto rounded-2xl border border-slate-100 dark:border-slate-800">
              {localEntries.slice(0, 30).map((entry) => (
                <div
                  key={entry.audioHash}
                  className="p-2.5 flex items-center justify-between gap-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-german font-semibold text-slate-800 dark:text-slate-100 truncate" dir="ltr">
                      {entry.text}
                    </p>
                    <span className="text-[11px] text-slate-400">
                      {entry.sourceType} • {formatBytes(entry.size)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDeleteLocalEntry(entry.audioHash)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600"
                    title="حذف من هذا المتصفح"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Admin Shared Cloud Audio Library Dashboard */}
        <AudioLibraryDashboard
          isAdmin={isAdmin}
          userEmail={firebaseUser?.email || null}
        />

        {/* Optional Google Cloud TTS Setup */}
        <section className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                تكامل Google Cloud Text-to-Speech (اختياري)
              </h2>
              <p className="text-xs text-slate-400">
                يدعم التطبيق التخزين السحابي المشترك لـ ElevenLabs مع Google Drive كأولوية أولى، مع خيار إضافي لمفاتيح Google Cloud TTS.
              </p>
            </div>
          </div>

          <div className="p-4 bg-blue-50/60 dark:bg-slate-800/40 rounded-2xl border border-blue-100 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300 space-y-2">
            <span className="font-bold text-blue-700 dark:text-blue-300 block flex items-center gap-1.5">
              <Info className="w-4 h-4" />
              كيف يعمل الصوت في التطبيق؟
            </span>
            <p className="leading-relaxed">
              1. <strong>المكتبة السحابية المشتركة + IndexedDB:</strong> أي جملة أو كلمة تُولّد عبر ElevenLabs تُحفظ في متصفحك وفي مجلد Google Drive المشترك لإعادة تشغيلها فوراً لجميع المتعلمين.
            </p>
            <p className="leading-relaxed">
              2. <strong>بديل المتصفح المجاني:</strong> في حال عدم التوفر أو إيقاف التوليد السحابي يعمل محرك Web Speech الألماني محلياً مجاناً.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="password"
              value={cloudApiKey}
              onChange={(e) => setCloudApiKey(e.target.value)}
              placeholder="GOOGLE_CLOUD_TTS_API_KEY (اختياري)..."
              className="flex-1 px-4 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
            <button
              onClick={handleSaveCloudKey}
              className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition-opacity"
            >
              حفظ المفتاح
            </button>
          </div>
          {savedKeyMessage && (
            <p className="text-xs font-bold text-emerald-600">✓ تم حفظ المفتاح بنجاح.</p>
          )}
        </section>
      </div>
    </div>
  );
};
