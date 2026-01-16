---
date: "January 16, 2026"
title: "New Year, New Colors"
description: "A deep dive into building randomized color themes with HSL—complementary hues, contrast math, and localStorage persistence."
published: true
---

I rebuilt my website over the holidays. Not because anything was broken—the old one worked fine—but because I wanted something that felt more like me, and consolidated many of the various domains that I managed at the same time.

The biggest change isn't structural. I built the templating engine behind this website back in 2020, and it's still going strong. It's the little sparkle in the header that randomizes the entire color palette.

## Why Randomize?

I've always had a bold, retro-influenced design aesthetic—I've never wanted my home on the web to look like every other website. Most sites pick a palette and assign meaning to it. Blue means trust, green means growth, whatever. The truth is, these choices are mostly arbitrary. I could have gone with mauve or mustard or seafoam and it wouldn't change what I have to say about my interests.

So instead of pretending the color choice is meaningful, I made it playful. Click the icon, get a new palette. The structure stays, the skin changes.

## Controlled Randomness

Pure randomness would be chaos. You'd get unreadable combinations—yellow text on white backgrounds, clashing accents, muddy pastels. The trick is constraining the randomness to a space where everything works.

The system defines three structural colors tied to a single base hue:

```javascript
var baseHue = Math.floor(Math.random() * 360);

// Dark color (header, text) - base hue, low lightness
var newBlack =
  "hsl(" +
  baseHue +
  ", " +
  (30 + Math.floor(Math.random() * 40)) +
  "%, " +
  (5 + Math.floor(Math.random() * 12)) +
  "%)";

// Light color (cards, backgrounds) - complementary hue (180° offset), high lightness
var newWhite =
  "hsl(" +
  ((baseHue + 180) % 360) +
  ", " +
  (10 + Math.floor(Math.random() * 30)) +
  "%, " +
  (92 + Math.floor(Math.random() * 6)) +
  "%)";

// Page background - analogous hue (90° offset), mid lightness
var newBg =
  "hsl(" +
  ((baseHue + 90) % 360) +
  ", " +
  (20 + Math.floor(Math.random() * 50)) +
  "%, " +
  (50 + Math.floor(Math.random() * 25)) +
  "%)";
```

The 180° and 90° offsets are doing most of the work here. Complementary colors (180° apart on the color wheel) create natural contrast—the header and content cards will always push against each other. The analogous offset (90°) for the page background mediates between them, creating cohesion without monotony.

These relationships hold no matter where the base hue lands. A warm base gives you burgundy headers with cream cards on a dusty rose background. A cool base gives you navy headers with ice-blue cards on a sage background. The math is the same; the mood shifts.

## Accent Colors

The structural colors carry the palette, but accent colors (links, dates, highlights) need their own treatment. These are randomized independently:

```javascript
function randomHSL(minS, maxS, minL, maxL) {
  var h = Math.floor(Math.random() * 360);
  var s = minS + Math.floor(Math.random() * (maxS - minS));
  var l = minL + Math.floor(Math.random() * (maxL - minL));
  return "hsl(" + h + ", " + s + "%, " + l + "%)";
}

var newYellow = randomHSL(90, 100, 50, 65);
var newBlue = randomHSL(80, 100, 40, 60);
var newGreen = randomHSL(70, 100, 35, 55);
```

Each accent has its own saturation and lightness bounds tuned to what that role typically needs. Yellows stay high saturation and lightness so they pop. Greens stay lower lightness so they don't wash out. The hue floats freely, but the intensity is controlled.

This means you can get unexpected combinations—a warm palette with a cool blue accent, or muted backgrounds with a saturated pink link color. It works because these accents are used sparingly. They're punctuation, not prose.

## Persistence

The palette persists in localStorage. Once you roll a palette, that's "your" version of the site until you change it. Different visitors, different memories of the same place.

```javascript
colorVars.forEach(function (c) {
  localStorage.setItem("theme-" + c, root.style.getPropertyValue("--" + c));
});
```

For a personal website, I think that's the right energy.

---

The source is [on GitHub](https://github.com/tylerreckart/rkrt.net) if you want to see how the rest of the site works.
