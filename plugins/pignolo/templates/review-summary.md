<!--
pignolo closing summary of a review or Judgment Day (spec §4.6, §12). Fill it in the human's
language: headings and sentences translated, structure kept. Every count and id comes from the
ledger file (ledger.js output), never from memory. Refuted findings are always listed.
-->
**<"In plain words" heading>**
<1 to 3 lines: whether the change is approved, what was fixed and what, if anything, is left for the human. Approving does not authorize delivering.>

**<"Technical detail" heading>**
- <"Result" label>: APPROVED | ESCALATED · SHA <sha> · level <low|medium|high> · profile <profile> · rounds <0-2>
- <"Reviewed by" label>: <lenses run, refuters, judges; "structural reading" for low risk>
- <"Confirmed and fixed" label>: <ledger id · location · severity · confirming test> (or "none")
- <"Open or escalated" label>: <ledger id · location · severity · why> (or "none")
- <"Refuted" label>: <ledger id · location · refuter reason> (or "none")
- <"Not reproduced (lowered to WARNING)" label>: <ledger id · location> (or "none")
- <"Suspect (one judge only)" label>: <ledger id · location> (or "none")
- <"Ledger" label>: <path returned by ledger.js save>
