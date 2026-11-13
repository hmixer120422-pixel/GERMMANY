import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface StoredDriveCredentials {
  refreshToken?: string;
  accessToken?: string;
  expiryDate?: number;
  googleAccountEmail?: string | null;
  googleAccountName?: string | null;
  rootFolderId?: string | null;
  deDeFolderId?: string | null;
  elevenlabsFolderId?: string | null;
  modelFolderId?: string | null;
  maleFolderId?: string | null;
  femaleFolderId?: string | null;
  metadataFolderId?: string | null;
  backupsFolderId?: string | null;
  connectedAt?: string;
}

const DATA_DIR = path.resolve(process.cwd(), '.server-data');
const TOKEN_FILE = path.join(DATA_DIR, 'drive-tokens.enc');

let ephemeralFallbackKey: Buffer | null = null;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  }
}

export function isEncryptionKeyConfigured(): boolean {
  const raw = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  return Boolean(raw && raw.length >= 16);
}

function getDerivedKey(): Buffer {
  const configured = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (configured && configured.length >= 16) {
    return crypto.createHash('sha256').update(configured).digest();
  }
  if (!ephemeralFallbackKey) {
    ephemeralFallbackKey = crypto.randomBytes(32);
  }
  return ephemeralFallbackKey;
}

export function saveEncryptedDriveCredentials(data: StoredDriveCredentials): void {
  ensureDataDir();
  const key = getDerivedKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(data), 'utf8');
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const envelope = {
    v: 1,
    alg: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: authTag.toString('base64'),
    data: encrypted.toString('base64'),
  };

  fs.writeFileSync(TOKEN_FILE, JSON.stringify(envelope), { mode: 0o600 });
}

export function loadEncryptedDriveCredentials(): StoredDriveCredentials | null {
  try {
    if (!fs.existsSync(TOKEN_FILE)) return null;
    const raw = fs.readFileSync(TOKEN_FILE, 'utf8');
    const envelope = JSON.parse(raw);
    if (!envelope || envelope.v !== 1 || !envelope.iv || !envelope.tag || !envelope.data) {
      return null;
    }

    const key = getDerivedKey();
    const iv = Buffer.from(envelope.iv, 'base64');
    const tag = Buffer.from(envelope.tag, 'base64');
    const ciphertext = Buffer.from(envelope.data, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8')) as StoredDriveCredentials;
  } catch {
    // Key changed or corrupted token file
    return null;
  }
}

export function clearEncryptedDriveCredentials(): void {
  try {
    if (fs.existsSync(TOKEN_FILE)) {
      fs.unlinkSync(TOKEN_FILE);
    }
  } catch {
    // ignore unlink failure
  }
}
