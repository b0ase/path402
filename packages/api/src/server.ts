// API Server - extracted from gui/server.ts
// This will be fleshed out as we migrate routes

import express from 'express';

const app = express();
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// TODO: Add routes from gui/server.ts
// - /api/status
// - /api/tokens
// - /api/portfolio
// - /api/peers
// - /api/opportunities
// - /api/speculation/*
// - /api/auto/*

export { app };

export function startServer(port = 4021) {
  return app.listen(port, () => {
    console.log(`API server running on http://localhost:${port}`);
  });
}
