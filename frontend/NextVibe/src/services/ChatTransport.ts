import WebSocketService from './WebSocketService';
import LocalMessageStore from './LocalMessageStore';

export type TransportType = 'p2p' | 'server';

export interface RTCConfiguration {
  iceServers: Array<{ urls: string | string[] }>;
}

export interface ChatTransportListener {
  onTransportStateChange: (chatId: number, transport: TransportType) => void;
  onMessageReceived: (message: any) => void;
}

class ChatTransportManager {
  private static instance: ChatTransportManager;
  private p2pConnections: Map<string, any> = new Map(); // key: `chat_${chatId}_user_${userId}`
  private activeTransports: Map<number, TransportType> = new Map(); // chatId -> 'p2p' | 'server'
  private listeners: Set<ChatTransportListener> = new Set();
  
  private readonly defaultIceServers: RTCConfiguration = {
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
    ]
  };

  private constructor() {
    this.setupWebSocketListeners();
  }

  public static getInstance(): ChatTransportManager {
    if (!ChatTransportManager.instance) {
      ChatTransportManager.instance = new ChatTransportManager();
    }
    return ChatTransportManager.instance;
  }

  public addListener(listener: ChatTransportListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getActiveTransport(chatId: number): TransportType {
    return this.activeTransports.get(chatId) || 'server';
  }

  private setTransportState(chatId: number, transport: TransportType) {
    this.activeTransports.set(chatId, transport);
    this.listeners.forEach((l) => l.onTransportStateChange(chatId, transport));
  }

  /**
   * Listen to WS for WebRTC signaling events from peers
   */
  private setupWebSocketListeners() {
    WebSocketService.addListener((data: any) => {
      if (!data || !data.type) return;

      if (data.type === 'webrtc_offer') {
        this.handleRemoteOffer(data);
      } else if (data.type === 'webrtc_answer') {
        this.handleRemoteAnswer(data);
      } else if (data.type === 'webrtc_ice_candidate') {
        this.handleRemoteIceCandidate(data);
      } else if (data.type === 'message') {
        // Cache decrypted/received message into local store
        LocalMessageStore.saveMessages(data.chat_id, [
          {
            id: data.server_msg_id || data.message_id || data.client_msg_id,
            chat_id: data.chat_id,
            sender_id: data.sender_id,
            content: data.content,
            created_at: data.created_at || new Date().toISOString(),
            reply_to_id: data.reply_to_id,
            edited_at: data.edited_at,
            deleted_at: data.deleted_at
          }
        ]);
        this.listeners.forEach((l) => l.onMessageReceived(data));
      }
    });
  }

  /**
   * Initialize P2P connection attempt with target user for chat
   */
  public async initP2PConnection(chatId: number, targetUserId: number): Promise<boolean> {
    const key = `chat_${chatId}_user_${targetUserId}`;
    try {
      // In React Native JS environment, if native RTCPeerConnection is available or fallback
      if (typeof window !== 'undefined' && 'RTCPeerConnection' in window) {
        const pc = new (window as any).RTCPeerConnection(this.defaultIceServers);
        const dataChannel = pc.createDataChannel('nextvibe-p2p-chat');
        
        this.setupDataChannelEvents(chatId, targetUserId, dataChannel);
        this.p2pConnections.set(key, { pc, dataChannel });

        pc.onicecandidate = (event: any) => {
          if (event.candidate) {
            WebSocketService.send({
              type: 'webrtc_ice_candidate',
              chat_id: chatId,
              target_user_id: targetUserId,
              candidate: event.candidate
            });
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        WebSocketService.send({
          type: 'webrtc_offer',
          chat_id: chatId,
          target_user_id: targetUserId,
          sdp: offer
        });

        // 5s fallback timeout threshold
        setTimeout(() => {
          if (this.getActiveTransport(chatId) !== 'p2p') {
            this.setTransportState(chatId, 'server');
          }
        }, 5000);

        return true;
      }
    } catch (err) {
      console.warn('P2P initialization fallback to server relay:', err);
    }
    
    this.setTransportState(chatId, 'server');
    return false;
  }

  private async handleRemoteOffer(data: any) {
    const { chat_id, sender_user_id, sdp } = data;
    const key = `chat_${chat_id}_user_${sender_user_id}`;

    try {
      if (typeof window !== 'undefined' && 'RTCPeerConnection' in window) {
        const pc = new (window as any).RTCPeerConnection(this.defaultIceServers);
        this.p2pConnections.set(key, { pc });

        pc.ondatachannel = (event: any) => {
          this.setupDataChannelEvents(chat_id, sender_user_id, event.channel);
        };

        pc.onicecandidate = (event: any) => {
          if (event.candidate) {
            WebSocketService.send({
              type: 'webrtc_ice_candidate',
              chat_id: chat_id,
              target_user_id: sender_user_id,
              candidate: event.candidate
            });
          }
        };

        await pc.setRemoteDescription(new (window as any).RTCSessionDescription(sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        WebSocketService.send({
          type: 'webrtc_answer',
          chat_id: chat_id,
          target_user_id: sender_user_id,
          sdp: answer
        });
      }
    } catch (err) {
      console.warn('Error handling remote offer:', err);
    }
  }

  private async handleRemoteAnswer(data: any) {
    const { chat_id, sender_user_id, sdp } = data;
    const key = `chat_${chat_id}_user_${sender_user_id}`;
    const conn = this.p2pConnections.get(key);
    if (conn && conn.pc) {
      try {
        await conn.pc.setRemoteDescription(new (window as any).RTCSessionDescription(sdp));
      } catch (err) {
        console.warn('Error handling remote answer:', err);
      }
    }
  }

  private async handleRemoteIceCandidate(data: any) {
    const { chat_id, sender_user_id, candidate } = data;
    const key = `chat_${chat_id}_user_${sender_user_id}`;
    const conn = this.p2pConnections.get(key);
    if (conn && conn.pc) {
      try {
        await conn.pc.addIceCandidate(new (window as any).RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('Error adding ICE candidate:', err);
      }
    }
  }

  private setupDataChannelEvents(chatId: number, peerUserId: number, channel: any) {
    channel.onopen = () => {
      console.log(`⚡ P2P Data Channel connected for chat ${chatId} with user ${peerUserId}`);
      this.setTransportState(chatId, 'p2p');
    };

    channel.onclose = () => {
      console.log(`🔌 P2P Data Channel closed for chat ${chatId}`);
      this.setTransportState(chatId, 'server');
    };

    channel.onmessage = (event: any) => {
      try {
        const payload = JSON.parse(event.data);
        LocalMessageStore.saveMessages(chatId, [
          {
            id: payload.server_msg_id || payload.client_msg_id,
            chat_id: chatId,
            sender_id: peerUserId,
            content: payload.content,
            created_at: payload.created_at || new Date().toISOString()
          }
        ]);
        this.listeners.forEach((l) => l.onMessageReceived(payload));
      } catch (err) {
        console.error('Error parsing P2P DataChannel message:', err);
      }
    };
  }

  /**
   * Sends message: uses P2P DataChannel if open, or seamlessly falls back to WebSocket server relay
   */
  public async sendMessage(
    chatId: number,
    targetUserId: number,
    payload: any
  ): Promise<TransportType> {
    const key = `chat_${chatId}_user_${targetUserId}`;
    const conn = this.p2pConnections.get(key);

    if (conn && conn.dataChannel && conn.dataChannel.readyState === 'open') {
      try {
        // Send P2P over WebRTC Data Channel
        conn.dataChannel.send(JSON.stringify(payload));

        // Async sync envelope to server so history & multi-device stay consistent
        WebSocketService.send({
          ...payload,
          is_p2p_synced: true
        });

        return 'p2p';
      } catch (err) {
        console.warn('P2P data channel send failed, falling back to server:', err);
      }
    }

    // Seamless Server Relay Fallback
    WebSocketService.send(payload);
    return 'server';
  }
}

export default ChatTransportManager.getInstance();
