# How to Deploy Your Guitar Pedal App

This guide is written for someone with **zero** technical or coding background. Follow these steps and you'll have a working guitar pedal app on the internet in about 10-15 minutes.

---

## Section 1: How to Get Your App Online (Easiest Way - GitHub Pages)

GitHub Pages is a **free** service that puts your app on the internet with a secure (HTTPS) web address. This is the recommended way to use your guitar pedal app because the microphone feature requires a secure connection.

### Step 1: Get Your Files Ready

Your guitar pedal app is made up of these files:

| File | What It Does |
|------|-------------|
| `index.html` | The main page of your app |
| `styles.css` | Makes the app look like a guitar pedal |
| `app.js` | Handles button clicks and controls |
| `audio-engine.js` | Records and plays back audio |
| `effects.js` | Creates reverb, delay, and distortion effects |

You'll also have documentation files (`README.md`, `DEPLOYMENT.md`, `SECURITY.md`) - these are helpful but the app only needs the 5 files listed above to work.

**What you need to do:** Make sure you have all these files saved somewhere on your computer where you can find them (like your Desktop or Downloads folder).

---

### Step 2: Create a GitHub Account

GitHub is a free website where people store code. You'll use it to host your app.

1. Open your web browser (Chrome, Firefox, or Edge work best)
2. Go to **https://github.com**
3. Click the **"Sign up"** button (top right corner of the page)
4. You'll see a form asking for:
   - **Email address** - Use any email you have access to
   - **Password** - Choose something secure
   - **Username** - Pick a name (this will be part of your app's web address later, so choose something you like!)
5. Complete the puzzle/verification if asked
6. GitHub will send a verification email to the address you entered
7. Open your email, find the message from GitHub, and click the verification link
8. You'll be taken back to GitHub - you're now signed in!

**What you should see:** A dashboard page with a GitHub logo in the top left corner and your username in the top right.

---

### Step 3: Create a New Repository

A "repository" (or "repo") is just a folder on GitHub where your files will live.

1. Look at the **top right corner** of the GitHub page
2. Click the **"+"** button (it's a plus sign next to your profile picture)
3. Click **"New repository"** from the dropdown menu
4. You'll see a form. Fill it in:
   - **Repository name:** Type `guitar-pedal` (or any name you like - no spaces, use dashes instead)
   - **Description:** (Optional) Type something like "My guitar pedal app"
   - **Public:** Make sure **"Public"** is selected (the radio button next to it should be filled in). This is required for free GitHub Pages hosting.
   - Leave everything else as-is (don't check any boxes)
5. Click the green **"Create repository"** button at the bottom

**What you should see:** A page with your repository name at the top and some instructions. You'll see a section that says "Quick setup" and below it some text about getting started. Look for the blue link that says **"uploading an existing file"** - you'll need that in the next step.

---

### Step 4: Upload Your Files

Now you'll put your app files into your GitHub repository.

1. On the repository page from Step 3, click the blue **"uploading an existing file"** link
   - If you can't find it, look for text that says "or uploading an existing file" in the middle of the page
2. You'll see a page with a large dotted-line box that says **"Drag files here"**
3. Open the folder on your computer where your guitar pedal files are saved
4. **Select ALL the files** (index.html, styles.css, app.js, audio-engine.js, effects.js, and optionally the .md files)
5. **Drag and drop** them into the dotted-line box on the GitHub page
   - Alternatively, click **"choose your files"** and select them from the file browser
6. Wait for all files to upload (you'll see them listed with green checkmarks)
7. At the bottom of the page, you'll see a "Commit changes" section
   - Leave the default message or type "Upload guitar pedal app"
8. Click the green **"Commit changes"** button
9. Wait for the page to reload

**What you should see:** Your repository page now shows all your files listed with their names. You can click on any file to see its contents.

---

### Step 5: Enable GitHub Pages

This is the step that makes your app available on the internet!

1. On your repository page, look at the **top menu bar** (the one with "Code", "Issues", "Pull requests", etc.)
2. Click **"Settings"** (it's on the right side of that menu bar, you might need to scroll right on mobile)
3. On the Settings page, look at the **left sidebar** (the menu on the left side)
4. Scroll down in the sidebar and click **"Pages"**
5. You'll see a section called **"Build and deployment"**
6. Under **"Source"**, make sure **"Deploy from a branch"** is selected
7. Under **"Branch"**, you'll see a dropdown that says "None"
8. Click that dropdown and select **"main"**
9. A second dropdown will appear - leave it as **"/ (root)"**
10. Click the **"Save"** button

**What you should see:** A message at the top saying your settings were saved.

**Now wait 2-3 minutes.** GitHub needs a moment to build your site.

11. **Refresh the page** (press F5 or click the refresh button in your browser)
12. At the top of the Pages settings, you should now see a green box with a message like:

    > Your site is live at https://yourusername.github.io/guitar-pedal/

13. **Click that URL** - your app is now live on the internet!

**If you don't see the URL yet:** Wait another minute and refresh again. It can sometimes take up to 5 minutes.

---

### Step 6: Using Your App

Your guitar pedal app is now live on the internet! Here's how to use it:

1. **Bookmark the URL** so you can easily find it again
   - The URL looks like: `https://yourusername.github.io/guitar-pedal/`
   - (Replace "yourusername" with your actual GitHub username)

2. **Share it with friends** by sending them the URL - anyone can use it!

3. **Access from any device** - the app works on:
   - Desktop computers (Windows, Mac, Linux)
   - Phones (iPhone, Android)
   - Tablets (iPad, Android tablets)
   - Any device with a microphone and a modern web browser

4. **How the app works:**
   - Click **"Start"** to connect your microphone (your browser will ask permission - click "Allow")
   - Click **"Record"** and play your guitar (or sing, or make any sound!)
   - Click **"Record"** again to stop
   - Choose an effect from the dropdown (Reverb, Delay, or Distortion)
   - Adjust the sliders to tweak the sound
   - Click **"Play"** to hear your audio with the effect applied
   - Click **"Clear"** when you want to start fresh

---

## Section 2: Alternative - Testing Locally (Advanced)

**Note:** This section is for people who are comfortable with the command line. If that's not you, skip this section and use GitHub Pages (Section 1 above).

### Why Can't I Just Open the File?

If you double-click `index.html` on your computer, the app will open in your browser but the **microphone won't work**. This is because:

- Modern browsers require a **secure connection (HTTPS)** to access the microphone
- Opening a file directly uses the `file://` protocol, which browsers don't consider secure
- This is a security feature to protect you, not a bug!

### Using a Local Python Server

If you have Python installed on your computer, you can run a local web server:

**Mac or Linux:**
```bash
cd /path/to/your/guitar-pedal-folder
python3 -m http.server 8000
```

**Windows:**
```bash
cd C:\path\to\your\guitar-pedal-folder
python -m http.server 8000
```

Then open your browser and go to: **http://localhost:8000**

**Good news:** `localhost` is treated as a secure context by most browsers, so the microphone should work with this method.

**To stop the server:** Press `Ctrl+C` in the terminal window.

### Recommendation

For the best experience, **use GitHub Pages** (Section 1). It's free, always available, works on any device, and gives you proper HTTPS security. The local server method is mainly useful for development and testing.

---

## Section 3: Troubleshooting

### "Microphone permission not showing up"

- **Check your URL:** Make sure it starts with `https://` (not `http://` or `file://`)
- **Try a different browser:** Chrome and Firefox work best
- **Check browser settings:** You may have previously blocked microphone access for this site
  - Chrome: Click the lock icon in the address bar > Site settings > Microphone > Allow
  - Firefox: Click the lock icon > Permissions > Use the Microphone > Allow
- **Check your device:** Make sure your microphone isn't muted or disabled in your system settings

### "GitHub Pages URL doesn't work"

- **Wait longer:** It can take up to 5-10 minutes for GitHub Pages to deploy the first time
- **Check that the repository is Public:** Go to Settings > General > scroll down to "Danger Zone" > make sure it says "Change visibility" and the current visibility is "Public"
- **Check Pages settings:** Go to Settings > Pages > make sure "main" branch is selected
- **Check your files:** Make sure `index.html` is in the root of your repository (not inside a subfolder)
- **Hard refresh:** Press `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)

### "No sound when recording"

- **Check your microphone:** Make sure it's plugged in and not muted
- **Check browser permissions:** Click the lock icon in the address bar and make sure microphone is set to "Allow"
- **Check system volume:** Make sure your speakers or headphones are on and volume is up
- **Try recording something louder:** Speak loudly or tap the microphone to test

### "Effects not working"

- **Record first:** You need to record audio before you can play it with effects
- **Try refreshing:** Press F5 to reload the page and try again
- **Check the effect selection:** Make sure an effect is selected in the dropdown
- **Adjust the Mix slider:** If Mix is at 0%, you won't hear any effect

### "Page looks broken or buttons don't work"

- **Try Chrome or Firefox:** These browsers have the best support
- **Clear your browser cache:**
  - Chrome: Press `Ctrl+Shift+Delete` > check "Cached images and files" > click "Clear data"
  - Firefox: Press `Ctrl+Shift+Delete` > check "Cache" > click "Clear Now"
- **Disable browser extensions:** Some ad blockers or security extensions can interfere with the app
- **Check the browser console:** Press F12, click the "Console" tab, and look for error messages

### "App works but sounds glitchy"

- **Close other browser tabs:** Audio processing needs CPU resources
- **Try Chrome:** It generally has the best Web Audio API performance
- **Reduce effect intensity:** Lower the Mix, Decay, or Feedback sliders

---

## Section 4: For Absolute Beginners

### You Can Do This!

If you've never used GitHub before, that's completely okay. Here's what to expect:

**What you need:**
- A computer, phone, or tablet with internet access
- An email address (for creating a GitHub account)
- About 10-15 minutes of your time

**What you'll do:**
1. Create a free GitHub account (like signing up for any website)
2. Create a "repository" (just a fancy word for a folder)
3. Upload your files (drag and drop, just like attaching files to an email)
4. Click a few settings (no coding involved!)
5. Get a web address for your app

**What it costs:**
- Nothing! GitHub Pages is completely free.
- There are no hidden fees, subscriptions, or trials.
- Your app will stay online as long as your GitHub account exists.

**Timeline:**
| Step | What You're Doing | Time |
|------|------------------|------|
| 1 | Creating GitHub account | 3 minutes |
| 2 | Creating repository | 1 minute |
| 3 | Uploading files | 2 minutes |
| 4 | Enabling GitHub Pages | 2 minutes |
| 5 | Waiting for deployment | 2-5 minutes |
| **Total** | | **10-13 minutes** |

**After that:**
- Your app is live on the internet
- Anyone with the URL can use it
- It works on phones, tablets, and computers
- You never need to touch the code again
- If you want to update the app later, just upload new files to the same repository

**Still stuck?** Search YouTube for "how to deploy to GitHub Pages" - there are many beginner-friendly video tutorials that walk through each step visually.

---

## Quick Reference

| Question | Answer |
|----------|--------|
| Is GitHub Pages free? | Yes, completely free |
| Do I need to know coding? | No |
| Does it work on phones? | Yes |
| Will it always be online? | Yes, as long as your GitHub account exists |
| Can other people use my app? | Yes, anyone with the URL |
| Is my audio data safe? | Yes, everything stays on each user's device |
| Can I use a custom domain? | Yes, GitHub Pages supports custom domains (advanced) |
