export async function generateMetadata({ params }) {
  return { title: params.slug };
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <head></head>
      <body>{children}</body>
    </html>
  );
}
