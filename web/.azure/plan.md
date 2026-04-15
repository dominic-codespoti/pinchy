# Pinchy Web-New Deployment Plan

## Overview
Deploy web-new Next.js frontend to Azure Static Web Apps for testing against the backend.

## Architecture
- **Frontend**: Azure Static Web Apps (free tier)
- **Backend**: Local Pinchy daemon on :3131 (already running)

## Configuration
- Framework: Next.js (static export)
- Build output: `dist` folder
- API backend: localhost:3131 (for local testing) or deployed backend

## Steps
1. Configure azure.yaml for SWA deployment
2. Validate configuration
3. Deploy to Azure
4. Test in browser

## Status
Ready for deployment
