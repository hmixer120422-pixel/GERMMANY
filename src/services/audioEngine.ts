import {
  AudioSourceStatus,
  ReadingSettings,
  VoiceGender,
} from '../types';
import { computeAudioHash, splitTextIntoPuterChunks } from '../utils/audioHash';
import { indexedDbCache } from './indexedDbCache';
import {
  DEFAULT_ELEVENLABS_MODEL,
  DEFAULT_FEMALE_VOICE_ID,
  DEFAULT_MALE_VOICE_ID,
  generateElevenLabsViaPuter,
  isPuterAvailable,
  VERIFIED_ELEVENLABS_VOICES,
} from './puterTtsService';
import { getCurrentIdToken } from './firebase';

export type PlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error';

export interface ConsentPromptRequest {
  textPreview: string;
  approvedForShared: boolean;
  resolve: (granted: boolean) => void;
}

class AudioEngine {
  private audio: HTMLAudioElement | null = null;
  private wordAudio: HTMLAudioElement | null = null;
  private activeSentenceObjectUrl: string | null = null;
  private activeWordObjectUrl: string | null = null;

  private currentSentences: string[] = [];
  private activeSentenceIndex: number = -1;
  private state: PlaybackState = 'idle';
  private activeSourceStatus: AudioSourceStatus = 'Shared Cloud Audio';
  private approvedForShared: boolean = true;
  private settings: ReadingSettings;

  private timerId: any = null;
  private isWordPlaying: boolean = false;
  private pausedBeforeWord: boolean = false;
  private playbackSessionId: number = 0;

  // Multi-chunk playback state (for paragraphs > 2800 chars)
  private activeChunkQueue: string[] = [];
  private activeChunkIndex: number = 0;

  // Browser SpeechSynthesis state
  private cachedVoices: SpeechSynthesisVoice[] = [];
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private speechWatchdogTimer: any = null;
  private selectedBrowserVoiceUri: string = '';

  // Pending consent prompt queue
  private pendingConsent: ConsentPromptRequest | null = null;

  // Listeners
  private stateListeners: Set<(state: PlaybackState) => void> = new Set();
  private sentenceListeners: Set<(index: number) => void> = new Set();
  private sourceListeners: Set<(status: AudioSourceStatus) => void> = new Set();
  private errorListeners: Set<(error: string) => void> = new Set();
  private noticeListeners: Set<(notice: string) => void> = new Set();
  private finishListeners: Set<() => void> = new Set();
  private consentListeners: Set<(req: ConsentPromptRequest | null) => void> = new Set();

  constructor() {
    this.settings = {
      voice: 'Rachel (ElevenLabs Shared)',
      voiceGender: 'female',
      elevenLabsVoiceId: DEFAULT_FEMALE_VOICE_ID,
      elevenLabsModel: DEFAULT_ELEVENLABS_MODEL,
      speed: 1.0,
      pitch: 0,
      defaultLevel: 'A2',
      readingMode: 'continuous',
      autoResumeAfterWord: false,
      autoScroll: true,
      sentencePauseMs: 350,
      paragraphPauseMs: 750,
      repeatMode: 'none',
      concentrationMode: false,
      timerMinutes: 0,
      theme: 'light',
      puterConsentGranted: false,
    };

    if (typeof window !== 'undefined') {
      this.audio = new Audio();
      this.audio.onended = () => this.handleAudioChunkOrSentenceEnded();
      this.audio.onerror = () => this.handleAudioError();

      this.wordAudio = new Audio();
      this.wordAudio.onended = () => this.handleWordEnded();

      if ('speechSynthesis' in window) {
        this.cachedVoices = window.speechSynthesis.getVoices();
        window.speechSynthesis.onvoiceschanged = () => {
          this.cachedVoices = window.speechSynthesis.getVoices();
        };
      }
    }
  }

  public updateSettings(newSettings: Partial<ReadingSettings>): void {
    const oldVoiceId = this.getActiveVoiceId();
    const oldVoiceMode = this.settings.voice;

    this.settings = { ...this.settings, ...newSettings };

    // Apply playbackRate live without re-fetching or invalidating cached MP3s (Part 4A)
    if (this.audio) {
      this.audio.playbackRate = this.settings.speed;
    }
    if (this.wordAudio) {
      this.wordAudio.playbackRate = this.settings.speed;
    }

    const newVoiceId = this.getActiveVoiceId();
    if (
      (oldVoiceId !== newVoiceId || oldVoiceMode !== this.settings.voice) &&
      this.state === 'playing'
    ) {
      this.play(this.activeSentenceIndex);
    }
  }

  public setApprovedForShared(approved: boolean): void {
    this.approvedForShared = approved;
  }

  public setBrowserVoiceUri(uri: string): void {
    this.selectedBrowserVoiceUri = uri;
  }

  public getGermanBrowserVoices(): SpeechSynthesisVoice[] {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
    const list =
      this.cachedVoices.length > 0 ? this.cachedVoices : window.speechSynthesis.getVoices();
    return list.filter((v) => v.lang.toLowerCase().startsWith('de'));
  }

  public loadSentences(
    sentences: string[],
    startIndex: number = 0,
    approvedForShared: boolean = true
  ): void {
    this.stop();
    this.approvedForShared = approvedForShared;
    this.currentSentences = sentences;
    this.activeSentenceIndex = Math.max(0, Math.min(startIndex, Math.max(sentences.length - 1, 0)));
    this.notifySentenceChange(this.activeSentenceIndex);
  }

  public getState(): PlaybackState {
    return this.state;
  }

  public getCurrentIndex(): number {
    return this.activeSentenceIndex;
  }

  public getSentences(): string[] {
    return this.currentSentences;
  }

  public getSourceStatus(): AudioSourceStatus {
    return this.activeSourceStatus;
  }

  public getActiveVoiceId(): string {
    if (this.settings.elevenLabsVoiceId) return this.settings.elevenLabsVoiceId;
    return this.settings.voiceGender === 'male' ? DEFAULT_MALE_VOICE_ID : DEFAULT_FEMALE_VOICE_ID;
  }

  public getActiveVoiceGender(): VoiceGender {
    const id = this.getActiveVoiceId();
    const matched = VERIFIED_ELEVENLABS_VOICES.find((v) => v.voiceId === id);
    if (matched) return matched.gender;
    return this.settings.voiceGender === 'male' ? 'male' : 'female';
  }

  public onStateChange(cb: (state: PlaybackState) => void): () => void {
    this.stateListeners.add(cb);
    return () => this.stateListeners.delete(cb);
  }

  public onSentenceChange(cb: (index: number) => void): () => void {
    this.sentenceListeners.add(cb);
    return () => this.sentenceListeners.delete(cb);
  }

  public onSourceChange(cb: (status: AudioSourceStatus) => void): () => void {
    this.sourceListeners.add(cb);
    return () => this.sourceListeners.delete(cb);
  }

  public onError(cb: (error: string) => void): () => void {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }

  public onNotice(cb: (notice: string) => void): () => void {
    this.noticeListeners.add(cb);
    return () => this.noticeListeners.delete(cb);
  }

  public onFinish(cb: () => void): () => void {
    this.finishListeners.add(cb);
    return () => this.finishListeners.delete(cb);
  }

  public onConsentRequired(cb: (req: ConsentPromptRequest | null) => void): () => void {
    this.consentListeners.add(cb);
    return () => this.consentListeners.delete(cb);
  }

  public respondToConsent(granted: boolean): void {
    if (this.pendingConsent) {
      const req = this.pendingConsent;
      this.pendingConsent = null;
      this.consentListeners.forEach((cb) => cb(null));
      req.resolve(granted);
    }
  }

  private requestUserPuterConsent(text: string): Promise<boolean> {
    if (this.settings.puterConsentGranted) return Promise.resolve(true);

    return new Promise((resolve) => {
      this.pendingConsent = {
        textPreview: text.slice(0, 120),
        approvedForShared: this.approvedForShared,
        resolve,
      };
      this.consentListeners.forEach((cb) => cb(this.pendingConsent));
    });
  }

  private setState(newState: PlaybackState): void {
    this.state = newState;
    this.stateListeners.forEach((cb) => cb(newState));
  }

  private setSourceStatus(status: AudioSourceStatus): void {
    this.activeSourceStatus = status;
    this.sourceListeners.forEach((cb) => cb(status));
  }

  private notifySentenceChange(index: number): void {
    this.sentenceListeners.forEach((cb) => cb(index));
  }

  private emitNotice(msg: string): void {
    this.noticeListeners.forEach((cb) => cb(msg));
  }

  private revokeSentenceObjectUrl(): void {
    if (this.activeSentenceObjectUrl) {
      URL.revokeObjectURL(this.activeSentenceObjectUrl);
      this.activeSentenceObjectUrl = null;
    }
  }

  private revokeWordObjectUrl(): void {
    if (this.activeWordObjectUrl) {
      URL.revokeObjectURL(this.activeWordObjectUrl);
      this.activeWordObjectUrl = null;
    }
  }

  // ----------------------------------------------------------------
  // CORE SENTENCE & CHUNKED PARAGRAPH PLAYBACK
  // ----------------------------------------------------------------
  public async play(index?: number): Promise<void> {
    if (this.currentSentences.length === 0) return;

    this.playbackSessionId += 1;
    const sessionId = this.playbackSessionId;

    if (this.isWordPlaying) {
      if (this.wordAudio) this.wordAudio.pause();
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      this.isWordPlaying = false;
    }

    if (typeof index === 'number' && index >= 0 && index < this.currentSentences.length) {
      this.activeSentenceIndex = index;
    } else if (this.activeSentenceIndex < 0) {
      this.activeSentenceIndex = 0;
    }

    this.notifySentenceChange(this.activeSentenceIndex);
    this.setState('loading');

    const sentence = this.currentSentences[this.activeSentenceIndex];
    if (!sentence) {
      this.setState('idle');
      return;
    }

    // Explicit Browser Speech mode selected by user
    if (this.settings.voice === 'Browser') {
      this.activeChunkQueue = [sentence];
      this.activeChunkIndex = 0;
      this.speakSentenceViaBrowser(sentence);
      return;
    }

    // Split into <= 2800-char sentence chunks respecting Puter 3000-char max limit
    this.activeChunkQueue = splitTextIntoPuterChunks(sentence, 2800);
    this.activeChunkIndex = 0;
    if (this.activeChunkQueue.length === 0) {
      this.handleSentenceEnded();
      return;
    }

    await this.playChunk(this.activeChunkQueue[0], sessionId, false);
  }

  private async playChunk(
    chunkText: string,
    sessionId: number,
    isWord: boolean
  ): Promise<void> {
    if (sessionId !== this.playbackSessionId) return;

    const voiceId = this.getActiveVoiceId();
    const voiceGender = this.getActiveVoiceGender();
    const model = this.settings.elevenLabsModel || DEFAULT_ELEVENLABS_MODEL;

    const { audioHash } = await computeAudioHash({
      text: chunkText,
      language: 'de-DE',
      provider: 'elevenlabs',
      model,
      voiceId,
      audioFormat: 'mp3',
      cacheVersion: 1,
    });

    // TIER 1: Browser IndexedDB Persistent Local Cache
    const localRecord = await indexedDbCache.getAudio(audioHash);
    if (sessionId !== this.playbackSessionId) return;

    if (localRecord && localRecord.blob.size >= 128) {
      this.recordEvent('local_hit');
      this.setSourceStatus('Local Cached Audio');
      await this.playBlobInElement(localRecord.blob, isWord, sessionId);
      return;
    }

    // TIER 2 & 3: Shared Firestore Index + Private Google Drive Backend Stream
    let claimOutcome: 'ready' | 'acquired' | 'wait' | 'offline' = 'offline';
    let lockToken: string | undefined;
    const idToken = await getCurrentIdToken();

    try {
      const claimRes = await fetch('/api/tts/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          text: chunkText,
          language: 'de-DE',
          provider: 'elevenlabs',
          model,
          voiceId,
          voiceGender,
          audioFormat: 'mp3',
          cacheVersion: 1,
          approvedForShared: this.approvedForShared,
        }),
      });

      if (claimRes.ok) {
        const claimJson = await claimRes.json();
        claimOutcome = claimJson?.data?.outcome || 'offline';
        lockToken = claimJson?.data?.lockToken;
      }
    } catch {
      claimOutcome = 'offline';
    }

    if (sessionId !== this.playbackSessionId) return;

    // Wait/poll if another learner concurrently holds the generation lock (Part 5)
    if (claimOutcome === 'wait') {
      const polled = await this.waitForReadyStatus(audioHash, idToken, sessionId);
      if (sessionId !== this.playbackSessionId) return;
      if (polled === 'ready') {
        claimOutcome = 'ready';
      }
    }

    // Download existing shared audio from Drive via backend proxy
    if (claimOutcome === 'ready') {
      const downloaded = await this.downloadAndCacheSharedAudio(
        audioHash,
        chunkText,
        voiceId,
        voiceGender,
        model,
        idToken
      );
      if (sessionId !== this.playbackSessionId) return;
      if (downloaded) {
        this.setSourceStatus('Shared Cloud Audio');
        await this.playBlobInElement(downloaded, isWord, sessionId);
        return;
      }
      // If Drive file was externally deleted (410 DRIVE_FILE_MISSING), re-claim lock for controlled regeneration
      try {
        const retryClaim = await fetch('/api/tts/claim', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({
            text: chunkText,
            language: 'de-DE',
            provider: 'elevenlabs',
            model,
            voiceId,
            voiceGender,
            audioFormat: 'mp3',
            cacheVersion: 1,
            approvedForShared: this.approvedForShared,
          }),
        });
        if (retryClaim.ok) {
          const retryJson = await retryClaim.json();
          if (retryJson?.data?.outcome === 'acquired') {
            claimOutcome = 'acquired';
            lockToken = retryJson?.data?.lockToken;
          }
        }
      } catch {
        // continue cleanly to generation or fallback
      }
    }

    // TIER 4: Generate new audio via Puter.js + ElevenLabs (with User-Pays consent)
    if (isPuterAvailable()) {
      const consented = await this.requestUserPuterConsent(chunkText);
      if (sessionId !== this.playbackSessionId) {
        if (lockToken) await this.releaseLock(audioHash, lockToken, 'expired', idToken);
        return;
      }

      if (consented) {
        try {
          const puterRes = await generateElevenLabsViaPuter({
            text: chunkText,
            voiceId,
            model,
            outputFormat: 'mp3_44100_128',
          });

          if (sessionId !== this.playbackSessionId) {
            if (lockToken) await this.releaseLock(audioHash, lockToken, 'expired', idToken);
            return;
          }

          if (puterRes.blob && puterRes.blob.size >= 128) {
            // Save immediately into persistent Browser IndexedDB
            await indexedDbCache.putAudio({
              audioHash,
              blob: puterRes.blob,
              mimeType: puterRes.blob.type || 'audio/mpeg',
              text: chunkText,
              voiceId,
              voiceGender,
              model,
              sourceType: this.approvedForShared ? 'Shared Cloud Audio' : 'Local Only Audio',
            });

            // Upload to shared Google Drive ONLY if approved educational content & user is signed in
            if (this.approvedForShared && idToken) {
              const uploaded = await this.uploadBlobToSharedLibrary({
                audioHash,
                lockToken,
                blob: puterRes.blob,
                text: chunkText,
                voiceId,
                voiceGender,
                model,
                duration: puterRes.duration,
                idToken,
              });
              if (!uploaded) {
                if (lockToken) await this.releaseLock(audioHash, lockToken, 'failed', idToken);
                this.emitNotice('تم تشغيل الصوت وحفظه محلياً؛ تعذر رفعه للمكتبة السحابية المشتركة حالياً.');
              }
            } else {
              // Custom private learner text or unauthenticated session -> keep local IndexedDB only (Part 7)
              if (lockToken) await this.releaseLock(audioHash, lockToken, 'expired', idToken);
              this.recordEvent('elevenlabs_local_generation');
              if (!this.approvedForShared) {
                this.emitNotice('نص مخصص: تم توليد الصوت وتشغيله وحفظه محلياً فقط دون رفعه للمكتبة المشتركة.');
              }
            }

            this.setSourceStatus('Newly Generated ElevenLabs Audio');
            await this.playBlobInElement(puterRes.blob, isWord, sessionId);
            return;
          }

          // CORS blocked remote URL fetch: play returned audioElement locally if playable, never create false Drive cache!
          if (lockToken) await this.releaseLock(audioHash, lockToken, 'failed', idToken);
          if (puterRes.corsBlocked && puterRes.audioElement?.src) {
            this.emitNotice(
              'تعذر استخراج ملف MP3 بسبب قيود CORS؛ تم تشغيل الصوت محلياً دون تخزين سحابي.'
            );
            this.setSourceStatus('Newly Generated ElevenLabs Audio');
            await this.playUrlInElement(puterRes.audioElement.src, isWord, sessionId);
            return;
          }
        } catch (err: any) {
          console.warn('Puter ElevenLabs generation failed, switching to Browser fallback:', err);
          if (lockToken) await this.releaseLock(audioHash, lockToken, 'failed', idToken);
          this.recordEvent('failed_generation');
        }
      } else {
        if (lockToken) await this.releaseLock(audioHash, lockToken, 'expired', idToken);
      }
    } else if (lockToken) {
      await this.releaseLock(audioHash, lockToken, 'failed', idToken);
    }

    // TIER 5: Free Browser SpeechSynthesis Fallback (playback-only, NEVER uploaded to Drive)
    this.recordEvent('fallback_used');
    this.setSourceStatus('Free Browser Voice');
    if (isWord) {
      this.speakWordViaBrowser(chunkText);
    } else {
      this.speakSentenceViaBrowser(chunkText);
    }
  }

  private async waitForReadyStatus(
    audioHash: string,
    idToken: string | null,
    sessionId: number
  ): Promise<'ready' | 'timeout'> {
    for (let attempt = 0; attempt < 15; attempt++) {
      if (sessionId !== this.playbackSessionId) return 'timeout';
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const res = await fetch(`/api/tts/status/${audioHash}`, {
          headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
        });
        if (!res.ok) continue;
        const json = await res.json();
        const st = json?.data?.status;
        if (st === 'ready') return 'ready';
        if (st === 'failed' || st === 'expired' || st === 'missing') return 'timeout';
      } catch {
        // retry poll
      }
    }
    return 'timeout';
  }

  private async downloadAndCacheSharedAudio(
    audioHash: string,
    text: string,
    voiceId: string,
    voiceGender: VoiceGender,
    model: string,
    idToken: string | null
  ): Promise<Blob | null> {
    try {
      const res = await fetch(`/api/tts/audio/${audioHash}`, {
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : {},
      });
      if (!res.ok) return null;
      const blob = await res.blob();
      if (!blob || blob.size < 128) return null;

      await indexedDbCache.putAudio({
        audioHash,
        blob,
        mimeType: 'audio/mpeg',
        text,
        voiceId,
        voiceGender,
        model,
        sourceType: 'Shared Cloud Audio',
      });
      return blob;
    } catch {
      return null;
    }
  }

  private async uploadBlobToSharedLibrary(params: {
    audioHash: string;
    lockToken?: string;
    blob: Blob;
    text: string;
    voiceId: string;
    voiceGender: VoiceGender;
    model: string;
    duration: number;
    idToken: string;
  }): Promise<boolean> {
    try {
      const base64 = await this.blobToBase64(params.blob);
      const res = await fetch('/api/tts/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${params.idToken}`,
        },
        body: JSON.stringify({
          audioHash: params.audioHash,
          lockToken: params.lockToken,
          audioBase64: base64,
          mimeType: 'audio/mpeg',
          text: params.text,
          language: 'de-DE',
          provider: 'elevenlabs',
          model: params.model,
          voiceId: params.voiceId,
          voiceGender: params.voiceGender,
          audioFormat: 'mp3',
          cacheVersion: 1,
          duration: params.duration,
          approvedForShared: this.approvedForShared,
        }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = String(reader.result || '');
        const idx = result.indexOf(',');
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  private async releaseLock(
    audioHash: string,
    lockToken: string,
    status: 'failed' | 'expired' | 'missing',
    idToken: string | null
  ): Promise<void> {
    await fetch('/api/tts/release-lock', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
      },
      body: JSON.stringify({ audioHash, lockToken, status }),
    }).catch(() => {});
  }

  private recordEvent(
    eventType: 'local_hit' | 'fallback_used' | 'failed_generation' | 'elevenlabs_local_generation'
  ): void {
    fetch('/api/tts/record-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventType }),
    }).catch(() => {});
  }

  private async playBlobInElement(blob: Blob, isWord: boolean, sessionId: number): Promise<void> {
    if (sessionId !== this.playbackSessionId) return;
    const url = URL.createObjectURL(blob);
    if (isWord) {
      this.revokeWordObjectUrl();
      this.activeWordObjectUrl = url;
    } else {
      this.revokeSentenceObjectUrl();
      this.activeSentenceObjectUrl = url;
    }
    await this.playUrlInElement(url, isWord, sessionId);
  }

  private async playUrlInElement(url: string, isWord: boolean, sessionId: number): Promise<void> {
    if (sessionId !== this.playbackSessionId) return;
    const target = isWord ? this.wordAudio : this.audio;
    if (!target) return;

    target.pause();
    target.src = url;
    target.playbackRate = this.settings.speed || 1.0;

    try {
      await target.play();
      if (!isWord) {
        this.setState('playing');
      }
    } catch (err) {
      console.warn('HTMLAudioElement play rejected, falling back:', err);
      const currentText = isWord
        ? ''
        : this.activeChunkQueue[this.activeChunkIndex] || this.currentSentences[this.activeSentenceIndex];
      if (!isWord && currentText) {
        this.setSourceStatus('Free Browser Voice');
        this.speakSentenceViaBrowser(currentText);
      } else {
        this.setState('error');
      }
    }
  }

  private async handleAudioChunkOrSentenceEnded(): Promise<void> {
    if (this.activeChunkIndex + 1 < this.activeChunkQueue.length) {
      this.activeChunkIndex += 1;
      const nextChunk = this.activeChunkQueue[this.activeChunkIndex];
      await this.playChunk(nextChunk, this.playbackSessionId, false);
      return;
    }
    this.handleSentenceEnded();
  }

  public pause(): void {
    this.clearTimers();

    if (this.audio && !this.audio.paused) {
      this.audio.pause();
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.pause();
    }
    this.setState('paused');
  }

  public resume(): void {
    if (this.state === 'paused') {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window && window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        this.setState('playing');
        return;
      }
      if (this.audio && this.audio.src && this.audio.paused && this.audio.currentTime > 0) {
        this.audio
          .play()
          .then(() => this.setState('playing'))
          .catch(() => this.play(this.activeSentenceIndex));
        return;
      }
    }
    this.play(this.activeSentenceIndex);
  }

  public stop(): void {
    this.playbackSessionId += 1;
    this.clearTimers();
    this.activeChunkQueue = [];
    this.activeChunkIndex = 0;

    if (this.audio) {
      this.audio.pause();
      this.audio.currentTime = 0;
    }
    if (this.wordAudio) {
      this.wordAudio.pause();
      this.wordAudio.currentTime = 0;
    }
    this.revokeSentenceObjectUrl();
    this.revokeWordObjectUrl();

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.isWordPlaying = false;
    this.setState('stopped');
  }

  public nextSentence(): void {
    if (this.activeSentenceIndex < this.currentSentences.length - 1) {
      this.play(this.activeSentenceIndex + 1);
    } else if (this.settings.repeatMode === 'all') {
      this.play(0);
    } else {
      this.stop();
      this.finishListeners.forEach((cb) => cb());
    }
  }

  public prevSentence(): void {
    if (this.activeSentenceIndex > 0) {
      this.play(this.activeSentenceIndex - 1);
    } else {
      this.play(0);
    }
  }

  public repeatCurrentSentence(): void {
    this.play(this.activeSentenceIndex);
  }

  private handleSentenceEnded(): void {
    this.clearWatchdog();

    if (this.settings.repeatMode === 'sentence') {
      this.repeatCurrentSentence();
      return;
    }

    if (this.settings.readingMode === 'sentence-step') {
      this.setState('paused');
      return;
    }

    const pauseTime = this.settings.sentencePauseMs || 350;
    this.timerId = setTimeout(() => {
      this.nextSentence();
    }, pauseTime);
  }

  private handleAudioError(): void {
    const sentence =
      this.activeChunkQueue[this.activeChunkIndex] ||
      this.currentSentences[this.activeSentenceIndex];
    if (sentence) {
      this.setSourceStatus('Free Browser Voice');
      this.speakSentenceViaBrowser(sentence);
    } else {
      this.setState('error');
    }
  }

  // ----------------------------------------------------------------
  // INDIVIDUAL WORD PRONUNCIATION (CLICK-TO-PRONOUNCE)
  // ----------------------------------------------------------------
  public playWordOnly(word: string): Promise<void> {
    return new Promise((resolve) => {
      const cleanWord = word.trim().replace(/[.,!?;:„"“»«()]/g, '');
      if (!cleanWord) {
        resolve();
        return;
      }

      if (this.state === 'playing') {
        this.pausedBeforeWord = true;
        if (this.audio) this.audio.pause();
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
        if (this.timerId) clearTimeout(this.timerId);
      } else {
        this.pausedBeforeWord = false;
      }

      this.isWordPlaying = true;
      const wordSession = ++this.playbackSessionId;

      if (this.settings.voice === 'Browser') {
        this.setSourceStatus('Free Browser Voice');
        this.speakWordViaBrowser(cleanWord, resolve);
        return;
      }

      // Word also uses the exact 5-tier Shared Cloud Audio cache pipeline!
      const prevOnEnded = this.wordAudio ? this.wordAudio.onended : null;
      if (this.wordAudio) {
        this.wordAudio.onended = () => {
          this.handleWordEnded();
          if (this.wordAudio && prevOnEnded) {
            this.wordAudio.onended = () => this.handleWordEnded();
          }
          resolve();
        };
      }

      this.playChunk(cleanWord, wordSession, true)
        .then(() => {
          // If fallback SpeechSynthesis was used, resolve handled in onend/onerror
          if (this.activeSourceStatus === 'Free Browser Voice') {
            setTimeout(resolve, 600);
          }
        })
        .catch(() => {
          this.setSourceStatus('Free Browser Voice');
          this.speakWordViaBrowser(cleanWord, resolve);
        });
    });
  }

  private handleWordEnded(): void {
    this.isWordPlaying = false;
    this.revokeWordObjectUrl();
    if (this.settings.autoResumeAfterWord && this.pausedBeforeWord) {
      this.resume();
    } else if (this.pausedBeforeWord) {
      this.setState('paused');
    }
  }

  // ----------------------------------------------------------------
  // BROWSER GERMAN SPEECH SYNTHESIS FALLBACK (de-DE)
  // ----------------------------------------------------------------
  private getBestGermanVoice(): SpeechSynthesisVoice | null {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
    const deVoices = this.getGermanBrowserVoices();
    if (deVoices.length === 0) return null;

    if (this.selectedBrowserVoiceUri) {
      const explicit = deVoices.find((v) => v.voiceURI === this.selectedBrowserVoiceUri);
      if (explicit) return explicit;
    }

    const preferMale = this.getActiveVoiceGender() === 'male';
    const genderMatched = deVoices.find((v) =>
      preferMale
        ? /Stefan|Hans|Markus|Conrad|Male|Mann|Klaus/i.test(v.name)
        : /Female|Marlene|Anna|Katja|Google Deutsch|Petra|Hedda|Vicki|Amira|Gisela/i.test(v.name)
    );

    return genderMatched || deVoices[0];
  }

  private speakSentenceViaBrowser(text: string): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      this.setState('error');
      this.errorListeners.forEach((cb) =>
        cb('خدمة تحويل النص إلى صوت غير مدعومة في هذا المتصفح.')
      );
      return;
    }

    this.setSourceStatus('Free Browser Voice');
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = this.settings.speed || 1.0;
    utterance.pitch = 1.0;

    const bestVoice = this.getBestGermanVoice();
    if (bestVoice) {
      utterance.voice = bestVoice;
    }

    this.currentUtterance = utterance;

    utterance.onstart = () => {
      this.setState('playing');
      this.startWatchdog();
    };

    utterance.onend = () => {
      this.handleSentenceEnded();
    };

    utterance.onerror = (e) => {
      if (e.error !== 'canceled' && e.error !== 'interrupted') {
        this.setState('error');
      }
    };

    window.speechSynthesis.speak(utterance);
  }

  private speakWordViaBrowser(word: string, onDone?: () => void): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      this.handleWordEnded();
      if (onDone) onDone();
      return;
    }

    this.setSourceStatus('Free Browser Voice');
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = 'de-DE';
    utterance.rate = this.settings.speed || 1.0;
    utterance.pitch = 1.0;

    const bestVoice = this.getBestGermanVoice();
    if (bestVoice) {
      utterance.voice = bestVoice;
    }

    utterance.onend = () => {
      this.handleWordEnded();
      if (onDone) onDone();
    };

    utterance.onerror = () => {
      this.handleWordEnded();
      if (onDone) onDone();
    };

    window.speechSynthesis.speak(utterance);
  }

  private startWatchdog(): void {
    this.clearWatchdog();
    this.speechWatchdogTimer = setInterval(() => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
          window.speechSynthesis.pause();
          window.speechSynthesis.resume();
        }
      }
    }, 12000);
  }

  private clearWatchdog(): void {
    if (this.speechWatchdogTimer) {
      clearInterval(this.speechWatchdogTimer);
      this.speechWatchdogTimer = null;
    }
  }

  private clearTimers(): void {
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.clearWatchdog();
  }
}

export const audioEngine = new AudioEngine();
