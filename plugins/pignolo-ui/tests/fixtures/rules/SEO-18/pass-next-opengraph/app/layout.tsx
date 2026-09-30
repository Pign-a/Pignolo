export const metadata = {
  openGraph: { title: 'Tienda', type: 'website', url: 'https://www.example.com/', images: ['/og.png'] },
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head></head>
      <body>{children}</body>
    </html>
  );
}
