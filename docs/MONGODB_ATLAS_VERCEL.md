# MongoDB Atlas + Vercel Setup

Vercel does **not** host MongoDB. You use **MongoDB Atlas** (free tier) for the database and store the connection string in **Vercel Environment Variables** (encrypted at rest by Vercel).

## Encryption layers

| Layer | What encrypts it |
|--------|------------------|
| **In transit** | TLS — automatic with `mongodb+srv://` Atlas URLs |
| **At rest** | MongoDB Atlas encrypts stored data by default |
| **MFA secrets** | App encrypts `mfaSecret` with AES-256-GCM (`DB_ENCRYPTION_KEY`) before saving |
| **Env vars on Vercel** | Encrypted in Vercel's dashboard |

---

## Step 1: Create MongoDB Atlas cluster (free)

1. Go to [mongodb.com/atlas](https://www.mongodb.com/atlas) and sign up
2. Create a **free M0 cluster**
3. **Database Access** → Add user (username + password) → note credentials
4. **Network Access** → Add IP → **Allow Access from Anywhere** (`0.0.0.0/0`)  
   (Required for Vercel serverless — IPs change per request)
5. **Database** → Connect → **Drivers** → copy connection string:

```
mongodb+srv://YOUR_USER:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/mfa_auth?retryWrites=true&w=majority
```

Replace `YOUR_USER`, `YOUR_PASSWORD`, and use your cluster host.

---

## Step 2: Generate encryption key

In your project folder:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the 64-character output — this is `DB_ENCRYPTION_KEY`.

---

## Step 3: Add to Vercel Environment Variables

**Vercel → Project → Settings → Environment Variables**

| Variable | Value | Environments |
|----------|--------|--------------|
| `MONGODB_URI` | Your Atlas connection string | Production, Preview, Development |
| `DB_ENCRYPTION_KEY` | 64-char hex from Step 2 | Production, Preview, Development |
| `JWT_SECRET` | Long random string | Production, Preview, Development |
| `JWT_MFA_SECRET` | Another long random string | Production, Preview, Development |
| `NODE_ENV` | `production` | Production |

Or via CLI:

```powershell
npx vercel env add MONGODB_URI production
npx vercel env add DB_ENCRYPTION_KEY production
```

Then **Redeploy**.

---

## Step 4: Verify

Open: `https://your-app.vercel.app/api/health`

Expected:

```json
{
  "ok": true,
  "mfa": "totp",
  "database": {
    "mode": "mongodb",
    "connected": true,
    "encryptionAtRest": "mongodb-atlas-default",
    "fieldEncryption": true
  }
}
```

If `"mode": "memory"` — `MONGODB_URI` is missing or Atlas connection failed.

---

## Local development with Atlas

Copy Atlas URI and encryption key into `.env`:

```env
MONGODB_URI=mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/mfa_auth
DB_ENCRYPTION_KEY=your-64-char-hex-key
```

Run `npm start`.
