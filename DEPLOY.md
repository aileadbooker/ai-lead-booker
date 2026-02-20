# AI Lead Booker - Deployment Guide 🚀

This guide explains how to deploy the AI Lead Booker for production use.

## 1. Prerequisites
- **Node.js** (v18 or higher)
- **NPM** (starts with Node)
- **SQLite** (or a persistent volume for the database file)

## 2. Environment Variables
Create a `.env` file in the root directory. You can copy `.env.example`.

```bash
# Server Configuration
PORT=3000
NODE_ENV=production
SESSION_SECRET=your-super-secure-secret-key-here

# Database
DATABASE_URL=database.sqlite

# Email Configuration (Gmail App Password recommended)
GMAIL_USER_EMAIL=your-email@gmail.com
ENABLE_REAL_EMAIL=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
IMAP_HOST=imap.gmail.com
IMAP_PORT=993
IMAP_USER=your-email@gmail.com
IMAP_PASS=your-app-password

# LLM Configuration
OPENAI_API_KEY=your-openai-key
USE_MOCK_LLM=false

# Business Info
BUSINESS_NAME="My AI Agency"
```

## 3. Installation & Build

```bash
# Install dependencies
npm install

# Build the project (compiles TypeScript)
npm run build
```

## 4. Starting the Server

```bash
# Start in production mode
npm start
```

The server will start on port 3000 (or your configured `PORT`).
- **Dashboard**: `http://localhost:3000`
- **Login**: Use the `ADMIN_PASSWORD` you set (default hardcoded to `admin123` in `src/api/auth.ts` - **change this in source code for production!**)

## 5. Automated Processes
The system automatically runs:
- **Email Monitor**: Polls for new emails and replies every 60 seconds.
- **Lead Processor**: Qualifies leads and queues follow-ups every 60 seconds.
- **Daily Summary**: Sends a report to your email at 7:00 AM daily.

## 6. Maintenance
- **Logs**: In production, consider using `pm2` to manage the process and logs:
  ```bash
  npm install -g pm2
  pm2 start dist/index.js --name "ai-lead-booker"
  ```
- **Database**: Back up `database.sqlite` regularly.
