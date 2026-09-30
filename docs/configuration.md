# Configuration

Both `npm run dev` and `npm start` read `.env`.

| Variable | Default | Role |
|---|---|---|
| `OPENAI_API_KEY` | — | Required. Stays in the Node process. |
| `MEMORY` | `true` | The `remember` and `forget` tools, and the memory block in the prompt |
| `OPENAI_VOICE` | `ripple` | Initial voice: ripple, vesper, stone, meridian, tempo, beacon, cinder |
| `OPENAI_LIVE_MODEL` | `gpt-live-1` | Preselected GPT-Live model |
| `OPENAI_BACKEND_MODEL` | `gpt-5.6-terra` | Preselected Responses backend for reasoning and tools |
| `WEB_SEARCH` | `true` | Hosted web search; browsers may disable it |
| `OPENAI_BASE_URL` | OpenAI | Points the proxy at a gateway or a stub |
| `PORT` | `5173` | |
| `SSL_KEY`, `SSL_CERT` | — | Paths to a real certificate; `npm start` then serves HTTPS |

The picker lists GPT-Live models accessible to your API key. Alan defaults to
Ripple. An authorized voice outside the list can be set with `OPENAI_VOICE`.

The third picker is the other end of the call: the Responses model Alan
delegates reasoning, lookups and tool calls to. It lists the text models your
key can reach from GPT-5 on — older families, the speech, image and embedding
models that share the prefix, the dated snapshots and the Codex builds are left
out; a later family is let through by its number, so a GPT-6 appears on its own
— with `OPENAI_BACKEND_MODEL` preselected
and always offered, whether or not the key lists it. Naming anything else is
refused by the proxy and the configured backend is minted instead;
`OPENAI_BACKEND_MODEL` is how you run on something outside that set.

Changing voice, model or backend reconnects with recent history.

Replace `OPENAI_REALTIME_MODEL` in existing `.env` files with
`OPENAI_LIVE_MODEL=gpt-live-1`. This clone uses the Live protocol only.

## On a phone

```sh
npm run dev:lan           # → https://192.168.x.x:5173, printed on start
```

Microphone access needs a secure context. `localhost` is one; a LAN address over
plain HTTP is not — `navigator.mediaDevices` doesn't exist there, so the page
can't even raise the mic prompt. The `:lan` scripts serve HTTPS with a
self-signed certificate, cached in `node_modules/.vite/`.

No browser trusts that certificate, so the phone shows a warning the first time
("Advanced" → proceed on Chrome, "Show details" → "visit this website" on
Safari). Tap through it once per device. To skip it, point `SSL_KEY` and
`SSL_CERT` at a certificate the device already trusts —
[mkcert](https://github.com/FiloSottile/mkcert) issues one for a LAN IP.

## Docker

```sh
docker run --rm -p 5173:5173 -e OPENAI_API_KEY=sk-... h1ddenpr0cess20/alan
```

Images go to Docker Hub on every push to `main` (`latest`) and on `v*` tags
(`1.2.3`, `1.2`), for `linux/amd64` and `linux/arm64`. Configuration is the same
set of variables as `.env` — pass them with `-e` or `--env-file .env`.

The container serves HTTP on `PORT` and expects TLS to be terminated in front of
it; to serve TLS from the container, mount a certificate and set `SSL_KEY` and
`SSL_CERT`. Build it yourself with `docker build -t alan .`. Publishing from a
fork needs a `DOCKERHUB_TOKEN` secret, plus a `DOCKERHUB_USERNAME` variable if
your Docker Hub account isn't `h1ddenpr0cess20`.

## Tools

GPT-Live handles speech while a Responses backend handles reasoning and tools.
The managed backend supports `web_search` and custom `function` tools. Search
is enabled by default; the memory functions are retained.
MCP, file search, image generation and code interpreter are not declared because
they are not supported by Live's managed Responses configuration.

The tools panel stores each browser's search preference and reconnects the call
when it changes. `WEB_SEARCH=false` disables search server-wide. Source links
appear below spoken captions — each cited page once, the oldest giving way past
six, and cleared along with the caption they belong to. Backend text is not
presented as speech.

Official contracts: [Live tools](https://developers.openai.com/api/docs/guides/live-delegation),
[session configuration](https://developers.openai.com/api/docs/guides/live-conversations),
and [WebRTC](https://developers.openai.com/api/docs/guides/voice-webrtc?api=live).

## The log and the memory

`log` opens past conversations, newest first. `new` closes the record and, if a
call is up, dials again — the model's memory of what was said is the call
itself, so a new call is the only thing that clears it. `clear` asks once, then
removes the log.

`memory` opens the short list of details Alan carries between calls. Ask it to
remember something and it calls `remember`; ask it to forget it and it calls
`forget`, which drops every stored line matching the keyword. You can also add a
line by hand, drop one, switch the whole thing off, or clear it. `MEMORY=false`
removes the tools and the prompt block for everyone the server serves.

Editing the list by hand takes effect on the next call rather than the current
one — the instructions are set when the Live session is created, and the page has no
copy of the persona to re-send with. A `remember` the model makes mid-call needs
no such round trip: it already knows what it just stored, because the tool
result said so.

Both live in `localStorage`, in the browser that made the call — see the
[design notes](design.md#storage) for the caps and what crosses the wire.
