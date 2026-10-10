import { SavedTranscription } from '../types/transcription.js';

export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

const STORAGE_KEY = 'union_erp_audio_transcriptions';

function getLocalTranscriptions(): SavedTranscription[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.warn('[TranscriptionStorage] Error loading from localStorage:', err);
    return [];
  }
}

function setLocalTranscriptions(items: SavedTranscription[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.warn('[TranscriptionStorage] Error saving to localStorage:', err);
  }
}

export async function testFirestoreConnection(): Promise<boolean> {
  return true;
}

export function subscribeToAuth(callback: (user: User | null) => void) {
  const localUser: User = {
    uid: 'local-operator',
    email: 'operator@union-erp.local',
    displayName: 'مشغل استوديو الصوت',
    photoURL: null,
  };
  callback(localUser);
  return () => {};
}

export async function signInWithGoogle(): Promise<User> {
  const localUser: User = {
    uid: 'google-user-' + Date.now(),
    email: 'user@google.com',
    displayName: 'مستخدم متصل',
    photoURL: null,
  };
  return localUser;
}

export async function logOut(): Promise<void> {
  // Local logout handler
}

export async function saveTranscriptionToFirestore(
  userId: string,
  data: {
    smartText: string;
    verbatimText: string;
    durationSeconds: number;
    wordCount: number;
    language?: string;
    summary?: string;
    source?: 'live' | 'file' | 'voice_live';
  }
): Promise<string> {
  const items = getLocalTranscriptions();
  const id = 'transcription_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const newItem: SavedTranscription = {
    id,
    userId,
    ...data,
    createdAt: new Date().toISOString(),
  };
  items.unshift(newItem);
  setLocalTranscriptions(items);
  return id;
}

export async function getUserTranscriptions(userId: string): Promise<SavedTranscription[]> {
  const items = getLocalTranscriptions();
  return items.filter((item) => !item.userId || item.userId === userId || userId === 'local-operator');
}

export async function deleteTranscriptionFromFirestore(userId: string, transcriptionId: string): Promise<void> {
  const items = getLocalTranscriptions();
  const filtered = items.filter((item) => item.id !== transcriptionId);
  setLocalTranscriptions(filtered);
}

export async function saveChatMessage(
  _userId: string,
  _message: {
    role: 'user' | 'model';
    content: string;
    modelUsed?: string;
    groundingMetadata?: string;
  }
): Promise<string> {
  return 'msg_' + Date.now();
}
