import type { Metadata, Viewport } from "next";
import { Noto_Sans_Sinhala, Noto_Sans_Tamil, Plus_Jakarta_Sans, Yaldevi } from "next/font/google";
import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { I18nProvider } from "@/components/providers/i18n-provider";
import { AppShell } from "@/components/shell/app-shell";
import { DEFAULT_LANG, isLang, isTextScale, LANG_COOKIE, TEXT_SCALE_COOKIE } from "@/i18n/dictionaries";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });
const sinhala = Noto_Sans_Sinhala({ subsets: ["sinhala"], variable: "--font-sinhala", display: "swap" });
const tamil = Noto_Sans_Tamil({ subsets: ["tamil"], variable: "--font-tamil", display: "swap" });
const yaldevi = Yaldevi({
  subsets: ["sinhala"],
  weight: ["500", "700"],
  variable: "--font-yaldevi",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "GovNavAI", template: "%s · GovNavAI" },
  description:
    "Sri Lankan government paperwork in Sinhala, Tamil and English: the right office, fee, documents and the official form, already filled.",
  applicationName: "GovNavAI",
};

export const viewport: Viewport = {
  themeColor: "#5C0F0F",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const jar = await cookies();
  const langCookie = jar.get(LANG_COOKIE)?.value;
  const scaleCookie = jar.get(TEXT_SCALE_COOKIE)?.value;
  const lang = isLang(langCookie) ? langCookie : DEFAULT_LANG;
  const textScale = isTextScale(scaleCookie) ? scaleCookie : "md";

  return (
    <html
      lang={lang}
      data-text-scale={textScale}
      className={`${jakarta.variable} ${sinhala.variable} ${tamil.variable} ${yaldevi.variable}`}
    >
      <body>
        <I18nProvider initialLang={lang} initialTextScale={textScale}>
          <AppShell>{children}</AppShell>
        </I18nProvider>
      </body>
    </html>
  );
}
