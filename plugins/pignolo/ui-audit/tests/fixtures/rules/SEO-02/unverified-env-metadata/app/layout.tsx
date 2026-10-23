export const metadata = {
  title: 'Pedidos',
  robots: process.env.VERCEL_ENV === 'preview' ? { index: false } : undefined,
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head></head>
      <body>{children}</body>
    </html>
  );
}
