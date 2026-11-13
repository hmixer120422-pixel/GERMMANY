import React, { useState, useEffect } from 'react';
import type { User } from 'firebase/auth';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { AudioPlayerBar } from './components/player/AudioPlayerBar';
import { HomeView } from './components/views/HomeView';
import { GeneratorView } from './components/views/GeneratorView';
import { ReaderView } from './components/views/ReaderView';
import { DictionaryView } from './components/views/DictionaryView';
import { VocabularyView } from './components/views/VocabularyView';
import { HistoryView } from './components/views/HistoryView';
import { SettingsView } from './components/views/SettingsView';
import {
  GermanTextPassage,
  CEFRLevel,
  ReadingSettings,
  SavedWord,
  ListeningStats,
} from './types';
import {
  getStoredTexts,
  getActiveTextId,
  setActiveTextId,
  getStoredSavedWords,
  getStoredSettings,
  saveStoredSettings,
  getStoredStats,
  DEFAULT_SETTINGS,
  addTextPassage,
} from './services/storage';
import { audioEngine } from './services/audioEngine';
import { checkIsAdminUser, onAuthChange } from './services/firebase';

export default function App() {
  const [currentView, setCurrentView] = useState<string>('home');
  const [settings, setSettings] = useState<ReadingSettings>(getStoredSettings());
  const [selectedLevel, setSelectedLevel] = useState<CEFRLevel>(settings.defaultLevel || 'A2');
  const [passages, setPassages] = useState<GermanTextPassage[]>([]);
  const [activePassage, setActivePassage] = useState<GermanTextPassage | null>(null);
  const [savedWords, setSavedWords] = useState<SavedWord[]>([]);
  const [stats] = useState<ListeningStats>(getStoredStats());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [generatorInitialTopic, setGeneratorInitialTopic] = useState<string>('');
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number>(0);

  // Firebase Auth & Admin Role state
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // Initialize data on mount
  useEffect(() => {
    const storedTexts = getStoredTexts();
    setPassages(storedTexts);

    const activeId = getActiveTextId();
    const active = storedTexts.find((t) => t.id === activeId) || storedTexts[0] || null;
    setActivePassage(active);

    const words = getStoredSavedWords();
    setSavedWords(words);

    const initialSettings = getStoredSettings();
    setSettings(initialSettings);
    setSelectedLevel(initialSettings.defaultLevel || 'A2');
    audioEngine.updateSettings(initialSettings);

    if (initialSettings.theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Sync default shared voice configuration if not customized away from defaults
    fetch('/api/tts/voices')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.success && json?.data) {
          const current = getStoredSettings();
          if (!localStorage.getItem('deutsch_meister_settings_v1')) {
            const synced: ReadingSettings = {
              ...current,
              elevenLabsVoiceId: json.data.defaultCourseVoiceId || current.elevenLabsVoiceId,
              elevenLabsModel: json.data.model || current.elevenLabsModel,
            };
            setSettings(synced);
            audioEngine.updateSettings(synced);
          }
        }
      })
      .catch(() => {});

    const unsubSentence = audioEngine.onSentenceChange((idx) => {
      setActiveSentenceIndex(idx);
    });

    const unsubAuth = onAuthChange(async (user) => {
      setFirebaseUser(user);
      if (user) {
        const adminFlag = await checkIsAdminUser(user);
        setIsAdmin(adminFlag);
      } else {
        setIsAdmin(false);
      }
    });

    return () => {
      unsubSentence();
      unsubAuth();
    };
  }, []);

  const handleUpdateSettings = (newSettings: Partial<ReadingSettings>) => {
    const updated = { ...settings, ...newSettings };
    setSettings(updated);
    saveStoredSettings(updated);
    audioEngine.updateSettings(updated);
  };

  const handleResetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    saveStoredSettings(DEFAULT_SETTINGS);
    audioEngine.updateSettings(DEFAULT_SETTINGS);
  };

  const handleToggleTheme = () => {
    const nextTheme = settings.theme === 'dark' ? 'light' : 'dark';
    handleUpdateSettings({ theme: nextTheme });
  };

  const handleSelectLevel = (lvl: CEFRLevel) => {
    setSelectedLevel(lvl);
    handleUpdateSettings({ defaultLevel: lvl });
  };

  const handleSelectPassage = (passage: GermanTextPassage) => {
    setActivePassage(passage);
    setActiveTextId(passage.id);
    setCurrentView('reader');
  };

  const handleUpdatePassage = (updatedPassage: GermanTextPassage) => {
    addTextPassage(updatedPassage);
    setPassages(getStoredTexts());
    if (activePassage?.id === updatedPassage.id) {
      setActivePassage(updatedPassage);
    }
  };

  const handleQuickGenerateFromHome = (topic: string) => {
    setGeneratorInitialTopic(topic);
    setCurrentView('generator');
  };

  const refreshWords = () => {
    setSavedWords(getStoredSavedWords());
  };

  const refreshPassages = () => {
    const updated = getStoredTexts();
    setPassages(updated);
    if (activePassage && !updated.find((p) => p.id === activePassage.id)) {
      setActivePassage(updated[0] || null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-arabic transition-colors" dir="rtl">
      {/* Top Navbar */}
      <Navbar
        currentView={currentView}
        onNavigate={(v) => setCurrentView(v)}
        selectedLevel={selectedLevel}
        onSelectLevel={handleSelectLevel}
        isDark={settings.theme === 'dark'}
        onToggleTheme={handleToggleTheme}
        onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        isMobileMenuOpen={isMobileMenuOpen}
      />

      <div className="flex-1 max-w-7xl w-full mx-auto flex">
        {/* Right Sidebar (in RTL, it is on the right) */}
        <Sidebar
          currentView={currentView}
          onNavigate={(v) => setCurrentView(v)}
          selectedLevel={selectedLevel}
          settings={settings}
          stats={stats}
          isMobileOpen={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
        />

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0 pb-36">
          {currentView === 'home' && (
            <HomeView
              selectedLevel={selectedLevel}
              onSelectLevel={handleSelectLevel}
              activePassage={activePassage}
              recentPassages={passages}
              stats={stats}
              onNavigate={(v) => setCurrentView(v)}
              onOpenPassageInReader={handleSelectPassage}
              onQuickGenerate={handleQuickGenerateFromHome}
              savedWordsCount={savedWords.length}
            />
          )}

          {currentView === 'generator' && (
            <GeneratorView
              selectedLevel={selectedLevel}
              onSelectLevel={handleSelectLevel}
              onSendToReader={handleSelectPassage}
              initialTopic={generatorInitialTopic}
              isAdmin={isAdmin}
            />
          )}

          {currentView === 'reader' && (
            <ReaderView
              passage={activePassage}
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              onSelectPassage={handleSelectPassage}
              onNavigateToGenerator={() => setCurrentView('generator')}
              isAdmin={isAdmin}
              onUpdatePassage={handleUpdatePassage}
            />
          )}

          {currentView === 'dictionary' && (
            <DictionaryView
              selectedLevel={selectedLevel}
              onRefreshWords={refreshWords}
            />
          )}

          {currentView === 'vocabulary' && (
            <VocabularyView
              savedWords={savedWords}
              onRefreshWords={refreshWords}
            />
          )}

          {currentView === 'history' && (
            <HistoryView
              passages={passages}
              onSelectPassage={handleSelectPassage}
              onRefreshPassages={refreshPassages}
              onNavigateToGenerator={() => setCurrentView('generator')}
            />
          )}

          {currentView === 'settings' && (
            <SettingsView
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              onResetSettings={handleResetSettings}
              isAdmin={isAdmin}
              firebaseUser={firebaseUser}
            />
          )}
        </main>
      </div>

      {/* Global Fixed Audio Player Bar */}
      <AudioPlayerBar
        totalSentences={activePassage?.sentences?.length || 0}
        currentSentenceIndex={activeSentenceIndex}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        onToggleConcentrationMode={() =>
          handleUpdateSettings({ concentrationMode: !settings.concentrationMode })
        }
      />
    </div>
  );
}
