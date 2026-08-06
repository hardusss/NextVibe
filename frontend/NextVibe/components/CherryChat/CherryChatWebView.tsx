import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { StyleProp, ViewStyle } from 'react-native';

type WebViewSource = { uri: string } | { html: string; baseUrl?: string };

export interface CherryChatConfig {
  appId: string;
  roomId?: string;
  embedUrl?: string;
  mode?: 'single' | 'external-controlled' | 'list';
  token?: string;
  walletAddress?: string;
  theme?: Record<string, unknown>;
  layout?: Record<string, unknown>;
}

export interface CherryChatWebViewProps {
  source: WebViewSource;
  config: CherryChatConfig;
  onSign?: (message: Uint8Array) => Promise<Uint8Array>;
  onEvent?: (event: string, data: unknown) => void;
  onWalletConnectRequested?: () => void;
  style?: StyleProp<ViewStyle>;
  webViewProps?: Partial<React.ComponentProps<typeof WebView>>;
}

export interface CherryChatWebViewRef {
  setWalletAddress: (address: string) => void;
  setToken: (token: string) => void;
  setRoom: (roomId: string) => void;
  setTheme: (theme: Record<string, unknown>) => void;
  signOut: () => void;
  show: () => void;
  hide: () => void;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? B64[b2 & 63] : '=';
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const lookup = new Uint8Array(256).fill(255);
  for (let i = 0; i < B64.length; i++) lookup[B64.charCodeAt(i)] = i;
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const e0 = lookup[clean.charCodeAt(i)]!;
    const e1 = lookup[clean.charCodeAt(i + 1)]!;
    const e2 = i + 2 < clean.length ? lookup[clean.charCodeAt(i + 2)]! : 0;
    const e3 = i + 3 < clean.length ? lookup[clean.charCodeAt(i + 3)]! : 0;
    out[p++] = (e0 << 2) | (e1 >> 4);
    if (i + 2 < clean.length && lookup[clean.charCodeAt(i + 2)] !== 255) out[p++] = ((e1 & 15) << 4) | (e2 >> 2);
    if (i + 3 < clean.length && lookup[clean.charCodeAt(i + 3)] !== 255) out[p++] = ((e2 & 3) << 6) | e3;
  }
  return out.slice(0, p);
}

type HostMessage =
  | { type: 'ready' }
  | { type: 'sign'; id: string; message: string }
  | { type: 'event'; event: string; data?: unknown };

export const CherryChatWebView = forwardRef<CherryChatWebViewRef, CherryChatWebViewProps>(
  function CherryChatWebView(props, ref) {
    const { source, config, onSign, onEvent, onWalletConnectRequested, style, webViewProps } = props;
    const webRef = useRef<WebView>(null);
    const isReadyRef = useRef(false);

    const configRef = useRef(config);
    configRef.current = config;
    const onSignRef = useRef(onSign);
    onSignRef.current = onSign;

    const inject = useCallback((js: string) => {
      webRef.current?.injectJavaScript(`${js}; true;`);
    }, []);

    const sendConfig = useCallback(() => {
      const json = JSON.stringify(configRef.current);
      inject(`window.__cherryReceiveConfig(${JSON.stringify(json)})`);
    }, [inject]);

    const command = useCallback(
      (method: string, params?: Record<string, unknown>) => {
        inject(`window.__cherryCommand(${JSON.stringify(method)}, ${JSON.stringify(JSON.stringify(params ?? {}))})`);
      },
      [inject],
    );

    useImperativeHandle(
      ref,
      (): CherryChatWebViewRef => ({
        setWalletAddress: (address) => command('setWalletAddress', { walletAddress: address }),
        setToken: (token) => command('setToken', { token }),
        setRoom: (roomId) => command('setRoom', { roomId }),
        setTheme: (theme) => command('setTheme', { theme }),
        signOut: () => command('signOut'),
        show: () => command('show'),
        hide: () => command('hide'),
      }),
      [command],
    );

    useEffect(() => {
      if (isReadyRef.current) sendConfig();
    }, [config.appId, config.roomId, config.token, config.walletAddress, sendConfig]);

    const handleMessage = useCallback(
      async (e: WebViewMessageEvent) => {
        let msg: HostMessage;
        try {
          msg = JSON.parse(e.nativeEvent.data) as HostMessage;
        } catch {
          return;
        }

        if (msg.type === 'ready') {
          isReadyRef.current = true;
          sendConfig();
          return;
        }

        if (msg.type === 'sign') {
          const { id } = msg;
          try {
            if (!onSignRef.current) {
              throw new Error('Signing is not configured for app-trusted zero-signature mode');
            }
            const messageBytes = base64ToBytes(msg.message);
            const signature = await onSignRef.current(messageBytes);
            const sigB64 = bytesToBase64(signature);
            inject(`window.__cherrySignResult(${JSON.stringify(id)}, ${JSON.stringify(sigB64)}, null)`);
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            inject(`window.__cherrySignResult(${JSON.stringify(id)}, null, ${JSON.stringify(errorMsg)})`);
          }
          return;
        }

        if (msg.type === 'event') {
          if (msg.event === 'walletConnectRequested') onWalletConnectRequested?.();
          onEvent?.(msg.event, msg.data);
          return;
        }
      },
      [inject, onEvent, onWalletConnectRequested, sendConfig],
    );

    return (
      <WebView
        ref={webRef}
        source={source}
        onMessage={handleMessage}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        style={style}
        {...webViewProps}
      />
    );
  },
);
