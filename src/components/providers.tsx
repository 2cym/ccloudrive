'use client';

import { SessionProvider } from 'next-auth/react';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import { type ReactNode } from 'react';

import { Toaster } from '@/components/ui/toaster';

/**
 * 客户端 Provider 聚合。
 *
 * 放在 layout.tsx 顶层，把 SessionProvider / ThemeProvider / Toaster 一次套上。
 * 注意：这个文件本身必须 'use client'，但 layout.tsx 仍是 Server Component。
 */

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <NextThemesProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange={false}
      >
        {children}
        <Toaster />
      </NextThemesProvider>
    </SessionProvider>
  );
}
