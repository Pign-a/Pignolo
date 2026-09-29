export default function Page() {
  return (
    <main>
      <h1>Pedidos</h1>
      <div className="rounded-[6px] border p-4">Resumen</div>
      <div className="rounded-[6px] border p-4 transition-all">Detalle</div>
      <input className="rounded-[6px] border outline-none" aria-label="Buscar" />
      <button role="combobox">Estado</button>
    </main>
  );
}
