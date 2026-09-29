export const metadata = { title: 'Pedidos', robots: { index: false, follow: true } };

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head></head>
      <body>{children}</body>
    </html>
  );
}
