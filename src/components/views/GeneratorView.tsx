import React, { useState } from 'react';
import {
  Sparkles,
  Layers,
  Sliders,
  Copy,
  Check,
  RotateCcw,
  Headphones,
  Bookmark,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  ChevronDown,
  Info,
  CheckCircle2,
  FileText,
  Volume2,
} from 'lucide-react';
import { GermanTextPassage, CEFRLevel, TextStyle } from '../../types';
import { addTextPassage } from '../../services/storage';
import { audioEngine } from '../../services/audioEngine';

interface GeneratorViewProps {
  selectedLevel: CEFRLevel;
  onSelectLevel: (lvl: CEFRLevel) => void;
  onSendToReader: (passage: GermanTextPassage) => void;
  initialTopic?: string;
  isAdmin?: boolean;
}

export const GeneratorView: React.FC<GeneratorViewProps> = ({
  selectedLevel,
  onSelectLevel,
  onSendToReader,
  initialTopic = '',
  isAdmin = false,
}) => {
  const [topic, setTopic] = useState(initialTopic || 'Ausbildung in Deutschland');
  const [style, setStyle] = useState<TextStyle>('Educational Passage');
  const [formality, setFormality] = useState<'everyday' | 'professional' | 'formal'>('everyday');
  const [customNote, setCustomNote] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Active view tab: 'single' (generate one text) vs 'compare' (generate all 6 levels A1-C2)
  const [activeTab, setActiveTab] = useState<'single' | 'compare'>('single');

  // State for single generation
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedPassage, setGeneratedPassage] = useState<GermanTextPassage | null>(null);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  // State for level comparison
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [compareData, setCompareData] = useState<{
    topic: string;
    levels: {
      level: CEFRLevel;
      authorInfo: string;
      germanText: string;
      wordCount: number;
      arabicSummary: string;
      grammarFocus: string;
      sentences: string[];
    }[];
  } | null>(null);
  const [selectedCompareLevel, setSelectedCompareLevel] = useState<CEFRLevel>('A2');

  const levels: { level: CEFRLevel; label: string; desc: string; words: string }[] = [
    { level: 'A1', label: 'مبتدئ (Beginner)', desc: 'مفردات وجمل بسيطة جداً، الحاضر وأدوات التعريف الأساسية', words: '50–70 كلمة' },
    { level: 'A2', label: 'أساسي (Elementary)', desc: 'جمل متصلة، أفعال مساعدة ومنفصلة، زمن الماضي التام، روابط بسيطة', words: '70–100 كلمة' },
    { level: 'B1', label: 'متوسط (Intermediate)', desc: 'تجارب وآراء شخصية، جمل ثانوية weil/obwohl، جمل موصولة', words: '100–140 كلمة' },
    { level: 'B2', label: 'فوق متوسط (Upper)', desc: 'مفردات ثرية، المبني للمجهول، Konjunktiv II، حجج ونقاشات متقدمة', words: '140–180 كلمة' },
    { level: 'C1', label: 'متقدم (Advanced)', desc: 'تراكيب بلاغية وأكاديمية معقدة، روابط لغوية متقدمة وتعبيرات اصطلاحية', words: '180–220 كلمة' },
    { level: 'C2', label: 'إتقان تام (Proficient)', desc: 'فصاحة تامة تقارب الناطق الأصلي، بلاغة أدبية وأسلوبية رفيعة', words: '220–280 كلمة' },
  ];

  const textStyles: { id: TextStyle; label: string; desc: string }[] = [
    { id: 'Educational Passage', label: 'نص كتاب تعليمي (Lehrtext)', desc: 'تمرين قراءة نموذجي مثل كتب المناهج الألمانية الرسمية' },
    { id: 'Personal Story', label: 'قصة شخصية (Persönliche Geschichte)', desc: 'سرد ذاتي لشخصية ألمانية باسم وعمر ومدينة' },
    { id: 'Daily Life', label: 'الحياة اليومية (Alltag)', desc: 'مواقف ومحادثات وممارسات معيشية في ألمانيا' },
    { id: 'Dialogue', label: 'حوار (Dialog)', desc: 'محادثة طبيعية بين شخصين أو أكثر' },
    { id: 'Interview', label: 'مقابلة (Interview)', desc: 'أسئلة وأجوبة استطلاعية مع خبير أو مواطن' },
    { id: 'Newspaper Article', label: 'مقال صحفي (Zeitungsartikel)', desc: 'أسلوب إخباري توثيقي شيق' },
    { id: 'Opinion', label: 'رأي وتعليق (Meinung)', desc: 'وجهة نظر معللة مع أمثلة واقعية' },
    { id: 'Discussion', label: 'نقاش وتبادل آراء (Diskussion)', desc: 'حجج مؤيدة ومعارضة لموضوع معين' },
    { id: 'Short Story', label: 'قصة قصيرة (Kurzgeschichte)', desc: 'حبكة سردية مشوقة ومفردات وصفية' },
    { id: 'Informative Text', label: 'نص معلوماتي (Informationstext)', desc: 'حقائق وشروحات واضحة ومنظمة' },
    { id: 'Experience Report', label: 'تقرير تجربة (Erfahrungsbericht)', desc: 'تجربة واقعية في الدراسة أو العمل أو الاندماج' },
    { id: 'Professional Conversation', label: 'حديث عمل مهني (Berufsgespräch)', desc: 'محادثة في بيئة العمل والشركات' },
    { id: 'Email', label: 'بريد إلكتروني (E-Mail)', desc: 'رسالة إلكترونية بمقدمة وخاتمة ألمانية صحيحة' },
    { id: 'Formal Letter', label: 'خطاب رسمي (Formeller Brief)', desc: 'مراسلة رسمية للدوائر أو أرباب العمل' },
    { id: 'Blog Post', label: 'تدوينة (Blogbeitrag)', desc: 'مقال مدونة عصري وقريب من القارئ' },
  ];

  const popularTopics = [
    'Ausbildung in Deutschland',
    'Arbeit und Beruf',
    'Familie und Alltag',
    'Ramadan in Deutschland',
    'Gesundheit und Arzt',
    'Reisen und Verkehr',
    'Wohnungssuche',
    'Klimawandel',
    'Künstliche Intelligenz',
    'Integration und Sprache',
    'Pflegefachmann / Pflege',
    'Freizeit und Hobbys',
  ];

  // -------------------------------------------------------------
  // Generate Single Text
  // -------------------------------------------------------------
  const handleGenerate = async (levelToUse: CEFRLevel = selectedLevel) => {
    if (!topic.trim()) return;

    setGenerating(true);
    setError(null);
    setCopied(false);
    setSaved(false);

    try {
      const res = await fetch('/api/ai/generate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          level: levelToUse,
          style,
          formality,
          customNote,
        }),
      });

      const rawText = await res.text();
      let resData: any;
      try {
        resData = JSON.parse(rawText);
      } catch {
        throw new Error('استجابة غير صالحة من خادم التوليد، يرجى المحاولة بعد قليل.');
      }

      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'فشل في توليد النص الألماني');
      }

      const passage: GermanTextPassage = {
        id: 'gen-' + Date.now(),
        ...resData.data,
        approvedForShared: Boolean(isAdmin),
      };

      setGeneratedPassage(passage);
      addTextPassage(passage);
      setSaved(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'حدث خطأ غير متوقع أثناء توليد النص');
    } finally {
      setGenerating(false);
    }
  };

  // -------------------------------------------------------------
  // Compare All 6 Levels
  // -------------------------------------------------------------
  const handleCompare = async () => {
    if (!topic.trim()) return;

    setComparing(true);
    setCompareError(null);

    try {
      const res = await fetch('/api/ai/compare-levels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          style,
        }),
      });

      const rawText = await res.text();
      let resData: any;
      try {
        resData = JSON.parse(rawText);
      } catch {
        throw new Error('استجابة غير صالحة من الخادم أثناء مقارنة المستويات');
      }

      if (!res.ok || !resData.success) {
        throw new Error(resData.error || 'فشل في مقارنة المستويات');
      }

      setCompareData(resData.data);
    } catch (err: any) {
      console.error(err);
      setCompareError(err.message || 'تعذر توليد مقارنة المستويات');
    } finally {
      setComparing(false);
    }
  };

  const handleCopy = () => {
    if (!generatedPassage) return;
    const fullContent = `${generatedPassage.title}\n${generatedPassage.authorInfo}\n\n${generatedPassage.germanText}`;
    navigator.clipboard.writeText(fullContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendActiveToReader = () => {
    if (generatedPassage) {
      onSendToReader(generatedPassage);
    }
  };

  const handleSendCompareLevelToReader = (lvlItem: any) => {
    const passage: GermanTextPassage = {
      id: 'compare-' + lvlItem.level + '-' + Date.now(),
      title: `${topic} (${lvlItem.level})`,
      authorInfo: lvlItem.authorInfo,
      level: lvlItem.level,
      germanText: lvlItem.germanText,
      sentences: lvlItem.sentences || [],
      arabicSummary: lvlItem.arabicSummary,
      keyVocabulary: [],
      wordCount: lvlItem.wordCount,
      style,
      topic,
      createdAt: new Date().toISOString(),
      approvedForShared: Boolean(isAdmin),
    };
    addTextPassage(passage);
    onSendToReader(passage);
  };

  return (
    <div className="space-y-8 animate-in fade-in" dir="rtl">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-bold mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>KI-TEXTGENERATOR</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white tracking-tight">
            مولّد نصوص القراءة الألمانية الذكي
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            أدخل أي موضوع وخصّص المستوى والأسلوب للحصول على نصوص تعليمية أصلية تماثل كتب المناهج الألمانية.
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('single')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'single'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            توليد نص فردي
          </button>
          <button
            onClick={() => {
              setActiveTab('compare');
              if (!compareData && !comparing) {
                handleCompare();
              }
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'compare'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>مقارنة كل المستويات (A1–C2)</span>
          </button>
        </div>
      </div>

      {/* SINGLE GENERATION TAB */}
      {activeTab === 'single' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left / Input Configuration (5 cols) */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-6">
            {/* Topic Input */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center justify-between">
                <span>الموضوع المطلوب (بالعربية، الألمانية، الإنجليزية أو الفرنسية):</span>
                <span className="text-blue-600 font-normal text-[11px]">مطلوب</span>
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="مثال: Ausbildung in Deutschland أو التدريب المهني..."
                className="w-full px-4 py-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium"
              />

              {/* Popular quick topics chips */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {popularTopics.map((top) => (
                  <button
                    key={top}
                    type="button"
                    onClick={() => setTopic(top)}
                    className="px-2.5 py-1 text-[11px] rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 dark:bg-slate-800 dark:hover:bg-slate-750 text-slate-600 dark:text-slate-300 transition-colors"
                  >
                    {top}
                  </button>
                ))}
              </div>
            </div>

            {/* CEFR Level Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block">
                اختر المستوى التعليمي (CEFR):
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                {levels.map((lvl) => (
                  <button
                    key={lvl.level}
                    type="button"
                    onClick={() => onSelectLevel(lvl.level)}
                    className={`p-2 rounded-xl text-center border transition-all ${
                      selectedLevel === lvl.level
                        ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-blue-400'
                    }`}
                  >
                    <span className="block font-black text-sm">{lvl.level}</span>
                    <span className="text-[10px] opacity-80 block">{lvl.words}</span>
                  </button>
                ))}
              </div>
              <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-slate-800/60 border border-blue-100 dark:border-slate-750 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                <span className="font-bold text-blue-700 dark:text-blue-300 block">
                  مواصفات المستوى {selectedLevel}:
                </span>
                <p>{levels.find((l) => l.level === selectedLevel)?.desc}</p>
              </div>
            </div>

            {/* Text Style Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block">
                أسلوب النص (15 أسلوباً متاحاً):
              </label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value as TextStyle)}
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {textStyles.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Advanced Settings Toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1.5"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>إعدادات إضافية اختيارية</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              </button>

              {showAdvanced && (
                <div className="mt-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-3 animate-in fade-in">
                  <div>
                    <label className="text-xs text-slate-600 dark:text-slate-300 block mb-1">درجة الرسمية:</label>
                    <div className="grid grid-cols-3 gap-1.5 text-xs">
                      {[
                        { id: 'everyday', label: 'يومي دارج' },
                        { id: 'professional', label: 'مهني وعملي' },
                        { id: 'formal', label: 'رسمي وأكاديمي' },
                      ].map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setFormality(f.id as any)}
                          className={`py-1.5 px-2 rounded-lg border text-center transition-colors ${
                            formality === f.id
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs text-slate-600 dark:text-slate-300 block mb-1">
                      ملاحظة خاصة للذكاء الاصطناعي (اختياري):
                    </label>
                    <input
                      type="text"
                      value={customNote}
                      onChange={(e) => setCustomNote(e.target.value)}
                      placeholder="مثال: ركز على أفعال الحركة أو استخدام روابط معينة..."
                      className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Main Generate Button */}
            <button
              type="button"
              onClick={() => handleGenerate(selectedLevel)}
              disabled={generating || !topic.trim()}
              className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 text-white font-bold text-sm shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              {generating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>جارٍ إنشاء النص الألماني والتراكيب النحوية...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>توليد النص الألماني لمستوى {selectedLevel}</span>
                </>
              )}
            </button>
          </div>

          {/* Right / Generated Passage Display (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {error && (
              <div className="p-4 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 rounded-2xl border border-rose-200 dark:border-rose-900/60 text-sm">
                <span className="font-bold block mb-1">تعذر توليد النص:</span>
                {error}
                <button
                  onClick={() => handleGenerate(selectedLevel)}
                  className="mt-2 text-xs underline font-bold"
                >
                  إعادة المحاولة
                </button>
              </div>
            )}

            {generating && !generatedPassage && (
              <div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border border-slate-200/80 dark:border-slate-800 text-center space-y-4 shadow-xs">
                <div className="w-12 h-12 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-200 text-base">
                    جارٍ تأليف نص ألماني أصلي...
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    يتم ضبط المفردات والقواعد لتتوافق بدقة مع معايير معهد غوته والإطار الأوروبي لمستوى {selectedLevel}.
                  </p>
                </div>
              </div>
            )}

            {!generating && !generatedPassage && (
              <div className="bg-slate-50 dark:bg-slate-900/60 p-12 rounded-3xl border-2 border-dashed border-slate-200 dark:border-slate-800 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-500 mx-auto flex items-center justify-center">
                  <FileText className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-700 dark:text-slate-300 text-base">
                  النص المُولَّد سيظهر هنا
                </h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                  أدخل موضوعك واضغط على زر التوليد. ستتمكن فوراً من الاستماع له جملة بجملة بصوت نسائي، والنقر على أي كلمة لترجمتها وحفظها.
                </p>
              </div>
            )}

            {generatedPassage && (
              <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden animate-in fade-in space-y-0">
                {/* Header card with fictional author and level */}
                <div className="p-5 sm:p-6 bg-gradient-to-r from-blue-50 via-slate-50 to-indigo-50 dark:from-slate-800/80 dark:via-slate-800/50 dark:to-slate-800/80 border-b border-slate-200/70 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 text-xs font-black rounded-md bg-blue-600 text-white">
                        CEFR {generatedPassage.level}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {generatedPassage.wordCount} كلمة • {generatedPassage.sentences.length} جمل
                      </span>
                    </div>
                    <h2 className="font-german text-xl font-bold text-slate-900 dark:text-white mt-1" dir="ltr">
                      {generatedPassage.title}
                    </h2>
                    <p className="font-german text-xs text-blue-700 dark:text-blue-400 font-semibold mt-0.5" dir="ltr">
                      {generatedPassage.authorInfo}
                    </p>
                  </div>

                  {/* Top quick actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopy}
                      className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium flex items-center gap-1 transition-colors"
                      title="نسخ النص كاملاً"
                    >
                      {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      <span className="hidden sm:inline">{copied ? 'تم النسخ' : 'نسخ'}</span>
                    </button>

                    <button
                      onClick={handleSendActiveToReader}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all"
                    >
                      <Headphones className="w-4 h-4" />
                      <span>قراءة واستماع</span>
                    </button>
                  </div>
                </div>

                {/* German Reading Body */}
                <div className="p-6 sm:p-8 space-y-6">
                  {/* German textbook formatted passage */}
                  <div className="bg-slate-50 dark:bg-slate-800/40 p-6 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          audioEngine.loadSentences(
                            generatedPassage.sentences?.length
                              ? generatedPassage.sentences
                              : [generatedPassage.germanText],
                            0,
                            Boolean(generatedPassage.approvedForShared)
                          );
                          audioEngine.play(0);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs"
                        title="استماع للنص المُولّد الآن"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>استمع للنص</span>
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            const updated = {
                              ...generatedPassage,
                              approvedForShared: !generatedPassage.approvedForShared,
                            };
                            setGeneratedPassage(updated);
                            addTextPassage(updated);
                          }}
                          className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700"
                        >
                          {generatedPassage.approvedForShared
                            ? '✓ معتمد للمكتبة المشتركة'
                            : 'اعتماد للمكتبة المشتركة'}
                        </button>
                      )}
                    </div>
                    <p
                      className="font-german text-lg sm:text-xl text-slate-900 dark:text-slate-100 font-medium leading-relaxed sm:leading-loose tracking-wide"
                      dir="ltr"
                    >
                      {generatedPassage.germanText}
                    </p>
                  </div>

                  {/* Arabic Summary / Translation Preview */}
                  {generatedPassage.arabicSummary && (
                    <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-slate-800/40 border border-indigo-100/60 dark:border-slate-700">
                      <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400 block mb-1.5 flex items-center gap-1">
                        <BookOpen className="w-3.5 h-3.5" />
                        الترجمة الشاملة للنص بالعربية:
                      </span>
                      <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed font-arabic">
                        {generatedPassage.arabicSummary}
                      </p>
                    </div>
                  )}

                  {/* Key Vocabulary Table */}
                  {generatedPassage.keyVocabulary && generatedPassage.keyVocabulary.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block">
                        أهم مفردات النص:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {generatedPassage.keyVocabulary.map((kv, idx) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-750 flex items-center justify-between gap-2 text-xs"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <button
                                type="button"
                                onClick={() => audioEngine.playWordOnly(kv.german)}
                                className="p-1 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 text-blue-600 shrink-0"
                                title="استمع لنطق الكلمة"
                              >
                                <Volume2 className="w-3.5 h-3.5" />
                              </button>
                              <span className="font-german font-bold text-slate-900 dark:text-white truncate" dir="ltr">
                                {kv.article ? `${kv.article} ` : ''}
                                {kv.german}
                              </span>
                            </div>
                            <span className="text-slate-600 dark:text-slate-300 font-medium shrink-0">
                              {kv.arabic}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bottom Action Ribbon */}
                  <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleGenerate(selectedLevel)}
                        disabled={generating}
                        className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
                        title="توليد نص بديل جديد لنفس الموضوع"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>توليد نص آخر لنفس الموضوع</span>
                      </button>

                      {/* Quick Level switch for the same topic */}
                      <div className="hidden sm:flex items-center gap-1 text-xs">
                        <span className="text-slate-400 text-[11px] ml-1">توليد بمستوى:</span>
                        {(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as CEFRLevel[])
                          .filter((l) => l !== selectedLevel)
                          .slice(0, 3)
                          .map((l) => (
                            <button
                              key={l}
                              onClick={() => {
                                onSelectLevel(l);
                                handleGenerate(l);
                              }}
                              className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-blue-600 text-xs font-bold"
                            >
                              {l}
                            </button>
                          ))}
                      </div>
                    </div>

                    <button
                      onClick={handleSendActiveToReader}
                      className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-600/20 flex items-center gap-2 transition-all active:scale-95"
                    >
                      <Headphones className="w-4 h-4" />
                      <span>قراءة واستماع الآن (جملة بجملة)</span>
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* COMPARE LEVELS TAB */}
      {activeTab === 'compare' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-600" />
                  مقارنة نفس الموضوع عبر المستويات الستة (A1 إلى C2)
                </h2>
                <p className="text-xs text-slate-400">
                  شاهد كيف تتطور التراكيب النحوية، طول الجمل، والمفردات من المستوى البسيط A1 حتى الإتقان الكامل C2.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="الموضوع للمقارنة..."
                  className="px-3.5 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white w-48 sm:w-64"
                />
                <button
                  onClick={handleCompare}
                  disabled={comparing || !topic.trim()}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  {comparing ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>توليد المقارنة</span>
                </button>
              </div>
            </div>

            {compareError && (
              <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-xs">{compareError}</div>
            )}
          </div>

          {comparing && (
            <div className="py-16 text-center space-y-3 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800">
              <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                جارٍ صياغة 6 نصوص متدرجة لغوياً بدقة لموضوع: &quot;{topic}&quot;...
              </p>
              <p className="text-xs text-slate-400">قد يستغرق ذلك بضع ثوانٍ لكتابة جميع المستويات</p>
            </div>
          )}

          {compareData && !comparing && (
            <div className="space-y-6">
              {/* Level Tab Switcher */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2">
                {compareData.levels.map((lvl) => (
                  <button
                    key={lvl.level}
                    onClick={() => setSelectedCompareLevel(lvl.level)}
                    className={`px-4 py-2.5 rounded-2xl text-xs font-bold transition-all shrink-0 flex items-center gap-2 ${
                      selectedCompareLevel === lvl.level
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-50'
                    }`}
                  >
                    <span className="text-sm">{lvl.level}</span>
                    <span className="text-[11px] opacity-80">({lvl.wordCount} كلمة)</span>
                  </button>
                ))}
              </div>

              {/* Display Selected Level Passage */}
              {(() => {
                const current = compareData.levels.find((l) => l.level === selectedCompareLevel) || compareData.levels[0];
                return (
                  <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 p-6 sm:p-8 space-y-6 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 rounded-lg bg-indigo-600 text-white font-black text-xs">
                            CEFR {current.level}
                          </span>
                          <span className="text-xs text-slate-400">
                            {current.wordCount} كلمة • {current.sentences.length} جملة
                          </span>
                        </div>
                        <p className="font-german text-sm font-semibold text-indigo-700 dark:text-indigo-400 mt-2" dir="ltr">
                          {current.authorInfo}
                        </p>
                      </div>

                      <button
                        onClick={() => handleSendCompareLevelToReader(current)}
                        className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center gap-2 transition-all"
                      >
                        <Headphones className="w-4 h-4" />
                        <span>فتح هذا المستوى في مشغل القراءة</span>
                      </button>
                    </div>

                    {/* German Reading Box */}
                    <div className="p-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200/60 dark:border-slate-700 space-y-3">
                      <button
                        type="button"
                        onClick={() => {
                          audioEngine.loadSentences(
                            current.sentences?.length ? current.sentences : [current.germanText],
                            0,
                            Boolean(isAdmin)
                          );
                          audioEngine.play(0);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>استمع لمستوى {current.level}</span>
                      </button>
                      <p className="font-german text-lg sm:text-xl text-slate-900 dark:text-slate-100 font-medium leading-relaxed sm:leading-loose" dir="ltr">
                        {current.germanText}
                      </p>
                    </div>

                    {/* Grammar focus breakdown */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl bg-amber-50/60 dark:bg-slate-800/60 border border-amber-100 dark:border-slate-700">
                        <span className="text-xs font-bold text-amber-800 dark:text-amber-400 block mb-1">
                          التركيز النحوي والقواعدي في هذا المستوى:
                        </span>
                        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                          {current.grammarFocus}
                        </p>
                      </div>

                      <div className="p-4 rounded-xl bg-blue-50/60 dark:bg-slate-800/60 border border-blue-100 dark:border-slate-700">
                        <span className="text-xs font-bold text-blue-800 dark:text-blue-400 block mb-1">
                          الترجمة العربية للمستوى {current.level}:
                        </span>
                        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                          {current.arabicSummary}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
