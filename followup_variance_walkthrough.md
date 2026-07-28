# Follow-Up Sending Time Variance Walkthrough

We have implemented a random time variance (jitter) of **+/- 20 to 60 minutes** for all scheduled follow-up emails. This ensures that follow-up messages are sent at slightly different times of the day relative to the initial email, making the sending pattern appear human and preventing email providers from flagging the activity as bot-like.

---

## 1. How It Works

1. **Jitter Calculation**:
   - Every time a follow-up is scheduled (either via lead-level auto-scheduling, bulk-creation for campaigns, or manual creation), a random duration between **20 and 60 minutes** is generated.
   - The system randomly decides to either **add** or **subtract** this duration from the exact scheduled base date/time.

2. **Database Impact**:
   - The resulting shifted date/time is saved as the follow-up's `scheduled_date`.
   - The follow-up scheduler runs every minute and processes follow-ups whose `scheduled_date` is less than or equal to the current time.

---

## 2. Technical Implementation Details

### `server/routes/send.js` (Lead-level Auto-scheduling)
Updated inside the `createFollowupsForLead` function. When follow-ups are automatically scheduled after sending the main email:
```javascript
// Add random human-like jitter (+/- 20 to 60 minutes)
const isPositive = Math.random() < 0.5
const minutes = Math.floor(Math.random() * (60 - 20 + 1)) + 20
const offsetMs = minutes * 60 * 1000
if (isPositive) {
  scheduledDate.setTime(scheduledDate.getTime() + offsetMs)
} else {
  scheduledDate.setTime(scheduledDate.getTime() - offsetMs)
}
```

### `server/routes/followups.js` (Bulk Campaign Creator & Manual Creator)
- **Bulk Campaign Creator (`/create-for-campaign/:campaign_id`)**: Added the same jitter logic right after computing the base `scheduledDate`.
- **Manual Creator (`/`)**: Added date parsing and jitter calculation before saving manual follow-ups to the database.
