# How to Get Google Cloud Credentials 🔑

To enable **"Sign in with Google"** and send emails via Gmail, you need to create a project in Google Cloud Console.

### Step 1: Create a Project
1.  Go to [Google Cloud Console](https://console.cloud.google.com/).
2.  Click **"Select a project"** (top left) → **"New Project"**.
3.  Name it "AI Lead Booker" and click **Create**.

### Step 2: Enable Gmail API
1.  In the search bar at the top, type `Gmail API`.
2.  Select **Gmail API** from the results.
3.  Click **Enable**.

### Step 3: Configure OAuth Consent Screen
1.  Go to **APIs & Services** → **OAuth consent screen**.
2.  Choose **External** (unless you have a Google Workspace organization) and click **Create**.
3.  **App Information**:
    *   App name: `AI Lead Booker`
    *   User support email: Your email.
4.  **Developer Contact Information**: Your email.
5.  Click **Save and Continue** until you reach the dashboard.
6.  **IMPORTANT**: Under "Test Users", click **+ Add Users** and add your own Gmail address (since the app is in "Testing" mode).

### Step 4: Create Credentials
1.  Go to **APIs & Services** → **Credentials**.
2.  Click **+ Create Credentials** → **OAuth Client ID**.
3.  **Application Type**: `Web application`.
4.  **Authorized Javascript Origins**:
    *   `http://localhost:3000`
5.  **Authorized Redirect URIs**:
    *   `http://localhost:3000/auth/google/callback`
6.  Click **Create**.

### Step 5: Copy Keys
You will see a modal with your keys. Copy them into your `.env` file:

```bash
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_CALLBACK_URL=http://localhost:3000/auth/google/callback
```

### Step 6: Restart Server
Once saved, restart the server for changes to take effect.
