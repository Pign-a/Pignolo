export const metadata = {
  metadataBase: new URL('https://www.example.com'),
  alternates: { canonical: '/' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head></head>
      <body>{children}</body>
    </html>
  );
}
