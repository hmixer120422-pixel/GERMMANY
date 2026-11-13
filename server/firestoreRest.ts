import fs from 'fs';
import path from 'path';
import type { TtsCacheMetadata, VoiceGender } from '../src/types/index';

interface FirebaseAppletConfig {
  projectId: string;
  appId: string;
  apiKey: string;
  authDomain: string;
  firestoreDatabaseId: string;
}

export interface VerifiedFirebaseUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
  isAdmin: boolean;
  idToken: string;
}

export interface ServerStatsState {
  elevenLabsGenerationsCount: number;
  sharedCacheHitsCount: number;
  localCacheHitsCount: number;
  fallbackVoiceUsesCount: number;
  failedGenerationsCount: number;
  updatedAt: string;
}

export interface ServerConfigState {
  defaultModel: string;
  defaultFemaleVoiceId: string;
  defaultMaleVoiceId: string;
  defaultCourseVoiceId: string;
  rootFolderName: string;
  driveConnected: boolean;
  updatedAt: string;
}

interface LocalIndexFile {
  entries: Record<string, TtsCacheMetadata>;
  stats: ServerStatsState;
  config: ServerConfigState;
}

export const BOOTSTRAPPED_ADMIN_EMAIL = 'hmixer1204.2.2@gmail.com';
const LOCK_TTL_MS = 60_000;
const DATA_DIR = path.resolve(process.cwd(), '.server-data');
const INDEX_FILE = path.join(DATA_DIR, 'tts-index.json');

let cachedConfig: FirebaseAppletConfig | null = null;
function getFirebaseConfig(): FirebaseAppletConfig {
  if (cachedConfig) return cachedConfig;
  const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  const raw = fs.readFileSync(configPath, 'utf8');
  cachedConfig = JSON.parse(raw) as FirebaseAppletConfig;
  return cachedConfig;
}

export function getAdminEmail(): string {
  return (process.env.APP_ADMIN_EMAIL || BOOTSTRAPPED_ADMIN_EMAIL).trim().toLowerCase();
}

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

function defaultState(): LocalIndexFile {
  const now = new Date().toISOString();
  return {
    entries: {},
    stats: {
      elevenLabsGenerationsCount: 0,
      sharedCacheHitsCount: 0,
      localCacheHitsCount: 0,
      fallbackVoiceUsesCount: 0,
      failedGenerationsCount: 0,
      updatedAt: now,
    },
    config: {
      defaultModel: 'eleven_multilingual_v2',
      defaultFemaleVoiceId: '21m00Tcm4TlvDq8ikWAM',
      defaultMaleVoiceId: 'ErXwobaYiN019PkySvjV',
      defaultCourseVoiceId: '21m00Tcm4TlvDq8ikWAM',
      rootFolderName: 'GermanLearningAudioLibrary',
      driveConnected: false,
      updatedAt: now,
    },
  };
}

let stateCache: LocalIndexFile | null = null;
function loadState(): LocalIndexFile {
  if (stateCache) return stateCache;
  try {
    if (fs.existsSync(INDEX_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
      const def = defaultState();
      stateCache = {
        entries: parsed.entries || {},
        stats: { ...def.stats, ...(parsed.stats || {}) },
        config: { ...def.config, ...(parsed.config || {}) },
      };
      return stateCache;
    }
  } catch {
    // ignore corrupt local cache file
  }
  stateCache = defaultState();
  return stateCache;
}

function saveState(): void {
  ensureDataDir();
  if (!stateCache) return;
  fs.writeFileSync(INDEX_FILE, JSON.stringify(stateCache, null, 2), { mode: 0o600 });
}

// =========================================================
// Firebase ID Token Verification & Firestore REST Sync
// =========================================================
export async function verifyFirebaseIdToken(idToken: string): Promise<VerifiedFirebaseUser | null> {
  if (!idToken || idToken.length < 20) return null;
  try {
    const fb = getFirebaseConfig();
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(fb.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const user = data?.users?.[0];
    if (!user || !user.localId) return null;

    const email = String(user.email || '').toLowerCase();
    const emailVerified = Boolean(user.emailVerified);
    let isAdmin = emailVerified && email === getAdminEmail();

    if (!isAdmin && emailVerified) {
      // Check /admins/{uid} document in Firestore
      const adminDoc = await firestoreGetDoc('admins', user.localId, idToken);
      if (adminDoc && adminDoc.role === 'admin') {
        isAdmin = true;
      }
    }

    return {
      uid: user.localId,
      email: user.email || '',
      emailVerified,
      displayName: user.displayName,
      isAdmin,
      idToken,
    };
  } catch {
    return null;
  }
}

function firestoreDocUrl(collectionName: string, docId: string): string {
  const fb = getFirebaseConfig();
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    fb.projectId
  )}/databases/${encodeURIComponent(fb.firestoreDatabaseId)}/documents/${encodeURIComponent(
    collectionName
  )}/${encodeURIComponent(docId)}`;
}

function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') {
    // ISO timestamps for date fields handled explicitly in converter
    return { stringValue: val };
  }
  return { stringValue: String(val) };
}

function fromFirestoreFields(fields: Record<string, any> | undefined): Record<string, any> {
  if (!fields) return {};
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(fields)) {
    if ('stringValue' in v) out[k] = v.stringValue;
    else if ('integerValue' in v) out[k] = parseInt(v.integerValue, 10);
    else if ('doubleValue' in v) out[k] = Number(v.doubleValue);
    else if ('booleanValue' in v) out[k] = Boolean(v.booleanValue);
    else if ('timestampValue' in v) out[k] = v.timestampValue;
    else if ('nullValue' in v) out[k] = null;
  }
  return out;
}

function cacheEntryToFirestoreFields(entry: TtsCacheMetadata): Record<string, any> {
  const fields: Record<string, any> = {
    audioHash: { stringValue: entry.audioHash },
    language: { stringValue: entry.language },
    originalText: { stringValue: entry.originalText.slice(0, 4000) },
    normalizedText: { stringValue: entry.normalizedText.slice(0, 4000) },
    provider: { stringValue: entry.provider },
    model: { stringValue: entry.model },
    voiceId: { stringValue: entry.voiceId },
    audioFormat: { stringValue: entry.audioFormat },
    driveFileId: { stringValue: entry.driveFileId },
    driveFolderId: { stringValue: entry.driveFolderId },
    status: { stringValue: entry.status },
    fileSize: { integerValue: String(Math.max(0, Math.floor(entry.fileSize || 0))) },
    duration: { doubleValue: Number(entry.duration || 0) },
    cacheVersion: { integerValue: String(entry.cacheVersion || 1) },
    createdAt: { timestampValue: entry.createdAt },
    updatedAt: { timestampValue: entry.updatedAt },
    lastAccessedAt: { timestampValue: entry.lastAccessedAt },
  };
  if (entry.voiceGender) fields.voiceGender = { stringValue: entry.voiceGender };
  if (entry.lockOwner) fields.lockOwner = { stringValue: entry.lockOwner };
  if (typeof entry.lockExpiresAt === 'number') {
    fields.lockExpiresAt = { integerValue: String(Math.floor(entry.lockExpiresAt)) };
  }
  if (typeof entry.approvedForShared === 'boolean') {
    fields.approvedForShared = { booleanValue: entry.approvedForShared };
  }
  return fields;
}

// Optional GCP Cloud Run metadata server token (allows server-to-Firestore sync even on learner uploads)
let cachedGcpToken: { token: string; expiresAt: number } | null = null;
async function getServerFirestoreAuthToken(fallbackUserToken?: string): Promise<string | null> {
  if (cachedGcpToken && Date.now() < cachedGcpToken.expiresAt - 60_000) {
    return cachedGcpToken.token;
  }
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 800);
    const res = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      {
        headers: { 'Metadata-Flavor': 'Google' },
        signal: controller.signal,
      }
    );
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data?.access_token) {
        cachedGcpToken = {
          token: data.access_token,
          expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
        };
        return cachedGcpToken.token;
      }
    }
  } catch {
    // Metadata server not present in local dev; fall back cleanly
  }
  return fallbackUserToken || null;
}

export async function firestoreGetDoc(
  collectionName: string,
  docId: string,
  bearerToken?: string
): Promise<Record<string, any> | null> {
  try {
    const authToken = await getServerFirestoreAuthToken(bearerToken);
    if (!authToken) return null;
    const res = await fetch(firestoreDocUrl(collectionName, docId), {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return fromFirestoreFields(json.fields);
  } catch {
    return null;
  }
}

export async function syncEntryToFirestore(
  entry: TtsCacheMetadata,
  userToken?: string
): Promise<boolean> {
  try {
    const authToken = await getServerFirestoreAuthToken(userToken);
    if (!authToken) return false;
    const fb = getFirebaseConfig();
    const docPath = `projects/${fb.projectId}/databases/${fb.firestoreDatabaseId}/documents/ttsAudioCache/${entry.audioHash}`;
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      fb.projectId
    )}/databases/${encodeURIComponent(fb.firestoreDatabaseId)}/documents:commit`;

    // Use Firestore serverTimestamp transforms for createdAt/updatedAt/lastAccessedAt compliance with rules
    const fields = cacheEntryToFirestoreFields(entry);
    delete fields.updatedAt;
    delete fields.lastAccessedAt;

    const existingRemote = await firestoreGetDoc('ttsAudioCache', entry.audioHash, userToken);
    const fieldTransforms: any[] = [
      { fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' },
      { fieldPath: 'lastAccessedAt', setToServerValue: 'REQUEST_TIME' },
    ];
    if (!existingRemote) {
      delete fields.createdAt;
      fieldTransforms.push({ fieldPath: 'createdAt', setToServerValue: 'REQUEST_TIME' });
    } else if (existingRemote.createdAt) {
      fields.createdAt = { timestampValue: existingRemote.createdAt };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        writes: [
          {
            update: { name: docPath, fields },
            updateTransforms: fieldTransforms,
          },
        ],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteEntryFromFirestore(audioHash: string, userToken?: string): Promise<boolean> {
  try {
    const authToken = await getServerFirestoreAuthToken(userToken);
    if (!authToken) return false;
    const res = await fetch(firestoreDocUrl('ttsAudioCache', audioHash), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

export async function syncStatsToFirestore(userToken?: string): Promise<boolean> {
  try {
    const authToken = await getServerFirestoreAuthToken(userToken);
    if (!authToken) return false;
    const st = loadState();
    const fb = getFirebaseConfig();
    const docPath = `projects/${fb.projectId}/databases/${fb.firestoreDatabaseId}/documents/ttsStatistics/global`;
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      fb.projectId
    )}/databases/${encodeURIComponent(fb.firestoreDatabaseId)}/documents:commit`;

    const allReady = Object.values(st.entries).filter((e) => e.status === 'ready');
    const totalBytes = allReady.reduce((sum, e) => sum + (e.fileSize || 0), 0);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        writes: [
          {
            update: {
              name: docPath,
              fields: {
                statId: { stringValue: 'global' },
                elevenLabsGenerationsCount: { integerValue: String(st.stats.elevenLabsGenerationsCount) },
                sharedCacheHitsCount: { integerValue: String(st.stats.sharedCacheHitsCount) },
                localCacheHitsCount: { integerValue: String(st.stats.localCacheHitsCount) },
                fallbackVoiceUsesCount: { integerValue: String(st.stats.fallbackVoiceUsesCount) },
                failedGenerationsCount: { integerValue: String(st.stats.failedGenerationsCount) },
                totalCloudAudioBytes: { integerValue: String(totalBytes) },
                sharedAudioFilesCount: { integerValue: String(allReady.length) },
              },
            },
            updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
          },
        ],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function syncConfigToFirestore(userToken?: string): Promise<boolean> {
  try {
    const authToken = await getServerFirestoreAuthToken(userToken);
    if (!authToken) return false;
    const st = loadState();
    const fb = getFirebaseConfig();
    const docPath = `projects/${fb.projectId}/databases/${fb.firestoreDatabaseId}/documents/ttsConfig/default`;
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
      fb.projectId
    )}/databases/${encodeURIComponent(fb.firestoreDatabaseId)}/documents:commit`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        writes: [
          {
            update: {
              name: docPath,
              fields: {
                configId: { stringValue: 'default' },
                defaultModel: { stringValue: st.config.defaultModel },
                defaultFemaleVoiceId: { stringValue: st.config.defaultFemaleVoiceId },
                defaultMaleVoiceId: { stringValue: st.config.defaultMaleVoiceId },
                defaultCourseVoiceId: { stringValue: st.config.defaultCourseVoiceId },
                rootFolderName: { stringValue: st.config.rootFolderName },
                driveConnected: { booleanValue: st.config.driveConnected },
              },
            },
            updateTransforms: [{ fieldPath: 'updatedAt', setToServerValue: 'REQUEST_TIME' }],
          },
        ],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function checkFirestoreServerConnectivity(userToken?: string): Promise<boolean> {
  try {
    const fb = getFirebaseConfig();
    const authToken = await getServerFirestoreAuthToken(userToken);
    const res = await fetch(firestoreDocUrl('ttsConfig', 'default'), {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    });
    // 200, 404, or 403 proves the Firestore Enterprise database endpoint is active and reachable
    return res.status === 200 || res.status === 404 || res.status === 403;
  } catch {
    return false;
  }
}

// =========================================================
// Distributed Locking & Metadata Store Operations
// =========================================================
// Simple in-process async mutex per audioHash to serialize concurrent claims cleanly
const hashMutexMap = new Map<string, Promise<any>>();
async function withHashLock<T>(hash: string, fn: () => Promise<T>): Promise<T> {
  const prev = hashMutexMap.get(hash) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((res) => {
    release = res;
  });
  hashMutexMap.set(hash, prev.then(() => current));
  try {
    await prev;
    return await fn();
  } finally {
    release();
    if (hashMutexMap.get(hash) === current) {
      hashMutexMap.delete(hash);
    }
  }
}

export async function claimGenerationLock(params: {
  audioHash: string;
  originalText: string;
  normalizedText: string;
  language: string;
  provider: string;
  model: string;
  voiceId: string;
  voiceGender: VoiceGender;
  audioFormat: string;
  cacheVersion: number;
  requesterId: string;
  approvedForShared: boolean;
  userToken?: string;
}): Promise<{
  outcome: 'ready' | 'acquired' | 'wait';
  entry: TtsCacheMetadata;
  lockToken?: string;
}> {
  return withHashLock(params.audioHash, async () => {
    const st = loadState();
    let existing = st.entries[params.audioHash];

    // If not in local cache, check remote Firestore index (e.g., after container restart)
    if (!existing && params.userToken) {
      const remote = await firestoreGetDoc('ttsAudioCache', params.audioHash, params.userToken);
      if (remote && remote.audioHash) {
        existing = remote as TtsCacheMetadata;
        st.entries[params.audioHash] = existing;
        saveState();
      }
    }

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();

    // 1. Ready shared audio exists -> immediate shared hit!
    if (existing && existing.status === 'ready' && existing.driveFileId) {
      return { outcome: 'ready', entry: existing };
    }

    // 2. Active non-expired generation lock held by another request -> wait/poll
    if (
      existing &&
      existing.status === 'generating' &&
      existing.lockExpiresAt &&
      existing.lockExpiresAt > nowMs
    ) {
      return { outcome: 'wait', entry: existing };
    }

    // 3. No ready entry OR expired/abandoned/failed/missing lock -> acquire lock atomically
    const lockToken = `${params.requesterId}:${nowMs}:${Math.random().toString(36).slice(2, 8)}`;
    const newEntry: TtsCacheMetadata = {
      audioHash: params.audioHash,
      language: params.language,
      originalText: params.originalText.slice(0, 4000),
      normalizedText: params.normalizedText.slice(0, 4000),
      provider: params.provider,
      model: params.model,
      voiceId: params.voiceId,
      voiceGender: params.voiceGender,
      audioFormat: params.audioFormat,
      driveFileId: existing?.driveFileId || '',
      driveFolderId: existing?.driveFolderId || '',
      status: 'generating',
      fileSize: 0,
      duration: 0,
      lockOwner: lockToken,
      lockExpiresAt: nowMs + LOCK_TTL_MS,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
      lastAccessedAt: nowIso,
      cacheVersion: params.cacheVersion,
      approvedForShared: params.approvedForShared,
    };

    st.entries[params.audioHash] = newEntry;
    saveState();
    await syncEntryToFirestore(newEntry, params.userToken).catch(() => false);

    return { outcome: 'acquired', entry: newEntry, lockToken };
  });
}

export async function completeAudioUploadMetadata(params: {
  audioHash: string;
  lockToken?: string;
  driveFileId: string;
  driveFolderId: string;
  fileSize: number;
  duration: number;
  originalText: string;
  normalizedText: string;
  language: string;
  provider: string;
  model: string;
  voiceId: string;
  voiceGender: VoiceGender;
  audioFormat: string;
  cacheVersion: number;
  approvedForShared: boolean;
  isAdmin: boolean;
  userToken?: string;
}): Promise<{ ok: boolean; error?: string; entry?: TtsCacheMetadata }> {
  return withHashLock(params.audioHash, async () => {
    const st = loadState();
    const existing = st.entries[params.audioHash];
    const nowIso = new Date().toISOString();

    if (existing && existing.status === 'ready' && existing.driveFileId && !params.isAdmin) {
      return { ok: false, error: 'Shared audio already exists and cannot be overwritten.', entry: existing };
    }

    if (
      existing &&
      existing.status === 'generating' &&
      existing.lockOwner &&
      params.lockToken &&
      existing.lockOwner !== params.lockToken &&
      !params.isAdmin &&
      (existing.lockExpiresAt || 0) > Date.now()
    ) {
      return { ok: false, error: 'Generation lock is held by another active request.' };
    }

    const readyEntry: TtsCacheMetadata = {
      audioHash: params.audioHash,
      language: params.language,
      originalText: params.originalText.slice(0, 4000),
      normalizedText: params.normalizedText.slice(0, 4000),
      provider: params.provider,
      model: params.model,
      voiceId: params.voiceId,
      voiceGender: params.voiceGender,
      audioFormat: params.audioFormat,
      driveFileId: params.driveFileId,
      driveFolderId: params.driveFolderId,
      status: 'ready',
      fileSize: params.fileSize,
      duration: params.duration || 0,
      lockOwner: '',
      lockExpiresAt: 0,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
      lastAccessedAt: nowIso,
      cacheVersion: params.cacheVersion,
      approvedForShared: params.approvedForShared,
    };

    st.entries[params.audioHash] = readyEntry;
    st.stats.elevenLabsGenerationsCount += 1;
    st.stats.updatedAt = nowIso;
    saveState();

    await syncEntryToFirestore(readyEntry, params.userToken).catch(() => false);
    await syncStatsToFirestore(params.userToken).catch(() => false);

    return { ok: true, entry: readyEntry };
  });
}

export async function releaseGenerationLock(params: {
  audioHash: string;
  lockToken?: string;
  status?: 'failed' | 'expired' | 'missing';
  userToken?: string;
}): Promise<void> {
  await withHashLock(params.audioHash, async () => {
    const st = loadState();
    const existing = st.entries[params.audioHash];
    if (!existing) return;
    if (existing.status === 'ready') return;
    if (params.lockToken && existing.lockOwner && existing.lockOwner !== params.lockToken) return;

    const nowIso = new Date().toISOString();
    existing.status = params.status || 'failed';
    existing.lockOwner = '';
    existing.lockExpiresAt = 0;
    existing.updatedAt = nowIso;
    if (params.status === 'failed') {
      st.stats.failedGenerationsCount += 1;
      st.stats.updatedAt = nowIso;
    }
    saveState();
    await syncEntryToFirestore(existing, params.userToken).catch(() => false);
    await syncStatsToFirestore(params.userToken).catch(() => false);
  });
}

export function getAudioEntry(audioHash: string): TtsCacheMetadata | null {
  const st = loadState();
  return st.entries[audioHash] || null;
}

export function touchSharedHit(audioHash: string): void {
  const st = loadState();
  const nowIso = new Date().toISOString();
  if (st.entries[audioHash]) {
    st.entries[audioHash].lastAccessedAt = nowIso;
  }
  st.stats.sharedCacheHitsCount += 1;
  st.stats.updatedAt = nowIso;
  saveState();
}

export function recordTelemetryEvent(
  eventType: 'local_hit' | 'fallback_used' | 'failed_generation' | 'elevenlabs_local_generation'
): void {
  const st = loadState();
  const nowIso = new Date().toISOString();
  if (eventType === 'local_hit') st.stats.localCacheHitsCount += 1;
  else if (eventType === 'fallback_used') st.stats.fallbackVoiceUsesCount += 1;
  else if (eventType === 'failed_generation') st.stats.failedGenerationsCount += 1;
  else if (eventType === 'elevenlabs_local_generation') st.stats.elevenLabsGenerationsCount += 1;
  st.stats.updatedAt = nowIso;
  saveState();
}

export function getAllAudioEntries(search?: string, statusFilter?: string): TtsCacheMetadata[] {
  const st = loadState();
  let items = Object.values(st.entries);
  if (statusFilter && statusFilter !== 'all') {
    items = items.filter((i) => i.status === statusFilter);
  }
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    items = items.filter(
      (i) =>
        i.originalText.toLowerCase().includes(q) ||
        i.normalizedText.toLowerCase().includes(q) ||
        i.audioHash.toLowerCase().includes(q) ||
        i.voiceId.toLowerCase().includes(q)
    );
  }
  return items.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export async function removeAudioEntry(audioHash: string, userToken?: string): Promise<void> {
  const st = loadState();
  delete st.entries[audioHash];
  saveState();
  await deleteEntryFromFirestore(audioHash, userToken).catch(() => false);
}

export async function removeExpiredOrFailedEntries(userToken?: string): Promise<number> {
  const st = loadState();
  const nowMs = Date.now();
  let removed = 0;

  for (const [hash, entry] of Object.entries(st.entries)) {
    const isStaleLock =
      entry.status === 'generating' && entry.lockExpiresAt && entry.lockExpiresAt < nowMs;
    if (entry.status === 'failed' || entry.status === 'expired' || entry.status === 'missing' || isStaleLock) {
      delete st.entries[hash];
      removed += 1;
      await deleteEntryFromFirestore(hash, userToken).catch(() => false);
    }
  }

  saveState();
  return removed;
}

export function markAudioEntryMissing(audioHash: string): void {
  const st = loadState();
  if (st.entries[audioHash]) {
    st.entries[audioHash].status = 'missing';
    st.entries[audioHash].driveFileId = '';
    st.entries[audioHash].updatedAt = new Date().toISOString();
    saveState();
  }
}

export function upsertRebuiltEntry(entry: TtsCacheMetadata): void {
  const st = loadState();
  st.entries[entry.audioHash] = entry;
  saveState();
}

export function getStatsAndConfig(): { stats: ServerStatsState; config: ServerConfigState } {
  const st = loadState();
  return { stats: st.stats, config: st.config };
}

export async function updateServerConfig(
  patch: Partial<ServerConfigState>,
  userToken?: string
): Promise<ServerConfigState> {
  const st = loadState();
  st.config = {
    ...st.config,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  saveState();
  await syncConfigToFirestore(userToken).catch(() => false);
  return st.config;
}
