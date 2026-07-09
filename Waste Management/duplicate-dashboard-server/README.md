# HEYA Recruiting Dashboard

This project now runs as a single app:

- `frontend/` contains the browser UI
- `backend/` contains the native Node.js API and app server

## Run the app

From the project root:

```bash
npm install
npm start
```

Open:

- `http://localhost:4000` for the dashboard UI
- `http://localhost:4000/api/health` for the API health check

## Verify the backend

```bash
npm run check
```

That forwards to the backend validation suite and smoke test.
