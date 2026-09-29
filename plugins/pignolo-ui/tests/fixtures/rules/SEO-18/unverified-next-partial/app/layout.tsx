export const metadata = { openGraph: { title: 'Tienda', type: 'website' } };

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head></head>
      <body>{children}</body>
    </html>
  );
}
