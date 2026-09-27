import axios from 'axios';
import GetApiUrl from '../utils/url_api';
import { storage } from '../utils/storage';
import WebSocketService from '../services/WebSocketService';
import CryptoService from '../services/CryptoService';
import type { MediaKey } from '../services/e2ee/core';
import { extensionFor, sealFile } from '../services/e2ee/media';

function getRealtimeBaseUrl(): string {
  return GetApiUrl()
    .replace("api", "realtime")
    .replace(":8000", ":8081")
    .replace("v1", "v2");
}

export const convertFileToBase64 = async (uri: string): Promise<string> => {
  const response = await fetch(uri);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = (err) => reject(err);
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
};

type LocalMedia = {
  uri: string;
  type?: string;
  mimeType?: string;
  name?: string;
  fileName?: string;
};

const mediaFileName = (file: LocalMedia) => file.fileName || file.name || file.uri.split('/').pop() || 'media_file.jpg';

/** image/jpeg, video/mp4…, from the picker's type or the file name. */
export const mediaContentType = (file: LocalMedia): string => {
  let contentType = file.mimeType || file.type;
  if (!contentType || contentType === 'image' || contentType === 'video') {
    const ext = mediaFileName(file).split('.').pop()?.toLowerCase();
    if (ext === 'png') contentType = 'image/png';
    else if (ext === 'gif') contentType = 'image/gif';
    else if (ext === 'webp') contentType = 'image/webp';
    else if (ext === 'mp4' || ext === 'mov') contentType = 'video/mp4';
    else contentType = file.type === 'video' ? 'video/mp4' : 'image/jpeg';
  }
  return contentType;
};

export const prepareMediaForSocket = async (file: LocalMedia) => {
  const filename = mediaFileName(file);
  const contentType = mediaContentType(file);

  const base64Data = await convertFileToBase64(file.uri);
  return {
    data: base64Data,
    type: contentType,
    name: filename,
  };
};

export const uploadMedia = async (
  chatId: number,
  file: { uri: string; type?: string; mimeType?: string; name?: string; fileName?: string }
) => {
  return prepareMediaForSocket(file);
};

/**
 * Text and media as the server stores them: end-to-end encrypted (v3, media
 * sealed on the phone) when the other person's app has a device key, else the
 * older format their app can read. If v3 fails, the older format is used.
 */
async function sealForChat(
  mode: 'v3' | 'legacy',
  currentUserId: number,
  targetUserId: number,
  text: string,
  mediaFiles: LocalMedia[],
  onProgress?: (progressPercent: number, statusText?: string) => void
) {
  const media: { data: string; type: string; name: string }[] = [];
  const keys: MediaKey[] = [];
  for (let i = 0; i < mediaFiles.length; i++) {
    const file = mediaFiles[i];
    if (mode === 'v3') {
      const type = mediaContentType(file);
      const sealed = await sealFile(file.uri, type);
      media.push({ data: sealed.data, type, name: `media.${extensionFor(type)}` });
      keys.push(sealed.key);
    } else {
      media.push(await prepareMediaForSocket(file));
    }
    if (onProgress) {
      const step = Math.round(10 + ((i + 1) / mediaFiles.length) * 75);
      onProgress(step, `Processing ${i + 1} of ${mediaFiles.length} (${step}%)`);
    }
  }

  let message = text;
  if (mode === 'v3') {
    message = await CryptoService.sealText(currentUserId, targetUserId, text, keys, 'v3');
  } else if (text) {
    message = await CryptoService.sealText(currentUserId, targetUserId, text, undefined, 'legacy');
  }
  return { message, media };
}

export const sendWebSocketMessage = async (
  chatId: number,
  message: string,
  mediaFiles: any[] = [],
  replyToId?: number,
  clientMsgId?: string,
  targetUserId?: number,
  onProgress?: (progressPercent: number, statusText?: string) => void
) => {
  const text = (message || '').trim();
  const files: LocalMedia[] = mediaFiles || [];
  const currentUserId = Number(await storage.getItem('id')) || 0;
  const target = targetUserId || 0;
  if (onProgress && files.length > 0) onProgress(10, `Processing 1 of ${files.length} files...`);

  let sealed: { message: string; media: any[] };
  try {
    const mode = await CryptoService.mode(currentUserId, target);
    sealed = await sealForChat(mode, currentUserId, target, text, files, onProgress);
  } catch (error) {
    console.warn('[E2EE] v3 failed, sending in the older format:', error);
    sealed = await sealForChat('legacy', currentUserId, target, text, files, onProgress);
  }

  if (onProgress) onProgress(90, 'Sending...');
  WebSocketService.send({
    type: 'message',
    chat_id: chatId,
    message: sealed.message,
    reply_to_id: replyToId || null,
    client_msg_id: clientMsgId || null,
    media: sealed.media,
  });
  if (onProgress) onProgress(100, 'Sent');
};

export const notifyEnterChat = (chatId: number) => {
  WebSocketService.send({
    type: 'enter_chat',
    chat_id: chatId,
    timestamp: new Date().toISOString()
  });
};

export const markChatAsRead = async (chatId: number) => {
  if (!chatId) return;

  // 1. Immediate WebSocket notification
  notifyEnterChat(chatId);

  // 2. Guaranteed REST database persistence
  try {
    const token = await storage.getItem('access');
    await axios.post(
      `${getRealtimeBaseUrl()}/messages/chat/${chatId}/read`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (err) {
    // Silent fallback catch
  }
};

export const sendTypingStart = (chatId: number) => {
  WebSocketService.send({
    type: 'typing_start',
    chat_id: chatId
  });
};

export const sendTypingStop = (chatId: number) => {
  WebSocketService.send({
    type: 'typing_stop',
    chat_id: chatId
  });
};

export const addReaction = async (chatId: number, messageId: number, emoji: string) => {
  const numChatId = Number(chatId);
  const numMsgId = Number(messageId);

  WebSocketService.send({
    type: 'reaction_add',
    chat_id: numChatId,
    message_id: numMsgId,
    emoji
  });

  const token = await storage.getItem('access');
  try {
    await axios.post(
      `${getRealtimeBaseUrl()}/messages/${numMsgId}/reactions`,
      { emoji },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (err) {
    // Socket is primary, REST is fallback
  }
};

export const removeReaction = async (chatId: number, messageId: number, emoji: string) => {
  const numChatId = Number(chatId);
  const numMsgId = Number(messageId);

  WebSocketService.send({
    type: 'reaction_remove',
    chat_id: numChatId,
    message_id: numMsgId,
    emoji
  });

  const token = await storage.getItem('access');
  try {
    await axios.delete(
      `${getRealtimeBaseUrl()}/messages/${numMsgId}/reactions/${encodeURIComponent(emoji)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (err) {
    // Socket is primary, REST is fallback
  }
};

/** `mediaKeys`: the keys of the message's encrypted photos and videos, so they stay viewable. */
export const editMessage = async (chatId: number, messageId: number, text: string, targetUserId?: number, mediaKeys?: MediaKey[]) => {
  if (!messageId || isNaN(messageId) || messageId <= 0) {
    throw new Error('Invalid message ID');
  }

  let finalPayload = text;
  if (text && text.trim()) {
    const currentUserId = Number(await storage.getItem('id')) || 0;
    const target = targetUserId || 0;
    const mode = mediaKeys?.length ? 'v3' : await CryptoService.mode(currentUserId, target);
    finalPayload = await CryptoService.sealText(currentUserId, target, text.trim(), mediaKeys, mode);
  }

  WebSocketService.send({
    type: 'edit_message',
    chat_id: chatId,
    message_id: messageId,
    text: finalPayload
  });

  const token = await storage.getItem('access');
  try {
    const res = await axios.patch(
      `${getRealtimeBaseUrl()}/messages/${messageId}`,
      { text: finalPayload },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data;
  } catch (err: any) {
    if (err?.response) {
      throw err;
    }
    console.warn('[editMessage] REST fallback warning:', err);
  }
};

export const deleteMessage = async (chatId: number, messageId: number) => {
  WebSocketService.send({
    type: 'delete_message',
    chat_id: chatId,
    message_id: messageId
  });

  const token = await storage.getItem('access');
  try {
    await axios.delete(
      `${getRealtimeBaseUrl()}/messages/${messageId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (err) {
    // Socket primary
  }
};

export const getUnreadMessagesCount = async (): Promise<number> => {
  const token = await storage.getItem('access');
  try {
    const response = await axios.get(`${GetApiUrl()}/chat/unread-count/`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    return response.data?.count ?? 0;
  } catch (error) {
    return 0;
  }
};

export const getChats = async () => {
  const token = await storage.getItem('access');
  try {
    const response = await axios.get(`${GetApiUrl()}/chat/chats/`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching chats:', error);
    return [];
  }
};

export const getOnlineUsers = async () => {
  const token = await storage.getItem('access');
  try {
    const response = await axios.get(`${GetApiUrl()}/chat/online-users/`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching online users:', error);
    return [];
  }
};

export const getMessages = async (chatId: number, lastMessageId?: number) => {
  const token = await storage.getItem('access');
  const user_id = await storage.getItem("id");
  
  try {
    const url = lastMessageId 
      ? `${getRealtimeBaseUrl()}/messages/${chatId}?last_message_id=${lastMessageId}&user_id=${user_id}`
      : `${getRealtimeBaseUrl()}/messages/${chatId}?user_id=${user_id}`;
    
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching messages:', error);
    return [];
  }
};

export const deleteChat = async (chatId: number): Promise<boolean> => {
  const token = await storage.getItem('access');
  try {
    const response = await axios.delete(`${GetApiUrl()}/chat/delete-chat/${chatId}/`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    return response.status === 200;
  } catch (error) {
    console.error('Error deleting chat:', error);
    return false;
  }
};

export interface CherryTokenResponse {
  token: string | null;
  wallet_address: string | null;
  wallet_required?: boolean;
}

export const getCherryEmbedToken = async (): Promise<CherryTokenResponse> => {
  const token = await storage.getItem('access');
  try {
    const rawApiUrl = GetApiUrl();
    const baseUrl = rawApiUrl.endsWith('/v1') ? rawApiUrl.slice(0, -3) : rawApiUrl;
    const response = await axios.post(`${baseUrl}/cherry-embed-token`, {}, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    return {
      token: response.data?.token || null,
      wallet_address: response.data?.wallet_address || null,
      wallet_required: false,
    };
  } catch (error: any) {
    if (error?.response?.data?.error === 'wallet_required') {
      return { token: null, wallet_address: null, wallet_required: true };
    }
    console.error('Error fetching Cherry embed token:', error);
    return { token: null, wallet_address: null, wallet_required: false };
  }
};

export const getCherryMembers = async () => {
  const token = await storage.getItem('access');
  try {
    const rawApiUrl = GetApiUrl();
    const baseUrl = rawApiUrl.endsWith('/v1') ? rawApiUrl.slice(0, -3) : rawApiUrl;
    const response = await axios.get(`${baseUrl}/cherry-members`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    return response.data?.members || [];
  } catch (error) {
    console.error('Error fetching Cherry group members:', error);
    return [];
  }
};

export const getCherryMuteStatus = async (): Promise<boolean> => {
  const token = await storage.getItem('access');
  try {
    const rawApiUrl = GetApiUrl();
    const baseUrl = rawApiUrl.endsWith('/v1') ? rawApiUrl.slice(0, -3) : rawApiUrl;
    const response = await axios.get(`${baseUrl}/cherry-mute`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    return !!response.data?.is_muted;
  } catch (error) {
    console.error('Error fetching Cherry mute status:', error);
    return false;
  }
};

export const toggleCherryMute = async (isMuted?: boolean): Promise<boolean> => {
  const token = await storage.getItem('access');
  try {
    const rawApiUrl = GetApiUrl();
    const baseUrl = rawApiUrl.endsWith('/v1') ? rawApiUrl.slice(0, -3) : rawApiUrl;
    const response = await axios.post(
      `${baseUrl}/cherry-mute`,
      { is_muted: isMuted },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    return !!response.data?.is_muted;
  } catch (error) {
    console.error('Error toggling Cherry mute status:', error);
    return false;
  }
};

export const triggerCherryMessageNotification = async (messageData: any) => {
  try {
    const token = await storage.getItem('access');
    const rawApiUrl = GetApiUrl();
    const baseUrl = rawApiUrl.endsWith('/v1') ? rawApiUrl.slice(0, -3) : rawApiUrl;
    await axios.post(
      `${baseUrl}/cherry-webhook`,
      {
        event: 'message.created',
        payload: messageData,
      },
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );
  } catch (error) {
    console.error('Error triggering Cherry push notification:', error);
  }
};