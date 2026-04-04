#!/bin/bash
# Startup script for Databricks Apps.
# Installs frontend dependencies, builds the React app, then starts the backend.
set -e

echo "==> Installing frontend dependencies..."
cd frontend
npm ci
echo "==> Building frontend..."
npm run build
cd ..

echo "==> Starting backend..."
exec uvicorn backend.main:app --host 0.0.0.0 --port 8000
