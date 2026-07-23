import axios from 'axios';
import GetApiUrl from '../utils/url_api';
import { storage } from '../utils/storage';
import WebSocketService from '../services/WebSocketService';

function getRealtimeBaseUrl(): string {
  return GetApiUrl()
    .replace("api", "realtime")
    .replace(":8000", ":8081")
    .replace("v1", "v2");
}

export const uploadMedia = async (chatId: number, file: { uri: string; type?: string; name?: string }) => {
  const token = await storage.getItem('access');
  try {
    const filename = file.name || file.uri.split('/').pop() || 'media_file.jpg';
    const contentType = file.type || (filename.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg');

    const res = await fetch(file.uri);
    const blob = await res.blob();
    const fileSize = blob.size || 1024;

    const urlResponse = await axios.post(
      `${getRealtimeBaseUrl()}/media/upload-url`,
      {
        chat_id: chatId,
        filename,
        content_type: contentType,
        file_size: fileSize
      },
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    const { upload_url, media_key, file_url } = urlResponse.data;

    // Upload directly to R2 off-socket
    await fetch(upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: blob
    });

    return { media_key, file_url };
  } catch (error) {
    console.error('Error uploading media off-socket:', error);
    throw error;
  }
};

export const sendWebSocketMessage = async (
  chatId: number,
  message: string,
  mediaFiles: any[] = [],
  replyToId?: number,
  clientMsgId?: string
) => {
  try {
    let mediaKeys: string[] = [];
    if (mediaFiles && mediaFiles.length > 0) {
      const uploadResults = await Promise.all(
        mediaFiles.map((file) => uploadMedia(chatId, file))
      );
      mediaKeys = uploadResults.map((r) => r.media_key);
    }
    
    WebSocketService.send({
      type: 'message',
      chat_id: chatId,
      message,
      reply_to_id: replyToId || null,
      client_msg_id: clientMsgId || null,
      media_keys: mediaKeys
    });
  } catch (error) {
    console.error('Error preparing media / sending message:', error);
    // Fallback send message without media if upload failed
    WebSocketService.send({
      type: 'message',
      chat_id: chatId,
      message,
      reply_to_id: replyToId || null,
      client_msg_id: clientMsgId || null
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
  WebSocketService.send({
    type: 'edit_message',
    chat_id: chatId,
    message_id: messageId,
    text
  });

  const token = await storage.getItem('access');
  try {
    await axios.patch(
      `${getRealtimeBaseUrl()}/messages/${messageId}`,
      { text },
      { headers: { Authorization: `Bearer ${token}` } }
    );
  } catch (err) {
    // Socket primary
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