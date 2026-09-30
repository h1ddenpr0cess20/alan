import { createOpenAIClient } from './openai.js';
import { sameOrigin } from './origin.js';

// A session request carries the page's memories, so the cap is the memory list
// rather than a model name.
const BODY_LIMIT = 64 * 1024;

function sendJSON(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

// Past the limit we stop keeping the body but keep reading it, up to a hard
// ceiling. Answering while the client is still uploading leaves it writing into
// a socket nobody is draining, which hangs the request instead of failing it.
const DRAIN_LIMIT = 4 * 1024 * 1024;

async function readJSON(req) {
  const chunks = [];
  let size = 0;
  let over = false;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) {
      over = true;
      chunks.length = 0;
      if (size > DRAIN_LIMIT) {
        req.destroy();
        break;
      }
      continue;
    }
    chunks.push(chunk);
  }
  if (over) throw new Error('request body too large');
  if (!chunks.length) return {};
  const body = JSON.parse(Buffer.concat(chunks).toString());
  if (body === null || typeof body !== 'object') throw new Error('body is not an object');
  return body;
}

/** The HTTP surface: the pickers' catalog, and minting a call. */
export function createApiMiddleware(config) {
  const openai = createOpenAIClient(config);

  return async function api(req, res, next) {
    const path = req.url.split('?')[0];
    if (!path.startsWith('/api/')) return next();

    /**
     * Anything that changes something has to have been asked for from this
     * page. A cross-site POST needs no preflight if it keeps the content type
     * simple, and this API takes a body without looking at that header — so
     * without this, a page in another tab could open calls on this server's
     * key, with whatever memories it liked handed to the model.
     */
    if (req.method !== 'GET' && req.method !== 'HEAD' && !sameOrigin(req)) {
      /** Refusing in silence makes this impossible to tell from a bug. */
      console.warn(`api: refused ${req.method} ${path} — origin ${req.headers.origin ?? 'none'}`
        + ` against host ${req.headers.host ?? req.headers[':authority'] ?? 'none'}`);
      return sendJSON(res, 403, { error: 'that did not come from this page' });
    }

    try {
      if (path === '/api/models' && req.method === 'GET') {
        if (!config.apiKey) return sendJSON(res, 500, { error: 'OPENAI_API_KEY is not set' });
        const { models, backendModels } = await openai.catalog();
        return sendJSON(res, 200, {
          models,
          model: config.defaultModel,
          /** The other end of the call: what reasons and runs the tools. */
          backendModels,
          backendModel: config.backendModel,
          voices: config.voices,
          voice: config.defaultVoice,
          memory: config.memory,
          /** The tools the page may switch off for its own call. */
          switches: config.webSearch ? [{ name: 'web_search', label: 'web search' }] : [],
        });
      }

      if (path === '/api/session' && req.method === 'POST') {
        if (!config.apiKey) return sendJSON(res, 500, { error: 'OPENAI_API_KEY is not set' });
        let payload;
        try {
          payload = await readJSON(req);
        } catch {
          return sendJSON(res, 400, { error: 'malformed request body' });
        }
        if (typeof payload.sdp !== 'string' || !payload.sdp.trim()) {
          return sendJSON(res, 400, { error: 'An SDP offer is required' });
        }
        return sendJSON(res, 200, await openai.createLiveSession(payload));
      }
    } catch (err) {
      return sendJSON(res, 502, { error: err?.message ?? String(err) });
    }

    sendJSON(res, 404, { error: `no route for ${req.method} ${path}` });
  };
}
