import { useState } from "react";
import { TextField } from "@kit/components/text-field";
import { Button } from "@kit/components/button";

export const meta = { title: "Text field" };

export default function TextFieldPage() {
  const [email, setEmail] = useState("");
  const [touched, setTouched] = useState(false);
  const invalid = touched && !/^\S+@\S+\.\S+$/.test(email);
  const [show, setShow] = useState(false);
  return (
    <div>
      <h1 className="mb-1 text-3xl font-semibold tracking-tight text-(--color-on-surface)">Text field</h1>
      <p className="mb-8 max-w-prose text-(--color-on-surface-variant)">
        La etiqueta vive dentro del campo; al enfocar o escribir sube a la esquina superior izquierda y el campo crece. El espacio ya está reservado: lo que hay debajo no se mueve.
      </p>

      <section className="mb-10 grid max-w-3xl grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <TextField label="Nombre completo" placeholder="Ana García" helperText="Como figura en tu documento" data-testid="tf-name" />
        <TextField
          label="Correo electrónico"
          type="email"
          placeholder="ana@ejemplo.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched(true)}
          error={invalid ? "Escribí un correo válido, por ejemplo ana@ejemplo.com" : undefined}
          helperText="Te enviamos el comprobante acá"
          data-testid="tf-email"
        />
        <TextField label="Teléfono" defaultValue="11 5555 0123" data-testid="tf-filled" />
        <TextField
          label="Contraseña"
          type={show ? "text" : "password"}
          trailing={
            <Button size="sm" variant="tertiary" onClick={() => setShow((v) => !v)} aria-pressed={show} data-testid="tf-toggle">
              {show ? "Ocultar" : "Mostrar"}
            </Button>
          }
          helperText="Al menos 8 caracteres"
          data-testid="tf-pass"
        />
        <TextField label="Ciudad" placeholder="Buenos Aires" data-testid="tf-city" />
        <TextField label="Código de cliente" defaultValue="CL-20931" readOnly helperText="No se puede cambiar" data-testid="tf-readonly" />
        <TextField label="Documento" disabled defaultValue="30.555.123" data-testid="tf-disabled" />
        <TextField label="Empresa" error="Este dato es obligatorio" data-testid="tf-error" />
      </section>

      <section className="mb-10 max-w-sm" data-testid="tf-stack">
        <h2 className="mb-3 text-lg font-semibold text-(--color-on-surface)">Campos apilados</h2>
        <TextField label="Calle" helperText="Sin número" data-testid="tf-street" />
        <TextField label="Número" data-testid="tf-number" />
        <Button className="mt-2" data-testid="tf-after">Guardar</Button>
      </section>
    </div>
  );
}
