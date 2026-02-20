# Deployment Guide 🚀

This guide explains how to deploy the AI Lead Booker application to a live server.

## Recommended: Render.com (Easiest)
We recommend **Render** because it supports Node.js applications and persistent disks (essential for our database).

### Step 1: Push to GitHub
1.  Initialize a git repository if you haven't already:
    ```bash
    git init
    git add .
    git commit -m "Ready for deploy"
    ```
2.  Create a repository on GitHub (private) and push your code.

### Step 2: Create a Web Service on Render
1.  Sign up at [render.com](https://render.com).
2.  Click **New +** -> **Web Service**.
3.  Connect your GitHub repository.
4.  **Settings**:
    *   **Name**: `ai-lead-booker`
    *   **Runtime**: Node
    *   **Build Command**: `npm install && npm run build`
    *   **Start Command**: `npm start`
    *   **Region**: (Pick closest to you)

### Step 3: Configure Environment Variables
In the Render dashboard, go to the **Environment** tab and add these keys (copy from your `.env` file):

| Key | Value Description |
| :--- | :--- |
| `NODE_ENV` | `production` |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `GOOGLE_CALLBACK_URL` | Update to: `https://<YOUR-RENDER-APP-NAME>.onrender.com/auth/google/callback` |
| `SESSION_SECRET` | A long random string (e.g. `super_secret_key_123`) |
| `OPENAI_API_KEY` | Your OpenAI Key |
| `STRIPE_SECRET_KEY` | Your Stripe Secret Key |
| `STRIPE_PUBLISHABLE_KEY` | Your Stripe Publishable Key |
| `STRIPE_WEBHOOK_SECRET` | (Optional for now) |
| `BASE_URL` | `https://<YOUR-RENDER-APP-NAME>.onrender.com` |

### Step 4: Add Persistent Disk (CRITICAL)
Since we use SQLite (`database.sqlite`), the database file lives on the disk. Render's standard services wipe the disk on every restart/deploy unless you add a Disk.

1.  Go to **Disks** in your Web Service sidebar.
2.  Click **Add Disk**.
3.  **Name**: `sqlite-data`
4.  **Mount Path**: `/opt/render/project/src/database`
    *   *Why?* The app looks for the DB in `src/database`.
    *   **Size**: 1GB (Minimum is fine)

### Step 5: Deploy
Click **Create Web Service**. Render will build and deploy your app.
Once live, you can visit the URL provided by Render!

## Troubleshooting
*   **Database Reset?** If your data disappears after a deploy, you didn't mount the Disk correctly. Check Step 4.
*   **Port Error?** The app automatically listens on the `PORT` provided by Render.
