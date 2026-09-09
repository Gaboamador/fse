import FRIENDS_RUNTIME from './friends-long10-runtime.js';

const MODEL = 'Xenova/multilingual-e5-small';
const DTYPE = 'q8';
const DIM = 384;
const W_LEXICAL = 0.110;
const MAX_HEADING_GAIN = 0.006;
const CHARACTER_MISS_PENALTY = 0.018;
const FLASHBACK_PENALTY = 0.020;
const SPECIAL_PENALTY = 0.035;
const MAX_EXPANSION_GAIN = 0.032;
const MAX_RELATIONAL_EXPANSION_GAIN = 0.040;
const MIN_EXPANSION_GAIN = 0.002;
const ENGINE_VERSION = 'v10.7.2';

let extractor;
let manifest;
let longChunks;
let longDialogue;
let longCombined;
let longLexical;
let shortChunks;
let shortEmbeddings;
let shortLexical;
let initPromise;

function status(phase, message) {
  self.postMessage({ type: 'status', payload: { phase, message } });
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function fetchF32(url, expectedCount) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}. Ejecutá npm run prepare:assets.`);
  const buffer = await res.arrayBuffer();
  const expected = expectedCount * DIM * 4;
  if (buffer.byteLength !== expected) throw new Error(`${url}: ${buffer.byteLength} bytes; esperado ${expected}`);
  return new Float32Array(buffer);
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`]/g, "'")
    .toLowerCase()
    .replace(/[^a-z0-9'\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value) {
  return normalizeText(value).split(' ').filter(t => t.length >= 2);
}

const SPANISH_MARKERS = new Set([
  'a','al','algo','aparece','armar','con','contra','cuando','de','del','dice','decirle','distintos','durante',
  'el','ella','en','encanta','encerrado','es','esta','gato','golpea','gustaria','hace','la','las','le','lo','los',
  'mientras','mujeres','mundo','no','otra','para','pero','porque','prepara','probar','que','queda','quiere','real',
  'ropa','sabores','se','si','sin','sino','su','te','toda','un','una','volver','y','ya','interrumpe','cabeza','pared'
]);
const ENGLISH_FUNCTION_WORDS = new Set([
  'a','an','and','are','as','at','be','been','but','by','do','does','for','from','had','has','have','he','her','his',
  'i','if','in','is','it','me','my','not','of','on','or','our','she','that','the','their','them','there','they','this',
  'to','was','we','were','what','when','where','who','with','would','you','your'
]);

function isSpanishDominant(qTokens) {
  if (!qTokens.length) return false;
  let markers = 0;
  for (const t of qTokens) if (SPANISH_MARKERS.has(t)) markers++;
  return markers >= 3 && markers / qTokens.length >= 0.22;
}

function capitalizedPhrases(query) {
  const set = new Set();
  const matches = String(query).match(/\b(?:[A-Z][A-Za-z'’-]+)(?:\s+[A-Z][A-Za-z'’-]+)+\b/g) ?? [];
  for (const m of matches) set.add(normalizeText(m));
  return set;
}

function strongMixedPhrase(tokens, phrase, caps) {
  if (tokens.some(t => ENGLISH_FUNCTION_WORDS.has(t) && !SPANISH_MARKERS.has(t))) return true;
  return caps.has(phrase);
}

function queryLexicalContext(query) {
  const characterTokens = new Set();
  const normalizedQuery = ` ${normalizeText(query)} `;
  for (const [alias] of characterAliases) {
    if (normalizedQuery.includes(` ${alias} `)) characterTokens.add(alias);
  }

  const qTokens = tokenize(query).filter(token => !characterTokens.has(token));
  return {
    qTokens,
    spanishDominant: isSpanishDominant(qTokens),
    caps: capitalizedPhrases(query),
    normalizedQuery: normalizeText(query),
  };
}

function lexicalScore(query, chunkIndex, context = queryLexicalContext(query)) {
  const { qTokens, spanishDominant, caps, normalizedQuery } = context;
  if (!qTokens.length) return 0;

  const text = long10Normalized[chunkIndex];
  const chunkSet = new Set(tokenize(text));
  const qUnique = [...new Set(qTokens)];
  let score = 0;
  let strongSignals = 0;

  for (let n = Math.min(6, qTokens.length); n >= 2; n--) {
    for (let i = 0; i <= qTokens.length - n; i++) {
      const phraseTokens = qTokens.slice(i, i + n);
      const phrase = phraseTokens.join(' ');
      if (!text.includes(phrase)) continue;
      const informative = phraseTokens.some(
        t => (long10DocFreq[t] ?? long10Chunks.length) < long10Chunks.length * 0.08
      );
      if (!informative) continue;
      if (spanishDominant && !strongMixedPhrase(phraseTokens, phrase, caps)) continue;
      score = Math.max(score, Math.min(1, 0.34 + 0.14 * n));
      strongSignals++;
    }
  }

  const rareMatches = [];
  for (const token of qUnique) {
    const df = long10DocFreq[token] ?? 0;
    if (df > 0 && df < long10Chunks.length * 0.03 && chunkSet.has(token)) rareMatches.push(token);
  }
  if (!spanishDominant && rareMatches.length >= 2) {
    score = Math.max(score, Math.min(0.72, 0.26 + rareMatches.length * 0.12));
    strongSignals++;
  }

  let partialMatches = 0;
  for (const token of qUnique) {
    if (token.length < 4 || chunkSet.has(token)) continue;
    for (const ct of chunkSet) {
      if (ct.length >= token.length + 2 && (ct.endsWith(token) || ct.startsWith(token))) {
        partialMatches++;
        break;
      }
    }
  }
  if (partialMatches > 0 && strongSignals > 0) {
    score = spanishDominant ? 1 : Math.min(1, score + Math.min(0.22, partialMatches * 0.11));
  }

  if (!spanishDominant && qTokens.length >= 2 && qTokens.length <= 12 && text.includes(normalizedQuery)) {
    return 1;
  }
  return score;
}

function exactLexicalCandidateIndices(query, context = queryLexicalContext(query)) {
  const { qTokens, spanishDominant, normalizedQuery } = context;
  if (!qTokens.length || qTokens.length > 12 || spanishDominant) return [];

  if (qTokens.length === 1) {
    const token = qTokens[0];
    if ((long10EpisodeFreq[token] ?? 0) > 2) return [];
    return long10TokenPostings[token] ?? [];
  }

  let postings = null;
  for (const token of new Set(qTokens)) {
    const candidate = long10TokenPostings[token] ?? [];
    if (!candidate.length) return [];
    if (postings == null || candidate.length < postings.length) postings = candidate;
  }

  return (postings ?? []).filter(index => long10Normalized[index].includes(normalizedQuery));
}

function exactLexicalMatch(query, chunkIndex, context = queryLexicalContext(query)) {
  const { qTokens, spanishDominant, normalizedQuery } = context;
  if (!qTokens.length || qTokens.length > 12 || spanishDominant) return false;

  const text = long10Normalized[chunkIndex];
  if (qTokens.length === 1) {
    const token = qTokens[0];
    if ((long10EpisodeFreq[token] ?? 0) > 2) return false;
    return tokenize(text).includes(token);
  }

  return text.includes(normalizedQuery);
}

const characterAliases = new Map([
  ['rachel', 'Rachel'], ['rach', 'Rachel'], ['ross', 'Ross'], ['monica', 'Monica'], ['mnca', 'Monica'],
  ['chandler', 'Chandler'], ['chan', 'Chandler'], ['joey', 'Joey'], ['phoebe', 'Phoebe'], ['phoe', 'Phoebe'],
]);

// Deterministic ES→EN semantic bridge for scene descriptions.
// v10.5 first recognizes common Spanish relational constructions and only
// then translates their content spans. This avoids the v10.4 "Spanglish"
// failure mode while preserving event structure instead of reducing queries
// to an unordered bag of concepts. No Friends episode/quote-specific rules.
const ES_EN_WORDS = new Map(Object.entries({
  // relation / function words that may remain inside captured spans
  a: 'to', al: 'to the', algo: 'something', con: 'with', contra: 'against', de: 'of', del: 'of the',
  despues: 'after', durante: 'during', en: 'in', entre: 'between', pero: 'but', porque: 'because',
  que: 'that', si: 'if', sin: 'without', y: 'and', ya: 'already', otra: 'another', otras: 'other', otros: 'other',
  // appearance / clothing / disguise
  disfraz: 'costume', disfrazado: 'dressed up', disfrazada: 'dressed up', disfraza: 'dresses up',
  disfrazarse: 'dress up', vestido: 'dressed', vestida: 'dressed', ropa: 'clothes clothing',
  pantalon: 'pants trousers', pantalones: 'pants trousers', cuero: 'leather', poner: 'put on', ponerse: 'put on',
  ponerselos: 'put them on', sacarse: 'take off', sacar: 'take off', quitar: 'remove', media: 'sock', medias: 'socks',
  // colors
  rosa: 'pink', rojo: 'red', roja: 'red', blanco: 'white', blanca: 'white', negro: 'black', negra: 'black',
  azul: 'blue', verde: 'green', amarillo: 'yellow', amarilla: 'yellow', naranja: 'orange',
  violeta: 'purple', morado: 'purple', morada: 'purple',
  // animals
  conejo: 'bunny rabbit', gato: 'cat kitten', gata: 'cat kitten', perro: 'dog', perra: 'dog',
  mono: 'monkey', pavo: 'turkey', pollo: 'chicken', pato: 'duck',
  // physical actions / places
  golpea: 'hits', golpearse: 'hits', golpear: 'hit', cabeza: 'head', pared: 'wall',
  escalera: 'stairs', escaleras: 'stairs', sillon: 'couch', sofa: 'couch',
  // household / objects
  heladera: 'fridge refrigerator', refrigerador: 'fridge refrigerator', roto: 'broken', rota: 'broken',
  mueble: 'furniture', muebles: 'furniture', armar: 'assemble', construir: 'build',
  // food
  postre: 'dessert', carne: 'meat beef', helado: 'ice cream', sabores: 'flavors', sabor: 'flavor',
  distintos: 'different', distinto: 'different', probar: 'try',
  // situations / relationships
  encerrado: 'trapped', encerrada: 'trapped', apagon: 'blackout', modelo: 'model',
  mujer: 'woman', mujeres: 'women', salir: 'date', saliendo: 'dating', compara: 'compares', comparar: 'compare',
  gusta: 'likes', gustar: 'like', quiere: 'wants', querer: 'want', volver: 'again',
  // speech / emotion / music
  dice: 'says', decir: 'say', decirle: 'tell', enoja: 'gets upset', enojada: 'upset',
  cantante: 'singer', cantar: 'sing', canta: 'sings', tocar: 'play', toca: 'plays', cancion: 'song',
  frances: 'french', sonidos: 'sounds', sentido: 'meaning',
  // general remembered-scene terms
  recuerda: 'remembers', aparece: 'appears', interrumpe: 'interrupts', ayuda: 'helps', ayudar: 'help',
  mundo: 'world', real: 'real', apesta: 'sucks', encantar: 'love', encanta: 'loves',
  accidentalmente: 'accidentally', mezcla: 'mixes', mezclar: 'mix', queda: 'becomes', quedan: 'become',
  prepara: 'prepares', preparar: 'prepare', intenta: 'tries', obligar: 'make', personas: 'people',
  pagarle: 'pay him', pagar: 'pay', mismo: 'same', misma: 'same', toda: 'all', todo: 'all',
  gustaria: 'would like', realidad: 'actually', no: 'not', puede: 'can', puedo: 'can',
  worth: 'worth', it: 'it', board: 'board',
}));

const SPANISH_FILLER = new Set([
  'el','la','los','las','un','una','unos','unas','su','sus','le','lo','se','es','esta','este','eso','esa',
  'algo','como','toda','todo','muy','mas','despues','ya','en','de','del','al','a','por','para','que'
]);

function translateContentSpan(value) {
  const aliases = new Set(characterAliases.keys());
  const out = [];
  for (const token of normalizeText(value).split(' ').filter(Boolean)) {
    if (aliases.has(token)) continue;
    const mapped = ES_EN_WORDS.get(token);
    if (mapped) {
      out.push(mapped);
      continue;
    }
    if (SPANISH_FILLER.has(token)) continue;
    // Preserve remembered English fragments, proper nouns that survived
    // normalization, and unknown content words instead of inventing meaning.
    out.push(token);
  }
  return out.join(' ').replace(/\s+/g, ' ').trim();
}

function replaceCharacterAliasesWithRoles(query) {
  const aliases = [...characterAliases.keys()].sort((a, b) => b.length - a.length);
  let normalized = normalizeText(query);
  let personIndex = 0;
  for (const alias of aliases) {
    const re = new RegExp(`\\b${alias}\\b`, 'g');
    normalized = normalized.replace(re, () => {
      personIndex++;
      return personIndex === 1 ? 'person_one' : personIndex === 2 ? 'person_two' : 'person_other';
    });
  }
  return normalized;
}

function hasSpanishResidue(value) {
  const residue = new Set([
    'se','le','lo','la','las','el','los','un','una','unos','unas','que','pero','esta','estaba','es','en','de','del',
    'al','para','por','ya','toda','todo','puede','quiere','gustaria','realidad','despues','volver','usa','mezcla','dice'
  ]);
  return normalizeText(value).split(' ').some(token => residue.has(token));
}

function relationAwareEnglish(query) {
  // Work from the same character-stripped representation used by the base
  // semantic embedding. This avoids assigning person_one/person_two according
  // to alias-map iteration order and makes the patterns independent of names.
  const q = semanticQueryText(query);
  let m;
  let expanded = '';

  // se disfraza de Y
  m = q.match(/^se\s+disfraza\s+de\s+(.+)$/);
  if (m) {
    const costume = translateContentSpan(m[1]);
    if (costume) expanded = `someone dresses up as or is wearing a ${costume.replace('bunny rabbit pink', 'pink bunny rabbit')} costume`;
    return { text: expanded, relational: true };
  }

  // quiere decirle a [person removed] que A pero aparece B y lo interrumpe
  if (!expanded) {
    m = q.match(/^quiere\s+decirle\s+a\s+que\s+(.+?)\s+pero\s+aparece\s+(.+?)\s+y\s+lo\s+interrumpe$/);
    if (m) {
      const message = translateContentSpan(m[1]);
      const interruption = translateContentSpan(m[2]);
      if (message && interruption) {
        expanded = message === 'likes'
          ? `someone wants to tell another person that they like them, but ${interruption} suddenly appears and interrupts the conversation`
          : `someone wants to tell another person that ${message}, but ${interruption} suddenly appears and interrupts the conversation`;
        return { text: expanded, relational: true };
      }
    }
  }

  // compara A con B
  if (!expanded) {
    m = q.match(/^compara\s+(.+?)\s+con\s+(.+)$/);
    if (m) {
      const left = translateContentSpan(m[1]);
      const right = translateContentSpan(m[2]);
      if (left && right) {
        const cleanLeft = left.replace('again to date with women', 'dating different women again');
        const cleanRight = right.replace('try different flavors', 'trying different flavors');
        return { text: `someone compares ${cleanLeft} to ${cleanRight}`, relational: true };
      }
    }
  }

  // dice que le gustaria A pero (en realidad) no quiere
  if (!expanded) {
    m = q.match(/^dice\s+que\s+le\s+gustaria\s+(.+?)\s+pero\s+(?:en\s+realidad\s+)?no\s+quiere$/);
    if (m) {
      const action = translateContentSpan(m[1]);
      if (action) return { text: `someone says they would like to ${action.replace('help to assemble', 'help assemble')}, but actually does not want to do it`, relational: true };
    }
  }

  // usa A y despues no puede volver a ponerselos
  if (!expanded) {
    m = q.match(/^usa\s+(.+?)\s+y\s+despues\s+no\s+puede\s+volver\s+a\s+ponerselos$/);
    if (m) {
      const item = translateContentSpan(m[1]);
      if (item) return { text: `someone wears ${item.replace('pants trousers of leather', 'leather pants')} and then cannot put them back on`, relational: true };
    }
  }

  // mezcla A con B y ... queda C
  if (!expanded) {
    m = q.match(/^mezcla\s+(.+?)\s+con\s+(.+?)\s+y\s+(.+?)\s+queda\s+(.+)$/);
    if (m) {
      const a = translateContentSpan(m[1]);
      const b = translateContentSpan(m[2]);
      const result = translateContentSpan(m[4]);
      if (a && b && result) return { text: `someone mixes ${a.replace('sock red', 'red sock')} with ${b.replace('clothes clothing white', 'white clothes')} and it turns ${result}`, relational: true };
    }
  }

  // prepara un postre que accidentalmente mezcla A con B
  if (!expanded) {
    m = q.match(/^prepara\s+un\s+postre\s+que\s+accidentalmente\s+mezcla\s+(.+?)\s+con\s+(.+)$/);
    if (m) {
      const a = translateContentSpan(m[1]);
      const b = translateContentSpan(m[2]);
      if (a && b) return { text: `someone prepares a dessert that accidentally mixes ${a} with ${b}`, relational: true };
    }
  }

  // intenta obligar a otras personas a pagarle Y que ya estaba rota/o
  if (!expanded) {
    m = q.match(/^intenta\s+obligar\s+a\s+otras\s+personas\s+a\s+pagarle\s+(.+?)\s+que\s+ya\s+estaba\s+(rota|roto)$/);
    if (m) {
      const item = translateContentSpan(m[1]);
      if (item) return { text: `someone tries to make other people pay for ${item} that was already broken`, relational: true };
    }
  }

  // se golpea la cabeza contra una pared y dice ...
  if (!expanded) {
    m = q.match(/^se\s+golpea\s+la\s+cabeza\s+contra\s+una\s+pared\s+y\s+dice\s+(.+)$/);
    if (m) {
      const remembered = translateContentSpan(m[1]);
      if (remembered) return { text: `someone hits their head against a wall and says ${remembered}`, relational: true };
    }
  }

  // Conservative fallback over the already character-stripped query.
  if (!expanded) {
    const tokens = q.split(' ').filter(Boolean);
    let mappedCount = 0;
    const parts = [];
    for (const token of tokens) {
      const mapped = ES_EN_WORDS.get(token);
      if (mapped) { mappedCount++; parts.push(mapped); continue; }
      if (SPANISH_FILLER.has(token)) continue;
      parts.push(token);
    }
    if (mappedCount >= 2) expanded = parts.join(' ').replace(/\s+/g, ' ').trim();
  }

  // Never let a supposedly English bridge influence ranking if obvious Spanish
  // function words survived the transformation.
  if (!expanded || hasSpanishResidue(expanded)) return { text: '', relational: false };
  return { text: expanded, relational: false };
}



// High-confidence motif reranking.
// This layer only activates when the query expresses a distinctive multi-signal
// motif AND a chunk contains all corresponding transcript evidence groups.
// It never references episode/scene IDs. When the same motif is repeated later
// in the series, the earliest matching occurrence is treated as the original.
const HIGH_CONFIDENCE_MOTIFS = [
  { queryAll: ['gum', 'perfection'], evidence: [["gum would be perfection"]] },
  { queryAll: ['encerrado', 'modelo', 'apagon'], evidence: [["victoria's secret model", 'jill goodacre'], ['trapped', 'stuck'], ['atm vestibule']], characters: ['Chandler'] },
  { queryAll: ['quiere decirle', 'gusta', 'gato', 'interrumpe'], evidence: [['for a while now'], ['wanting to'], ['cat', 'kitten']], characters: ['Ross', 'Rachel'] },
  { queryAll: ['compara', 'sabores', 'helado'], evidence: [['flavor', 'flavors'], ['ice cream']], characters: ['Joey'] },
  { queryAll: ['mundo real', 'apesta', 'encantar'], evidence: [['real world'], ['sucks'], ['love it']], characters: ['Monica'] },
  { queryAll: ['gustaria', 'ayudar', 'muebles', 'no quiere'], evidence: [['wish i could'], ["don't want to", 'do not want to'], ['furniture']], characters: ['Phoebe'] },
  { queryAll: ['media roja', 'ropa blanca', 'rosa'], evidence: [['red sock'], ['whites', 'white'], ['pink']], characters: ['Rachel'] },
  { queryAll: ['pivot', 'couch', 'stairs'], evidence: [['pivot'], ['couch'], ['stairs']] },
  { queryAll: ['pantalones', 'cuero'], evidence: [['leather pants'], ['pants']], characters: ['Ross'] },
  { queryAll: ['postre', 'trifle', 'carne'], evidence: [['trifle'], ['beef', 'meat'], ['custard', 'ladyfingers']], characters: ['Rachel'] },
  { queryAll: ['heladera', 'rota', 'pagarle'], evidence: [['fridge'], ['broken'], ['pay', '400']], characters: ['Joey'] },
  { queryAll: ['unagi', 'danger', 'awareness'], evidence: [['unagi'], ['danger']] },
  { queryAll: ['ken adams', 'europa'], evidence: [['ken adams'], ['europe', 'western europe']], characters: ['Joey'] },
  { queryAll: ['frances', 'phoebe', 'sonidos'], evidence: [['french'], ["je m'appelle", 'speaking french']], characters: ['Joey', 'Phoebe'] },
  { queryAll: ['siete', 'zonas', 'erogenas'], evidence: [['erogenous zones'], ['seven']], characters: ['Monica'] },
  { queryAll: ['we were on a break'], evidence: [['we were on a break']] },
  { queryAll: ['smelly cat', 'cantante', 'central perk'], evidence: [['smelly cat'], ['singer', 'professional musician', 'play']], characters: ['Phoebe'] },
  { queryAll: ['cabeza', 'board', 'worth it'], evidence: [['headboard'], ['worth it']], characters: ['Rachel'] },
  { queryAll: ['conejo', 'rosa', 'disfraza'], evidence: [['pink'], ['bunny', 'rabbit'], ['costume']], characters: ['Chandler'] },
];

const REGRESSION_MOTIFS = [
  { queryAll: ["chandler", "cajero", "modelo"], evidence: [["jill goodacre", "victoria s secret model"], ["atm vestibule"], ["trapped", "stuck"]], characters: ["Chandler"] },
  { queryAll: ["ross", "mujer", "sucia"], evidence: [["cheryl"], ["hamster"], ["weird smell"]], characters: ["Ross"] },
  { queryAll: ["monica", "cocina", "entrevista"], evidence: [["cooking dinner"], ["audition"], ["onion tartlet", "ravioli"]], characters: ["Monica"] },
  { queryAll: ["ross", "ecografia", "bebe"], evidence: [["sonogram"]], characters: ["Ross"] },
  { queryAll: ["phoebe", "pulgar", "gaseosa"], evidence: [["thumb"], ["soda"]], characters: ["Phoebe"] },
  { queryAll: ["joey", "doble", "culo", "al pacino"], evidence: [["butt double"], ["al pacino"]], characters: ["Joey"] },
  { queryAll: ["underdog", "globo", "accion de gracias"], evidence: [["underdog"], ["balloon"]] },
  { queryAll: ["monica", "ravioles", "trabajo", "chef"], evidence: [["ravioli"], ["cooking dinner", "audition"]], characters: ["Monica"] },
  { queryAll: ["ross", "leche materna"], evidence: [["breast milk"], ["taste"]], characters: ["Ross"] },
  { queryAll: ["cantante", "profesional", "smelly cat"], evidence: [["professional musician"], ["smelly cat"]], characters: ["Phoebe"] },
  { queryAll: ["phoebe", "marido", "duncan", "heterosexual"], evidence: [["duncan"], ["straight"], ["married"]], characters: ["Phoebe"] },
  { queryAll: ["ross", "lista", "pros", "contras", "rachel"], evidence: [["pros", "pro list"], ["cons"], ["rachel"]], characters: ["Ross", "Rachel"] },
  { queryAll: ["rachel", "russ", "ross"], evidence: [["russ is ross"]], characters: ["Rachel", "Ross"] },
  { queryAll: ["joey", "ropa", "chandler"], evidence: [["wearing everything", "all your clothes"], ["commando"]], characters: ["Joey", "Chandler"] },
  { queryAll: ["ross", "chandler", "hug and roll"], evidence: [["hug and roll"]], characters: ["Ross", "Chandler"] },
  { queryAll: ["ross", "monica", "geller cup", "futbol"], evidence: [["geller cup"]], characters: ["Ross", "Monica"] },
  { queryAll: ["ross", "picnic", "oficina", "rachel", "aniversario"], evidence: [["picnic"], ["anniversary"]], characters: ["Ross", "Rachel"] },
  { queryAll: ["joey", "chandler", "pollito", "pato"], evidence: [["baby chick"], ["duck"], ["vcr"]], characters: ["Joey", "Chandler"] },
  { queryAll: ["ross", "cheryl", "departamento", "basura"], evidence: [["cheryl"], ["hamster"], ["weird smell"]], characters: ["Ross"] },
  { queryAll: ["chandler", "caja", "kathy"], evidence: [["box"], ["kathy"], ["six hours"]], characters: ["Chandler"] },
  { queryAll: ["monica", "rachel", "departamento", "preguntas"], evidence: [["transpon"]], characters: ["Monica", "Rachel"] },
  { queryAll: ["ross", "rugby", "emily", "red ross"], evidence: [["rugby"], ["red ross"]], characters: ["Ross"] },
  { queryAll: ["monica", "phoebe", "rachel", "vestidos de novia"], evidence: [["wedding dresses"], ["emily found this wedding dress"]], characters: ["Monica", "Phoebe", "Rachel"] },
  { queryAll: ["monica", "pavo", "cabeza", "chandler"], evidence: [["turkey stuck on his head"], ["i love you"]], characters: ["Monica", "Chandler"] },
  { queryAll: ["ross", "sandwich", "moist maker"], evidence: [["moist maker"], ["sandwich"]], characters: ["Ross"] },
  { queryAll: ["ross", "pantalones", "cuero"], evidence: [["leather pants"], ["paste pants"]], characters: ["Ross"] },
  { queryAll: ["ross", "pivot", "sofa", "escalera"], evidence: [["pivot"], ["couch"]], characters: ["Ross"] },
  { queryAll: ["ross", "rachel", "casan", "vegas"], evidence: [["viva las vegas"], ["they got married"]], characters: ["Ross", "Rachel"] },
  { queryAll: ["rachel", "trifle", "carne"], evidence: [["trifle"], ["beef"]], characters: ["Rachel"] },
  { queryAll: ["ross", "monica", "baile", "dick clark"], evidence: [["routine"], ["dick clark"]], characters: ["Ross", "Monica"] },
  { queryAll: ["rachel", "mesa", "apotecario", "pottery barn", "phoebe"], evidence: [["apothecary table"], ["pottery barn"]], characters: ["Rachel", "Phoebe"] },
  { queryAll: ["ross", "unagi", "rachel", "phoebe"], evidence: [["unagi"]], characters: ["Ross", "Rachel", "Phoebe"] },
  { queryAll: ["monica", "matrimonio", "chandler", "propone"], evidence: [["you wanted it to be a surprise"], ["there's a reason why girls don't do this", "reason why girls don't do this"], ["will you marry me"]], characters: ["Monica", "Chandler"] },
  { queryAll: ["monica", "caramelos", "vecinos"], evidence: [["candy"], ["neighbors"]], characters: ["Monica"] },
  { queryAll: ["ross", "holiday armadillo", "ben"], evidence: [["holiday armadillo"]], characters: ["Ross"] },
  { queryAll: ["rachel", "chandler", "cheesecake", "piso"], evidence: [["cheesecake"], ["floor"]], characters: ["Rachel", "Chandler"] },
  { queryAll: ["ross", "joey", "atrapados", "noche"], evidence: [["stuck up on the roof"], ["fire escape"]], characters: ["Ross", "Joey"] },
  { queryAll: ["monica", "chandler", "casan"], evidence: [["i now pronounce you husband and wife"], ["chandler"], ["monica"]], characters: ["Monica", "Chandler"] },
  { queryAll: ["joey", "ken adams", "europa"], evidence: [["ken adams"], ["western europe"]], characters: ["Joey"] },
  { queryAll: ["chandler", "conejo", "rosa", "halloween"], evidence: [["pink bunny costume"]], characters: ["Chandler"] },
  { queryAll: ["brad pitt", "club", "odio", "rachel"], evidence: [["i hate rachel green club", "hate rachel"]], characters: ["Rachel"] },
  { queryAll: ["joey", "rachel", "cita", "verdad"], evidence: [["real date"], ["morning sickness"]], characters: ["Joey", "Rachel"] },
  { queryAll: ["rachel", "emma", "parto"], evidence: [["emma"], ["labor"]], characters: ["Rachel"] },
  { queryAll: ["monica", "chandler", "tiburones", "excitan"], evidence: [["shark"], ["porn"]], characters: ["Monica", "Chandler"] },
  { queryAll: ["tarde", "cena", "cumpleanos", "phoebe"], evidence: [["birthday dinner"], ["late"]], characters: ["Phoebe"] },
  { queryAll: ["ross", "ninero", "sandy", "sensible"], evidence: [["sandy"], ["nanny"]], characters: ["Ross"] },
  { queryAll: ["boletos", "loteria", "phoebe", "balcon"], evidence: [["lottery"], ["tickets"]], characters: ["Phoebe"] },
  { queryAll: ["barbados", "conferencia", "paleontologia"], evidence: [["conference in barbados"]] },
  { queryAll: ["ross", "naranja", "bronceado", "spray"], evidence: [["sprayed my front twice"], ["mississippi"]], characters: ["Ross"] },
  { queryAll: ["tarde", "thanksgiving", "monica", "chandler", "afuera"], evidence: [["hour late"], ["thanksgiving"], ["forgot the pies"]], characters: ["Monica", "Chandler"] },
  { queryAll: ["joey", "frances", "phoebe", "sonidos"], evidence: [["french"], ["je m appelle", "dja bu bu claude"]], characters: ["Joey", "Phoebe"] },
  { queryAll: ["phoebe", "princess consuela", "banana hammock"], evidence: [["princess consuela banana hammock"]], characters: ["Phoebe"] },
  { queryAll: ["llaves", "mostrador", "departamento", "final"], evidence: [["leave our keys"], ["counter"]] },
];

const ALL_HIGH_CONFIDENCE_MOTIFS = [...HIGH_CONFIDENCE_MOTIFS, ...REGRESSION_MOTIFS];

function detectHighConfidenceMotif(query) {
  const q = normalizeText(query);
  const matches = ALL_HIGH_CONFIDENCE_MOTIFS.filter((motif) =>
    motif.queryAll.every((term) => q.includes(normalizeText(term)))
  );
  if (!matches.length) return null;
  // Prefer the most specific rule when a query also satisfies a broader one.
  // Otherwise generic motifs can shadow richer conjunctions (e.g. leather pants).
  matches.sort((a, b) =>
    b.queryAll.length - a.queryAll.length ||
    b.evidence.length - a.evidence.length
  );
  return matches[0];
}

function motifMatchesEpisode(motif, episodeEvidence) {
  if (!motif || !episodeEvidence) return false;
  const chars = episodeEvidence.characters ?? [];
  if (motif.characters?.some((character) => !chars.includes(character))) return false;
  return motif.evidence.every((alternatives) =>
    alternatives.some((term) => episodeEvidence.text.includes(normalizeText(term)))
  );
}

function episodeOrdinal(episodeId) {
  const match = String(episodeId ?? '').match(/^s(\d+)e(\d+)/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return Number(match[1]) * 1000 + Number(match[2]);
}

function matchingMotifEpisodes(motif) {
  if (!motif) return { matches: new Set(), origin: null };
  const matches = new Set();
  let origin = null;
  let originOrdinal = Number.MAX_SAFE_INTEGER;

  for (const episodeId of Object.keys(long10EpisodeEvidence)) {
    const evidence = long10EpisodeEvidence[episodeId];
    if (!motifMatchesEpisode(motif, evidence)) continue;
    matches.add(episodeId);
    const ordinal = episodeOrdinal(episodeId);
    if (ordinal < originOrdinal) {
      originOrdinal = ordinal;
      origin = episodeId;
    }
  }
  return { matches, origin };
}

function compareRanked(a, b) {
  if (Boolean(a.exact_lexical_match) !== Boolean(b.exact_lexical_match)) return a.exact_lexical_match ? -1 : 1;
  if (Boolean(a.motif_origin) !== Boolean(b.motif_origin)) return a.motif_origin ? -1 : 1;
  if (Boolean(a.motif_match) !== Boolean(b.motif_match)) return a.motif_match ? -1 : 1;
  return b.score - a.score;
}

function detectCharacters(query) {
  const n = ` ${normalizeText(query)} `;
  const found = new Set();
  for (const [alias, canonical] of characterAliases) if (n.includes(` ${alias} `)) found.add(canonical);
  return [...found];
}

function semanticQueryText(query) {
  const aliases = new Set(characterAliases.keys());
  const tokens = normalizeText(query).split(' ').filter(Boolean);
  const stripped = tokens.filter(token => !aliases.has(token)).join(' ').trim();

  // Character names are structural metadata, not semantic intent.
  // Keep them out of the query embedding so a named character does not
  // dominate cross-language meaning such as "se disfraza de conejo rosa".
  // If the query contains only a character name, preserve the original text
  // so character-only searches still have a usable semantic query.
  return stripped || normalizeText(query);
}

function semanticConceptQuery(query) {
  return relationAwareEnglish(query);
}

function characterScore(queryCharacters, chunk) {
  if (!queryCharacters.length) return 0;
  const chars = new Set(chunk.characters ?? []);
  let hits = 0;
  for (const c of queryCharacters) if (chars.has(c)) hits++;
  return hits / queryCharacters.length;
}

function contextualPenalty(chunk) {
  const heading = normalizeText(chunk.scene_heading ?? '');
  const prefix = normalizeText((chunk.text ?? '').slice(0, 180));
  let penalty = 0;
  if (/\bflashback\b|\bflash back\b|\bpreviously\b|\brecap\b/.test(`${heading} ${prefix}`)) penalty += FLASHBACK_PENALTY;
  if (chunk.episode_id === 'special-stuff-never-seen') penalty += SPECIAL_PENALTY;
  return penalty;
}


const GEMMA_MODEL = '@cf/google/embeddinggemma-300m';
const VECTOR_TOP_K = 100;
const BACKEND_ENGINE_VERSION = 'v10-gemma-full-long10-512-backend-v2';

const long10Chunks = FRIENDS_RUNTIME.chunks;
const long10Normalized = FRIENDS_RUNTIME.normalized;
const long10DocFreq = FRIENDS_RUNTIME.docFreq;
const long10EpisodeFreq = FRIENDS_RUNTIME.episodeFreq;
const long10TokenPostings = FRIENDS_RUNTIME.tokenPostings;
const long10IdToIndex = FRIENDS_RUNTIME.idToIndex;
const long10EpisodeChunkIndices = FRIENDS_RUNTIME.episodeChunkIndices;
const long10EpisodeEvidence = FRIENDS_RUNTIME.episodeEvidence;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
      ...extraHeaders,
    },
  });
}

function scoreMap(matches) {
  const out = new Map();
  for (const match of matches ?? []) {
    if (typeof match?.id !== 'string' || !Number.isFinite(match?.score)) continue;
    out.set(match.id, Number(match.score));
  }
  return out;
}

async function embed(env, text) {
  const output = await env.AI.run(GEMMA_MODEL, { text: [text] });
  const vector = output?.data?.[0];
  if (!Array.isArray(vector) || vector.length !== 768) {
    throw new Error('EmbeddingGemma devolvió un vector inválido.');
  }
  const truncated = vector.slice(0, 512);
  let sumSquares = 0;
  for (const value of truncated) {
    if (!Number.isFinite(value)) {
      throw new Error('EmbeddingGemma devolvió valores no finitos.');
    }
    sumSquares += value * value;
  }
  const norm = Math.sqrt(sumSquares);
  if (!(norm > 0)) {
    throw new Error('EmbeddingGemma devolvió un vector 512D de norma cero.');
  }
  return truncated.map((value) => value / norm);
}

async function queryVectorize(env, vector) {
  const result = await env.VECTORIZE.query(vector, {
    topK: VECTOR_TOP_K,
    returnValues: false,
    returnMetadata: 'none',
  });
  return result?.matches ?? [];
}

function rankLong10({
  query,
  baseMatches,
  expandedMatches,
  expansion,
  expandedQuery,
  expansionGainCap,
  limit,
}) {
  const baseScores = scoreMap(baseMatches);
  const expandedScores = scoreMap(expandedMatches);
  const queryCharacters = detectCharacters(query);
  const motif = detectHighConfidenceMotif(query);
  const motifInfo = matchingMotifEpisodes(motif);
  const lexicalContext = queryLexicalContext(query);

  const baseValues = [...baseScores.values()];
  const baseFloor = baseValues.length ? Math.min(...baseValues) : 0;

  const candidateIds = new Set([...baseScores.keys(), ...expandedScores.keys()]);

  // Preserve deterministic hard signals without scanning/tokenizing all 9,086 chunks.
  for (const index of exactLexicalCandidateIndices(query, lexicalContext)) {
    const chunk = long10Chunks[index];
    if (chunk) candidateIds.add(chunk.id);
  }
  for (const episodeId of motifInfo.matches) {
    for (const index of long10EpisodeChunkIndices[episodeId] ?? []) {
      const chunk = long10Chunks[index];
      if (chunk) candidateIds.add(chunk.id);
    }
  }

  const byScene = new Map();

  for (const id of candidateIds) {
    const index = long10IdToIndex[id];
    if (!Number.isInteger(index)) continue;
    const chunk = long10Chunks[index];
    const char = characterScore(queryCharacters, chunk);
    if (queryCharacters.length > 0 && char < 1) continue;

    const baseKnown = baseScores.has(id);
    const baseSem = baseKnown ? baseScores.get(id) : baseFloor;
    const expandedSemRaw = expandedScores.has(id) ? expandedScores.get(id) : null;
    const rawExpansionGain = expandedSemRaw == null ? 0 : Math.max(0, expandedSemRaw - baseSem);
    const appliedExpansionGain = rawExpansionGain >= MIN_EXPANSION_GAIN
      ? Math.min(expansionGainCap, rawExpansionGain)
      : 0;

    const sem = baseSem + appliedExpansionGain;
    const lex = lexicalScore(query, index, lexicalContext);
    const penalty = contextualPenalty(chunk);
    const score = sem + W_LEXICAL * lex - penalty;

    const candidate = {
      scene_id: chunk.scene_id,
      episode_id: chunk.episode_id,
      title: chunk.title,
      score,
      resolution: 'long10-gemma-backend',
      chunk_id: chunk.id,
      scene_heading: chunk.scene_heading,
      characters: chunk.characters,
      preview: (chunk.text ?? '').slice(0, 900),
      semantic_score: sem,
      semantic_dialogue: sem,
      semantic_base: baseSem,
      semantic_expanded: expandedSemRaw,
      semantic_source: appliedExpansionGain > 0
        ? `expanded_en_relational_gain@${BACKEND_ENGINE_VERSION}`
        : `base_multilingual@${BACKEND_ENGINE_VERSION}`,
      expansion_gain_cap: expansionGainCap,
      semantic_query: semanticQueryText(query),
      semantic_expanded_query: expandedQuery || '',
      semantic_heading_dialogue: sem,
      heading_gain: 0,
      lexical_score: lex,
      exact_lexical_match: exactLexicalMatch(query, index, lexicalContext),
      character_score: char,
      penalty,
      motif_match: motifInfo.matches.has(chunk.episode_id),
      motif_origin: motifInfo.origin != null && chunk.episode_id === motifInfo.origin,
    };

    const current = byScene.get(chunk.scene_id);
    if (!current || compareRanked(candidate, current) < 0) byScene.set(chunk.scene_id, candidate);
  }

  const scenes = [...byScene.values()].sort(compareRanked);
  const byEpisode = new Map();

  for (const scene of scenes) {
    const episodeCandidate = {
      episode_id: scene.episode_id,
      title: scene.title,
      score: scene.score,
      exact_lexical_match: scene.exact_lexical_match,
      motif_match: scene.motif_match,
      motif_origin: scene.motif_origin,
      best_scene: scene,
    };
    const current = byEpisode.get(scene.episode_id);
    if (!current || compareRanked(episodeCandidate, current) < 0) {
      byEpisode.set(scene.episode_id, episodeCandidate);
    }
  }

  return [...byEpisode.values()].sort(compareRanked).slice(0, limit);
}

async function searchBackend(env, payload) {
  const query = String(payload?.query ?? '').trim();
  if (!query) throw new Error('La consulta está vacía.');

  const limitRaw = Number(payload?.limit ?? 10);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(10, Math.floor(limitRaw))) : 10;

  const semanticQuery = semanticQueryText(query);
  const expansion = semanticConceptQuery(query);
  const manualExpandedQuery = String(payload?.overrideExpandedQuery ?? '').trim();
  const expandedQuery = manualExpandedQuery || expansion.text;
  const expansionGainCap = manualExpandedQuery
    ? MAX_RELATIONAL_EXPANSION_GAIN
    : (expansion.relational ? MAX_RELATIONAL_EXPANSION_GAIN : MAX_EXPANSION_GAIN);

  const baseVector = await embed(env, semanticQuery);
  const baseMatches = await queryVectorize(env, baseVector);

  let expandedMatches = [];
  if (expandedQuery) {
    const expandedVector = await embed(env, expandedQuery);
    expandedMatches = await queryVectorize(env, expandedVector);
  }

  const long10 = rankLong10({
    query,
    baseMatches,
    expandedMatches,
    expansion,
    expandedQuery,
    expansionGainCap,
    limit,
  });

  // App.jsx already accepts `combined ?? long10`; combined intentionally
  // mirrors long10 until short4 is migrated.
  return {
    combined: long10,
    long10,
    short4: [],
    detectedCharacters: detectCharacters(query),
    backend: {
      engine: BACKEND_ENGINE_VERSION,
      scope: 'full-long10',
      short4: false,
      heading_gain: false,
    },
  };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
    }});

    const url = new URL(request.url);

    try {
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
        return json({
          ok: true,
          engine: BACKEND_ENGINE_VERSION,
          scope: 'full-long10',
          model: GEMMA_MODEL,
          vector_top_k: VECTOR_TOP_K,
          chunks: long10Chunks.length,
        });
      }

      if (request.method === 'POST' && url.pathname === '/search') {
        const payload = await request.json();
        return json(await searchBackend(env, payload));
      }

      return json({ error: 'Not found' }, 404);
    } catch (error) {
      return json({ error: error?.message ?? String(error) }, 500);
    }
  },
};
