'use strict';
// Función que nadie llama.
function formatLegacyDate(d) {
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}
module.exports = { formatLegacyDate };
