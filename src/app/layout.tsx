import type { Metadata,Viewport } from "next";
import { Toaster } from "sonner";
import "./globals.css";
export const metadata:Metadata={title:{default:"CareRelay · Shared care, made simpler",template:"%s · CareRelay"},description:"A shared care space for medication routines, accepted handoffs and doctor appointments. The older person stays at the centre."};
export const viewport:Viewport={width:"device-width",initialScale:1,themeColor:"#267663"};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body><a href="#main-content" className="fixed left-4 top-4 z-[100] -translate-y-24 rounded-lg bg-primary px-5 py-3 text-white focus:translate-y-0">Skip to content</a>{children}<Toaster richColors position="bottom-right" closeButton/></body></html>;}
