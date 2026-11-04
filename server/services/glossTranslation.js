const MAX_RESPONSE_BYTES = 32768;
const MOBILE_CATEGORIES = {
  'room-service': ['FOOD', 'AMENITIES', 'LINENS', 'COMFORT ITEMS', 'EXTRA', 'ROOM SERVICE'],
  problem: ['AIR CONDITIONING', 'PLUMBING', 'ELECTRICITY', 'HOUSEKEEPING', 'FURNITURE',
    'TV / INTERNET', 'OTHER PROBLEM', 'PROBLEM'],
  services: ['VALET PARKING', 'TAXI'],
};

function translationError(message, code = 'GLOSS_TRANSLATION_UNAVAILABLE', retryable = true) {
  return Object.assign(new Error(message), { code, retryable });
}

export async function translateRequestMessage(payload, {
  env = process.env, fetchImpl = globalThis.fetch,
} = {}) {
  if (!env.GLOSS_TRANSLATOR_URL) return null;
  if (typeof payload.message !== 'string' || !payload.message.trim()) {
    throw translationError('ASL MESSAGE REQUIRED.', 'GLOSS_TRANSLATION_INVALID_INPUT', false);
  }
  const engine = env.GLOSS_TRANSLATOR_ENGINE || 'asl-translator-fp32';
  if (!['asl-translator-fp32', 'asl-translator-int8-dynamic'].includes(engine)) {
    throw translationError('ASL TRANSLATION CONFIGURATION INVALID. CONTACT HOTEL STAFF.');
  }
  // La app antepone la categoría seleccionada: no forma parte de las glosas.
  const candidate = payload.message.match(/^([^:\n]{1,100}): (.+)$/s);
  const match = candidate && MOBILE_CATEGORIES[payload.type]?.includes(candidate[1].toUpperCase())
    ? candidate : null;
  const prefix = match ? `${match[1]}: ` : '';
  const glossInput = match ? match[2] : payload.message;
  let endpoint;
  try {
    endpoint = new URL(env.GLOSS_TRANSLATOR_URL);
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password
      || endpoint.search || endpoint.hash || !['', '/'].includes(endpoint.pathname)) throw new Error();
    endpoint.pathname = '/translate';
  } catch {
    throw translationError('ASL TRANSLATION CONFIGURATION INVALID. CONTACT HOTEL STAFF.');
  }
  const timeout = Number(env.GLOSS_TRANSLATOR_TIMEOUT_MS || 10000);
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 12000) {
    throw translationError('ASL TRANSLATION CONFIGURATION INVALID. CONTACT HOTEL STAFF.');
  }
  try {
    const response = await fetchImpl(endpoint, {
      method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/json' },
      // El huésped puede editar el borrador de cámara y convertirlo en inglés natural.
      body: JSON.stringify({ text: glossInput }),
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) {
      if ([413, 422].includes(response.status)) {
        throw translationError('ASL MESSAGE TOO LONG OR INVALID. SHORTEN MESSAGE AND TRY AGAIN.',
          'GLOSS_TRANSLATION_INVALID_INPUT', false);
      }
      throw translationError('ASL TRANSLATION UNAVAILABLE. MESSAGE NOT SENT. TRY AGAIN.');
    }
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESPONSE_BYTES) throw new Error('Invalid translation response size');
        chunks.push(Buffer.from(value));
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (result.gloss !== glossInput || typeof result.english !== 'string'
      || !result.english.trim() || prefix.length + result.english.length > 5000
      || !['gloss', 'ambiguous', 'english'].includes(result.input_type)) {
      throw new Error('Invalid translation response');
    }
    return {
      original: payload.message,
      glossInput,
      english: prefix + result.english,
      inputType: result.input_type,
      corrected: typeof result.corrected === 'string' ? result.corrected : null,
      preprocessed: typeof result.preprocessed === 'string' ? result.preprocessed : null,
      engine,
      translatedAt: new Date(),
    };
  } catch (error) {
    if (typeof error.code === 'string' && error.code.startsWith('GLOSS_TRANSLATION_')) throw error;
    throw translationError('ASL TRANSLATION UNAVAILABLE. MESSAGE NOT SENT. TRY AGAIN.');
  }
}
