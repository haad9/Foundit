# Foundit Merge

Foundit Merge is a functional multiplayer vibe-coding prototype.

Two teammates describe changes to the same checkout in normal language. Foundit creates two independent configurations, previews each one, explains their changes, detects incompatible intent, collects a human resolution, merges the result, runs four checks, and creates a deterministic rollback version.

## Run it

Requirements: Node.js 20 or newer. There are no packages, accounts, API keys, or network services.

```powershell
npm.cmd run dev
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173) in Chrome or Edge.

If PowerShell blocks `npm`, run:

```powershell
node server.js
```

## Try the product

### Guided demo

1. Click Maya and Theo to view their separate working versions.
2. Click **Compare changes**.
3. Choose how to resolve the shipping-flow overlap.
4. Let Foundit run its checks.
5. Open the merged checkout or roll it back.

Keyboard shortcuts: `1` compare, `2` resolve or merge, `3` open the result, `E` edit ideas, and `R` reset.

### Custom ideas

Click **Try your ideas**. Enter two checkout requests or use one of the example pairs.

The current vertical slice understands:

- One-page or multi-step checkout
- Express payment
- Discount, promotion, and coupon codes
- Inline, separate, or removed address verification
- Guest checkout versus required accounts
- Order notes and delivery instructions
- Gift messages

Unsupported requests are marked clearly and do not silently invent a change.

Direct recording links:

- Prompt editor: [http://127.0.0.1:4173/?state=ideas](http://127.0.0.1:4173/?state=ideas)
- Conflict: [http://127.0.0.1:4173/?state=conflict](http://127.0.0.1:4173/?state=conflict)
- Completed merge: [http://127.0.0.1:4173/?state=merged](http://127.0.0.1:4173/?state=merged)

## Test it

Run everything:

```powershell
npm.cmd test
```

Run individual layers:

```powershell
npm.cmd run test:engine
npm.cmd run test:api
npm.cmd run test:browser
```

The automated suite covers:

- Natural-language behavior extraction
- Compatible and incompatible teammate requests
- Recommended and explicit conflict resolutions
- Result configuration and rollback version generation
- HTTP health, analysis, merge, validation, and static-file security
- A real headless-Chrome journey through custom ideas, preview, comparison, resolution, merge, and reset

The browser test finds a local Chrome or Edge installation. Set `CHROME_PATH` when the browser is installed elsewhere.

### Manual acceptance check

Use **Guest vs account** in the prompt editor. Build the versions, compare them, choose Theo's account requirement, and merge. The final checkout must say **Account required before payment**.

Use **Compatible ideas** next. The comparison must report zero overlaps; after merging, both order notes and gift-message fields must appear.

## Film the 75-second demo

Record the browser at 1440×900 or 1920×1080, 100% zoom. Hide bookmarks and notifications. Start the server before recording and keep the three direct links open as backup tabs.

### Script

**0:00–0:08 — Problem**

> Vibe coding made it possible for anyone to build software. But the moment a second person joins, collaboration falls back to Git and merge conflicts.

**0:08–0:19 — Real input**

Click **Try your ideas**. Pause on the two requests, then click **Build both versions**.

> Maya wants a faster one-page checkout. Theo adds discounts and address verification. Foundit turns both requests into separate, safe versions.

**0:19–0:30 — Preview**

Click Maya and then Theo.

> Each idea works by itself. But both change the checkout flow.

**0:30–0:44 — Understand the conflict**

Click **Compare changes**.

> Instead of showing nontechnical teammates a wall of code, Foundit explains what changed and finds the one decision they actually need to make.

**0:44–0:57 — Resolve and check**

Keep **simple + verify inline**, then click the green button. Leave two seconds of silence for the checks.

> The team keeps the simple flow while verification happens inline. Foundit merges the behavior, checks compatibility, and creates a rollback point.

**0:57–1:09 — Result**

Click **Open merged app**.

> Both ideas are now working together: one page, express pay, discounts, and safe address verification.

**1:09–1:15 — Close**

> Foundit is GitHub for people who do not code. Vibe coding made software creation accessible. We make it multiplayer.

End immediately after the final sentence.

### Recording advice

- Record the screen silently first and add narration afterward.
- Move the mouse slowly and leave half a second around each click.
- Do not type during the main take; use the prefilled ideas.
- Capture a complete take, a conflict-to-merge take, and a merged-result take.
- If a take fails, switch to the direct URL for the next scene.

## Honest MVP boundary

This is a complete, testable vertical slice for checkout behavior—not an arbitrary repository merger. The merge engine changes a real structured checkout configuration and the UI renders that result. It does not yet inspect GitHub repositories, write source code, run a production app's test suite, or push commits.

The next technical milestone is a GitHub adapter that converts prompt history and code diffs into this same plain-English change model, then executes approved merges inside isolated worktrees.
