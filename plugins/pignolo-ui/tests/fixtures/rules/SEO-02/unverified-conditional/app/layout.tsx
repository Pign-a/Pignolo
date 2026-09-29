export default function RootLayout({ children, preview }) {
  return (
    <html lang="es">
      <head>{preview && <meta name="robots" content="noindex" />}</head>
      <body>{children}</body>
    </html>
  );
}
