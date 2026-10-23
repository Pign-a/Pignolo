export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head></head>
      <body>{links.map((l) => <a key={l.href} href={l.href}>{l.label}</a>)}{children}</body>
    </html>
  );
}
