// HTML character references, decoded the way a browser reads them (also without the closing ";" for
// the numeric ones), shared by the leak scan, the remote-resource check and the brace check.
//
// decodeEntities(text) -> string
const LATIN1 = ('nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 acute micro para middot cedil '
  + 'sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml '
  + 'ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig '
  + 'ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml').split(' ');
const NAMED = new Map([
  ['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"],
  // ASCII punctuation with a name: how a value or a URL is hidden from a plain-text search
  ['colon', ':'], ['sol', '/'], ['bsol', '\\'], ['Tab', '\t'], ['NewLine', '\n'], ['period', '.'], ['comma', ','], ['semi', ';'],
  ['commat', '@'], ['lpar', '('], ['rpar', ')'], ['lbrace', '{'], ['rbrace', '}'], ['lcub', '{'], ['rcub', '}'], ['lsqb', '['], ['rsqb', ']'],
  ['num', '#'], ['percnt', '%'], ['excl', '!'], ['quest', '?'], ['plus', '+'], ['equals', '='], ['lowbar', '_'], ['hyphen', '-'], ['dash', '-'],
  ['ast', '*'], ['dollar', '$'], ['grave', '`'], ['Hat', '^'], ['verbar', '|'], ['vert', '|'], ['tilde', '~'], ['ZeroWidthSpace', String.fromCharCode(0x200b)],
]);
LATIN1.forEach((n, i) => NAMED.set(n, String.fromCharCode(160 + i)));

const codePoint = (n) => { try { return String.fromCodePoint(n); } catch { return ''; } };

export function decodeEntities(text) {
  return String(text)
    .replace(/&#[xX]([0-9a-fA-F]{1,6});?/g, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d{1,7});?/g, (_, d) => codePoint(parseInt(d, 10)))
    .replace(/&([A-Za-z][A-Za-z0-9]{1,13});/g, (m, name) => (NAMED.has(name) ? NAMED.get(name) : m));
}

// CSS escapes undone: a backslash and 1 to 6 hex digits (and one space that ends them), or a backslash and any other character.
export function cssUnescape(text) {
  return String(text).replace(/\\([0-9a-fA-F]{1,6})[ \t\n\r\f]?|\\([^\n\r\f0-9a-fA-F])/g, (m, hex, ch) => {
    if (ch !== undefined) return ch;
    try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return ''; }
  });
}
