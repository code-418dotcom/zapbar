# First upload — Zapbar 1.0.0 (owner, Play Console, once)

Google requires a new app's creation and first bundle upload in the Console; the API works from release 2. Account: **Code-418** (<developer-email>). Everything you paste lives in `docs/release/listing.md` and `docs/release/declarations.md`.

**Files:**
- AAB: `E:\projects\zapbar\release\zapbar-1.0.0.aab`
- Graphics: `docs/release/graphics/` (`1-remote.png` … `6-slider.png`, `feature-graphic.png`, `icon-512.png`)
- Demo video: `docs/release/fgs-demo.mp4`. Upload it to YouTube as **unlisted** first; you need the URL in step 8.

## 1. Create the app
Play Console → **Create app**
- App name: `Zapbar: Remote for HEOS`
- Default language: English (United States)
- App or game: **App**
- Free or paid: **Free**. This cannot be changed to paid later, which is fine: tips are in-app products.
- Tick the declarations (Developer Program Policies, US export laws) → **Create app**

## 2. Check the testing requirement
On the new app's dashboard, look at **Publishing overview / Production**. If it asks for a **closed test with 12 testers for 14 days** before production, tell Claude. The organisation account should be exempt, but this has never been verified.

## 3. Internal testing release
**Test and release → Testing → Internal testing → Create new release**
- If asked, accept **Play App Signing** (Google holds the app key; `zapbar-upload.jks` is only the upload key).
- Upload `zapbar-1.0.0.aab`
- Release name: `1.0.0`. Release notes: `First release.`
- **Next → Save and publish / Start rollout to Internal testing**

## 4. Testers
**Internal testing → Testers → Create email list** `zapbar-owners`: your Google account and your partner's → Save. Copy the **opt-in link** and open it on both phones.

## 5. License testers (test purchases are free)
**Settings (left, under the account) → License testing**: add the same two Google accounts → Save.

## 6. Give the publishing service account access
**Users and permissions → Invite new users**
- Email: `<service-account>@<project>.iam.gserviceaccount.com`
- **App permissions → Add app → Zapbar**: View app information, Manage testing tracks and edit tester lists, Release to production / exclude devices / use app signing, Manage store presence, Manage orders and subscriptions, **Manage in-app products**
- Invite → confirm

Then tell Claude. Claude runs `python3 scripts/play/check.py` to prove access and creates the tip products (after your OK).

## 7. Store listing
**Grow users → Store presence → Main store listing**: paste title, short description and full description from `listing.md`. Upload the app icon (`icon-512.png`), feature graphic (`feature-graphic.png`) and the six phone screenshots in order. Save.
**Store settings**: category **Music & Audio**, email `support@zapbar.app`, website `https://zapbar.app`.

## 8. App content (Policy → App content)
Work through each card with the answers in `declarations.md`: privacy policy URL, ads, app access, content rating, target audience, data safety, government apps (no), financial features (none), health (no), **foreground service permissions** (paste the text + the YouTube URL).
