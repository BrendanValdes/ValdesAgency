import type { Metadata, Viewport } from "next";
import { Manrope, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import BookingProvider from "@/components/BookingProvider";

// Snap scroll is CSS-native (see globals.css). LenisProvider and
// SnapScrollProvider were removed because Lenis intercepts wheel
// events, which conflicts with browser-native scroll-snap. The files
// remain in components/ as unused references.

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  width: "device-width",
  initialScale: 1,
};

// Fallback fonts until PP Neue Montreal / PP Object Sans / PP Mondwest
// .woff2 files land in public/fonts/. Swap path is next/font/local then.
const manrope = Manrope({
  variable: "--font-body-fallback",
  subsets: ["latin"],
  weight: ["400", "500", "700", "800"],
  display: "swap",
});

const manropeDisplay = Manrope({
  variable: "--font-display-fallback",
  subsets: ["latin"],
  weight: ["700", "800"],
  display: "swap",
});

const mondwestFallback = JetBrains_Mono({
  variable: "--font-mono-fallback",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://valdesagency.com"),
  title: "The Valdes Growth Engine",
  description:
    "We build the system. You run the business. Websites, ads, AI lead capture, CRM, and reporting for home service businesses in Las Vegas.",
  openGraph: {
    title: "The Valdes Growth Engine",
    description: "We build the system. You run the business. For home service businesses.",
    url: "https://valdesagency.com",
    siteName: "Valdes Agency",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Valdes Agency",
    description: "Marketing systems for service businesses. Las Vegas.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${manropeDisplay.variable} ${mondwestFallback.variable}`}
    >
      <body>
        <BookingProvider>{children}</BookingProvider>
      </body>
    </html>
  );
}
