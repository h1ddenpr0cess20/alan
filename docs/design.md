# Design notes

How Alan is put together. The [README](../README.md) covers running it;
[configuration](configuration.md) covers the knobs.

## How the call is wired

The API key stays on the server. The browser gathers an SDP offer and posts it
with model, voice, memories, startup history and disabled tools to `/api/session`.
The proxy creates `/v1/live/sessions`; the browser applies `transport.sdp` and
waits for `session.started`. Audio flows directly over WebRTC, and transcripts
and delegated Responses events use the `oai-events` data channel.

GPT-Live handles full-duplex speech. Its Responses backend reasons and uses tools.
Typed input uses `response.item.create` followed by `response.create`; notes
from the page use `session.commentary.append`. Escape requests a speech
interruption.

Model, voice and tool changes reconnect with recent history. Hangup stops capture
and playback, sends `session.close`, and keeps the transport alive until
`session.closed` or a 15-second timeout. Voice usage is cumulative seconds;
backend usage is separate. Recording is not enabled.

The proxy is connect-style middleware rather than a server, so there's only one
implementation of `/api/*`: `vite.config.js` mounts it in development and
`src/server/app.js` mounts it in front of the static handler in production. No
second process, and the key lives in one place either way.

## Storage

History, memory and tool preferences use `alan.history.v1`, `alan.memory.v1`
and `alan.tools.v1` in browser storage. Relevant memory and resumed history are
sent through the proxy to OpenAI when creating a session; the proxy stores no copy.
Startup history is restricted to user and assistant text, at most 40 messages
and 6,000 UTF-8 bytes, and supplied as `session.input`.

Transcript fragments retain their exact text and timestamps. Each speaker has
independent display groups with stable IDs; later fragments update existing
history rows. A 1.5-second timestamp gap starts a new display group. This is a UI
heuristic, not a semantic turn boundary, and never triggers tool execution.

Nested `response.event` envelopes carry backend work. Completed function items
are collected before the terminal response event, executed once, and all outputs
are submitted through `response.item.create` before one `response.create`
continuation. Late results from disconnected calls are discarded. Backend output
is not spoken-caption text; its URL annotations become clickable sources under
the caption, deduplicated, the oldest giving way past six, and cleared with the
caption they belong to.

## The eye

A sphere of clear glass with a blue iris suspended inside it. The glass is a
transmissive physical material (index 1.5, all but perfectly smooth), and
transmission only refracts what is opaque — so the iris and the pupil are
opaque discs inside the ball, and behind everything hangs a dark backdrop, a
big inside-out sphere with a little light high up. Without it the glass would
bend the renderer's stand-in for "nothing here", a flat half-white, and clear
glass would come out milky. The iris is painted once onto a canvas
(`eye/iris.js`): pale at the collarette, deepening outwards, a dark limbal ring,
radial fibres and a few crypts. The pupil is its own disc, so it can dilate.

Nothing it does is a canned animation: every frame is springs chasing targets.

## States

`idle` · `listening` · `thinking` · `speaking` — each a set of targets for the
pupil, the iris's glow, the float, the drift and the lean (`eye/moods.js`).
Alan eases between them, so a change of state reads as the same eye changing
its mind rather than a cut.

- **idle** — floats and drifts, pupil at rest, and watches the room.
- **listening** — comes toward you a little and opens its pupil.
- **thinking** — draws back, narrows its pupil, the iris pulses faintly, and it
  looks everywhere at once.
- **speaking** — the iris glows with the voice and the pupil kicks on each burst.

Transcript activity drives listening and speaking. Backend work drives thinking
between transcript updates. The display timeout is a visual heuristic, not proof
of audio playback completion.

## Where it looks

`eye/attention.js` decides, a frame at a time, and hands back a gaze and how
fast to get there. The gaze is two angles measured from "straight at the
camera", so it keeps finding you however the view is orbited.

- **track** — the pointer moved in the last three seconds: Alan follows it.
  The pointer's ray meets a plane a little in front of the eye and the eye looks
  at that point, so the edge of the screen turns it well round without it ever
  looking cross-eyed at its own glass. Small moves are followed smoothly; a big
  jump is a saccade.
- **survey** — idle, and nobody pointing: it sweeps the room like a security
  camera. Slow pans at a camera's speed rather than an eye's, a pause at either
  end, a dart at something now and then — and always, sooner or later, a look
  back at you.
- **regard** — listening or speaking with no pointer: it holds the viewer, with
  the small jumps a real eye makes between two points on a face. Speaking, it
  sometimes looks away mid-pronouncement.
- **scan** — thinking: rapid looks all round, many a second.

Left alone, every so often it rolls its eye — the gaze traces a full circle —
or tumbles over once in the air, drifting a little sideways as it goes. Thinking
does the same, more often.

Three nested groups keep those motions apart: the outer one carries the float,
the drift and the lean toward the camera; the middle one the tumble; the inner
one the gaze. The gaze springs are stepped at 120 Hz whatever the frame rate,
because a saccade's is stiff enough to go unstable on a slow frame.

## Layout

```
Dockerfile              Build the client, then serve it from src/server
index.html              Markup only — Vite's entry
src/
  client/
    main.js             The wiring, and nothing else
    styles.css          The HUD around Alan
    api.js              The server's endpoints, as functions
    history.js          Past conversations in localStorage, and picking one up
    memory.js           What it remembers between calls, in localStorage
    tools.js            Which of the server's tools this browser switched off
    eye/                Geometry and animation. Knows nothing about transports
      index.js            The controller, the pointer, and the per-frame loop
      attention.js        Where it looks: track, survey, regard, scan, gestures
      gaze.js             Gaze as two angles, and the pointer as a gaze
      moods.js            Targets per conversational state
      motion.js           The spring and the chase every channel eases on
      model.js            The glass, the iris and the pupil; the backdrop
      iris.js             The blue iris, painted once onto a canvas
      environment.js      A cold studio for the glass to reflect
    session/            The call. Emits transport-agnostic events
      index.js            Lifecycle: mic, session, connect, meter, tear down
      webrtc.js           Peer connection, data channel, SDP handshake
      events.js           Live and nested Responses events → this vocabulary
      tools.js            remember/forget, answered in the page
      metering.js         Two analysers → one 0..1 number per frame
      emitter.js
    ui/
      hud.js              Status chip, transcript, caption
      menu.js             The corner menu, and the list of panels it drops
      history.js          The log panel behind `log` in the menu, and its `continue`
      memory.js           The memory panel behind `memory` in the menu
      tools.js            The tool switches behind `tools` in the menu — web search
      controls.js         Mic (tap mutes, hold hangs up), field, send, pickers
      viewport.js         Keeps the composer above the on-screen keyboard
    vendor/
      gfx/                The 3D engine: <three-d-stage>, WebGPU, else WebGL 2
  server/
    index.js            Entry point
    app.js              The middleware chain
    api.js              /api/models + /api/session
    openai.js           The two calls it makes
    persona.js          Who Alan is, and the session config
    origin.js           Who is allowed to ask for a change
    config.js           The environment, resolved once
    static.js           Hosting for dist/ — production only
docs/                   These notes, configuration, policies, screenshots
test/                   node:test, against a stub OpenAI
.github/workflows/      CI (lint, tests, build smoke test), CodeQL, Docker publish
```

`src/client/vendor/gfx/` is the 3D engine, shared with the other characters:
`<three-d-stage>` (studio lighting, ground shadow, orbit controls, framing,
resize), the scene API the rig is built from — handed over as `GFX` — and the
same shading in WGSL for WebGPU and GLSL for WebGL 2. WebGPU is tried first,
WebGL 2 takes over where it is missing or its device is lost, and
`?renderer=webgl` pins the fallback. Its maths follow three.js r186 closely;
`vendor/gfx/LICENSE` says which parts are ported.
The shaders are plain `.glsl` and `.wgsl` files under `vendor/gfx/shaders/`,
put together per draw by `glsl.js` and `wgsl.js`.

## The transport seam

`session/index.js` exposes `on`, `start`, `stop`, `send`, `note`, `cancel`,
`context`, `messages`, `connected`, `busy`, `stale`, `state`, `muted`, `model`,
`voice` — and emits:

```
'state'   connecting | listening | thinking | speaking | idle
'caption' the assistant's spoken row so far, whole — it replaces, not appends
'user'    the person's spoken row so far, whole
'source'  a url_citation the backend attached to what it answered
'tool'    a label while a tool works, or null
'memory'  the result of a remember/forget the model just called
'level'   0..1 sustained amplitude, per frame
'pulse'   0..1 transient, one per discrete event
'message' a row as it stands, { id, role, content, fragments } — what the log stores
'busy'    whether a backend response is in flight
'usage'   cumulative voice usage; `final` on the last one
'backend' a delegated response that settled, with its own usage
'error'   { message }
```

A spoken row grows: `caption`, `user` and `message` are re-emitted with the
whole row each time a fragment lands in it, identified by a stable `id`. The HUD
replaces what it is showing, and the log rewrites that row rather than adding
one. Those rewrites are held briefly before the log is serialised, so a sentence
costs one write instead of one per word; ending a call settles what is held.

Alan takes audio-shaped input:

```js
alan.setState('speaking')  // idle | listening | thinking | speaking
alan.setLevel(0.62)        // sustained amplitude 0..1, sampled per frame
alan.pulse(0.4)            // transient impulse 0..1, one per discrete event
```

Both land on the same internal energy value. `setLevel` carries the voice — two
`AnalyserNode`s, one on the mic and one on the model's track, read per frame and
smoothed with a fast attack and a slow release. `pulse` is for the beats where a
turn changes hands: it kicks the pupil and the float directly as well as the
energy, so the glow punctuates instead of strobing.

Swapping providers means writing a different `createVoiceSession()` with that
surface. `main.js` and the eye don't change.
