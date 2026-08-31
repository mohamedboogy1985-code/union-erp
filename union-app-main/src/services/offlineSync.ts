import { OfflineQueueItem, SyncStatus } from '../types/erp.js';
import { api } from './api.js';

const OFFLINE_QUEUE_KEY = 'union_erp_offline_queue_v1';

type StatusListener = (status: SyncStatus, pendingCount: number) => void;

class OfflineSyncManager {
  private queue: OfflineQueueItem[] = [];
  private status: SyncStatus = navigator.onLine ? 'ONLINE' : 'OFFLINE';
  private listeners: Set<StatusListener> = new Set();
  private isSyncing = false;

  constructor() {
    this.loadQueue();
    this.setupEventListeners();
  }

  private loadQueue() {
    try {
      const saved = localStorage.getItem(OFFLINE_QUEUE_KEY);
      if (saved) {
        this.queue = JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to read offline queue from localStorage', e);
      this.queue = [];
    }
  }

  private saveQueue() {
    try {
      localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(this.queue));
    } catch (e) {
      console.warn('Failed to save offline queue to localStorage', e);
    }
    this.notifyListeners();
  }

  private setupEventListeners() {
    window.addEventListener('online', () => {
      this.status = 'ONLINE';
      this.notifyListeners();
      this.syncQueueNow();
    });

    window.addEventListener('offline', () => {
      this.status = 'OFFLINE';
      this.notifyListeners();
    });

    // Periodic sync attempt if online
    setInterval(() => {
      if (navigator.onLine && this.getPendingCount() > 0 && !this.isSyncing) {
        this.syncQueueNow();
      }
    }, 15000);
  }

  public subscribe(listener: StatusListener) {
    this.listeners.add(listener);
    listener(this.status, this.getPendingCount());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners() {
    const count = this.getPendingCount();
    this.listeners.forEach((fn) => fn(this.status, count));
  }

  public getStatus(): SyncStatus {
    return this.status;
  }

  public getPendingCount(): number {
    return this.queue.filter((q) => q.status === 'PENDING').length;
  }

  public getQueue(): OfflineQueueItem[] {
    return [...this.queue];
  }

  /**
   * Enqueue a financial action to be executed offline or synchronized later
   */
  public enqueueAction(operation: OfflineQueueItem['operation'], endpoint: string, payload: any): OfflineQueueItem {
    const item: OfflineQueueItem = {
      id: `offline-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      operation,
      endpoint,
      payload,
      createdAt: new Date().toISOString(),
      status: 'PENDING',
      retryCount: 0,
    };

    this.queue.push(item);
    this.saveQueue();

    // If currently online, try syncing immediately
    if (navigator.onLine) {
      this.syncQueueNow();
    }

    return item;
  }

  public enqueue(operation: OfflineQueueItem['operation'], payload: any): OfflineQueueItem {
    const endpoint =
      operation === 'CREATE_JOURNAL'
        ? '/api/journal-entries'
        : operation === 'CREATE_RECEIPT'
        ? '/api/receipts'
        : '/api/members';
    return this.enqueueAction(operation, endpoint, payload);
  }

  /**
   * Synchronize all pending items to the server
   */
  public async syncQueueNow(): Promise<{ synced: number; failed: number }> {
    if (this.isSyncing) return { synced: 0, failed: 0 };
    if (!navigator.onLine) {
      this.status = 'OFFLINE';
      this.notifyListeners();
      return { synced: 0, failed: 0 };
    }

    this.isSyncing = true;
    this.status = 'SYNCING';
    this.notifyListeners();

    let synced = 0;
    let failed = 0;

    for (const item of this.queue) {
      if (item.status === 'PENDING') {
        try {
          if (item.operation === 'CREATE_JOURNAL') {
            await api.createJournalEntry(item.payload);
          } else if (item.operation === 'CREATE_RECEIPT') {
            await api.createReceipt(item.payload);
          } else if (item.operation === 'CREATE_MEMBER') {
            await api.createMember(item.payload);
          }

          item.status = 'SYNCED';
          synced++;
        } catch (err: any) {
          item.retryCount = (item.retryCount || 0) + 1;
          item.error = err.message || 'فشل الاتصال بالخادم المركزي';
          if (item.retryCount >= 5) {
            item.status = 'FAILED';
          }
          failed++;
        }
      }
    }

    this.isSyncing = false;
    this.status = navigator.onLine ? 'ONLINE' : 'OFFLINE';
    this.saveQueue();

    return { synced, failed };
  }

  /**
   * Clear completed synced items from memory
   */
  public clearCompleted() {
    this.queue = this.queue.filter((q) => q.status === 'PENDING');
    this.saveQueue();
  }

  /**
   * Export offline backup for Electron or desktop emergency extraction
   */
  public exportOfflineBackup(): string {
    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        totalItems: this.queue.length,
        items: this.queue,
      },
      null,
      2
    );
  }

  /**
   * Delete specific queue item
   */
  public removeQueueItem(id: string) {
    this.queue = this.queue.filter((q) => q.id !== id);
    this.saveQueue();
  }
}

export const offlineSync = new OfflineSyncManager();
