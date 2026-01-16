# EryAI Dashboard

AI-driven kundtjänst dashboard med 2FA-inloggning.

## Features

- 🔐 **Tvåfaktorsautentisering (2FA)** - Obligatorisk TOTP via authenticator-app
- 👤 **Superadmin** - Ser alla kunders konversationer
- 🏢 **Kundkonton** - Ser bara sin egen data
- 💬 **Konversationsvy** - Läs alla chattar med AI-assistenten

## Setup

### 1. Environment Variables (Vercel)

```
NEXT_PUBLIC_SUPABASE_URL=https://tjqxseptmeypfsymrrln.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<din-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<din-service-role-key>
SUPERADMIN_EMAIL=din-email@example.com
```

### 2. Supabase Setup

Kör `supabase-setup.sql` i Supabase SQL Editor.

### 3. Skapa användare

1. **Superadmin**: Skapa via Supabase Dashboard > Authentication > Users
2. **Demo-konto**: Skapa demo@eryai.tech och koppla till Bella Italia

### 4. Deploy

Push till GitHub → Vercel bygger automatiskt.

## Auth Flow

```
Login (email + lösenord)
    ↓
Första gången? → MFA Setup (skanna QR-kod)
    ↓
MFA Verify (ange kod)
    ↓
Dashboard (filtrerat baserat på roll)
```

## Tech Stack

- Next.js 14 (App Router)
- Supabase Auth + MFA
- Tailwind CSS
- Vercel Hosting
