'use strict';

// Importes en centavos enteros; nunca floats.
function parseAmount(text) {
  const m = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(String(text).trim());
  if (!m) throw new Error(`importe inválido: ${text}`);
  const cents = m[2] === undefined ? 0 : Number(m[2].padEnd(2, '0'));
  return Number(m[1]) * 100 + cents;
}

function formatAmount({ cents, currency = 'ARS' }) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const units = String(Math.floor(abs / 100));
  const rest = String(abs % 100).padStart(2, '0');
  return `${sign}${units},${rest} ${currency}`;
}

module.exports = { parseAmount, formatAmount };
