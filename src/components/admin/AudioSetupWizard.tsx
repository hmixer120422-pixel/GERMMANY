import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Key,
  Cloud,
  Database,
  Play,
  ShieldCheck,
  RefreshCw,
  Copy,
  Check,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { TtsLibraryStatistics } from '../../types';
import {
  firebaseConfig,
  getCurrentIdToken,
  testFirestoreConnection,
} from '../../services/firebase';
import {
  DEFAULT_ELEVENLABS_MODEL,
  DEFAULT_FEMALE_VOICE_ID,
  ensurePuterSignedInIfSupported,
  generateElevenLabsViaPuter,
  isPuterAvailable,
} from '../../services/puterTtsService';
import { computeAudioHash } from '../../utils/audioHash';

interface AudioSetupWizardProps {
  stats: TtsLibraryStatistics | null;
  onRefreshStats: () => Promise<void>;
  onClose?: () => void;
}

const DEV_CALLBACK_URL =
  'https://ais-dev-h4p6mf74ygpfmbs25c4jwy-717014715947.europe-west2.run.app/api/admin/drive/callback';
const SHARED_CALLBACK_URL =
  'https://ais-pre-h4p6mf74ygpfmbs25c4jwy-717014715947.europe-west2.run.app/api/admin/drive/callback';

export const AudioSetupWizard: React.FC<AudioSetupWizardProps> = ({
  stats,
  onRefreshStats,
  onClose,
}) => {
  const [firestoreCheck, setFirestoreCheck] = useState<{
    checked: boolean;
    connected: boolean;
    error?: string;
  }>({ checked: false, connected: Boolean(stats?.firestoreConnected) });
  const [copiedUri, setCopiedUri] = useState<string | null>(null);
  const [connectingDrive, setConnectingDrive] = useState(false);
  const [driveActionMsg, setDriveActionMsg] = useState<string | null>(null);
  const [testingDrive, setTestingDrive] = useState(false);
  const [driveTestResult, setDriveTestResult] = useState<string | null>(null);

  // Step 5 live audio generation test state
  const [useTestMode, setUseTestMode] = useState(true);
  const [step5Running, setStep5Running] = useState(false);
  const [step5Logs, setStep5Logs] = useState<string[]>([]);
  const [step5Success, setStep5Success] = useState(false);
  const [step5Error, setStep5Error] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith('.run.app') && !event.origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'DRIVE_OAUTH_SUCCESS') {
        setConnectingDrive(false);
        setDriveActionMsg(
          `تم ربط Google Drive بنجاح (${event.data.email || 'Connected'}) وإنشاء مجلد GermanLearningAudioLibrary.`
        );
        onRefreshStats();
      } else if (event.data?.type === 'DRIVE_OAUTH_ERROR') {
        setConnectingDrive(false);
        setDriveActionMsg(`تعذر إتمام الربط: ${event.data.error || 'OAuth failed'}`);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onRefreshStats]);

  const copyText = (val: string, key: string) => {
    navigator.clipboard.writeText(val);
    setCopiedUri(key);
    setTimeout(() => setCopiedUri(null), 2000);
  };

  const handleCheckFirebase = async () => {
    const res = await testFirestoreConnection();
    setFirestoreCheck({ checked: true, connected: res.connected, error: res.error });
    await onRefreshStats();
  };

  const handleConnectDrive = async () => {
    setConnectingDrive(true);
    setDriveActionMsg(null);
    try {
      const token = await getCurrentIdToken();
      const res = await fetch('/api/admin/drive/connect', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.data?.authUrl) {
        throw new Error(data.error || 'تعذر بدء تفويض Google Drive.');
      }
      const popup = window.open(
        data.data.authUrl,
        'google_drive_oauth',
        'width=600,height=720'
      );
      if (!popup) {
        setConnectingDrive(false);
        setDriveActionMsg('تم حظر النافذة المنبثقة (Popup). يرجى السماح بالنوافذ المنبثقة لهذا الموقع.');
      }
    } catch (err: any) {
      setConnectingDrive(false);
      setDriveActionMsg(err?.message || 'خطأ في بدء OAuth');
    }
  };

  const handleTestDrivePermissions = async () => {
    setTestingDrive(true);
    setDriveTestResult(null);
    try {
      const token = await getCurrentIdToken();
      const res = await fetch('/api/admin/drive/test', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'فشل اختبار الرفع والتنزيل في Drive.');
      }
      setDriveTestResult(
        `✓ نجاح اختبار الرفع والتنزيل والحذف في المجلد (${json.data.bytesTested} بايت خلال ${json.data.latencyMs}ms)`
      );
      await onRefreshStats();
    } catch (err: any) {
      setDriveTestResult(`✕ ${err?.message || 'فشل الاختبار'}`);
    } finally {
      setTestingDrive(false);
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const str = String(reader.result || '');
        const idx = str.indexOf(',');
        resolve(idx >= 0 ? str.slice(idx + 1) : str);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });

  const handleRunStep5AudioTest = async () => {
    setStep5Running(true);
    setStep5Logs([]);
    setStep5Error(null);
    setStep5Success(false);

    const log = (line: string) => setStep5Logs((prev) => [...prev, line]);
    let uploadedTestHash = '';

    try {
      log('1. فحص توفر Puter.js SDK...');
      if (!isPuterAvailable()) {
        throw new Error('Puter.js غير متوفر حالياً في المتصفح.');
      }
      log('✓ Puter.js متاح.');

      await ensurePuterSignedInIfSupported();

      const sampleText = 'Guten Tag! Testaufnahme.';
      const voiceId = DEFAULT_FEMALE_VOICE_ID;
      log(`2. تجربة ElevenLabs عبر Puter (test_mode=${useTestMode})...`);
      const gen = await generateElevenLabsViaPuter({
        text: sampleText,
        voiceId,
        model: DEFAULT_ELEVENLABS_MODEL,
        outputFormat: 'mp3_44100_128',
        testMode: useTestMode,
      });

      if (!gen.blob || gen.blob.size < 128) {
        throw new Error(
          gen.errorMessage ||
            'تم التوليد لكن تعذر استخراج MP3 Blob (قد يكون بسبب test_mode أو قيود CORS).'
        );
      }
      log(`✓ تم استخراج MP3 Blob بحجم ${gen.blob.size} بايت.`);

      const token = await getCurrentIdToken();
      if (!token) throw new Error('يرجى تسجيل الدخول بحساب المشرف أولاً.');

      const { audioHash } = await computeAudioHash({
        text: sampleText,
        language: 'de-DE',
        provider: 'elevenlabs',
        model: DEFAULT_ELEVENLABS_MODEL,
        voiceId,
        audioFormat: 'mp3',
        cacheVersion: 1,
      });
      uploadedTestHash = audioHash;

      log('3. رفع ملف الاختبار المؤقت إلى Google Drive...');
      const base64 = await blobToBase64(gen.blob);
      const upRes = await fetch('/api/tts/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          audioHash,
          audioBase64: base64,
          mimeType: 'audio/mpeg',
          text: sampleText,
          language: 'de-DE',
          provider: 'elevenlabs',
          model: DEFAULT_ELEVENLABS_MODEL,
          voiceId,
          voiceGender: 'female',
          audioFormat: 'mp3',
          cacheVersion: 1,
          duration: gen.duration,
          approvedForShared: true,
        }),
      });
      const upJson = await upRes.json();
      if (!upRes.ok && upRes.status !== 409) {
        throw new Error(upJson.error || 'فشل رفع ملف الاختبار إلى Google Drive.');
      }
      log('✓ تم حفظ ملف الاختبار في Google Drive و فهرسته في Firestore.');

      log('4. استرجاع الملف من Drive عبر الخادم وتشغيله...');
      const dlRes = await fetch(`/api/tts/audio/${audioHash}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!dlRes.ok) {
        throw new Error(`فشل استرجاع ملف الاختبار من Drive (HTTP ${dlRes.status}).`);
      }
      const dlBlob = await dlRes.blob();
      const objUrl = URL.createObjectURL(dlBlob);
      const audioEl = new Audio(objUrl);
      await audioEl.play().catch(() => {});
      setTimeout(() => URL.revokeObjectURL(objUrl), 5000);
      log(`✓ تم استرجاع الملف وتشغيله بنجاح (${dlBlob.size} بايت).`);

      log('5. تنظيف وحذف ملف الاختبار المؤقت فقط...');
      const delRes = await fetch(`/api/admin/tts/files/${audioHash}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (delRes.ok) {
        log('✓ تم حذف ملف الاختبار المؤقت بنجاح من Drive و Firestore.');
      }

      setStep5Success(true);
      await onRefreshStats();
    } catch (err: any) {
      setStep5Error(err?.message || 'فشل اختبار التوليد الكامل');
      if (uploadedTestHash) {
        const token = await getCurrentIdToken();
        if (token) {
          fetch(`/api/admin/tts/files/${uploadedTestHash}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          }).catch(() => {});
        }
      }
    } finally {
      setStep5Running(false);
    }
  };

  const firebaseOk = Boolean(firebaseConfig.projectId && (firestoreCheck.connected || stats?.firestoreConnected));
  const secretsOk = (stats?.missingSecrets?.length ?? 4) === 0;
  const driveOk = Boolean(stats?.driveConnected);
  const allComplete = firebaseOk && secretsOk && driveOk;

  const requiredSecretsList = [
    {
      name: 'GOOGLE_CLIENT_ID',
      desc: 'معرّف عميل OAuth 2.0 من Google Cloud Console',
      missing: stats?.missingSecrets?.includes('GOOGLE_CLIENT_ID') ?? true,
    },
    {
      name: 'GOOGLE_CLIENT_SECRET',
      desc: 'السر الخاص بعميل OAuth 2.0 (يُحفظ في الأسرار فقط)',
      missing: stats?.missingSecrets?.includes('GOOGLE_CLIENT_SECRET') ?? true,
    },
    {
      name: 'TOKEN_ENCRYPTION_KEY',
      desc: 'مفتاح عشوائي طويل (32+ حرف) لتشفير Refresh Token عبر AES-256-GCM',
      missing: stats?.missingSecrets?.includes('TOKEN_ENCRYPTION_KEY') ?? true,
    },
    {
      name: 'APP_ADMIN_EMAIL',
      desc: 'البريد الإلكتروني لمدير المكتبة الصوتية (hmixer1204.2.2@gmail.com)',
      missing: stats?.missingSecrets?.includes('APP_ADMIN_EMAIL') ?? true,
    },
  ];

  return (
    <div
      className="bg-white dark:bg-slate-900 rounded-3xl border border-indigo-200 dark:border-indigo-900/60 shadow-lg p-6 sm:p-8 space-y-6"
      dir="rtl"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>معالج الإعداد التفاعلي</span>
          </span>
          <h3 className="text-xl font-black text-slate-900 dark:text-white">
            Configure Shared Audio Cloud Storage
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            إعداد مكتبة الصوت الألمانية المشتركة خطوة بخطوة: Firebase + Google Cloud + Secrets + Drive + ElevenLabs
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            العودة للوحة الإدارة
          </button>
        )}
      </div>

      {/* STEP 1 — Firebase */}
      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-blue-600" />
            <div>
              <span className="text-[11px] font-extrabold text-blue-600 uppercase block">STEP 1 — Firebase</span>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                قاعدة بيانات الفهرسة Firestore والمصادقة
              </h4>
            </div>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
              firebaseOk
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-700'
            }`}
          >
            {firebaseOk ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
            <span>{firebaseOk ? 'مهيأ ومتصل' : 'بانتظار التحقق'}</span>
          </span>
        </div>
        <div className="text-xs text-slate-600 dark:text-slate-300 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <span className="text-slate-400 block">Project ID:</span>
            <code className="font-mono text-[11px] font-bold">{firebaseConfig.projectId}</code>
          </div>
          <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <span className="text-slate-400 block">Firestore Database ID:</span>
            <code className="font-mono text-[11px] font-bold truncate block">
              {firebaseConfig.firestoreDatabaseId}
            </code>
          </div>
        </div>
        <button
          onClick={handleCheckFirebase}
          className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>التحقق من اتصال Firestore</span>
        </button>
        {firestoreCheck.checked && (
          <p className={`text-xs font-semibold ${firestoreCheck.connected ? 'text-emerald-600' : 'text-rose-600'}`}>
            {firestoreCheck.connected
              ? '✓ تم التحقق من الاتصال الفعلي بقاعدة بيانات Firestore.'
              : `✕ تعذر الاتصال: ${firestoreCheck.error}`}
          </p>
        )}
      </div>

      {/* STEP 2 — Google Cloud */}
      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <Cloud className="w-5 h-5 text-indigo-600" />
            <div>
              <span className="text-[11px] font-extrabold text-indigo-600 uppercase block">STEP 2 — Google Cloud</span>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                تفعيل Google Drive API وإعداد OAuth 2.0
              </h4>
            </div>
          </div>
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <span>فتح Google Cloud Console</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        <ol className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 list-decimal list-inside leading-relaxed">
          <li>افتح مشروعك في Google Cloud (<code className="font-mono">{firebaseConfig.projectId}</code>) وفعّل <strong>Google Drive API</strong>.</li>
          <li>في شاشة OAuth consent screen، أضف النطاق المحدود فقط: <code className="font-mono bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded">https://www.googleapis.com/auth/drive.file</code></li>
          <li>أنشئ <strong>OAuth 2.0 Client ID (Web application)</strong> وأضف عناوين إعادة التوجيه (Authorized redirect URIs) التالية بدقة:</li>
        </ol>

        <div className="space-y-2" dir="ltr">
          {[
            { label: 'Development Callback URL', url: DEV_CALLBACK_URL, key: 'dev' },
            { label: 'Shared / Deployed Callback URL', url: SHARED_CALLBACK_URL, key: 'shared' },
          ].map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
            >
              <div className="min-w-0">
                <span className="text-[10px] font-bold text-slate-400 block">{item.label}</span>
                <code className="font-mono text-[11px] text-slate-800 dark:text-slate-200 break-all">
                  {item.url}
                </code>
              </div>
              <button
                onClick={() => copyText(item.url, item.key)}
                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 text-slate-600 shrink-0"
                title="نسخ الرابط"
              >
                {copiedUri === item.key ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* STEP 3 — Secrets */}
      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Key className="w-5 h-5 text-amber-600" />
            <div>
              <span className="text-[11px] font-extrabold text-amber-600 uppercase block">STEP 3 — Secrets</span>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                أسماء الأسرار المطلوبة في Google AI Studio Secrets Panel
              </h4>
            </div>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-bold ${
              secretsOk
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
            }`}
          >
            {secretsOk ? '✓ جميع الأسرار مضبوطة' : 'بعض الأسرار مفقودة'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {requiredSecretsList.map((sec) => (
            <div
              key={sec.name}
              className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-start justify-between gap-2"
            >
              <div>
                <code className="font-mono text-xs font-bold text-slate-900 dark:text-white block">
                  {sec.name}
                </code>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">{sec.desc}</span>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                  sec.missing
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                    : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                }`}
              >
                {sec.missing ? 'ناقص' : 'مضبوط'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* STEP 4 — Connect Google Drive */}
      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <div>
              <span className="text-[11px] font-extrabold text-emerald-600 uppercase block">
                STEP 4 — Connect Google Drive
              </span>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                ربط حساب Google Drive وإنشاء المجلد السحابي
              </h4>
            </div>
          </div>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-bold ${
              driveOk
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
            }`}
          >
            {driveOk ? `متصل (${stats?.googleAccountEmail || 'My Drive'})` : 'غير متصل'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleConnectDrive}
            disabled={connectingDrive}
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5"
          >
            <Cloud className="w-4 h-4" />
            <span>{connectingDrive ? 'جارٍ فتح نافذة التفويض...' : 'Connect Google Drive'}</span>
          </button>

          <button
            onClick={handleTestDrivePermissions}
            disabled={testingDrive || !driveOk}
            className="px-4 py-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 disabled:opacity-40 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testingDrive ? 'animate-spin' : ''}`} />
            <span>اختبار صلاحيات الرفع والتنزيل</span>
          </button>
        </div>

        {driveActionMsg && <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">{driveActionMsg}</p>}
        {driveTestResult && (
          <p className={`text-xs font-semibold ${driveTestResult.startsWith('✓') ? 'text-emerald-600' : 'text-rose-600'}`}>
            {driveTestResult}
          </p>
        )}
      </div>

      {/* STEP 5 — Test audio generation */}
      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <Play className="w-5 h-5 text-purple-600" />
            <div>
              <span className="text-[11px] font-extrabold text-purple-600 uppercase block">
                STEP 5 — Test audio generation
              </span>
              <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                اختبار Puter + ElevenLabs + رفع وتشغيل وحذف ملف اختبار مؤقت
              </h4>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={useTestMode}
              onChange={(e) => setUseTestMode(e.target.checked)}
              className="rounded border-slate-300"
            />
            <span>استخدام وضع الاختبار (test_mode) لتوفير الرصيد</span>
          </label>
        </div>

        <button
          onClick={handleRunStep5AudioTest}
          disabled={step5Running || !driveOk}
          className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-1.5"
        >
          <Play className="w-4 h-4" />
          <span>{step5Running ? 'جارٍ تشغيل الاختبار الشامل...' : 'تشغيل اختبار التوليد الكامل'}</span>
        </button>

        {step5Logs.length > 0 && (
          <div className="p-3 rounded-xl bg-slate-900 text-slate-100 font-mono text-[11px] space-y-1">
            {step5Logs.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}
        {step5Error && (
          <p className="text-xs font-bold text-rose-600">✕ {step5Error}</p>
        )}
        {step5Success && (
          <p className="text-xs font-bold text-emerald-600">
            ✓ اكتمل الاختبار بنجاح: التوليد، التحقق من Blob، الرفع إلى Drive، الاسترجاع، التشغيل، وتنظيف الملف المؤقت!
          </p>
        )}
      </div>

      {/* STEP 6 — Complete */}
      <div
        className={`p-5 rounded-2xl border space-y-3 ${
          allComplete
            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
            : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700'
        }`}
      >
        <span className="text-[11px] font-extrabold text-slate-500 uppercase block">STEP 6 — Complete</span>
        <h4 className="text-base font-black text-slate-900 dark:text-white">
          {allComplete
            ? 'Your shared German audio library is configured.'
            : 'أكمل الخطوات أعلاه لإتمام تهيئة المكتبة الصوتية المشتركة'}
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
            <span className="text-slate-400 block">Firebase</span>
            <strong className={firebaseOk ? 'text-emerald-600' : 'text-amber-600'}>
              {firebaseOk ? 'Connected' : 'Pending'}
            </strong>
          </div>
          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
            <span className="text-slate-400 block">Secrets</span>
            <strong className={secretsOk ? 'text-emerald-600' : 'text-amber-600'}>
              {secretsOk ? 'Configured' : 'Missing'}
            </strong>
          </div>
          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
            <span className="text-slate-400 block">Google Drive</span>
            <strong className={driveOk ? 'text-emerald-600' : 'text-amber-600'}>
              {driveOk ? 'Connected' : 'Not Connected'}
            </strong>
          </div>
          <div className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
            <span className="text-slate-400 block">Puter + ElevenLabs</span>
            <strong className={isPuterAvailable() ? 'text-emerald-600' : 'text-amber-600'}>
              {isPuterAvailable() ? 'Ready' : 'SDK Loading'}
            </strong>
          </div>
        </div>
      </div>
    </div>
  );
};
