# Talent & Onboarding Log — Complete Build Guide
## Stack: React + Express + Neon PostgreSQL + Render + Vercel + GitHub

---

## 🗺️ Architecture Overview

```
D:\Projects\Talent & Onboarding Log\
├── backend/          → Express.js API (deploy to Render — free)
├── frontend/         → React + Vite app (deploy to Vercel — free)
├── .github/          → GitHub Actions (auto-deploy on push)
├── .gitignore
└── README.md
```

**Free tier stack chosen:**
| Layer | Service | Free Tier |
|---|---|---|
| Database | Neon (PostgreSQL) | 0.5 GB, always-on |
| Backend | Render | 750 hrs/month |
| Frontend | Vercel | Unlimited static |
| Repo | GitHub | Free |

---

## PHASE 0 — Accounts Setup (do this first, 15 mins)

### 1. GitHub
- Go to https://github.com → Sign up or log in
- Create new repository: `talent-onboarding-log`
- Set to **Public** (required for free Render deploys)
- Do NOT initialize with README (we'll push from local)

### 2. Neon (Free PostgreSQL)
- Go to https://neon.tech → Sign up with GitHub
- Click **New Project**
- Name it: `talent-onboarding`
- Region: choose closest to you (Frankfurt for Egypt)
- After creation, copy the **Connection String** — looks like:
  `postgresql://user:password@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`
- SAVE THIS — you'll need it later

### 3. Render (Free Backend Hosting)
- Go to https://render.com → Sign up with GitHub
- You'll connect your repo here later (after first push)

### 4. Vercel (Free Frontend Hosting)
- Go to https://vercel.com → Sign up with GitHub
- You'll connect your repo here later too

---

## PHASE 1 — Local Setup (Windsurf)

### Step 1: Open Windsurf, open the folder
```
File → Open Folder → D:\Projects\Talent & Onboarding Log
```

### Step 2: Open Terminal in Windsurf
```
Terminal → New Terminal
```

### Step 3: Initialize Git
```bash
git init
git branch -M main
```

### Step 4: Create the project structure
Run these commands one by one:
```bash
mkdir backend frontend .github\workflows
```

### Step 5: Initialize backend
```bash
cd backend
npm init -y
npm install express cors dotenv pg bcryptjs jsonwebtoken zod
npm install --save-dev nodemon
cd ..
```

### Step 6: Initialize frontend
```bash
cd frontend
npm create vite@latest . -- --template react
npm install
npm install axios react-query zustand react-hook-form @hookform/resolvers zod react-hot-toast date-fns lucide-react
npm install --save-dev tailwindcss postcss autoprefixer
npx tailwindcss init -p
cd ..
```

### Step 7: Push to GitHub
```bash
git add .
git commit -m "Initial project structure"
git remote add origin https://github.com/YOUR_USERNAME/talent-onboarding-log.git
git push -u origin main
```

---

## PHASE 2 — Database Setup

### Run the schema on Neon
1. Go to your Neon project dashboard
2. Click **SQL Editor**
3. Paste and run the contents of `backend/database/schema.sql`
4. Then paste and run `backend/database/seed.sql` (for initial data)

---

## PHASE 3 — Environment Variables

### Backend `.env` file (create at `backend/.env`)
```env
PORT=3001
DATABASE_URL=your_neon_connection_string_here
JWT_SECRET=generate_a_random_64_char_string_here
JWT_REFRESH_SECRET=another_random_64_char_string_here
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
```

**Generate JWT secrets (run in terminal):**
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Run this TWICE — once for each secret.

### Frontend `.env` file (create at `frontend/.env`)
```env
VITE_API_URL=http://localhost:3001/api/v1
```

---

## PHASE 4 — Deployment (after build works locally)

### Deploy Backend to Render
1. Go to https://render.com → New → Web Service
2. Connect your GitHub repo
3. **Root Directory:** `backend`
4. **Build Command:** `npm install`
5. **Start Command:** `node server.js`
6. Add environment variables (same as your `.env` but with Neon URL)
7. Deploy — you'll get a URL like `https://talent-api.onrender.com`

### Deploy Frontend to Vercel
1. Go to https://vercel.com → New Project
2. Import your GitHub repo
3. **Root Directory:** `frontend`
4. **Framework Preset:** Vite
5. Add environment variable:
   - `VITE_API_URL` = your Render backend URL + `/api/v1`
6. Deploy

---

## PHASE 5 — Auto-Backup to GitHub

### Create `auto-sync.bat` in your project root
```batch
@echo off
:loop
git add .
git commit -m "Auto backup %date% %time%" 2>nul
git push 2>nul
timeout /t 60 /nobreak >nul
goto loop
```

### Run it:
Double-click `auto-sync.bat` while you're coding.
Every 60 seconds → auto-committed and pushed to GitHub.

**Pro tip:** Also use **Windsurf's built-in Git panel** to write meaningful commits
when you finish a feature. The auto-sync is your safety net.

---

## Key Notes

- **Group_ID logic:** Only the "Active Hiring Ticket" row controls status for its group
- **Migration:** Your Google Sheets data can be exported and migrated using the script in `backend/database/migrate-from-sheets.js`
- **No rowMapping:** Every ticket has a stable UUID — no more row shifting bugs

---

## Daily Workflow

```
1. Open Windsurf → open D:\Projects\Talent & Onboarding Log
2. Double-click auto-sync.bat (runs in background)
3. Code in Windsurf
4. Push to GitHub main → Render + Vercel auto-deploy
```
