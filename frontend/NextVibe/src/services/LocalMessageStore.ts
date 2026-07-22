import { storage } from '../utils/storage';

export interface LocalMessage {
  id: number | string;
  chat_id: number;
  sender_id: number;
  content: string;
  created_at: string;
  is_read?: boolean;
  reply_to_id?: number | null;
  edited_at?: string | null;
  deleted_at?: string | null;
}

const LOCAL_MESSAGES_KEY_PREFIX = 'local_messages_chat_';

class LocalMessageStore {
  private static instance: LocalMessageStore;

  private constructor() {}

  public static getInstance(): LocalMessageStore {
    if (!LocalMessageStore.instance) {
      LocalMessageStore.instance = new LocalMessageStore();
    }
    return LocalMessageStore.instance;
  }

  public async saveMessages(chatId: number, messages: LocalMessage[]): Promise<void> {
    try {
      const key = `${LOCAL_MESSAGES_KEY_PREFIX}${chatId}`;
      const existingStr = await storage.getItem(key);
      let existing: LocalMessage[] = existingStr ? JSON.parse(existingStr) : [];

      const map = new Map<string | number, LocalMessage>();
      existing.forEach((m) => map.set(m.id, m));
      messages.forEach((m) => map.set(m.id, m));

      const merged = Array.from(map.values()).sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      await storage.setItem(key, JSON.stringify(merged));
    } catch (err) {
      console.error('Error saving local messages:', err);
    }
  }

  public async getMessages(chatId: number): Promise<LocalMessage[]> {
    try {
      const key = `${LOCAL_MESSAGES_KEY_PREFIX}${chatId}`;
      const data = await storage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (err) {
      console.error('Error getting local messages:', err);
      return [];
    }
  }

  public async searchLocalMessages(chatId: number, query: string): Promise<LocalMessage[]> {
    if (!query.trim()) return [];
    const messages = await this.getMessages(chatId);
    const lowerQuery = query.toLowerCase();
    return messages.filter(
      (m) => m.content && !m.deleted_at && m.content.toLowerCase().includes(lowerQuery)
    );
  }
}

export default LocalMessageStore.getInstance();
