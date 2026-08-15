# LEANR Launch Animation — "The Ignition Reveal"

Reference implementation of the app-open animation specified in
`LEANR_PT_NEXTGEN_APP_PRD.md` §18. See that section for the full creative
rationale; this README covers setup only.

## Dependencies

Only what's strictly required — no animation-library sprawl:

```
npx expo install react-native-reanimated expo-linear-gradient expo-splash-screen @react-native-async-storage/async-storage
```

- **react-native-reanimated** — drives every animated value on the UI
  thread, so the sequence holds 60fps even while the JS thread is busy
  with bootstrap work (session restore, journey-state fetch).
- **expo-linear-gradient** — renders the light-sweep bar. Tiny, no native
  config beyond the standard Expo prebuild.
- **expo-splash-screen** — controls the native static splash so there is
  zero flash between it and this animated component's first frame.
- **@react-native-async-storage/async-storage** — persists a single
  non-sensitive boolean ("has this install seen the full sequence").

No `MaskedView` dependency: the wordmark reveal uses a plain
`overflow: hidden` width animation instead of a mask, which achieves the
same "light cuts the logo into view" effect with one fewer native module.

## app.json — native splash config

Set the native splash to an *identical* static frame (black background,
centered wordmark) so the handoff into the animated component is invisible:

```json
{
  "expo": {
    "splash": {
      "image": "./assets/leanr-wordmark.png",
      "resizeMode": "contain",
      "backgroundColor": "#000000"
    },
    "android": {
      "splash": {
        "backgroundColor": "#000000"
      }
    }
  }
}
```

## Assets

Extract a transparent-background PNG/SVG of just the yellow "LEANR"
wordmark from `image.png` (the full lockup includes the black backdrop and
"By Fitelo" sub-mark, which this component renders separately so it can
animate them independently). Export at 3x for crisp rendering on all
device densities. Place at `assets/leanr-wordmark.png` relative to this
folder (adjust the `require()` path in `BrandLaunchAnimation.tsx` to match
your actual project structure).

## Android glow note

`shadowRadius` does not blur on Android (Android only honors `elevation`).
The reference component ships a flat-opacity approximation that still
reads as "premium" but isn't a true soft blur. For pixel-parity with iOS,
either:
1. Layer an `expo-blur` `BlurView` behind the glow `View` (adds one small
   dependency), or
2. Replace the glow `View` with a pre-rendered, pre-blurred radial-gradient
   PNG asset (zero runtime cost, recommended if the extra dependency isn't
   wanted).

## Performance budget

- First launch: ~2.0s total, all transform/opacity animations (GPU
  compositor thread, no layout thrashing).
- Repeat launches: ~650ms.
- Reduced-motion (OS setting on): ~450ms, still fully branded.
- Real app bootstrap (session restore, etc.) runs in parallel via
  `App.example.tsx`'s `appReady` state — the animation never gates it.
