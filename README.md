# Farming

Version 0.1.0 is the verified minimal local release: idea generation, content
generation, image generation, and production-stage tracking have all been
smoke-tested end-to-end against real local Ollama and Draw Things instances.

Version 0.2.0 adds preferred completed-image selection (with
server-authoritative validation of the selection) and a read-only Production
Summary on the Overview tab.

Farming is a local-first content production workspace for gardening and
hydroponics projects. The minimal local version supports:

- research-based idea generation with Ollama;
- YouTube script and PDF draft generation with Ollama, with the generated PDF
  draft editable and exportable as a PDF from the Content tab;
- local image generation through the Draw Things HTTP API; and
- manual production tracking from Idea → Draft → Created → Published.

Project metadata is stored as JSON under `data/projects/`. Imported and
generated media stays inside the corresponding local project folder.

## Requirements

- Node.js 20 or newer
- npm
- Ollama running locally
- Draw Things running locally with its HTTP API enabled

The default local service configuration is:

| Service | Default |
| --- | --- |
| Farming backend | `http://localhost:4000` |
| Farming frontend | `http://localhost:5173` |
| Ollama | `http://localhost:11434` |
| Ollama model | `qwen2.5:14b-instruct` |
| Draw Things HTTP API | `http://127.0.0.1:7860` |

## First-time setup

Install the locked Node dependencies:

```sh
npm ci
```

Install the default Ollama model if it is not already present:

```sh
ollama pull qwen2.5:14b-instruct
```

Start Ollama and confirm that it responds:

```sh
ollama serve
curl http://127.0.0.1:11434/api/version
curl http://127.0.0.1:11434/api/tags
```

Start Draw Things, enable its local HTTP API, and confirm that the active model
endpoint responds:

```sh
curl http://127.0.0.1:7860/sdapi/v1/options
```

The model reported by Draw Things is the model actually used for generation.
Farming records that value with each completed image when the endpoint reports
it.

## Launch locally

Run the backend in one terminal:

```sh
npm run server
```

Run the frontend in a second terminal:

```sh
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

The status panel should report that the Farming backend and Ollama are
connected. Draw Things connectivity is checked when an image is generated; a
connection failure is shown on the image job.

## Optional configuration

The backend reads these environment variables:

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | Farming backend port | `4000` |
| `FARMING_DATA_DIR` | Alternate local data root | repository `data/` folder |
| `OLLAMA_HOST` | Ollama base URL | `http://localhost:11434` |
| `OLLAMA_MODEL` | Ollama model used for generation | `qwen2.5:14b-instruct` |
| `DRAW_THINGS_URL` | Draw Things HTTP API base URL | `http://127.0.0.1:7860` |

Set overrides on the backend process. For example:

```sh
OLLAMA_MODEL=my-local-model DRAW_THINGS_URL=http://127.0.0.1:7860 npm run server
```

## Minimal workflow smoke test

1. Create a project and add a few research notes.
2. Open Ideas, generate one idea, review it, and accept it.
3. Mark the idea Approved and select it for production.
4. Create a Design Brief from the selected idea.
5. Open Content and generate a YouTube script or PDF draft.
6. Open Image Generation, create an image job, and generate one image through
   Draw Things.
7. Edit the idea's Production stage through Idea, Draft, Created, and
   Published, confirming each stage appears on its idea card.
8. Return to the project list, reopen the project, and confirm the accepted
   idea, draft, completed image, and production stage are still present.

## Verification

Run the complete automated checks:

```sh
npm run lint
npm test
npm run build
```

The tests use isolated temporary project folders and local stub servers for
Ollama and Draw Things. They do not require either provider to be running.
