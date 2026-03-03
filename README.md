# Valor Energy Partners — Strategic Intelligence Brief

Interactive dashboard synthesizing the Geometry of Being framework with upstream E&P operations and the March 2026 Hormuz crisis.

## Deploy to GitHub Pages (5 minutes)

### Step 1: Create the repo

Go to [github.com/new](https://github.com/new) and create a new repository.
- The `vite.config.js` in this project is already set to `base: '/IntelBrief-Hormuz-Iran/'` — if you keep the default name, no changes are needed
- If you name your repo something else (e.g. `valor-dashboard`), update `vite.config.js` line 6 to match
- Public or Private — both work (Private requires GitHub Pro for Pages)
- Do NOT initialize with README

### Step 2: Push this code

Open a terminal in this folder and run:

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/IntelBrief-Hormuz-Iran.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

### Step 3: Enable GitHub Pages

1. Go to your repo on GitHub
2. Click **Settings** → **Pages** (left sidebar)
3. Under **Source**, select **GitHub Actions**
4. That's it — the workflow triggers automatically on push

### Step 4: Wait ~60 seconds

The GitHub Action will build and deploy. Check the **Actions** tab to watch progress.

Your site will be live at:
```
https://YOUR_USERNAME.github.io/IntelBrief-Hormuz-Iran/
```

## If you named the repo something different

Edit `vite.config.js` line 6 to match your repository name:
```js
base: '/your-actual-repo-name/',
```

## Local development

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`

## Custom domain (optional)

If you want `dashboard.valorenp.com` or similar:

1. Add a `CNAME` file to `public/` folder containing your domain
2. Configure DNS: CNAME record pointing `dashboard.valorenp.com` → `YOUR_USERNAME.github.io`
3. In GitHub repo Settings → Pages → Custom domain, enter your domain
4. Remove the `base` line from `vite.config.js` (or set to `'/'`)
