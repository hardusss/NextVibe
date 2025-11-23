import axios from 'axios';
import { storage } from '../utils/storage';
import GetApiUrl from '../utils/url_api';

let ws: WebSocket | null = null;

export const connectWebSocket = async (onMessage: (data: any) => void) => {
  const token = await storage.getItem('access');
  if (!token) throw new Error('No access token found');

  const wsUrl = GetApiUrl()
    .replace('http', 'ws')
    .replace(':8000', ':8081')
    .replace('/api/v1', '');

  if (!ws?.OPEN){
    ws = new WebSocket(`${wsUrl}/ws?token=${token}`); 
  }

  ws.onopen = () => console.log('WebSocket connected');

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onMessage(data);
  };

  ws.onerror = (error) => console.error('WebSocket error:', error);

};

export const sendWebSocketMessage = async (chatId: number, message: string, mediaFiles: any[] = []) => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      const media = await Promise.all(mediaFiles.map(async (file) => {
        const response = await fetch(file.uri);
        const blob = await response.blob();

        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64data = (reader.result as string).split(',')[1];
            resolve({
              data: base64data,
              type: file.type || 'image/jpeg',
              name: file.uri.split('/').pop() || 'image.jpg'
            });
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }));

      ws.send(JSON.stringify({
        chat_id: chatId,
        message,
        media
      }));
    } catch (error) {
      console.error('Error preparing media:', error);
    }
  }
};

export const sendReadStatus = (chatId: number) => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'read_status',
      chat_id: chatId
    }));
  }
};

export const notifyEnterChat = (chatId: number) => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'enter_chat',
      chat_id: chatId,
      timestamp: new Date().toISOString()
    }));
  }
};
export const getWebSocket = () => ws;

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
  const user_id = await storage.getItem("id")
  try {
    const url = lastMessageId 
      ? `${GetApiUrl().replace(":8000", ":8081")}/messages/${chatId}?last_message_id=${lastMessageId}&user_id=${user_id}`
      : `${GetApiUrl().replace(":8000", ":8081")}/messages/${chatId}?user_id=${user_id}`;
      
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    return response.data;
  } catch (error) {
    return [];
  }
};

export const deleteChat = async (chatId: number): Promise<boolean>  => {
  const token = await storage.getItem('access');
  try {
    const response = await axios.delete(`${GetApiUrl()}/chat/delete-chat/${chatId}/`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    return response.status === 200; 
  } catch (error) {
    return false;
  }
}