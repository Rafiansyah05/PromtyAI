import { StorageSchema } from './schema';

class ExtensionStorage {
  async get<K extends keyof StorageSchema>(key: K): Promise<StorageSchema[K] | null> {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        resolve(result[key] ?? null);
      });
    });
  }

  async set<K extends keyof StorageSchema>(key: K, value: StorageSchema[K]): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  }

  async remove(key: string): Promise<void> {
    return new Promise((resolve) => {
      chrome.storage.local.remove(key, resolve);
    });
  }
}

export const storage = new ExtensionStorage();
