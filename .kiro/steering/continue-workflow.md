---
inclusion: manual
---

# Continue Workflow Instructions

When the user types **"continue"**, follow these steps exactly:

1. Read `.kiro/steering/chain-bars-progress.md`
2. Find the line "LAST COMPLETED STEP"
3. Find the first unchecked `[ ]` step in the MASTER TASK LIST after that
4. Announce: "Resuming from STEP X: [step name]" so the user knows where we are
5. Execute that step fully and completely
6. After completing it, update the progress file:
   - Mark the step `[x]`
   - Update "LAST COMPLETED STEP" with the step number and today's date
   - Add the step's created/modified files to "FILES MODIFIED SO FAR"
7. Ask the user: "Step X done. Ready for Step X+1: [next step name]? Type 'continue' to proceed."

This ensures work can always resume after any crash, timeout, or session end.
