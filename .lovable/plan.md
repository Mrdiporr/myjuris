# Verify session recording and in-app playback

- Open the signed-in session page and confirm the selected session is ready.
- Record a brief spoken phrase through the browser microphone, then stop recording.
- Confirm the saved audio plays in the session page and recognized words appear in the visible, timestamped transcript.
- Report whether recording, audio playback, and transcript recognition succeeded; identify any browser/device or session blocker without changing app behavior.

## Technical details

Use the existing session page and browser automation with the same signed-in account when its session is available. Grant microphone access only for the app origin. Take screenshots of the recorded state and playback/transcript state; do not modify application files or backend data beyond the requested test recording.