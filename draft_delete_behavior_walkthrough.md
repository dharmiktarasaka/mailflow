# Draft Deletion Behavior Walkthrough

We have successfully updated the deletion behavior for emails (drafts) across the application. The system now distinguishes between deleting a raw draft and deleting an email from other states.

## 1. Deletion Behavior Logic

| Original Section / Tab | Action | Resulting Behavior | Database Action |
| :--- | :--- | :--- | :--- |
| **Draft** | Delete | Permanently removes the draft. | `Draft.findByIdAndDelete` |
| **Approved** | Delete | Reverts status back to `draft`. Clears scheduled & reviewed times. | `Draft.save` (sets status, scheduled_at, and reviewed_at) |
| **Scheduled** | Delete | Reverts status back to `draft`. Clears scheduled & reviewed times. | `Draft.save` (sets status, scheduled_at, and reviewed_at) |
| **Rejected** | Delete | Reverts status back to `draft`. Clears scheduled & reviewed times. | `Draft.save` (sets status, scheduled_at, and reviewed_at) |

---

## 2. Technical Implementation Details

### Backend Updates
Modified the `DELETE /api/drafts/:id` route in `server/routes/drafts.js`:
- Queries the draft by ID first.
- If `draft.status === 'draft'`, it invokes `Draft.findByIdAndDelete(id)`.
- If `draft.status` is anything else (e.g. `'approved'`, `'scheduled'`, `'rejected'`), it sets:
  - `draft.status = 'draft'`
  - `draft.scheduled_at = undefined`
  - `draft.reviewed_at = undefined`
  - Saves the updated draft back to the database.

### Frontend Updates
Modified `client/src/pages/Drafts.jsx`:
- Updated `deleteDraft` signature to take the entire `draft` object.
- Dynamically prompt the user depending on the status:
  - **Draft**: *"Delete this draft permanently?"*
  - **Other States**: *"Move this email back to the draft section?"*
- Updated all occurrences of `deleteDraft(draft.id)` in the JSX tabs to call `deleteDraft(draft)`.
