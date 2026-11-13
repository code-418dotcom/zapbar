# Play declarations — Zapbar 1.0.0

Answers for Play Console → Policy → App content. Owner pastes; Claude keeps this file true to the code.

## Privacy policy
https://zapbar.app/privacy

## Ads
No, the app contains no ads.

## App access
All functionality is available without special access, but the app needs hardware. Choose **"All or some functionality is restricted"** and add one instruction set:
- Name: `HEOS device required`
- Instructions: "Zapbar controls a HEOS device (for example a Denon soundbar) on the user's local Wi-Fi network and needs one to show its main screen. There is no login. Demo video of the app controlling a Denon DHT-S716H: <YouTube URL of docs/release/fgs-demo.mp4>."

## Content rating (IARC questionnaire)
- Category: **Utility, Productivity, Communication or Other**
- Violence, sexuality, language, controlled substances, gambling: **No** to all
- Users can interact or exchange content: **No**
- Shares user location with others: **No**
- Allows purchases of digital goods: **Yes** (optional tips)
- Expected rating: Everyone / PEGI 3

## Target audience and content
- Target age groups: **13–15, 16–17, 18 and over** (not under 13, so the app stays out of the Families program)
- Appeals to children: **No**

## Foreground service permissions
Type: **Connected device** (`FOREGROUND_SERVICE_CONNECTED_DEVICE`)
- Use case description: "Keeps a media session and a notification connected to the user's own soundbar on the local network, so the phone's volume keys and the notification control the soundbar while it is playing. It runs only while Zapbar is open or the soundbar is playing, and stops when the soundbar has been idle for 5 minutes or the phone leaves Wi-Fi. The user can turn it off in Settings."
- User impact if deferred or interrupted: "The volume keys would stop controlling the soundbar and the notification controls would disappear mid-use."
- Video: <YouTube URL of docs/release/fgs-demo.mp4>

## Government apps, financial features, health, news
None of these apply: answer No / not applicable.

## Data safety
Answer: **"Does your app collect or share any of the required user data types?" → No.** Encryption in transit and deletion questions then do not apply.

Evidence (checked 2026-10-17, https://support.google.com/googleplay/android-developer/answer/10787469):
- "If your app uses a payment service such as PayPal, Google Pay, Google Play's billing system, or similar services to complete payment transactions, you don't need to declare collection of the data that the payment service collects in connection with its processing of financial transactions … if … your app never accesses this information; and the payment service collects this information directly from the user."
- "'Collect' means transmitting data from your app off a user's device." / "User data accessed by your app that is only processed locally on the user's device and not sent off device does not need to be disclosed."

Zapbar reads its own purchase tokens only to acknowledge them through the Play Billing library on the device and sends nothing off the device: no backend, no server-side verification, no analytics or crash SDKs (enforced by `apps/remote/__tests__/privacy-claims.test.ts`). **If server-side purchase verification or any SDK is ever added, this answer must change to declare "Purchase history".**

## Name check
TMview (EUIPO, EU national offices, WIPO international registrations), searched 2026-10-17:
- **"ZAPBAR":** two marks worldwide, neither in the EU nor in class 9 — US class 40 (permanent jewellery, filed) and CN class 34 (registered).
- **Closest live class-9 marks in the EU / WIPO:** ZAP (EUIPO 015265747, ZapLabs LLC, 9/36/42), ZAPP (EUIPO 018355250, Quick Commerce Ltd), Zapp (Benelux 1163657, Stichting Nederlandse Publieke Omroep, 9/16/18/38/41), ZAPBOX (WIPO 1338346, Zappar Ltd), ZAPIER (WIPO 1621051), ZAPPER (WIPO 1693748).
- **Conclusion:** no identical or near-identical class-9 mark. The residual risk is the shared "ZAP" prefix (ZapLabs, NPO's Zapp); the distinct "-BAR" ending and the narrow use argue against confusion. Not legal advice. The "ZAP" result set (27k marks) was sampled (top 100), not fully cleared. A EUIPO filing in class 9 (~€850) would secure the name if Zapbar takes off.
