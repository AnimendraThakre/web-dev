# MFA Authentication Web Application

Full-stack authentication app with email/password login, 6-digit OTP via email, and a protected dashboard.

## Features

- User registration and login (bcrypt password hashing)
- Multi-factor authentication via email OTP (5-minute expiry)
- JWT session management with HTTP-only cookies
- Protected dashboard route
- MongoDB with in-memory fallback

## Tech Stack

- **Frontend:** HTML, CSS, Vanilla JavaScript
- **Backend:** Node.js, Express
- **Database:** MongoDB (optional)
- **Email:** Nodemailer (Gmail SMTP)

## Installation

```bash
git clone https://github.com/AnimendraThakre/web-dev.git
cd web-dev
npm install
copy .env.example .env
```

Edit `.env` with JWT secrets and Gmail SMTP credentials (use a Google App Password).

## Run Locally

```bash
npm start
```

Open http://localhost:3000/login.html

Test SMTP: `npm run test:email`

## Legacy Files

`index.html` is from the original web-dev learning exercise (localStorage-based demo).
