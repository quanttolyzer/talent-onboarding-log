# Talent & Onboarding Log

Internal recruitment and onboarding tracking system.

## Stack
- **Frontend**: React + Vite → Vercel
- **Backend**: Node.js + Express → Render
- **Database**: PostgreSQL → Neon (free tier)
- **Auth**: JWT (access 8h + refresh 7d)

## Local Development

### Backend
```bash
cd backend
cp .env.example .env     # fill in your Neon DATABASE_URL and JWT secrets
npm install
npm run dev              # runs on http://localhost:3001
```

### Frontend
```bash
cd frontend
cp .env.example .env     # VITE_API_URL=http://localhost:3001/api/v1
npm install
npm run dev              # runs on http://localhost:5173
```

## Key Features
- ✅ Real PostgreSQL — no more row-shifting bugs
- ✅ Group_ID system — "Active Hiring Ticket" controls status of all cloned rows
- ✅ JWT authentication with roles (admin / member / viewer)
- ✅ Audit log on every change
- ✅ Real pagination (offset-based)
- ✅ Client-side search (no server round-trip on every keypress)
- ✅ Bulk clone with field overrides
- ✅ Concurrent-safe deletes (UUID-based, not row numbers)

## Default Login
- Email: `admin@talent.internal`
- Password: `Admin@123`
- **Change this immediately after first login!**

## Auto-backup
Double-click `auto-sync.bat` to continuously push changes to GitHub every 60 seconds.
