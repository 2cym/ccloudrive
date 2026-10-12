import type { Metadata, Viewport } from 'next';

import '@/app/globals.css';
import { Providers } from '@/components/providers';

export const metadata: Metadata = {
  title: {
    default: '云盘',
    template: '%s · 云盘',
  },
  description: '基于 Cloudflare Workers 的轻量网盘应用。',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){
  if (typeof window === 'undefined') return;
  var n = function(target, value) {
    try { Object.defineProperty(target, 'name', { value: value, configurable: true }); } catch(e) {}
    return target;
  };
  if (typeof window.__name === 'undefined') window.__name = n;
  if (typeof globalThis.__name === 'undefined') globalThis.__name = n;
})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
