import React, { useState, useEffect, useCallback } from 'react';
import {
  Cloud,
  Database,
  HardDrive,
  Search,
  Trash2,
  Download,
  RefreshCw,
  Play,
  Sliders,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Wand2,
  Unplug,
  Shield,
} from 'lucide-react';
import {
  ElevenLabsVoiceOption,
  TtsCacheMetadata,
  TtsLibraryStatistics,
} from '../../types';
import { formatBytes } from '../../utils/audioHash';
import {
  getCurrentIdToken,
  verifyFirestoreAudioIndexReadable,
} from '../../services/firebase';
import { indexedDbCache } from '../../services/indexedDbCache';
import {
  DEFAULT_ELEVENLABS_MODEL,
  DEFAULT_FEMALE_VOICE_ID,
  DEFAULT_MALE_VOICE_ID,
  generateElevenLabsViaPuter,
  isPuterAvailable,
  VERIFIED_ELEVENLABS_VOICES,
} from '../../services/puterTtsService';
import { AudioSetupWizard } from './AudioSetupWizard';

interface AudioLibraryDashboardProps {
  isAdmin: boolean;
  userEmail: string | null;
}

export const AudioLibraryDashboard: React.FC<AudioLibraryDashboardProps> = ({
  isAdmin,
  userEmail,
}) => {
  const [stats, setStats] = useState<TtsLibraryStatistics | null>(null);
  const [localStats, setLocalStats] = useState<{ count: number; totalBytes: number }>({
    count: 0,
    totalBytes: 0,
  });
  const [files, setFiles] = useState<TtsCacheMetadata[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedHashes, setSelectedHashes] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);

  // Admin Voice configuration state
  const [voices, setVoices] = useState<ElevenLabsVoiceOption[]>(VERIFIED_ELEVENLABS_VOICES);
  const [defaultModel, setDefaultModel] = useState(DEFAULT_ELEVENLABS_MODEL);
  const [defaultFemaleVoiceId, setDefaultFemaleVoiceId] = useState(DEFAULT_FEMALE_VOICE_ID);
  const [defaultMaleVoiceId, setDefaultMaleVoiceId] = useState(DEFAULT_MALE_VOICE_ID);
  const [defaultCourseVoiceId, setDefaultCourseVoiceId] = useState(DEFAULT_FEMALE_VOICE_ID);

  // Explicit confirmation modal state for destructive operations
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const loadDashboardData = useCallback(async () => {
    const idb = await indexedDbCache.getStats();
    setLocalStats(idb);

    try {
      const voicesRes = await fetch('/api/tts/voices');
      if (voicesRes.ok) {
        const vj = await voicesRes.json();
        if (vj.success && vj.data) {
          setVoices(vj.data.voices || VERIFIED_ELEVENLABS_VOICES);
          setDefaultModel(vj.data.model || DEFAULT_ELEVENLABS_MODEL);
          setDefaultFemaleVoiceId(vj.data.defaultFemaleVoiceId || DEFAULT_FEMALE_VOICE_ID);
          setDefaultMaleVoiceId(vj.data.defaultMaleVoiceId || DEFAULT_MALE_VOICE_ID);
          setDefaultCourseVoiceId(vj.data.defaultCourseVoiceId || DEFAULT_FEMALE_VOICE_ID);
        }
      }
    } catch {
      // keep defaults
    }

    if (!isAdmin) return;
    setLoading(true);
    setActionError(null);
    try {
      const token = await getCurrentIdToken();
      if (!token) return;

      const [statsRes, filesRes] = await Promise.all([
        fetch('/api/admin/tts/statistics', {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(
          `/api/admin/tts/files?q=${encodeURIComponent(searchQuery)}&status=${encodeURIComponent(
            statusFilter
          )}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        ),
      ]);

      if (statsRes.ok) {
        const sj = await statsRes.json();
        if (sj.success) setStats(sj.data);
      }
      if (filesRes.ok) {
        const fj = await filesRes.json();
        if (fj.success) setFiles(fj.data || []);
      }
    } catch (err: any) {
      setActionError(err?.message || 'تعذر تحميل بيانات لوحة المكتبة الصوتية.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, searchQuery, statusFilter]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    const onMsg = (event: MessageEvent) => {
      if (!event.origin.endsWith('.run.app') && !event.origin.includes('localhost')) return;
      if (event.data?.type === 'DRIVE_OAUTH_SUCCESS') {
        setActionMessage('✓ تم ربط Google Drive وتجهيز مجلد المكتبة بنجاح.');
        loadDashboardData();
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [loadDashboardData]);

  const handleConnectDrive = async () => {
    setActionError(null);
    try {
      const token = await getCurrentIdToken();
      const res = await fetch('/api/admin/drive/connect', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'تعذر بدء ربط Drive');
      const popup = window.open(json.data.authUrl, 'google_drive_oauth', 'width=600,height=720');
      if (!popup) {
        setActionError('يرجى السماح بالنوافذ المنبثقة (Popups) لفتح شاشة تفويض Google Drive.');
      }
    } catch (err: any) {
      setActionError(err?.message);
    }
  };

  const handleDisconnectDrive = () => {
    setConfirmModal({
      title: 'تأكيد فصل حساب Google Drive',
      message:
        'سيتم إزالة رمز الوصول المشفر من الخادم وإيقاف الرفع إلى Drive مؤقتاً، مع الحفاظ على بيانات الفهرسة في Firestore. هل تريد المتابعة؟',
      confirmLabel: 'فصل Google Drive',
      onConfirm: async () => {
        const token = await getCurrentIdToken();
        const res = await fetch('/api/admin/drive/disconnect', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error('فشل فصل Drive');
        setActionMessage('✓ تم فصل حساب Google Drive بأمان.');
        await loadDashboardData();
      },
    });
  };

  const handleTestDrive = async () => {
    setActionError(null);
    setActionMessage(null);
    try {
      const token = await getCurrentIdToken();
      const res = await fetch('/api/admin/drive/test', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'فشل اختبار Drive');
      setActionMessage(
        `✓ اختبار Google Drive ناجح (${json.data.bytesTested} بايت في ${json.data.latencyMs}ms)`
      );
      await loadDashboardData();
    } catch (err: any) {
      setActionError(err?.message);
    }
  };

  const handleVerifyFirestore = async () => {
    setActionError(null);
    const res = await verifyFirestoreAudioIndexReadable();
    if (res.ok) {
      setActionMessage(`✓ Firestore متصل ويعمل بنجاح (عدد العينات المفحوصة: ${res.sampleCount}).`);
    } else {
      setActionError(`✕ تعذر التحقق من Firestore: ${res.error}`);
    }
  };

  const handleTestElevenLabs = async () => {
    setActionError(null);
    try {
      if (!isPuterAvailable()) throw new Error('Puter.js غير متوفر.');
      const res = await generateElevenLabsViaPuter({
        text: 'Hallo, das ist ein Sprachtest.',
        voiceId: defaultCourseVoiceId,
        model: defaultModel,
        testMode: true,
      });
      res.audioElement.play().catch(() => {});
      setActionMessage(
        res.blob
          ? `✓ اختبار ElevenLabs عبر Puter نجح (${res.blob.size} بايت MP3).`
          : '✓ تم التشغيل عبر Puter لكن بدون Blob قابل للرفع.'
      );
    } catch (err: any) {
      setActionError(err?.message || 'فشل اختبار ElevenLabs');
    }
  };

  const handleRemoveExpired = async () => {
    const token = await getCurrentIdToken();
    const res = await fetch('/api/admin/tts/remove-expired', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const json = await res.json();
    if (res.ok) {
      setActionMessage(`✓ تم تنظيف ${json.data?.removedCount || 0} سجل منتهي أو معطوب.`);
      await loadDashboardData();
    }
  };

  const handleRebuildIndex = async () => {
    setActionError(null);
    const token = await getCurrentIdToken();
    const res = await fetch('/api/admin/tts/rebuild-index', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const json = await res.json();
    if (res.ok) {
      setActionMessage(
        `✓ تمت إعادة بناء الفهرس من Drive: ${json.data?.indexedCount || 0} ملف متزامن.`
      );
      await loadDashboardData();
    } else {
      setActionError(json.error || 'فشل إعادة بناء الفهرس');
    }
  };

  const handleExportMetadata = async () => {
    const token = await getCurrentIdToken();
    const res = await fetch('/api/admin/tts/export', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deutsch_meister_audio_metadata_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleSaveVoiceConfig = async () => {
    setActionError(null);
    const token = await getCurrentIdToken();
    const res = await fetch('/api/admin/tts/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        defaultModel,
        defaultFemaleVoiceId,
        defaultMaleVoiceId,
        defaultCourseVoiceId,
      }),
    });
    if (res.ok) {
      setActionMessage('✓ تم حفظ إعدادات أصوات ElevenLabs المشتركة بنجاح.');
    } else {
      setActionError('تعذر حفظ إعدادات الأصوات.');
    }
  };

  const handleDeleteSingleFile = (entry: TtsCacheMetadata) => {
    setConfirmModal({
      title: 'حذف ملف صوتي من المكتبة المشتركة',
      message: `هل أنت متأكد من حذف الملف الصوتي للنص "${entry.normalizedText.slice(
        0,
        80
      )}" من Google Drive و Firestore نهائياً؟`,
      confirmLabel: 'حذف نهائي',
      onConfirm: async () => {
        const token = await getCurrentIdToken();
        const res = await fetch(`/api/admin/tts/files/${entry.audioHash}`, {
          method: 'DELETE',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || 'فشل الحذف');
        }
        setActionMessage('✓ تم حذف الملف الصوتي من Drive والفهرس.');
        await loadDashboardData();
      },
    });
  };

  const handleDeleteSelected = () => {
    if (selectedHashes.size === 0) return;
    const count = selectedHashes.size;
    setConfirmModal({
      title: `حذف ${count} ملفات محددة`,
      message: `سيتم حذف ${count} ملفات صوتية محددة من مجلد المكتبة الصوتية في Google Drive ومن فهرس Firestore. هل تؤكد الحذف؟`,
      confirmLabel: `حذف (${count})`,
      onConfirm: async () => {
        const token = await getCurrentIdToken();
        for (const h of Array.from(selectedHashes)) {
          await fetch(`/api/admin/tts/files/${h}`, {
            method: 'DELETE',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
        }
        setSelectedHashes(new Set());
        setActionMessage(`✓ تم حذف ${count} ملفات بنجاح.`);
        await loadDashboardData();
      },
    });
  };

  const handlePlayPreview = async (audioHash: string) => {
    const token = await getCurrentIdToken();
    const res = await fetch(`/api/tts/audio/${audioHash}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      setActionError('تعذر تحميل المعاينة من Google Drive.');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const el = new Audio(url);
    el.onended = () => URL.revokeObjectURL(url);
    await el.play();
  };

  if (!isAdmin) {
    return (
      <section
        className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4"
        dir="rtl"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Audio Library Management
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              إدارة مكتبة الصوت السحابية المشتركة متاحة لمدير النظام فقط.{' '}
              {userEmail ? `(الحساب الحالي: ${userEmail})` : 'سجّل الدخول بحساب المدير للوصول.'}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 dark:text-white">
              Audio Library Management
            </h2>
            <p className="text-xs text-slate-400">
              لوحة تحكم المكتبة الصوتية المشتركة: Google Drive + Firestore + Puter/ElevenLabs + IndexedDB
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowWizard(!showWizard)}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
          >
            <Wand2 className="w-4 h-4" />
            <span>{showWizard ? 'إخفاء معالج الإعداد' : 'Configure Shared Audio Cloud Storage'}</span>
          </button>

          <button
            onClick={loadDashboardData}
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            title="تحديث الإحصائيات"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Warning banner if Drive disconnected */}
      {stats && !stats.driveConnected && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>
              <strong>تنبيه المدير:</strong> حساب Google Drive غير متصل حالياً. لن يتأثر التشغيل المحلي في IndexedDB أو صوت المتصفح، ولكن يجب ربط Drive لتخزين ومشاركة ملفات MP3 الجديدة.
            </span>
          </div>
          <button
            onClick={() => setShowWizard(true)}
            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold"
          >
            فتح معالج الربط
          </button>
        </div>
      )}

      {actionMessage && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs font-bold text-emerald-700 dark:text-emerald-300">
          {actionMessage}
        </div>
      )}
      {actionError && (
        <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs font-bold text-rose-700 dark:text-rose-300">
          {actionError}
        </div>
      )}

      {/* Guided 6-step Setup Wizard */}
      {showWizard && (
        <AudioSetupWizard
          stats={stats}
          onRefreshStats={loadDashboardData}
          onClose={() => setShowWizard(false)}
        />
      )}

      {/* All 12 Required Dashboard Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
          <span className="text-[11px] text-slate-400 block">1. حالة Google Drive</span>
          <strong className={`text-sm font-black ${stats?.driveConnected ? 'text-emerald-600' : 'text-rose-600'}`}>
            {stats?.driveConnected ? 'متصل بنجاح' : 'غير متصل'}
          </strong>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
          <span className="text-[11px] text-slate-400 block">2. حساب Google المرتبط</span>
          <strong className="text-xs font-bold text-slate-900 dark:text-white truncate block">
            {stats?.googleAccountEmail || 'غير مربوط بعد'}
          </strong>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
          <span className="text-[11px] text-slate-400 block">3. اسم المجلد الجذري</span>
          <strong className="text-xs font-mono font-bold text-blue-700 dark:text-blue-400 block truncate">
            {stats?.rootFolderName || 'GermanLearningAudioLibrary'}
          </strong>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
          <span className="text-[11px] text-slate-400 block">4. عدد الملفات المشتركة</span>
          <strong className="text-lg font-black text-slate-900 dark:text-white">
            {stats?.sharedAudioFilesCount ?? 0}
          </strong>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
          <span className="text-[11px] text-slate-400 block">5. إجمالي التخزين السحابي</span>
          <strong className="text-sm font-black text-slate-900 dark:text-white">
            {formatBytes(stats?.totalCloudAudioBytes || 0)}
          </strong>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
          <span className="text-[11px] text-slate-400 block">6. الكاش المحلي (IndexedDB)</span>
          <strong className="text-sm font-black text-slate-900 dark:text-white">
            {formatBytes(localStats.totalBytes)} ({localStats.count})
          </strong>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
          <span className="text-[11px] text-slate-400 block">7. توليدات ElevenLabs</span>
          <strong className="text-lg font-black text-indigo-600 dark:text-indigo-400">
            {stats?.elevenLabsGenerationsCount ?? 0}
          </strong>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
          <span className="text-[11px] text-slate-400 block">8. إصابات الكاش المشترك</span>
          <strong className="text-lg font-black text-emerald-600">
            {stats?.sharedCacheHitsCount ?? 0}
          </strong>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
          <span className="text-[11px] text-slate-400 block">9. إصابات الكاش المحلي</span>
          <strong className="text-lg font-black text-blue-600">
            {stats?.localCacheHitsCount ?? 0}
          </strong>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
          <span className="text-[11px] text-slate-400 block">10. مرات استخدام صوت المتصفح</span>
          <strong className="text-lg font-black text-slate-700 dark:text-slate-300">
            {stats?.fallbackVoiceUsesCount ?? 0}
          </strong>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700">
          <span className="text-[11px] text-slate-400 block">11. التوليدات الفاشلة</span>
          <strong className="text-lg font-black text-rose-600">
            {stats?.failedGenerationsCount ?? 0}
          </strong>
        </div>

        <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50">
          <span className="text-[11px] text-emerald-700 dark:text-emerald-300 block">12. التوفير التقديري من الكاش</span>
          <strong className="text-lg font-black text-emerald-700 dark:text-emerald-300">
            ${(stats?.estimatedSavingsUsd ?? 0).toFixed(4)}
          </strong>
        </div>
      </div>

      {/* Administrative Actions Toolbar */}
      <div className="flex flex-wrap gap-2">
        {!stats?.driveConnected ? (
          <button
            onClick={handleConnectDrive}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <Cloud className="w-3.5 h-3.5" />
            <span>ربط Google Drive</span>
          </button>
        ) : (
          <button
            onClick={handleDisconnectDrive}
            className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1.5"
          >
            <Unplug className="w-3.5 h-3.5" />
            <span>فصل Google Drive</span>
          </button>
        )}

        <button
          onClick={handleTestDrive}
          disabled={!stats?.driveConnected}
          className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 disabled:opacity-40 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
        >
          <HardDrive className="w-3.5 h-3.5" />
          <span>اختبار اتصال Drive والمساحة</span>
        </button>

        <button
          onClick={handleVerifyFirestore}
          className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
        >
          <Database className="w-3.5 h-3.5" />
          <span>فحص Firestore</span>
        </button>

        <button
          onClick={handleTestElevenLabs}
          className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>اختبار ElevenLabs (وضع تجريبي)</span>
        </button>

        <button
          onClick={handleRemoveExpired}
          className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>إزالة السجلات المنتهية</span>
        </button>

        <button
          onClick={handleRebuildIndex}
          disabled={!stats?.driveConnected}
          className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 disabled:opacity-40 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>إعادة بناء الفهرس من Drive</span>
        </button>

        <button
          onClick={handleExportMetadata}
          className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" />
          <span>تصدير Metadata JSON</span>
        </button>
      </div>

      {/* Default ElevenLabs Voice Configuration */}
      <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              إعدادات صوت ElevenLabs الافتراضي للمكتبة المشتركة
            </h3>
          </div>
          <button
            onClick={handleSaveVoiceConfig}
            className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold"
          >
            حفظ إعدادات الأصوات
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <div>
            <label className="text-slate-500 block mb-1">Model:</label>
            <input
              type="text"
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono"
              dir="ltr"
            />
          </div>
          <div>
            <label className="text-slate-500 block mb-1">صوت المنهج المشترك الافتراضي:</label>
            <select
              value={defaultCourseVoiceId}
              onChange={(e) => setDefaultCourseVoiceId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
            >
              {voices.map((v) => (
                <option key={v.voiceId} value={v.voiceId}>
                  {v.name} ({v.voiceId.slice(0, 8)}...)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-slate-500 block mb-1">الصوت الأنثوي الافتراضي:</label>
            <input
              type="text"
              value={defaultFemaleVoiceId}
              onChange={(e) => setDefaultFemaleVoiceId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono"
              dir="ltr"
            />
          </div>
          <div>
            <label className="text-slate-500 block mb-1">الصوت الذكوري الافتراضي:</label>
            <input
              type="text"
              value={defaultMaleVoiceId}
              onChange={(e) => setDefaultMaleVoiceId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono"
              dir="ltr"
            />
          </div>
        </div>
      </div>

      {/* Browse & Search Audio Library */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث بالكلمة أو الجملة الألمانية أو التجزئة (Hash)..."
              className="w-full pr-9 pl-4 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
          >
            <option value="all">كل الحالات ({files.length})</option>
            <option value="ready">ready</option>
            <option value="generating">generating</option>
            <option value="failed">failed</option>
            <option value="missing">missing</option>
          </select>

          {selectedHashes.size > 0 && (
            <button
              onClick={handleDeleteSelected}
              className="px-3.5 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف المحدد ({selectedHashes.size})</span>
            </button>
          )}
        </div>

        <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
          {files.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              لا توجد ملفات صوتية مسجلة تطابق البحث حالياً.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-80 overflow-y-auto">
              {files.map((item) => {
                const checked = selectedHashes.has(item.audioHash);
                return (
                  <div
                    key={item.audioHash}
                    className="p-3 flex flex-wrap items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-xs"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          const next = new Set(selectedHashes);
                          if (checked) next.delete(item.audioHash);
                          else next.add(item.audioHash);
                          setSelectedHashes(next);
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-german font-bold text-slate-900 dark:text-white truncate" dir="ltr">
                          {item.normalizedText}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                          <span className="font-mono">{item.audioHash.slice(0, 12)}…</span>
                          <span>• {item.voiceGender || 'female'}</span>
                          <span>• {formatBytes(item.fileSize)}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded font-bold ${
                              item.status === 'ready'
                                ? 'bg-emerald-100 text-emerald-700'
                                : item.status === 'generating'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-rose-100 text-rose-700'
                            }`}
                          >
                            {item.status}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {item.status === 'ready' && (
                        <button
                          onClick={() => handlePlayPreview(item.audioHash)}
                          className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100"
                          title="تشغيل من Drive"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteSingleFile(item)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        title="حذف الملف الصوتي"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h4 className="font-bold text-base text-slate-900 dark:text-white">
              {confirmModal.title}
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              {confirmModal.message}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                إلغاء
              </button>
              <button
                onClick={async () => {
                  try {
                    await confirmModal.onConfirm();
                  } catch (err: any) {
                    setActionError(err?.message || 'فشل تنفيذ العملية');
                  } finally {
                    setConfirmModal(null);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold"
              >
                {confirmModal.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
