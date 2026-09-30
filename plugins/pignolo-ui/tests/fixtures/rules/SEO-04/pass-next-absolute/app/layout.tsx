export const metadata = { alternates: { canonical: 'https://www.example.com/' } };

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head></head>
      <body>{children}</body>
    </html>
  );
}
