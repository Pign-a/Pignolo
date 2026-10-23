export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head></head>
      <body><a onClick={open}>Abrir</a>{children}</body>
    </html>
  );
}
