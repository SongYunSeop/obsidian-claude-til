---
name: til-review
description: "SRS-based TIL review session (spaced repetition). Use when the user says 'quiz me', 'review what I learned', 'flashcard session', 'test my knowledge', or wants to do spaced repetition review of their TIL notes."
argument-hint: "[category]"
plugin-version: "__PLUGIN_VERSION__"
---

# Review Skill

SRS (spaced repetition) based TIL review session. Manages review schedule with the SM-2 algorithm.

## MCP Tools

- `til_review_list`: List of cards due for review today + stats (load note content with `include_content: true`)
- `til_review_update`: Record review result (grade 0-5) or remove from review

## Step 1: Load Review Cards

Call `til_review_list` (`include_content: true`, pass category argument if provided).

- 0 cards → Show "No reviews today" + suggest registering untracked TILs (go to Step 5)
- Cards found → Display list + proceed to Step 2

## Step 2: Select Evaluation Mode

Select via `AskUserQuestion`:
- "Simple mode (Again / Good)"
- "Detailed mode (Again / Hard / Good / Easy)"

## Step 3: Per-Card Review Loop

For each card:

1. Display title, category, review info (repetition count, EF, days overdue)
2. Use `content` already loaded in Step 1 (no additional MCP calls needed)
3. Present key content as questions (generate 1-2 questions based on content)
4. Wait for user answer
5. Provide feedback (correct answer / supplementary explanation)
6. Input evaluation via `AskUserQuestion`:
   - Simple mode: "Good (Remembered)" / "Again (Forgot)" / "Skip" / "Stop Review"
   - Detailed mode: "Again (Failed)" / "Hard (Struggled)" / "Good (Normal)" / "Easy (Perfect)"
   - Grade mapping: Again=1, Hard=3, Good=4, Easy=5
   - "Skip": do not evaluate this card, move to next
   - "Stop Review": move to Step 4
   - Skip/Stop in detailed mode: select "Other" then type "Skip" or "Stop Review"
7. If not skipped, call `til_review_update` (action: "review", grade)
8. Display result summary (next review date, interval)

## Step 4: Completion Stats

After all cards are done:
- Number of cards reviewed, average grade
- If remaining > 0, show "N more remaining, continue tomorrow"
- Re-call `til_review_list` to display latest stats

## Step 5: Register TILs (Optional)

When no cards exist or user requests:
- Display full TIL list via `til_list`
- User selects files to add to review
- Call `til_review_update` (action: "review", grade: 4) for each selected file

## Rules

- Max 20 cards per session (prevent overload)
- Prioritize overdue cards (most urgent first)
- Remove from review: if user says "remove this card", call `til_review_update` (action: "remove")
