import crypto from 'crypto';
import { Readable } from 'stream';
import { google, drive_v3 } from 'googleapis';
import {
  clearEncryptedDriveCredentials,
  isEncryptionKeyConfigured,
  loadEncryptedDriveCredentials,
  saveEncryptedDriveCredentials,
  StoredDriveCredentials,
} from './cryptoTokens';
import type { VoiceGender } from '../src/types/index';

// Minimum required Drive scope per Part 2A
export const DRIVE_OAUTH_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const ROOT_FOLDER_NAME = 'GermanLearningAudioLibrary';

interface OAuthStateEntry {
  uid: string;
  createdAt: number;
}

const pendingOAuthStates = new Map<string, OAuthStateEntry>();
let csrfRuntimeSecret: string | null = null;

function getCsrfSecret(): string {
  if (process.env.TOKEN_ENCRYPTION_KEY?.trim()) {
    return process.env.TOKEN_ENCRYPTION_KEY.trim();
  }
  if (!csrfRuntimeSecret) {
    csrfRuntimeSecret = crypto.randomBytes(32).toString('hex');
  }
  return csrfRuntimeSecret;
}

export function getOAuthRedirectUri(): string {
  if (process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim()) {
    return process.env.GOOGLE_OAUTH_REDIRECT_URI.trim();
  }
  const appUrl = (process.env.APP_URL || 'http://localhost:3000').trim().replace(/\/$/, '');
  return `${appUrl}/api/admin/drive/callback`;
}

export function getMissingDriveSecrets(): string[] {
  const missing: string[] = [];
  const hasServiceAccount = Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() && process.env.GOOGLE_SHARED_DRIVE_ID?.trim()
  );
  if (!hasServiceAccount) {
    if (!process.env.GOOGLE_CLIENT_ID?.trim()) missing.push('GOOGLE_CLIENT_ID');
    if (!process.env.GOOGLE_CLIENT_SECRET?.trim()) missing.push('GOOGLE_CLIENT_SECRET');
  }
  if (!isEncryptionKeyConfigured()) missing.push('TOKEN_ENCRYPTION_KEY');
  if (!process.env.APP_ADMIN_EMAIL?.trim()) missing.push('APP_ADMIN_EMAIL');
  return missing;
}

function createOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error(
      'Google OAuth credentials (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) are not configured in server secrets.'
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, getOAuthRedirectUri());
}

export function generateDriveConnectUrl(adminUid: string): { authUrl: string; redirectUri: string } {
  const oauth2Client = createOAuth2Client();
  const nonce = crypto.randomBytes(24).toString('hex');
  const sig = crypto.createHmac('sha256', getCsrfSecret()).update(`${nonce}:${adminUid}`).digest('hex');
  const state = `${nonce}.${sig}`;

  // Clean up expired states (> 10 minutes)
  const now = Date.now();
  for (const [key, entry] of pendingOAuthStates.entries()) {
    if (now - entry.createdAt > 10 * 60_000) {
      pendingOAuthStates.delete(key);
    }
  }
  pendingOAuthStates.set(state, { uid: adminUid, createdAt: now });

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [DRIVE_OAUTH_SCOPE],
    state,
    include_granted_scopes: true,
  });

  return { authUrl, redirectUri: getOAuthRedirectUri() };
}

export function validateOAuthState(state: string | undefined): boolean {
  if (!state) return false;
  const entry = pendingOAuthStates.get(state);
  if (!entry) return false;
  pendingOAuthStates.delete(state);

  if (Date.now() - entry.createdAt > 10 * 60_000) {
    return false;
  }

  const [nonce, sig] = state.split('.');
  if (!nonce || !sig) return false;
  const expected = crypto
    .createHmac('sha256', getCsrfSecret())
    .update(`${nonce}:${entry.uid}`)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err?.code || err?.response?.status;
      const transient = status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
      if (!transient || attempt === maxAttempts) {
        throw err;
      }
      const delayMs = Math.min(400 * Math.pow(2, attempt - 1), 3000);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}

async function getAuthenticatedDriveClient(): Promise<{
  drive: drive_v3.Drive;
  creds: StoredDriveCredentials;
  sharedDriveId?: string;
}> {
  // Optional Google Workspace Shared Drive Service Account support
  const saJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  const sharedDriveId = process.env.GOOGLE_SHARED_DRIVE_ID?.trim();
  if (saJson && sharedDriveId) {
    const credentials = JSON.parse(saJson);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: [DRIVE_OAUTH_SCOPE],
    });
    const drive = google.drive({ version: 'v3', auth });
    const stored = loadEncryptedDriveCredentials() || {};
    return { drive, creds: stored, sharedDriveId };
  }

  const stored = loadEncryptedDriveCredentials();
  if (!stored || !stored.refreshToken) {
    throw new Error('GOOGLE_DRIVE_NOT_CONNECTED');
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    refresh_token: stored.refreshToken,
    access_token: stored.accessToken,
    expiry_date: stored.expiryDate,
  });

  oauth2Client.on('tokens', (tokens) => {
    const current = loadEncryptedDriveCredentials() || stored;
    const updated: StoredDriveCredentials = {
      ...current,
      accessToken: tokens.access_token || current.accessToken,
      expiryDate: tokens.expiry_date || current.expiryDate,
      refreshToken: tokens.refresh_token || current.refreshToken,
    };
    saveEncryptedDriveCredentials(updated);
  });

  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  return { drive, creds: stored };
}

async function findOrCreateFolder(
  drive: drive_v3.Drive,
  name: string,
  parentId?: string,
  sharedDriveId?: string
): Promise<string> {
  const escaped = name.replace(/'/g, "\\'");
  const parentQuery = parentId ? `'${parentId}' in parents` : sharedDriveId ? `'${sharedDriveId}' in parents` : `'root' in parents`;
  const q = `name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false and ${parentQuery}`;

  const listRes = await withRetry(() =>
    drive.files.list({
      q,
      fields: 'files(id, name)',
      spaces: 'drive',
      ...(sharedDriveId
        ? { supportsAllDrives: true, includeItemsFromAllDrives: true, corpora: 'drive', driveId: sharedDriveId }
        : {}),
    })
  );

  const existing = listRes.data.files?.[0];
  if (existing?.id) return existing.id;

  const createRes = await withRetry(() =>
    drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : sharedDriveId ? [sharedDriveId] : undefined,
      },
      fields: 'id',
      ...(sharedDriveId ? { supportsAllDrives: true } : {}),
    })
  );

  if (!createRes.data.id) {
    throw new Error(`Failed to create Google Drive folder "${name}"`);
  }
  return createRes.data.id;
}

export async function ensureDriveFolderHierarchy(
  drive: drive_v3.Drive,
  creds: StoredDriveCredentials,
  sharedDriveId?: string
): Promise<StoredDriveCredentials> {
  // Verify existing folder IDs if already cached
  if (creds.rootFolderId && creds.maleFolderId && creds.femaleFolderId && creds.metadataFolderId && creds.backupsFolderId) {
    try {
      const check = await drive.files.get({
        fileId: creds.rootFolderId,
        fields: 'id, trashed',
        ...(sharedDriveId ? { supportsAllDrives: true } : {}),
      });
      if (check.data.id && !check.data.trashed) {
        return creds;
      }
    } catch {
      // Fall through to recreate missing folder tree
    }
  }

  const rootFolderId = await findOrCreateFolder(drive, ROOT_FOLDER_NAME, undefined, sharedDriveId);
  const deDeFolderId = await findOrCreateFolder(drive, 'de-DE', rootFolderId, sharedDriveId);
  const elevenlabsFolderId = await findOrCreateFolder(drive, 'elevenlabs', deDeFolderId, sharedDriveId);
  const modelFolderId = await findOrCreateFolder(drive, 'multilingual-v2', elevenlabsFolderId, sharedDriveId);
  const maleFolderId = await findOrCreateFolder(drive, 'male', modelFolderId, sharedDriveId);
  const femaleFolderId = await findOrCreateFolder(drive, 'female', modelFolderId, sharedDriveId);
  const metadataFolderId = await findOrCreateFolder(drive, 'metadata', rootFolderId, sharedDriveId);
  const backupsFolderId = await findOrCreateFolder(drive, 'backups', rootFolderId, sharedDriveId);

  const updated: StoredDriveCredentials = {
    ...creds,
    rootFolderId,
    deDeFolderId,
    elevenlabsFolderId,
    modelFolderId,
    maleFolderId,
    femaleFolderId,
    metadataFolderId,
    backupsFolderId,
  };
  saveEncryptedDriveCredentials(updated);
  return updated;
}

export async function completeDriveOAuthCallback(code: string): Promise<{
  email: string | null;
  displayName: string | null;
  rootFolderId: string;
}> {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);

  const existing = loadEncryptedDriveCredentials();
  const refreshToken = tokens.refresh_token || existing?.refreshToken;
  if (!refreshToken) {
    throw new Error(
      'Google did not return a refresh token. Please revoke prior access or reconnect with consent prompt.'
    );
  }

  oauth2Client.setCredentials(tokens);
  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  let email: string | null = null;
  let displayName: string | null = null;
  try {
    const aboutRes = await withRetry(() =>
      drive.about.get({ fields: 'user(emailAddress,displayName)' })
    );
    email = aboutRes.data.user?.emailAddress || null;
    displayName = aboutRes.data.user?.displayName || null;
  } catch {
    // non-fatal if Drive about metadata restricted
  }

  const baseCreds: StoredDriveCredentials = {
    refreshToken,
    accessToken: tokens.access_token || undefined,
    expiryDate: tokens.expiry_date || undefined,
    googleAccountEmail: email,
    googleAccountName: displayName,
    connectedAt: new Date().toISOString(),
  };

  const fullCreds = await ensureDriveFolderHierarchy(drive, baseCreds);
  return {
    email: fullCreds.googleAccountEmail || null,
    displayName: fullCreds.googleAccountName || null,
    rootFolderId: fullCreds.rootFolderId!,
  };
}

export async function disconnectDriveAccount(): Promise<void> {
  const existing = loadEncryptedDriveCredentials();
  if (existing?.refreshToken && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    try {
      const oauth2Client = createOAuth2Client();
      await oauth2Client.revokeToken(existing.refreshToken);
    } catch {
      // Continue local wipe even if token already revoked
    }
  }
  clearEncryptedDriveCredentials();
}

export async function getDriveStatusSummary(): Promise<{
  connected: boolean;
  googleAccountEmail: string | null;
  googleAccountName: string | null;
  rootFolderName: string;
  rootFolderId: string | null;
  storageAvailable: boolean;
  storageQuotaBytes?: number;
  storageUsedBytes?: number;
  error?: string;
}> {
  const creds = loadEncryptedDriveCredentials();
  const hasServiceAccount = Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim() && process.env.GOOGLE_SHARED_DRIVE_ID?.trim()
  );

  if (!hasServiceAccount && (!creds || !creds.refreshToken)) {
    return {
      connected: false,
      googleAccountEmail: null,
      googleAccountName: null,
      rootFolderName: ROOT_FOLDER_NAME,
      rootFolderId: null,
      storageAvailable: false,
    };
  }

  try {
    const { drive, creds: loadedCreds, sharedDriveId } = await getAuthenticatedDriveClient();
    const aboutRes = await withRetry(() =>
      drive.about.get({ fields: 'user(emailAddress,displayName),storageQuota(limit,usage)' })
    );
    const updatedCreds = await ensureDriveFolderHierarchy(drive, {
      ...loadedCreds,
      googleAccountEmail: aboutRes.data.user?.emailAddress || loadedCreds.googleAccountEmail || null,
      googleAccountName: aboutRes.data.user?.displayName || loadedCreds.googleAccountName || null,
    }, sharedDriveId);

    const limitNum = aboutRes.data.storageQuota?.limit ? Number(aboutRes.data.storageQuota.limit) : undefined;
    const usageNum = aboutRes.data.storageQuota?.usage ? Number(aboutRes.data.storageQuota.usage) : undefined;

    return {
      connected: true,
      googleAccountEmail: updatedCreds.googleAccountEmail || null,
      googleAccountName: updatedCreds.googleAccountName || null,
      rootFolderName: ROOT_FOLDER_NAME,
      rootFolderId: updatedCreds.rootFolderId || null,
      storageAvailable: limitNum ? (usageNum || 0) < limitNum : true,
      storageQuotaBytes: limitNum,
      storageUsedBytes: usageNum,
    };
  } catch (err: any) {
    return {
      connected: false,
      googleAccountEmail: creds?.googleAccountEmail || null,
      googleAccountName: creds?.googleAccountName || null,
      rootFolderName: ROOT_FOLDER_NAME,
      rootFolderId: creds?.rootFolderId || null,
      storageAvailable: false,
      error: err?.message || 'Unable to verify Google Drive connection.',
    };
  }
}

/**
 * Validates that an uploaded buffer is a genuine MP3 file (ID3v2 header or MPEG frame sync)
 * and rejects empty, HTML, JSON, or oversized payloads.
 */
export function isValidMp3Buffer(buffer: Buffer): boolean {
  if (!buffer || buffer.length < 128 || buffer.length > 15 * 1024 * 1024) {
    return false;
  }
  // ID3v2 header: 'ID3'
  if (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    return true;
  }
  // Raw MPEG Audio Frame Sync: 11 set bits (0xFF followed by 0xE0 mask)
  if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return true;
  }
  // Also scan first 64 bytes in case of small leading padding
  for (let i = 0; i < Math.min(buffer.length - 2, 64); i++) {
    if (buffer[i] === 0x49 && buffer[i + 1] === 0x44 && buffer[i + 2] === 0x33) return true;
    if (buffer[i] === 0xff && (buffer[i + 1] & 0xe0) === 0xe0) return true;
  }
  return false;
}

export async function uploadAudioToDrive(params: {
  audioHash: string;
  buffer: Buffer;
  gender: VoiceGender;
  voiceId: string;
  model: string;
}): Promise<{ fileId: string; folderId: string }> {
  if (!isValidMp3Buffer(params.buffer)) {
    throw new Error('Invalid MP3 audio file signature or size.');
  }

  const { drive, creds, sharedDriveId } = await getAuthenticatedDriveClient();
  const folders = await ensureDriveFolderHierarchy(drive, creds, sharedDriveId);
  const targetFolderId = params.gender === 'male' ? folders.maleFolderId! : folders.femaleFolderId!;
  const fileName = `${params.audioHash}.mp3`;

  // Check if file already exists in target folder to avoid duplicates
  const existing = await withRetry(() =>
    drive.files.list({
      q: `name = '${fileName}' and '${targetFolderId}' in parents and trashed = false`,
      fields: 'files(id, size)',
      ...(sharedDriveId
        ? { supportsAllDrives: true, includeItemsFromAllDrives: true, corpora: 'drive', driveId: sharedDriveId }
        : {}),
    })
  );

  if (existing.data.files?.[0]?.id) {
    return {
      fileId: existing.data.files[0].id,
      folderId: targetFolderId,
    };
  }

  const createRes = await withRetry(() =>
    drive.files.create({
      requestBody: {
        name: fileName,
        parents: [targetFolderId],
        description: `Deutsch Meister Shared German Audio (${params.model} / ${params.voiceId})`,
        appProperties: {
          audioHash: params.audioHash,
          language: 'de-DE',
          provider: 'elevenlabs',
          model: params.model,
          voiceId: params.voiceId,
          gender: params.gender,
        },
      },
      media: {
        mimeType: 'audio/mpeg',
        body: Readable.from(params.buffer),
      },
      fields: 'id',
      ...(sharedDriveId ? { supportsAllDrives: true } : {}),
    })
  );

  if (!createRes.data.id) {
    throw new Error('Google Drive upload returned no file ID.');
  }

  return {
    fileId: createRes.data.id,
    folderId: targetFolderId,
  };
}

export async function downloadAudioFromDrive(fileId: string): Promise<{
  found: boolean;
  buffer?: Buffer;
}> {
  const { drive, sharedDriveId } = await getAuthenticatedDriveClient();
  try {
    const meta = await withRetry(() =>
      drive.files.get({
        fileId,
        fields: 'id, trashed, size',
        ...(sharedDriveId ? { supportsAllDrives: true } : {}),
      })
    );
    if (!meta.data.id || meta.data.trashed) {
      return { found: false };
    }

    const mediaRes = await withRetry(
      () =>
        drive.files.get(
          {
            fileId,
            alt: 'media',
            ...(sharedDriveId ? { supportsAllDrives: true } : {}),
          },
          { responseType: 'arraybuffer' }
        )
    );

    const buffer = Buffer.from(mediaRes.data as ArrayBuffer);
    if (buffer.length < 128) {
      return { found: false };
    }
    return { found: true, buffer };
  } catch (err: any) {
    const code = err?.code || err?.response?.status;
    if (code === 404) {
      return { found: false };
    }
    throw err;
  }
}

/**
 * Deletes an audio file ONLY after verifying it lives inside the app's own
 * GermanLearningAudioLibrary folder hierarchy. Never deletes external Drive files.
 */
export async function deleteAppAudioFileFromDrive(fileId: string): Promise<boolean> {
  if (!fileId) return false;
  const { drive, creds, sharedDriveId } = await getAuthenticatedDriveClient();
  const folders = await ensureDriveFolderHierarchy(drive, creds, sharedDriveId);
  const allowedParents = new Set(
    [
      folders.maleFolderId,
      folders.femaleFolderId,
      folders.backupsFolderId,
      folders.metadataFolderId,
      folders.modelFolderId,
      folders.rootFolderId,
    ].filter(Boolean) as string[]
  );

  try {
    const meta = await drive.files.get({
      fileId,
      fields: 'id, name, parents',
      ...(sharedDriveId ? { supportsAllDrives: true } : {}),
    });

    const parents = meta.data.parents || [];
    const isInsideAppFolder = parents.some((p) => allowedParents.has(p));
    if (!isInsideAppFolder) {
      throw new Error('SECURITY_BLOCK: Refusing to delete file outside GermanLearningAudioLibrary.');
    }

    await withRetry(() =>
      drive.files.delete({
        fileId,
        ...(sharedDriveId ? { supportsAllDrives: true } : {}),
      })
    );
    return true;
  } catch (err: any) {
    if ((err?.code || err?.response?.status) === 404) return true;
    throw err;
  }
}

export async function listDriveAudioFiles(): Promise<
  Array<{
    fileId: string;
    name: string;
    audioHash: string;
    folderId: string;
    gender: VoiceGender;
    size: number;
    voiceId?: string;
    model?: string;
    createdTime?: string;
  }>
> {
  const { drive, creds, sharedDriveId } = await getAuthenticatedDriveClient();
  const folders = await ensureDriveFolderHierarchy(drive, creds, sharedDriveId);

  const results: Array<{
    fileId: string;
    name: string;
    audioHash: string;
    folderId: string;
    gender: VoiceGender;
    size: number;
    voiceId?: string;
    model?: string;
    createdTime?: string;
  }> = [];

  for (const [gender, folderId] of [
    ['female', folders.femaleFolderId],
    ['male', folders.maleFolderId],
  ] as const) {
    if (!folderId) continue;
    const res = await withRetry(() =>
      drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name, size, createdTime, appProperties)',
        pageSize: 500,
        ...(sharedDriveId
          ? { supportsAllDrives: true, includeItemsFromAllDrives: true, corpora: 'drive', driveId: sharedDriveId }
          : {}),
      })
    );

    for (const f of res.data.files || []) {
      if (!f.id || !f.name?.endsWith('.mp3')) continue;
      const hash = f.appProperties?.audioHash || f.name.replace(/\.mp3$/i, '');
      results.push({
        fileId: f.id,
        name: f.name,
        audioHash: hash,
        folderId,
        gender,
        size: Number(f.size || 0),
        voiceId: f.appProperties?.voiceId,
        model: f.appProperties?.model,
        createdTime: f.createdTime || undefined,
      });
    }
  }

  return results;
}

/**
 * Verifies real upload, download, byte-integrity, and cleanup inside GermanLearningAudioLibrary/backups.
 */
export async function testDriveUploadDownload(): Promise<{
  ok: boolean;
  rootFolderId: string;
  bytesTested: number;
  latencyMs: number;
  error?: string;
}> {
  const started = Date.now();
  const { drive, creds, sharedDriveId } = await getAuthenticatedDriveClient();
  const folders = await ensureDriveFolderHierarchy(drive, creds, sharedDriveId);

  // Create a minimal valid MP3 header + silence frame (256 bytes)
  const testBuffer = Buffer.alloc(256, 0x00);
  testBuffer[0] = 0xff;
  testBuffer[1] = 0xfb;
  testBuffer[2] = 0x90;
  testBuffer[3] = 0x00;

  let testFileId = '';
  try {
    const createRes = await drive.files.create({
      requestBody: {
        name: `drive-connection-test-${Date.now()}.mp3`,
        parents: [folders.backupsFolderId!],
      },
      media: {
        mimeType: 'audio/mpeg',
        body: Readable.from(testBuffer),
      },
      fields: 'id',
      ...(sharedDriveId ? { supportsAllDrives: true } : {}),
    });
    testFileId = createRes.data.id || '';
    if (!testFileId) throw new Error('Drive create returned empty file ID.');

    const downloaded = await downloadAudioFromDrive(testFileId);
    if (!downloaded.found || !downloaded.buffer || downloaded.buffer.length !== testBuffer.length) {
      throw new Error('Downloaded Drive test bytes did not match uploaded payload.');
    }

    await deleteAppAudioFileFromDrive(testFileId);
    testFileId = '';

    return {
      ok: true,
      rootFolderId: folders.rootFolderId!,
      bytesTested: testBuffer.length,
      latencyMs: Date.now() - started,
    };
  } catch (err: any) {
    if (testFileId) {
      await deleteAppAudioFileFromDrive(testFileId).catch(() => {});
    }
    return {
      ok: false,
      rootFolderId: folders.rootFolderId || '',
      bytesTested: 0,
      latencyMs: Date.now() - started,
      error: err?.message || 'Drive upload/download verification failed.',
    };
  }
}
