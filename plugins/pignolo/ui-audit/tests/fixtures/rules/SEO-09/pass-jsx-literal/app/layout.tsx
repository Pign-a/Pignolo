export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head></head>
      <body><nav><a href={'/productos'}>Productos</a><Link href="/x">X</Link></nav>{children}</body>
    </html>
  );
}
