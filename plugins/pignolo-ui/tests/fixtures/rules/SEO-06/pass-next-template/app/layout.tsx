export const metadata = { title: { template: '%s | Tienda', default: 'Tienda' } };

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head></head>
      <body>{children}</body>
    </html>
  );
}
