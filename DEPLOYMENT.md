# MedSign Deployment Guide

Complete guide for deploying MedSign on web and converting it into a mobile app (iOS + Android).

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Web Deployment](#web-deployment)
   - [Option A: Railway (Recommended for solo devs)](#option-a-railway)
   - [Option B: Vercel + Railway](#option-b-vercel--railway)
   - [Option C: AWS / DigitalOcean with Docker](#option-c-aws--digitalocean-with-docker)
4. [Mobile App with Capacitor](#mobile-app-with-capacitor)
   - [Why Capacitor](#why-capacitor)
   - [Setup Steps](#setup-steps)
   - [iOS Build](#ios-build)
   - [Android Build](#android-build)
   - [Code Changes for Mobile](#code-changes-for-mobile)
5. [PWA (Progressive Web App) — Alternative](#pwa-alternative)
6. [Environment Variables Reference](#environment-variables-reference)
7. [Database & Migrations](#database--migrations)
8. [Domain & SSL](#domain--ssl)
9. [Monitoring & Logging](#monitoring--logging)
10. [Estimated Costs](#estimated-costs)
11. [Checklist Before Going Live](#checklist-before-going-live)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────┐
│                   Clients                        │
│  Web Browser  |  iOS App  |  Android App         │
└──────────┬───────────┬──────────┬────────────────┘
           │           │          │
           ▼           ▼          ▼
┌──────────────────────────────────────────────────┐
│              Next.js Frontend                    │
│  - Serves UI (SSR + static pages)                │
│  - Proxies /api/* calls to backend               │
│  - Auth check in proxy.ts                        │
│  Port: 3000                                      │
└──────────────────┬───────────────────────────────┘
                   │ /api/*
                   ▼
┌──────────────────────────────────────────────────┐
│              FastAPI Backend                      │
│  - REST API at /api/v1/*                         │
│  - Gemini AI for health assessments              │
│  - Lab report extraction pipeline                │
│  - Rate limiting, auth middleware                │
│  Port: 8000                                      │
└──────────┬───────────────────┬───────────────────┘
           │                   │
           ▼                   ▼
┌──────────────────┐  ┌───────────────────┐
│    Supabase      │  │   Google Gemini   │
│  - PostgreSQL    │  │   - AI API        │
│  - Auth          │  │                   │
│  - Storage       │  │                   │
└──────────────────┘  └───────────────────┘
```

**Key point:** The frontend proxies all `/api/*` requests to the backend via Next.js rewrites. Clients never talk to the backend directly. For mobile (Capacitor), the app calls your deployed frontend URL, which proxies to the backend.

---

## Prerequisites

- **Supabase project** — Already set up (PostgreSQL + Auth + Storage)
- **Gemini API key** — From Google AI Studio (free tier: 15 RPM)
- **Node.js 20+** and **Python 3.12+**
- **Docker** (for Docker-based deployments)
- **Xcode 15+** (for iOS builds, macOS only)
- **Android Studio** (for Android builds)

---

## Web Deployment

### Option A: Railway

**Best for:** Solo developers, fastest setup, one platform for both services.
**Cost:** ~$5-10/month (Hobby plan)

#### Step 1: Push code to GitHub

```bash
cd /path/to/ArogyaAI
git init
git add -A
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/medsign.git
git push -u origin main
```

#### Step 2: Create Railway project

1. Go to https://railway.app and sign in with GitHub
2. Click "New Project" > "Deploy from GitHub Repo"
3. Select your MedSign repository

#### Step 3: Deploy Backend

1. In Railway, click "Add Service" > "GitHub Repo"
2. Set the **Root Directory** to `backend`
3. Add environment variables:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   GEMINI_API_KEY=your-gemini-key
   ENVIRONMENT=production
   SECRET_KEY=<generate with: openssl rand -hex 32>
   CORS_ORIGINS=https://your-frontend-domain.railway.app
   MONETIZATION_ENABLED=false
   ```
4. Railway auto-detects the Dockerfile and deploys
5. Note the generated URL (e.g., `https://medsign-backend-xxx.railway.app`)

#### Step 4: Deploy Frontend

1. Click "Add Service" > "GitHub Repo" again
2. Set the **Root Directory** to `frontend`
3. Add environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   NEXT_PUBLIC_API_URL=https://medsign-backend-xxx.railway.app
   ```
4. Railway deploys the frontend
5. Set up a custom domain or use the Railway-provided URL

#### Step 5: Update Supabase

In Supabase Dashboard > Authentication > URL Configuration:
- Set **Site URL** to your frontend URL
- Add the frontend URL to **Redirect URLs**

---

### Option B: Vercel + Railway

**Best for:** Best frontend performance (Vercel's edge network) + separate backend.
**Cost:** Vercel free tier + Railway ~$5/month

#### Frontend on Vercel

1. Go to https://vercel.com, import your GitHub repo
2. Set **Root Directory** to `frontend`
3. Add environment variables (same as above)
4. Vercel auto-detects Next.js and deploys

#### Backend on Railway

Same as Option A, Steps 3-4.

#### Important: Update CORS

Set `CORS_ORIGINS` on the backend to include your Vercel domain:
```
CORS_ORIGINS=https://medsign.vercel.app,https://your-custom-domain.com
```

---

### Option C: AWS / DigitalOcean with Docker

**Best for:** Full control, scaling to many users later.
**Cost:** DigitalOcean ~$12/month (Basic Droplet), AWS varies

#### Step 1: Provision a server

- **DigitalOcean:** Create a Droplet (2 GB RAM, Ubuntu 24.04)
- **AWS:** Launch an EC2 t3.small instance

#### Step 2: Install Docker on the server

```bash
ssh root@your-server-ip

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose
apt install docker-compose-plugin
```

#### Step 3: Clone and configure

```bash
git clone https://github.com/YOUR_USERNAME/medsign.git
cd medsign

# Create .env from example
cp .env.example .env
nano .env  # Fill in all real values
```

#### Step 4: Update docker-compose.yml for production

```yaml
services:
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    env_file: .env
    depends_on:
      - backend
    restart: always

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    env_file: .env
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
    restart: always

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
      - ./certbot/conf:/etc/letsencrypt
    depends_on:
      - frontend
    restart: always
```

#### Step 5: Deploy

```bash
docker compose up -d --build
```

---

## Mobile App with Capacitor

### Why Capacitor

| Option | Pros | Cons |
|--------|------|------|
| **Capacitor** | Same codebase, native APIs, App Store ready | Need Xcode/Android Studio for builds |
| React Native | Better native performance | Complete rewrite needed |
| Flutter | Great performance | Complete rewrite, different language |
| PWA | Zero extra work | No App Store, limited native APIs |

**Capacitor wins** because MedSign is already a web app. Capacitor wraps it in a native shell — you get App Store distribution with minimal code changes.

### How It Works

```
┌─────────────────────────────────┐
│        Mobile App (Shell)       │
│  ┌───────────────────────────┐  │
│  │       WebView             │  │
│  │  ┌─────────────────────┐  │  │
│  │  │  Your Next.js App   │  │  │
│  │  │  (exported static)  │  │  │
│  │  └─────────────────────┘  │  │
│  └───────────────────────────┘  │
│                                 │
│  Native Bridge (Camera, GPS,   │
│  Push Notifications, etc.)     │
└─────────────────────────────────┘
```

Capacitor loads your app inside a native WebView. API calls go to your deployed backend URL over the internet. Native features (camera, push notifications) are accessed via Capacitor plugins.

### Setup Steps

#### Step 1: Install Capacitor in the frontend

```bash
cd frontend

npm install @capacitor/core @capacitor/cli
npx cap init "MedSign" "com.medsign.app" --web-dir out
```

#### Step 2: Configure Capacitor

Create `frontend/capacitor.config.ts`:

```typescript
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.medsign.app",
  appName: "MedSign",
  webDir: "out",
  server: {
    // Point to your deployed backend for API calls
    url: "https://your-medsign-domain.com",
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#059669",
      showSpinner: false,
    },
  },
};

export default config;
```

#### Step 3: Update Next.js for static export

Add `output: "export"` to `next.config.ts`:

```typescript
import type { NextConfig } from "next";

const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const nextConfig: NextConfig = {
  output: "export",
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
```

**Important:** `output: "export"` disables server-side features (rewrites, proxy.ts). See [Code Changes for Mobile](#code-changes-for-mobile) below for how to handle this.

#### Step 4: Build the static export

```bash
npm run build
# This creates the `out/` directory with static HTML/JS/CSS
```

#### Step 5: Add native platforms

```bash
# Add iOS
npm install @capacitor/ios
npx cap add ios

# Add Android
npm install @capacitor/android
npx cap add android

# Copy web build to native projects
npx cap sync
```

### iOS Build

**Requirements:** macOS + Xcode 15+ + Apple Developer Account ($99/year)

```bash
# Open in Xcode
npx cap open ios
```

In Xcode:
1. Select your Team under Signing & Capabilities
2. Set Bundle Identifier to `com.medsign.app`
3. Select a real device or simulator
4. Click **Run** to test
5. To publish: Product > Archive > Distribute App > App Store Connect

**App Store submission checklist:**
- App icon (1024x1024 PNG)
- Screenshots for each device size
- Privacy policy URL
- App description and keywords
- Health-related app disclaimer (required for medical apps)

### Android Build

**Requirements:** Android Studio + JDK 17

```bash
# Open in Android Studio
npx cap open android
```

In Android Studio:
1. Let Gradle sync complete
2. Select a device/emulator
3. Click **Run** to test
4. To publish: Build > Generate Signed Bundle (AAB)
5. Upload AAB to Google Play Console

**Play Store submission checklist:**
- App icon (512x512 PNG)
- Feature graphic (1024x500)
- Screenshots
- Privacy policy URL
- Content rating questionnaire
- "Health & Fitness" category — may require additional review

### Code Changes for Mobile

Static export (`output: "export"`) disables Next.js server features. Here's what needs to change:

#### 1. API calls — direct to backend instead of proxy

The `rewrites` proxy won't work in static export. Update `frontend/src/lib/api.ts` to call the backend directly when running in Capacitor:

```typescript
// Add at the top of api.ts
const API_BASE = typeof window !== "undefined" && (window as any).Capacitor
  ? "https://your-medsign-backend.com"  // Direct backend URL for mobile
  : "";                                   // Empty = use Next.js proxy for web

// Update apiFetch to prepend API_BASE
export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  // ... rest of the function
}
```

#### 2. Auth proxy — move to client-side

`proxy.ts` won't run in static export. Auth protection moves to a client-side wrapper:

```typescript
// frontend/src/components/AuthGuard.tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) router.replace("/login");
      else setReady(true);
    });
  }, [router]);

  if (!ready) return null; // or a loading spinner
  return <>{children}</>;
}
```

Wrap protected pages with `<AuthGuard>` in their layouts.

#### 3. Dynamic routes

Any `generateStaticParams` or dynamic routes need to be handled. For MedSign, pages like `/reports/[id]` need `dynamicParams` configuration or client-side fetching (which they already do).

#### 4. Useful Capacitor plugins for MedSign

```bash
# Camera — for uploading medical images/face scans
npm install @capacitor/camera

# Push notifications
npm install @capacitor/push-notifications

# Haptic feedback
npm install @capacitor/haptics

# Secure storage for tokens
npm install @capacitor/preferences

# Share — let users share reports with doctors
npm install @capacitor/share
```

---

## PWA Alternative

If you don't want to deal with App Store submissions, a PWA works with zero code changes.

#### Step 1: Add a web manifest

Create `frontend/public/manifest.json`:

```json
{
  "name": "MedSign",
  "short_name": "MedSign",
  "description": "AI-powered health assessment",
  "start_url": "/dashboard",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#059669",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

#### Step 2: Add manifest link to layout

In `frontend/src/app/layout.tsx`, add to `<head>`:
```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#059669" />
<meta name="apple-mobile-web-app-capable" content="yes" />
```

#### Step 3: Users install from browser

- **Android:** Chrome shows "Add to Home Screen" banner automatically
- **iOS:** Safari > Share > "Add to Home Screen"

**PWA vs Capacitor:**

| Feature | PWA | Capacitor |
|---------|-----|-----------|
| App Store listing | No | Yes |
| Push notifications | Limited on iOS | Full support |
| Camera access | Yes (via browser) | Yes (native) |
| Offline support | With service worker | With service worker |
| Install friction | Low (browser prompt) | Standard (store download) |
| Update process | Instant (reload) | App store review |

---

## Environment Variables Reference

### Backend (.env)

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (bypasses RLS) |
| `GEMINI_API_KEY` | Yes | Google Gemini API key |
| `ENVIRONMENT` | Yes | `development` or `production` |
| `SECRET_KEY` | Yes (prod) | Random secret, must not be "change-me" in production |
| `CORS_ORIGINS` | Yes | Comma-separated allowed origins |
| `SENTRY_DSN` | No | Sentry error tracking DSN |
| `MEDGEMMA_ENABLED` | No | `true` to enable local MedGemma model (needs GPU) |
| `MONETIZATION_ENABLED` | No | Defaults to `false` for acquisition mode: unlimited feature access, unlocked Pro insights, and no new checkout. Apply migration `018_add_quota_usage_counters.sql`, then set `true` to restore paid limits and subscriptions with fresh quotas. |

### Frontend (.env.local)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Same Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Same Supabase anon key |
| `NEXT_PUBLIC_API_URL` | Yes | Backend URL (e.g., `https://api.medsign.com`) |

---

## Database & Migrations

MedSign uses **Supabase-hosted PostgreSQL**. No database server to deploy.

### Running migrations

Migrations are in `supabase/migrations/`. Apply them via the Supabase CLI:

```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-ref

# Push all migrations
supabase db push
```

Or apply manually via Supabase SQL Editor: copy each migration file's SQL and run it.

### Backup

Supabase Pro plan includes daily backups. For free tier:
```bash
# Manual backup via pg_dump
pg_dump "postgresql://postgres.your-project:password@host:5432/postgres" > backup.sql
```

---

## Domain & SSL

### Custom domain setup

1. Buy a domain (Namecheap, Cloudflare, Google Domains)
2. Point DNS to your hosting provider:
   - **Railway/Vercel:** Add custom domain in their dashboard, they handle SSL
   - **Self-hosted:** Point A record to your server IP

### SSL with Let's Encrypt (self-hosted only)

```bash
# Install certbot
apt install certbot python3-certbot-nginx

# Get certificate
certbot --nginx -d medsign.com -d www.medsign.com

# Auto-renewal is set up automatically
```

---

## Monitoring & Logging

### Backend logs

The backend logs every request with user ID, status, and timing:
```
14:32:05 | INFO | medsign.requests | POST /api/v1/reports/upload → 201 (3420ms) user=a1b2c3d4
```

### Sentry (error tracking)

1. Create a project at https://sentry.io
2. Set `SENTRY_DSN` in your backend environment
3. Errors are automatically captured and reported

### Uptime monitoring

Use a free service like UptimeRobot or Better Stack:
- Monitor `https://your-domain.com/health` (backend)
- Monitor `https://your-domain.com` (frontend)
- Set up email/Slack alerts for downtime

---

## Estimated Costs

### Minimum viable deployment (free - $15/month)

| Service | Cost | Notes |
|---------|------|-------|
| Supabase | Free | 500 MB database, 1 GB storage, 50K auth users |
| Gemini API | Free | 15 requests/minute (sufficient for early users) |
| Railway (backend) | ~$5/month | Hobby plan |
| Vercel (frontend) | Free | Hobby plan, generous limits |
| Domain | ~$10/year | Optional |
| **Total** | **~$5-15/month** | |

### Growth stage (100+ daily users)

| Service | Cost | Notes |
|---------|------|-------|
| Supabase Pro | $25/month | 8 GB database, 100 GB storage |
| Gemini API | Free-$10 | May need paid tier for higher RPM |
| Railway | ~$10/month | More compute |
| Vercel Pro | $20/month | More bandwidth, analytics |
| Sentry | Free | 5K errors/month |
| **Total** | **~$55-65/month** | |

### Mobile app additional costs

| Item | Cost | Notes |
|------|------|-------|
| Apple Developer Account | $99/year | Required for iOS App Store |
| Google Play Console | $25 one-time | Required for Play Store |

---

## Checklist Before Going Live

### Security
- [ ] `.env` file is NOT committed to git
- [ ] `SECRET_KEY` is set to a real random value (not "change-me")
- [ ] `CORS_ORIGINS` lists only your actual frontend domain(s)
- [ ] Supabase RLS policies are enabled on all tables
- [ ] Rate limiting is active on upload endpoints
- [ ] Swagger docs disabled in production (`docs_url=None`)

### Supabase
- [ ] Site URL set to your production frontend URL
- [ ] Redirect URLs include your production domain
- [ ] Email templates customized with MedSign branding
- [ ] Storage bucket policies are correct (private for medical-uploads)

### Frontend
- [ ] `NEXT_PUBLIC_API_URL` points to production backend
- [ ] Error boundary (`error.tsx`) and 404 page (`not-found.tsx`) exist
- [ ] No console.log statements left in production code

### Backend
- [ ] All migrations applied to production database
- [ ] `ENVIRONMENT=production` is set
- [ ] Uvicorn running with `--workers 2` (not `--reload`)
- [ ] Health check endpoint (`/health`) is accessible

### Mobile (if applicable)
- [ ] App icons generated for all sizes
- [ ] Splash screen configured
- [ ] API base URL points to production backend
- [ ] Camera permissions configured in Info.plist / AndroidManifest.xml
- [ ] Privacy policy page is live and linked in app
- [ ] App Store / Play Store metadata prepared

### Monitoring
- [ ] Sentry DSN configured (or alternative error tracking)
- [ ] Uptime monitoring set up for health endpoint
- [ ] Log aggregation accessible (Railway logs, or custom)

---

## Quick Start Commands

```bash
# --- Local Development ---
cd backend && uvicorn app.main:app --reload        # Backend at :8000
cd frontend && npm run dev                          # Frontend at :3000

# --- Docker (local or production) ---
docker compose up -d --build                        # Both services

# --- Mobile Build ---
cd frontend
npm run build                                       # Build static export
npx cap sync                                        # Copy to native projects
npx cap open ios                                    # Open in Xcode
npx cap open android                                # Open in Android Studio

# --- Database ---
supabase db push                                    # Apply migrations
```
