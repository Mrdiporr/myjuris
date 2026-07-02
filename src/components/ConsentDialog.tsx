import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

interface Props {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Shown once per browser before the first recording. Discloses third-party
 * processing (AssemblyAI) and prompts the clerk to confirm all-party consent
 * has been obtained where required by jurisdiction.
 */
export function ConsentDialog({ open, onConfirm, onCancel }: Props) {
  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Recording &amp; processing notice</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>Before you begin, please confirm the following:</p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Audio will be captured from your device microphone and uploaded to your private cloud storage.</li>
                <li>To generate speaker-labelled transcripts, audio may be sent to a third-party transcription service (AssemblyAI, USA).</li>
                <li>You have obtained any consent required by your jurisdiction (some courts require all-party notice before recording).</li>
                <li>Recordings and transcripts are visible only to your account.</li>
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>I understand — start recording</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const KEY = "myjuris:recording-consent:v1";
export const consent = {
  granted: () => typeof localStorage !== "undefined" && localStorage.getItem(KEY) === "1",
  grant: () => { try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ } },
};
