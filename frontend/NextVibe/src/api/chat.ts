import axios from 'axios';
import GetApiUrl from '../utils/url_api';
import { storage } from '../utils/storage';
import WebSocketService from '../services/WebSocketService';
import CryptoService from '../services/CryptoService';

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

export const prepareMediaForSocket = async (file: {
  uri: string;
  type?: string;
  mimeType?: string;
  name?: string;
  fileName?: string;
}) => {
  const filename = file.fileName || file.name || file.uri.split('/').pop() || 'media_file.jpg';
  let contentType = file.mimeType || file.type;

  if (!contentType || contentType === 'image' || contentType === 'video') {
    const ext = filename.split('.').pop()?.toLowerCase();
    if (ext === 'png') contentType = 'image/png';
    else if (ext === 'gif') contentType = 'image/gif';
    else if (ext === 'webp') contentType = 'image/webp';
    else if (ext === 'mp4' || ext === 'mov') contentType = 'video/mp4';
    else contentType = 'image/jpeg';
  }

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

export const sendWebSocketMessage = async (
  chatId: number,
  message: string,
  mediaFiles: any[] = [],
  replyToId?: number,
  clientMsgId?: string,
  targetUserId?: number,
  onProgress?: (progressPercent: number, statusText?: string) => void
) => {
  try {
    let preparedMedia: any[] = [];
    if (mediaFiles && mediaFiles.length > 0) {
      const totalFiles = mediaFiles.length;
      if (onProgress) onProgress(10, `Processing 1 of ${totalFiles} files...`);

      preparedMedia = [];
      for (let i = 0; i < mediaFiles.length; i++) {
        const file = mediaFiles[i];
        const mediaData = await prepareMediaForSocket(file);
        preparedMedia.push(mediaData);

        const stepProgress = Math.round(10 + ((i + 1) / totalFiles) * 75);
        if (onProgress) {
          onProgress(stepProgress, `Processing ${i + 1} of ${totalFiles} (${stepProgress}%)`);
        }
      }
    }

    if (onProgress) onProgress(90, 'Encrypting & sending...');

    let finalPayload = message;
    if (message && message.trim()) {
      try {
        const currentUserIdStr = await storage.getItem('id');
        const currentUserId = currentUserIdStr ? Number(currentUserIdStr) : 0;
        const envelope = await CryptoService.encryptMessage(currentUserId, targetUserId || 0, message.trim());
        finalPayload = JSON.stringify(envelope);
      } catch (encryptErr) {
        console.warn('[E2EE] Encryption fallback warning:', encryptErr);
      }
    }

    WebSocketService.send({
      type: 'message',
      chat_id: chatId,
      message: finalPayload,
      reply_to_id: replyToId || null,
      client_msg_id: clientMsgId || null,
      media: preparedMedia,
    });

    if (onProgress) onProgress(100, 'Sent');
  } catch (error) {
    console.error('Error preparing media / sending message:', error);
    WebSocketService.send({
      type: 'message',
      chat_id: chatId,
      message,
      reply_to_id: replyToId || null,
      client_msg_id: clientMsgId || null,
    });
  }
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

export const editMessage = async (chatId: number, messageId: number, text: string) => {
  if (!messageId || isNaN(messageId) || messageId <= 0) {
    throw new Error('Invalid message ID');
  }

  WebSocketService.send({
    type: 'edit_message',
    chat_id: chatId,
    message_id: messageId,
    text
  });

  const token = await storage.getItem('access');
  try {
    const res = await axios.patch(
      `${getRealtimeBaseUrl()}/messages/${messageId}`,
      { text },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data;
  } catch (err: any) {
    if (err?.response) {
      throw err;
    }
    console.warn('[editMessage] REST fallback failed:', err);
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