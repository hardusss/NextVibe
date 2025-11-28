import GetApiUrl from "../utils/url_api";
import { storage } from "../utils/storage";

type MessageHandler = (data: any) => void;

class WebSocketService {
  private static instance: WebSocketService;
  private ws: WebSocket | null = null;
  private isConnecting: boolean = false;
  private messageHandlers: Set<MessageHandler> = new Set(); 

  // Private constructor to enforce Singleton
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
      if (!token) return null;

      const baseUrl = GetApiUrl().split("/api/v1")[0];
      const wsBaseUrl = baseUrl
        .replace("http://", "ws://")
        .replace("https://", "wss://")
        .replace(":8000", ":8081");

      return `${wsBaseUrl}/ws?token=${token}`;
    } catch (error) {
      console.error("❌ Error generating WS URL:", error);
      return null;
    }
  }

  public async connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      console.log("⚠️ WS Service: Already connected or connecting");
      return;
    }

    if (this.isConnecting) return;

    this.isConnecting = true;
    console.log("🔌 WS Service: Starting connection...");

    const url = await this.getUrl();

    if (!url) {
      this.isConnecting = false;
      console.error("❌ WS Service: No URL/Token");
      return;
    }

    try {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log("✅ WS Service: Connected");
        this.isConnecting = false;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.messageHandlers.forEach((handler) => handler(data));
        } catch (e) {
          console.error("❌ WS Service: Parse error", e);
        }
      };

      this.ws.onerror = (e: any) => {
        console.error("⚠️ WS Service: Error", e?.message);
        this.isConnecting = false;
      };

      this.ws.onclose = (e) => {
        console.log(`🔌 WS Service: Closed (${e.code})`);
        this.ws = null;
        this.isConnecting = false;
      };
    } catch (e) {
      this.isConnecting = false;
    }
  }

  public disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnecting = false;
  }

  public send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn("⚠️ WS Service: Cannot send, socket not open");
    }
  }

  public addListener(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler); 
  }
}

export default WebSocketService.getInstance();