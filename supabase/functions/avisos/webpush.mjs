// Web Push sin librerías: cifra el aviso para el móvil (RFC 8291, aes128gcm) y
// firma la petición con las claves del servidor (VAPID, RFC 8292). Solo usa
// WebCrypto, así que corre igual en el servidor (Deno) y en Node para probarlo.

const enc = new TextEncoder();
export const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const deB64url = (s) => Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(String(s).length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const junta = (...partes) => { const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of partes) { out.set(p, i); i += p.length; } return out; };
const hkdf = async (sal, clave, info, largo) => new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: sal, info }, await crypto.subtle.importKey("raw", clave, "HKDF", false, ["deriveBits"]), largo * 8));

// Cifra «texto» para una suscripción { p256dh, auth } (en base64url).
export const cifrar = async (texto, p256dh, auth) => {
  const delMovil = deB64url(p256dh), secreto = deB64url(auth);
  if (delMovil.length !== 65 || delMovil[0] !== 4 || secreto.length < 16) throw new Error("suscripción mal formada");
  const par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const mia = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  const suya = await crypto.subtle.importKey("raw", delMovil, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const comun = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: suya }, par.privateKey, 256));
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const ikm = await hkdf(secreto, comun, junta(enc.encode("WebPush: info\0"), delMovil, mia), 32);
  const cek = await hkdf(sal, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(sal, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const clave = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  // Un solo registro: el texto y el byte 2, que marca que es el último.
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, clave, junta(enc.encode(texto), new Uint8Array([2]))));
  return junta(sal, new Uint8Array([0, 0, 16, 0]), new Uint8Array([mia.length]), mia, cifrado);   // tamaño de registro: 4096
};

// La cabecera Authorization para ese destino, firmada con la clave privada (JWK).
export const vapid = async (endpoint, publica, privadaJwk, contacto, ahora = Date.now()) => {
  const clave = await crypto.subtle.importKey("jwk", privadaJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const cuerpo = `${b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })))}.${b64url(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(ahora / 1000) + 12 * 3600, sub: contacto })))}`;
  const firma = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, clave, enc.encode(cuerpo));
  return `vapid t=${cuerpo}.${b64url(firma)}, k=${publica}`;
};

// Manda un aviso. Devuelve el código de respuesta del servicio de avisos:
// 201 es que ha salido; 404 o 410, que esa suscripción ya no existe.
export const enviar = async (sus, aviso, claves) => {
  const cuerpo = await cifrar(JSON.stringify(aviso), sus.p256dh, sus.auth);
  const res = await fetch(sus.endpoint, { method: "POST", headers: { Authorization: await vapid(sus.endpoint, claves.publica, claves.privada, claves.contacto), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "43200", Urgency: "normal" }, body: cuerpo });
  return res.status;
};

// Solo se manda a los servicios de avisos de los navegadores: así nadie puede
// usar el servidor para llamar a otras direcciones.
export const destinoValido = (endpoint) => {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com)$/.test(u.hostname);
  } catch { return false; }
};

// Un par de claves nuevo para el servidor: { publica (base64url), privada (JWK) }.
export const clavesNuevas = async () => {
  const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  return { publica: b64url(await crypto.subtle.exportKey("raw", par.publicKey)), privada: await crypto.subtle.exportKey("jwk", par.privateKey) };
};
