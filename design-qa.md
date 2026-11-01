# Design QA — project dashboard direction 1

## Comparison target

- Source visual truth: `/Users/xiaocheng/.codex/generated_images/01a0b324-4857-7111-aa8e-a0d4e60b8991/exec-2faa6598-35ae-46e8-a4c8-642768ec6b28.png`
- Rendered implementation: `http://127.0.0.1:4178/index.html#/project/recveNpiTYQzHi`
- Implementation evidence: browser-rendered local CUA tab 5 screenshot, project-detail state with the reader open. The computer-use bridge exposes the screenshot as a visual artifact rather than a filesystem path.
- State: authenticated UI was simulated locally only to inspect layout; a report PDF was selected so the reader error state could be inspected without sending any credentials.
- Viewport: desktop wide layout; the implementation responds by keeping the left navigation, operating surface, and right reader in view.

## Full-view comparison

The selected reference establishes a light operations desk: narrow pale navigation, compact project header and tabs, clear blue KPI emphasis, a cadence/next-step work surface, a tabular document area, and a right-hand reading pane. The implementation matches that composition and does not reproduce the previous heavy outlined-card dashboard.

Focused comparison was applied to the project header/KPI strip, cadence timeline, file rows, and open reader because these are the high-density elements that define the selected visual direction.

## Required fidelity surfaces

- **Fonts and typography:** Inter/PingFang fallback stack remains. The implementation uses a large compact project title, restrained section headings, and small metadata labels. Long filenames truncate in rows and retain the full filename in the reader title.
- **Spacing and layout rhythm:** A fixed-width left rail, generous page gutters, a three-part KPI strip, and hairline separators create the reference's editorial rhythm. The reader becomes a side desk on desktop and an overlay on compact screens.
- **Colors and visual tokens:** Cool white canvas, blue interaction color, pale blue KPI background, and subtle lavender/blue ambient gradients align with the chosen reference. Status colors remain semantic and contrast with the white ground.
- **Image quality and asset fidelity:** The chosen source is a layout reference, not a supplied brand/photography asset. No replacement logo or illustrative asset was fabricated; existing member avatars remain sourced from synced data.
- **Copy and content:** Real project names, actual source-table entries, real file labels, and the already-established verified-data language are retained. The old static `266 / 500` claim is not shown.

## Findings

- [P3] The selected reference shows a fully rendered document page in the reader; the local QA state correctly shows the access-error state because it uses a disposable local session. The online authenticated check remains necessary for final document-content verification.
  - Location: `#reader-preview`.
  - Fix: after GitHub deployment, open a PDF, XLSX, DOCX, and PPTX from the authenticated production site and confirm each file's local renderer receives the Worker response.

## Open questions

- Feishu source tables themselves intentionally open in Feishu because their interactive worksheet UI is not a file download. Attached office files are rendered locally in the dashboard reader.

## Implementation checklist

- [x] Replace the heavy framed page treatment with the selected light operating-desk visual system.
- [x] Rebuild the document reader as a right-side work surface.
- [x] Add local PDF/image, XLSX, DOCX, and PPTX preview paths without forwarding file content to a document-conversion service.
- [x] Verify project page interaction, reader opening, error state, and console output locally.
- [ ] Push the committed revision to GitHub Pages after GitHub authentication is available.
- [ ] Verify authenticated production files in all four renderer paths.

## Follow-up polish

- Add thumbnail extraction for PDF/PPT pages if faster scanning is desired after production file access is verified.

final result: passed
