# Troubleshooting GlassGem

Step-by-step fixes for the problems users actually run into. The short
version lives in the [README](../README.md); this page goes deeper.

## First: the 60-second health check

1. Is the Web2API server up? Open <http://127.0.0.1:8081/v1/models> —
   a model list (or even a `401` with your key required) proves it is alive.
2. Does GlassGem agree? The status pill in the top bar should say
   **● Connected**. Click it for URL, model, latency and last success.
3. Still stuck? Enable **Settings → General → Debug panel** — the bug icon
   shows every request GlassGem made: endpoint, status, duration, usage
   (never the API key).

## Startup

| Symptom | Cause | Fix |
| --- | --- | --- |
| `npm install` fails downloading Electron | The Electron binary comes from GitHub releases; corporate proxies or blocked networks break it. | Web version is unaffected. For the desktop app set `ELECTRON_MIRROR=https://registry.npmmirror.com/-/binary/electron/` or `HTTPS_PROXY=http://proxy:port`, then re-run `run-desktop.bat clean`. |
| *MOCK server* warning at startup | No backend binary could be built or downloaded, so GlassGem started the built-in mock (sample answers only). | Install [Go](https://go.dev) 1.22+ (so the bundled sources can be built), or allow the prebuilt download from github.com. See [BACKEND.md](./BACKEND.md). |
| Port 8081 already in use | Another Web2API instance (or a different app) holds the port. | `npm run web2api:stop`, or point GlassGem at the other port in Settings → API. |
| Port 17384 already in use (desktop) | A second GlassGem desktop instance. | Close it, or set `GLASSGEM_DESKTOP_PORT` before launching. |

## Connection

| Symptom | Cause | Fix |
| --- | --- | --- |
| *Unable to connect to Gemini Web2API* | Nothing is listening at the Base URL. | Start the server (`run.bat` / `./run.sh` do it automatically); check `.web2api.log`; confirm the URL ends with `/v1`. |
| Works with proxy on, fails with it off | CORS — the browser blocks direct cross-origin calls to Web2API. | Keep **Use local proxy** enabled (Settings → API). |
| *API key rejected (401)* | Key mismatch. | Enter the key from the server's `config.json` (default `sk-gemini`). |
| *Access denied (403)* | Server-side refusal — usually an expired Gemini session cookie on the Web2API side. | Re-login / refresh cookies on the server; see [BACKEND.md](./BACKEND.md#the-backend-in-60-seconds). |
| *Endpoint or model not found (404)* | Wrong Base URL or unknown model ID. | URL must end with `/v1`; pick a model from the discovered list or add a custom ID. |
| *Rate limited (429)* | Gemini is throttling. | Wait and retry; heavy usage can trigger this even though Web2API retries automatically. |
| *Web2API server error (5xx)* | The backend crashed handling the request. | Read the stack trace in the server window / `.web2api.log`. Gemini cookies may need refreshing. |
| *Invalid response* | The URL points at an HTML page, not the API. | Fix the Base URL (should be JSON, not a web page). |
| Request times out on slow models | The non-streaming request exceeded the timeout. | Settings → API → **Request timeout** → 5 or 10 minutes. Streaming responses never time out — enable them in Settings → Chat. |

## Chat behaviour

| Symptom | Cause | Fix |
| --- | --- | --- |
| Response stops midway | You pressed **Stop**, or the connection dropped. | Click **Regenerate**. Mid-stream failures keep the partial text. |
| Attach button is greyed / explains itself | Image input is off (conservative default — not every server build accepts images). | Settings → Chat → *Enable image input* after verifying your server supports multimodal messages. |
| System instructions never sent | The server rejected system messages once; GlassGem remembered. | Settings → API → *Re-detect*, then retry. |
| temperature/top_p/max_tokens ignored | Same capability mechanism: a 400 flips them off. | Settings → API → *Re-detect*; keep *Send sampling parameters* enabled. |
| A feature shows as *Unsupported* but your server has it | An old failure is cached. | Settings → API → **Reset** under *Detected capabilities*. |
| Follow-up chips never appear | Your server build does not append `<ElicitationsGroup>` markup. | Nothing to fix — the feature is automatic when the markup is present. |
| Token usage / response time missing | The server does not report `usage`. | Displayed only when the server reports it. |

## Data

| Symptom | Cause | Fix |
| --- | --- | --- |
| Everything looks stuck / storage errors | The browser tab lost IndexedDB access (private mode, quota). | Use a normal window; Settings → Privacy shows usage. Export a backup first. |
| Conversations gone after clearing browser data | IndexedDB was erased. | Restore from a `glassgem-backup-*.json` (Settings → Data → Import). |
| Import fails with *not valid JSON* | The file isn't a GlassGem export. | Only GlassGem JSON exports (single conversation or full backup) can be imported. |
| Imported twice → duplicates | Imports always get fresh IDs (never overwrite). | Delete the duplicates; intentional behaviour. |

## Desktop app

| Symptom | Fix |
| --- | --- |
| *Electron runtime is missing* | `run-desktop.bat` retries several download paths automatically; see the Startup section above for mirror/proxy settings. An antivirus quarantining `electron.exe` is the other usual suspect — allow the project folder, then `run-desktop.bat clean`. |
| SmartScreen warning on install | The artifacts are unsigned (code signing is a CI away — see README §13). |
| Data not shared with the browser version | By design: the desktop app uses its own stable origin (`127.0.0.1:17384`). Use Settings → Data export/import to move data between them. |
| Web2API still running after the desktop app closed | Since 1.2.0 the desktop session stops the server it started — automatically, whether you close the app window, press Ctrl+C, or close the terminal. Only a server that was already running *before* the desktop session (e.g. `npm run web2api` or a service) stays up by design; stop it with `run-desktop.bat stop`. |

## Getting more help

- Every chat error has **Retry** and **Open Settings** buttons.
- The debug panel (Settings → General → Debug panel) lists the last 40
  requests with status codes and durations.
- The crash screen (if the UI ever fails) offers one-click **Copy
  diagnostics** — include that when opening an issue.
