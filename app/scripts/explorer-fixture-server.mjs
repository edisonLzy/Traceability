import { createServer } from "node:http";

const port = Number(process.env.EXPLORER_FIXTURE_PORT || 4173);
const oversizedPayload = { items: ["x".repeat(256 * 1024 + 1)] };

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

const page = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>Explorer fixture</title></head>
  <body>
    <main>
      <h1>Explorer fixture</h1>
      <p>Use these controls to exercise browser diagnostics and one-shot selection.</p>
      <label for="fixture-name">Name</label>
      <input id="fixture-name" data-testid="fixture-name" name="name" placeholder="Type something">
      <button id="save-button" data-testid="save-button">Save</button>
      <button id="valid-json">Fetch valid JSON</button>
      <button id="validation-json">Fetch 422 JSON</button>
      <button id="oversized-json">Fetch oversized JSON</button>
      <button id="slow-json">Fetch slow JSON</button>
      <button id="console-error">Emit console error</button>
      <pre id="result" aria-live="polite"></pre>
    </main>
    <script>
      const result = document.querySelector('#result');
      const request = async (path) => {
        const response = await fetch(path);
        result.textContent = await response.text();
      };
      document.querySelector('#valid-json').addEventListener('click', () => request('/api/valid'));
      document.querySelector('#validation-json').addEventListener('click', () => request('/api/validation-error'));
      document.querySelector('#oversized-json').addEventListener('click', () => request('/api/oversized'));
      document.querySelector('#slow-json').addEventListener('click', () => request('/api/slow'));
      document.querySelector('#console-error').addEventListener('click', () => {
        console.error('Explorer fixture console error');
        request('/api/console-error');
      });
    </script>
  </body>
</html>`;

const server = createServer((request, response) => {
  const path = new URL(request.url || "/", `http://localhost:${port}`).pathname;
  if (path === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(page);
  } else if (path === "/api/valid") {
    json(response, 200, { ok: true, message: "valid JSON" });
  } else if (path === "/api/validation-error") {
    json(response, 422, { ok: false, error: "Validation failed", fields: { name: "Required" } });
  } else if (path === "/api/oversized") {
    json(response, 200, oversizedPayload);
  } else if (path === "/api/slow") {
    setTimeout(() => json(response, 200, { ok: true, message: "slow JSON" }), 3_000);
  } else if (path === "/api/console-error") {
    json(response, 200, { ok: true, message: "console error emitted by fixture page" });
  } else {
    json(response, 404, { error: "Not found" });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.info(`Explorer fixture listening at http://localhost:${port}`);
});
