# ♥ Repeater Likes — Complete Setup Guide

---

## What you have

| File | What it is |
|---|---|
| `api/toggle.js` | Vercel serverless function — handles like/unlike |
| `api/status.js` | Vercel serverless function — fetches counts on page load |
| `widget/like-button.js` | The like button custom element (runs on the visitor's site) |
| `dashboard/index.html` | The stats page shown to site owners in their Wix dashboard |
| `wix-data-collections-extension.json` | Pasted into Wix Dev Center to auto-create CMS collections |
| `vercel.json` | Vercel routing + CORS config |
| `package.json` | Node dependencies |
| `.env.example` | Environment variable template |

---

## PART 1 — Deploy to Vercel

### Step 1 — Push to GitHub
Create a new GitHub repo and push this entire folder to it.

### Step 2 — Connect to Vercel
1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **Add New → Project**
3. Import your GitHub repo
4. Click **Deploy** (no build settings needed — Vercel auto-detects the `api/` folder)

### Step 3 — Add environment variables
In Vercel → your project → **Settings → Environment Variables**, add:

| Name | Value |
|---|---|
| `WIX_APP_ID` | Your App ID from Wix Dev Center (you'll get this in Part 2) |
| `WIX_APP_SECRET` | Your App Secret from Wix Dev Center |

> You'll come back and fill these in after Part 2. For now just deploy — the functions won't work yet but the URLs will be live.

### Step 4 — Note your Vercel URL
After deploying you'll get a URL like:
`https://repeater-likes-abc123.vercel.app`

**You need this URL for Part 2.**

### Step 5 — Replace placeholder URLs in code
Now that you have your Vercel URL, replace `YOUR_VERCEL_APP` in these two files:

**`widget/like-button.js`** line 20:
```js
const API_BASE = 'https://repeater-likes-abc123.vercel.app'; // ← your real URL
```

**`dashboard/index.html`** line 107:
```js
const API = 'https://repeater-likes-abc123.vercel.app'; // ← your real URL
```

Then also replace `YOUR_WIX_APP_ID` and `YOUR_WIX_APP_SECRET` in `dashboard/index.html` lines 114-115 (you'll get these values in Part 2).

**Commit and push again after making these changes.**

---

## PART 2 — Set up in Wix Dev Center

Go to [manage.wix.com/account/custom-apps](https://manage.wix.com/account/custom-apps)

### Step 1 — Create the app
1. Click **Create New App**
2. Select **Build from scratch**
3. Select **Self-Hosted**
4. Click **Get Started**

### Step 2 — Get your App ID and Secret
1. In your new app, go to **Settings → OAuth**
2. Copy the **App ID** and **App Secret Key**
3. Paste them into Vercel environment variables (`WIX_APP_ID`, `WIX_APP_SECRET`)
4. Also paste them into `dashboard/index.html` lines 114–115
5. Commit and redeploy

### Step 3 — Add the Dashboard Page extension
This is what site owners see when they open your app in their Wix dashboard.

1. Go to **Develop → Extensions → + Create Extension**
2. Choose **Dashboard Page**
3. Fill in:
   - **Name**: `Repeater Likes Dashboard`
   - **Iframe URL**: `https://your-vercel-url.vercel.app/dashboard/index.html?instanceId={instanceId}`
     *(Wix automatically replaces `{instanceId}` with the real site ID)*
4. Click **Save**

### Step 4 — Add the Site Widget (Like Button) extension
This is the draggable like button that site owners put in their repeater.

1. Go to **Develop → Extensions → + Create Extension**
2. Choose **Site Widget (Custom Element)**
3. Fill in:
   - **Widget name**: `Like Button`
   - **Tag name**: `repeater-like-button`
     *(must match exactly what's in `widget/like-button.js` line at the bottom)*
   - **Script URL**: `https://your-vercel-url.vercel.app/widget/like-button.js`
4. Under **Widget sizing**:
   - Width: **Manual**
   - Height: **Automatic** (auto-fits to button)
5. Under **Settings action button**:
   - Leave blank for now (no settings panel needed for the free version)
6. Under **Manage action button**:
   - Select your **Repeater Likes Dashboard** page
7. Click **Save**

### Step 5 — Add the Data Collections extension
This automatically creates the `ItemLikes` and `LikeCounts` collections in the site's CMS when a site owner installs your app.

1. Go to **Develop → Extensions → + Create Extension**
2. Choose **Data Collections**
3. In the JSON editor that appears, **delete all existing content** and paste the entire contents of `wix-data-collections-extension.json`
4. Click **Save**

### Step 6 — Set required permissions
Your app needs permission to read/write Wix Data on the site.

1. Go to **Develop → Permissions**
2. Add these permissions:
   - `WIX_DATA.MANAGE_DATA_ITEMS`
   - `WIX_DATA.MANAGE_COLLECTIONS`
3. Click **Save**

---

## PART 3 — Test your app

### Step 1 — Install on a dev site
1. In the top right of your app dashboard, click **Test App → Test on dev site**
2. Create a new dev site or select an existing one
3. Click **Test App** — Wix installs your app and opens the site editor

### Step 2 — Add the widget to a Repeater
1. In the Wix Editor, add a **Repeater** to your page
2. Connect the repeater to any dataset (or use dummy data — doesn't matter)
3. Click inside one **Repeater item**
4. Click **Add Elements → Apps → Like Button**
5. Drag it inside the repeater item and resize as needed
6. **Publish** the site

### Step 3 — Test as a visitor
Open the published site. Click the ♥ button on different items. Check that:
- ✅ Count increments on click
- ✅ Button turns red (liked state)
- ✅ Click again → unlike, count decrements
- ✅ Refreshing the page keeps the liked state
- ✅ Opening in a new tab shows the same count

### Step 4 — Check the CMS
In the Wix site dashboard → **Content Manager** — you should see:
- **ItemLikes** collection with one row per click
- **LikeCounts** collection with one row per unique compId

---

## PART 4 — Publish to the App Market

1. In your app dashboard → **Launch → App Market Listing**
2. Fill in name, description, screenshots, category (**Social** or **Engagement**)
3. Upload an icon (512×512 PNG)
4. Submit for review (~5–10 business days)

---

## Project structure recap

```
repeater-likes/
├── api/
│   ├── toggle.js          ← Vercel function: like/unlike
│   └── status.js          ← Vercel function: bulk status on load
├── widget/
│   └── like-button.js     ← Custom element: the actual like button UI
├── dashboard/
│   └── index.html         ← Dashboard page: stats for site owner
├── wix-data-collections-extension.json  ← Paste into Wix Dev Center
├── vercel.json
├── package.json
└── .env.example
```
