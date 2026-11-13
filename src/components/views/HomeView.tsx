import React, { useState } from 'react';
import {
  Sparkles,
  Headphones,
  BookOpen,
  Bookmark,
  ArrowLeft,
  Play,
  Layers,
  GraduationCap,
  Clock,
  CheckCircle2,
  TrendingUp,
} from 'lucide-react';
import { GermanTextPassage, CEFRLevel, ListeningStats } from '../../types';

interface HomeViewProps {
  selectedLevel: CEFRLevel;
  onSelectLevel: (lvl: CEFRLevel) => void;
  activePassage: GermanTextPassage | null;
  recentPassages: GermanTextPassage[];
  stats: ListeningStats;
  onNavigate: (view: string) => void;
  onOpenPassageInReader: (passage: GermanTextPassage) => void;
  onQuickGenerate: (topic: string) => void;
  savedWordsCount: number;
}

export const HomeView: React.FC<HomeViewProps> = ({
  selectedLevel,
  onSelectLevel,
  activePassage,
  recentPassages,
  stats,
  onNavigate,
  onOpenPassageInReader,
  onQuickGenerate,
  savedWordsCount,
}) => {
  const [quickTopic, setQuickTopic] = useState('');

  const popularTopics = [
    'Ausbildung in Deutschland',
    'Arbeit und Beruf',
    'Familie und Alltag',
    'Wohnungssuche',
    'Gesundheit und Arztbesuch',
    'Klimawandel und Zukunft',
  ];

  const handleQuickSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTopic.trim()) return;
    onQuickGenerate(quickTopic.trim());
  };

  return (
    <div className="space-y-8 animate-in fade-in" dir="rtl">
      {/* Hero Welcome Banner */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white p-6 sm:p-10 shadow-xl border border-slate-800">
        <div className="absolute top-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>منصة متكاملة لتعلّم اللغة الألمانية بالذكاء الاصطناعي</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-black leading-tight text-white tracking-tight">
            مرحباً بك في <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300 font-german">Deutsch Meister</span>
          </h1>

          <p className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-2xl">
            ولّد نصوصاً ألمانية احترافية متوافقة بدقة مع الإطار الأوروبي (A1 إلى C2)، استمع بنطق نسائي ألماني طبيعي جملة تلو الأخرى، وانقر على أي كلمة لمعرفة إعرابها وترجمتها بالعربية فوراً.
          </p>

          {/* Quick Actions in Hero */}
          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={() => onNavigate('generator')}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-bold shadow-lg shadow-blue-600/30 flex items-center gap-2 transition-all active:scale-95"
            >
              <Sparkles className="w-4 h-4" />
              <span>توليد نص قراءة جديد</span>
            </button>

            {activePassage && (
              <button
                onClick={() => onOpenPassageInReader(activePassage)}
                className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/20 text-xs sm:text-sm font-bold flex items-center gap-2 transition-all active:scale-95"
              >
                <Play className="w-4 h-4 fill-current text-blue-400" />
                <span>متابعة القراءة والاستماع</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Stats Cards */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Headphones className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 block font-medium">وقت الاستماع</span>
            <span className="text-xl font-black text-slate-900 dark:text-white">
              {stats.totalMinutesListened} <span className="text-xs font-normal text-slate-400">دقيقة</span>
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 block font-medium">الجمل المقروءة</span>
            <span className="text-xl font-black text-slate-900 dark:text-white">
              {stats.sentencesRead} <span className="text-xs font-normal text-slate-400">جملة</span>
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Bookmark className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 block font-medium">مفرداتي المحفوظة</span>
            <span className="text-xl font-black text-slate-900 dark:text-white">
              {savedWordsCount} <span className="text-xs font-normal text-slate-400">كلمة</span>
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs text-slate-400 block font-medium">المستوى النشط</span>
            <span className="text-xl font-black text-slate-900 dark:text-white">
              CEFR {selectedLevel}
            </span>
          </div>
        </div>
      </section>

      {/* Quick Generator Box & Continue Reading Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Generator Box (2 Columns) */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 sm:p-7 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">مولّد النصوص السريع</h2>
                <p className="text-xs text-slate-400">أدخل أي موضوع بالعربية أو الألمانية أو الإنجليزية وسينشئ الذكاء نصاً كاملاً</p>
              </div>
            </div>
            <span className="px-2.5 py-1 text-xs font-extrabold rounded-lg bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
              المستوى: {selectedLevel}
            </span>
          </div>

          <form onSubmit={handleQuickSubmit} className="space-y-3">
            <div className="relative">
              <input
                type="text"
                value={quickTopic}
                onChange={(e) => setQuickTopic(e.target.value)}
                placeholder="اكتب موضوعاً (مثال: العمل في ألمانيا، التدريب المهني، رمضان، العائلة...)"
                className="w-full pl-28 pr-4 py-3.5 text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
              <button
                type="submit"
                disabled={!quickTopic.trim()}
                className="absolute left-2 top-2 bottom-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <span>توليد</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Popular Topic Badges */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              <span className="text-xs text-slate-400 font-medium ml-1">مواضيع مقترحة:</span>
              {popularTopics.map((top) => (
                <button
                  key={top}
                  type="button"
                  onClick={() => {
                    setQuickTopic(top);
                    onQuickGenerate(top);
                  }}
                  className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-blue-50 hover:text-blue-700 dark:hover:bg-slate-700 transition-colors"
                >
                  {top}
                </button>
              ))}
            </div>
          </form>
        </div>

        {/* Continue Reading Card (1 Column) */}
        <div className="bg-gradient-to-br from-indigo-50/70 to-blue-50/40 dark:from-slate-900 dark:to-slate-800/80 p-6 rounded-3xl border border-indigo-100 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-extrabold uppercase text-indigo-600 dark:text-indigo-400 tracking-wider flex items-center gap-1">
                <Headphones className="w-3.5 h-3.5" />
                آخر نص نشط
              </span>
              {activePassage && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  {activePassage.level}
                </span>
              )}
            </div>

            {activePassage ? (
              <div className="space-y-2">
                <h3 className="font-bold text-slate-900 dark:text-white text-base line-clamp-1">
                  {activePassage.title}
                </h3>
                <p className="font-german text-xs text-slate-500 dark:text-slate-400 line-clamp-1" dir="ltr">
                  {activePassage.authorInfo}
                </p>
                <p className="font-german text-sm text-slate-700 dark:text-slate-300 line-clamp-3 leading-relaxed mt-2" dir="ltr">
                  {activePassage.germanText}
                </p>
              </div>
            ) : (
              <div className="py-6 text-center text-slate-400 text-xs">
                لا يوجد نص نشط حالياً. اختر موضوعاً للبدء!
              </div>
            )}
          </div>

          <div className="pt-4 mt-4 border-t border-indigo-100 dark:border-slate-800">
            {activePassage ? (
              <button
                onClick={() => onOpenPassageInReader(activePassage)}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>افتح واستمع للنص الآن</span>
              </button>
            ) : (
              <button
                onClick={() => onNavigate('generator')}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                <Sparkles className="w-4 h-4" />
                <span>إنشاء نص تعليمي أول</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Recently Generated / Saved Texts */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">نصوص القراءة المتوفرة</h2>
          </div>
          <button
            onClick={() => onNavigate('history')}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <span>عرض كل النصوص ({recentPassages.length})</span>
            <ArrowLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {recentPassages.slice(0, 3).map((passage) => (
            <div
              key={passage.id}
              onClick={() => onOpenPassageInReader(passage)}
              className="group bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 text-xs font-extrabold rounded-md bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                    {passage.level}
                  </span>
                  <span className="text-[11px] text-slate-400 font-medium">
                    {passage.wordCount} كلمة • {passage.sentences.length} جمل
                  </span>
                </div>

                <h3 className="font-bold text-slate-900 dark:text-white text-base group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
                  {passage.title}
                </h3>

                <p className="font-german text-xs text-slate-400 line-clamp-1" dir="ltr">
                  {passage.authorInfo}
                </p>

                <p className="font-german text-xs text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed" dir="ltr">
                  {passage.germanText}
                </p>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">{passage.style}</span>
                <span className="font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 group-hover:translate-x-[-3px] transition-transform">
                  استماع وقراءة
                  <ArrowLeft className="w-3.5 h-3.5" />
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
