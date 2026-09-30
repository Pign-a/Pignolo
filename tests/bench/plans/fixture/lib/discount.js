'use strict';

// percent entero de 0 a 100; redondea hacia abajo el descuento.
function applyDiscount({ total, percent }) {
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    throw new RangeError(`porcentaje inválido: ${percent}`);
  }
  return total - Math.floor((total * percent) / 100);
}

module.exports = { applyDiscount };
