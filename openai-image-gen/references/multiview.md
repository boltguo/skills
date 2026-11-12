# Consistent character and modeling views

Use this only for turnarounds, model sheets, or separate views for 3D reconstruction. Do not automatically turn an ordinary portrait request into a multiview task.

## Resolve the actual deliverables

Read labels from the user's upload-slot screenshot. A common layout has eight slots: front, left 45°, right 45°, left, right, back, top, bottom. Count them rather than assuming seven. Produce separate images when the slots expect separate files. Use the requested size; `1024x1024` is appropriate for 1K square views.

Describe direction unambiguously in each prompt. For this workflow, “left” means nose and toes point toward image-left, and “right” means image-right. If the receiving app defines anatomical sides instead, follow that definition and label filenames accordingly.

## Identity and pose

- Choose a single approved front image plus useful side/back references. If the user prohibits reference uploads, keep the workflow text-only and preserve one shared character specification instead of silently attaching prior outputs.
- Record face, hair grouping, asymmetrical accessories, garment construction, colors, shoes and fixed body proportions. Front-only details stay on the front. Verify whether paired cone ornaments are seen as circles end-on or triangles in other projections.
- Keep one pose across all views. If the user requests horizontal arms, describe a genuine shoulder-height T-pose with straight elbows; otherwise retain the approved stance. Rotate head, shoulders, torso, hips, knees and feet together. Do not rotate only the head or twist the body to expose a prop.
- For hair intended for reconstruction, use coherent thick connected locks, anchored accessories and a simple silhouette. Reduce thin flying wisps, small loops and disconnected strands when this suits the approved design.
- Give the six horizontal camera views the same orthographic camera scale and alignment, complete head ornaments and complete shoes. Avoid perspective or camera elevation in the 45° yaw views.

For video references, extract and inspect frames first, then choose a small coherent set showing the same model, clothes and accessories. Label each frame's role in the prompt. Do not upload the video as an image.

## Top and bottom require their own projections

**Top:** camera directly above, looking vertically down the standing character's spine. The front of the model can point toward the bottom of the image, but state that convention. A large head usually hides the face and much of the torso and feet; only shapes physically protruding beyond the head footprint appear. Show the crown and hair parting, not a tilted standing portrait or the back of the head with a torso underneath.

**Bottom:** camera directly below a solid fully clothed model, looking vertically upward. Show the shoe soles and the exterior underside of the garment. For a skirted collectible figure, use a continuous opaque closure surface at the underside of the skirt so the drawing represents the solid model's external geometry. Preserve correct occlusion of the upper body; avoid an oblique low-angle portrait with soles pasted onto it.

Keep top/bottom scale consistent with the camera setup when required for reconstruction; a zoomed preview must not be described as using the identical orthographic scale.

## Execution and delivery

Generate and inspect the anchor first. Reuse it for the remaining views when references are allowed. Save each request in a new per-view output directory, for example `views/01_front/`, `views/02_left_45/`. Check left/right direction, clothing, ornaments, shoes and pose before packaging. If one view fails or has a demonstrated issue, rerun that view only and keep the previous version.

Start with one request at a time; modest concurrency is optional for independent views if the service is stable. The CLI already limits retries. Repeated 429/5xx errors are a reason to stop a failing batch and report which views remain, not start an unbounded regeneration loop or switch models silently.

After inspection, deliver clearly named independent PNGs such as `01_front.png` through `08_bottom.png`; a contact sheet and a ZIP with just the final images make upload easier. Preserve the per-view prompts, parameters, selected references, actual dimensions and model IDs separately.
