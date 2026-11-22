# PixelCutout UI design system

**Status:** Implemented in src/routes/+page.svelte.
**Design basis:** Refactoring UI by Adam Wathan and Steve Schoger, applied as guidance rather than copied screen designs.

## Product personality

PixelCutout should feel focused, calm, private, and dependable. The interface is a single-purpose image tool, not a general photo editor or dashboard. The design starts with the actual feature: choose one image, remove its background, inspect the result, and download a transparent PNG.

## Interface hierarchy

1. **Primary:** choose an image when empty; remove the background when an image is selected; download the transparent PNG when a result is ready.
2. **Secondary:** use manual colour removal as an advanced alternative, replace the selected image, and cancel active processing.
3. **Tertiary:** change the preview surface and adjust manual-removal tolerance.

Only the current stage's useful controls are shown. Empty-state controls do not advertise editing features that are not available.

## Layout and responsive behavior

- Keep the content centered with a bounded maximum width; do not stretch a narrow tool to fill a wide monitor.
- Use a preview-and-controls workspace on larger screens. Stack the same content on smaller screens without changing the task order.
- Keep the uploaded image inside a predictable preview area with object-fit: contain. This tool must preserve the entire source and make fine edges inspectable; crop-to-fill is not appropriate for the editing canvas.
- Use whitespace and surface contrast before adding borders. Reserve borders for the upload target, image canvas, and controls that need a clear boundary.
- Distinguish the image from its preview surface with a subtle inset edge, because arbitrary user images may blend into the surrounding UI.

## Spacing and type

The CSS uses a compact scale based on 4, 8, 12, 16, 24, 32, 40, and 48 pixels. Typography is restricted to a small set of UI sizes (11, 12, 13, 14, 15, 18, 20, 33, and 44 pixels) and regular/semibold/bold weights. Long explanatory copy stays narrow and left-aligned inside controls.

## Color and contrast

The page uses a near-white neutral canvas, dark blue-grey primary text, softer secondary text, and a single blue action color. Green is reserved for privacy/result-positive states; red is reserved for errors. Colors are defined as HSL-based CSS tokens so shades can be tuned consistently.

Normal text should meet a 4.5:1 contrast ratio and large text should meet 3:1. Focus indicators, labels, and text communicate state in addition to color. The result-ready state includes text and an icon, not a colour-only signal.

## Interaction and states

- Empty upload, active drag target, selected image, AI loading, model download, processing, cancellation, recoverable error, manual sample, reduced-size manual preview, full-resolution result, and downloadable result each have distinct feedback.
- Upload supports the picker, drag-and-drop, and clipboard paste, while rejecting multi-file drops to preserve the one-image scope.
- The before/after comparison remains a native range input and keeps keyboard interaction.
- Reduced-motion preferences disable the spinner animation and shorten transitions.
- Image pixels are processed in the browser. Model/runtime downloads are described separately from photo data.

## Lightweight guardrails

No new runtime or design-system dependency is required. Reuse browser controls and CSS variables. Do not introduce a global navigation shell, account flows, analytics, server-side image processing, or editor features outside the first-release scope.

## Reference topics in Refactoring UI

- Pages 36–40: visual hierarchy and using weight/contrast instead of making every element large.
- Pages 60–62: primary, secondary, and tertiary action hierarchy.
- Pages 66–74: whitespace and a deliberate spacing scale.
- Pages 102–108: a restrained type scale.
- Pages 162–168: contrast thresholds and not relying on color alone.
- Pages 214–217: handling arbitrary user-uploaded imagery and preventing background bleed.
- Pages 234–241: first-class empty states and using fewer borders.
