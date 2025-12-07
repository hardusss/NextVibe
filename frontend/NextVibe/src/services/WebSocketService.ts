import GetApiUrl from "../utils/url_api";
import { storage } from "../utils/storage";

type MessageHandler = (data: any) => void;

class WebSocketService {
  private static instance: WebSocketService;
  private ws: WebSocket | null = null;
  private isConnecting: boolean = false;
  private messageHandlers: Set<MessageHandler> = new Set();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;

  private constructor() {}

  public static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  private async getUrl(): Promise<string | null> {
    try {
      const token = await storage.getItem("access");
      if (!token) {
        console.error("❌ WS Service: No access token");
        return null;
      }

      const baseUrl = GetApiUrl().split("/api/v1")[0];
      const wsBaseUrl = baseUrl
        .replace("http://", "ws://")
        .replace("https://", "wss://")
        .replace(":8000", ":8081")
        .replace("api", "realtime");

      return `${wsBaseUrl}/ws?token=${token}`;
    } catch (error) {
      console.error("❌ Error generating WS URL:", error);
      return null;
    }
  }

  public async connect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log("✅ WS Service: Already connected");
      return;
    }

    if (this.ws?.readyState === WebSocket.CONNECTING) {
      console.log("⏳ WS Service: Connection in progress");
      return;
    }

    if (this.isConnecting) {
      console.log("⏳ WS Service: Already attempting to connect");
      return;
    }

    this.isConnecting = true;
    console.log("🔌 WS Service: Starting connection...");

    const url = await this.getUrl();
    if (!url) {
      this.isConnecting = false;
      console.error("❌ WS Service: No URL/Token available");
      return;
    }

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log("✅ WS Service: Connected successfully");
        this.isConnecting = false;
        this.reconnectAttempts = 0; 
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.messageHandlers.forEach((handler) => handler(data));
        } catch (e) {
          console.error("❌ WS Service: Parse error", e);
        }
      };

      this.ws.onerror = (error: any) => {
        console.error("⚠️ WS Service: Error", error?.message || error);
        this.isConnecting = false;
      };

      this.ws.onclose = (event) => {
        console.log(`🔌 WS Service: Closed (code: ${event.code}, reason: ${event.reason || 'none'})`);
        this.ws = null;
        this.isConnecting = false;

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000); // Exponential backoff
          console.log(`🔄 WS Service: Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
          
          this.reconnectTimeout = setTimeout(() => {
            this.connect();
          }, delay);
        } else {
          console.error("❌ WS Service: Max reconnect attempts reached");
        }
      };
    } catch (error) {
      console.error("❌ WS Service: Connection error", error);
      this.isConnecting = false;
      this.ws = null;
    }
  }

  public disconnect() {
    console.log("🔌 WS Service: Manual disconnect");

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.reconnectAttempts = 0;

    if (this.ws) {
      this.ws.close(1000, "Manual disconnect"); 
      this.ws = null;
    }
    
    this.isConnecting = false;
  }

  public send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn("⚠️ WS Service: Cannot send, socket not open (state:", this.ws?.readyState, ")");
      this.connect();
    }
}

  public addListener(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    console.log(`👂 WS Service: Listener added (total: ${this.messageHandlers.size})`);
    return () => {
      this.messageHandlers.delete(handler);
      console.log(`👂 WS Service: Listener removed (total: ${this.messageHandlers.size})`);
    };
  }

  public getReadyState(): number | null {
    return this.ws?.readyState ?? null;
  }
}

export default WebSocketService.getInstance();