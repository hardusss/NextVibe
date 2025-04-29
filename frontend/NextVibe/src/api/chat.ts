import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GetApiUrl from '../utils/url_api';

let ws: WebSocket | null = null;

export const connectWebSocket = (userId: number, onMessage: (data: any) => void) => {
  const wsUrl = GetApiUrl().replace('http', 'ws').replace(':8000', ':8001').replace('/api/v1', '');
  ws = new WebSocket(`${wsUrl}/ws/${userId}`);
  console.log('Connecting to WebSocket:', `${wsUrl}/ws/${userId}`);
  ws.onopen = () => {
    console.log('WebSocket Connected');
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onMessage(data);
  };

  ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };

  ws.onclose = () => {
    console.log('WebSocket disconnected');
    setTimeout(() => connectWebSocket(userId, onMessage), 5000);
  };
};

export const sendWebSocketMessage = (chatId: number, message: string) => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      chat_id: chatId,
      message: message
    }));
  }
};

export const getChats = async () => {
  const token = await AsyncStorage.getItem('access');
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
  const token = await AsyncStorage.getItem('access');
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

export const getMessages = async (chatId: number) => {
  const token = await AsyncStorage.getItem('access');
  try {
    const response = await axios.get(
      `${GetApiUrl()}/chat/messages/${chatId}/`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );
    return response.data;
  } catch (error) {
    return [];
  }
};
