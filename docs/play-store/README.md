# Google Play release

## App identity and build

- Name: Ooznest Control
- Package: `com.ooznest.control` (available in Play Console on 20 November 2026)
- Platform: Cordova Android 15.1, target API 36, minimum API 24
- Version comes from the root `package.json`.
- Android version code: `major * 1000000 + minor * 10000 + patch`.
- Existing debug APK releases remain separate from Play release bundles.

Run `npm run build-android-play` to produce
`cordova/platforms/android/app/build/outputs/bundle/release/app-release.aab`.
The **Build Android Play bundle** workflow produces a signed bundle as an
Actions artifact. The main release workflow calls it with the bumped release
tag and attaches the `.aab` to the GitHub release. Automatic upload to Google
Play is not configured.

Required encrypted GitHub secrets: `ANDROID_UPLOAD_KEY_BASE64` and
`ANDROID_UPLOAD_PASSWORD`. Alias: `ooznest-control-upload`. The original key
and private credentials are in `%LOCALAPPDATA%/Ooznest/signing/`, outside this
repository. Back up that folder to company credential storage.

The signed local bundle built on 20 November 2026 is version 1.0.207, code
1000207. Google Play accepted it. Release lint and signature verification
passed. Network connection and portrait UI were tested on a Samsung Android
16 phone with a grblHAL test controller. USB hardware testing is outstanding.

GitHub Actions run 44710248573 passed. Its signed bundle uses the same upload
certificate, includes the policy link and excludes signing files.

## Upload-key signing

Create an Ooznest-controlled upload key in Android Studio's **Generate Signed
Bundle / APK** flow, or using the JDK `keytool` utility. Store it outside this
repository and back it up in the company's credential storage.

Copy `cordova/build.example.json` to `cordova/build.json`, set the private key
path and passwords locally, then run `npm run build-android-play` again.
Cordova reads this signing configuration automatically. `build.json`, `.jks`
and `.keystore` files are ignored by Git and excluded from the mobile assets.
Never put the real passwords in the example file or commit them.

Verify signing with `jarsigner -verify -verbose -certs <bundle.aab>` before upload.
Use Google-generated app signing in Play Console, retaining the upload key
for subsequent releases. Accepting the signing terms requires suitable account
permissions and an authorised person to accept the agreement.

## Store listing draft

Default language: English (United Kingdom). Category: Tools. Pricing: Free.
Audience: ages 13 and above. Availability: all available countries.

Short description:

> Control your WorkBee CNC with USB and local network connections.

Full description:

> Ooznest Control brings your WorkBee CNC controls to your Android device.
>
> Connect to a compatible Ooznest Motion Control Core / grblHAL controller
> using a USB OTG connection or your local network. Open G-code files, inspect
> toolpaths in the 3D preview, jog your machine and manage CNC jobs.
>
> Tools include probing routines, surfacing, spoilboard grids, bowl cutting,
> macros, calibration, machine settings and troubleshooting information.
>
> A compatible CNC controller is required for machine operation. USB operation
> requires an Android device with USB host support and a suitable OTG adapter.
> Network operation requires the device and controller to be reachable on the
> same network. This app is for grblHAL controllers; Duet / RepRapFirmware uses
> a separate Ooznest Control edition.
>
> Use your machine's physical emergency stop and follow its operating guide.
> Keep the machine in view while operating it.
>
> Usage analytics is optional and off until you opt in. You can change your
> choice in Settings, Privacy. No app login is required.

Support email: `help@ooznest.co.uk`.
Website: https://control.ooznest.co.uk/
Support contact page: https://ooznest.co.uk/contact-us/
Guide: https://resources.ooznest.co.uk/
Release notes: First Google Play release of Ooznest Control for compatible
WorkBee / grblHAL CNC controllers, with USB OTG and local network connections.

## Graphics

`assets/icon-512.png` is the existing application icon on a white background.
`assets/feature-1024x500.png` is a draft feature graphic using the existing logo.
Regenerate them with `node docs/play-store/generate-assets.cjs`.

Capture genuine Android phone screenshots and tablet screenshots from the
release build. Existing desktop documentation screenshots should not be used
as Android screenshots. Capture preview, editor, tools and connection setup;
do not claim a physical machine is connected unless it really is.

Phone screenshots are in `assets/phone/`: jog controls, sample 3D toolpath,
G-code editor and surfacing tools, in that order. Captured on the real phone
at 1080 × 1920 and uploaded to Play Console.

App policy: https://control.ooznest.co.uk/download/privacy
Source: `download/privacy.html`. Cloudflare redirects the `.html` address to
the extensionless URL.

## Data safety and privacy review

The Play declaration covers optional approximate location, app interactions,
diagnostics and installation/session identifiers, for analytics. Processor
transfers are not declared as third-party sharing. No blanket encryption
claim is made because local machine traffic may be unencrypted.

Source-based inventory:

- Optional PostHog EU analytics sends app interactions, machine usage,
  connection outcomes, firmware information and controller diagnostics.
- It sends a random installation identifier, session identifier, OS and app
  version. IP-derived approximate location is enabled for `app opened`.
- Analytics uses HTTPS. Local controller connections may use unencrypted
  HTTP, WebSocket or TCP; do not declare that every transfer is encrypted
  without reviewing how those local transfers fit the Play form.
- Analytics is disabled before consent. No ads, app accounts, location
  permission or advertising ID were found in the reviewed app.
## Submission status

Production release 1.0.207 and the listing were submitted on 20 November 2026.
Play Console shows Changes in review; automated quick checks were still
running. Managed publishing is off, so approval will publish automatically.
Listing text, icon, feature graphic, screenshots, support contacts, privacy
policy and app declarations have been completed.

Back up the upload key and credentials. USB hardware testing and testing a
Play-installed build remain outstanding.

References:
- https://developer.android.com/google/play/requirements/target-sdk
- https://cordova.apache.org/docs/en/latest/guide/platforms/android/
- https://support.google.com/googleplay/android-developer/answer/9842756
- https://support.google.com/googleplay/android-developer/answer/9866151
- https://support.google.com/googleplay/android-developer/answer/10787469
