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
The manual **Build Android Play bundle** workflow produces an unsigned bundle
as an Actions artifact. It does not upload to Play or publish a release.

The local bundle built on 20 November 2026 is version 1.0.206, code 1000206.
It is unsigned. Release lint passed. Its contents were checked for development
files; it contains no native `.so` libraries. USB and network operation on
Android 16 has not yet been tested on hardware.

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

Default language: English (United Kingdom), proposed.
Category: Tools, proposed. Pricing: Free, awaiting confirmation.

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

Support email proposal: `hello@ooznest.co.uk` (already in the app configuration).
Website: https://control.ooznest.co.uk/
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

## Data safety and privacy review

This is a source-based inventory, not a completed Play declaration:

- Optional PostHog EU analytics sends app interactions, machine usage,
  connection outcomes, firmware information and controller diagnostics.
- It sends a random installation identifier, session identifier, OS and app
  version. IP-derived approximate location is enabled for `app opened`.
- Analytics uses HTTPS. Local controller connections may use unencrypted
  HTTP, WebSocket or TCP; do not declare that every transfer is encrypted
  without reviewing how those local transfers fit the Play form.
- Analytics is disabled before consent. No ads, app accounts, location
  permission or advertising ID were found in the reviewed app.
- Confirm the PostHog processor agreement, project retention, deletion process,
  access controls and actual stored properties before completing Data safety.
- Publish an app-specific privacy policy covering the above and local machine
  communications; confirm its public URL and contact details before submission.
- Complete content rating, target audience, app access and distribution
  countries with the owner. Suggested audience is adults operating CNC
  equipment; do not submit that selection without owner confirmation.

## Remaining submission steps

1. Ryan grants the required Play Console access or accepts the signing terms.
2. Confirm pricing, language, support contact and distribution countries.
3. Create and back up the upload key; build and verify a signed bundle.
4. Test USB/network operation on a physical Android device and capture screenshots.
5. Approve the listing, feature graphic, privacy policy and Data safety answers.
6. Upload to internal testing, install from Play and run the pre-launch checks.
7. Submit the production release for review once the checks pass.

References:
- https://developer.android.com/google/play/requirements/target-sdk
- https://cordova.apache.org/docs/en/latest/guide/platforms/android/
- https://support.google.com/googleplay/android-developer/answer/9842756
- https://support.google.com/googleplay/android-developer/answer/9866151
- https://support.google.com/googleplay/android-developer/answer/10787469
