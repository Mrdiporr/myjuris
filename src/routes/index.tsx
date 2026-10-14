import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: 'myJuris — Court session records' },
    { name: "description", content: 'Secure case management, courtroom audio recording and timestamped session transcripts.' },
    { property: "og:title", content: 'myJuris — Court session records' },
    { property: "og:description", content: 'Secure case management, courtroom audio recording and timestamped session transcripts.' },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: () => { throw redirect({ to: "/dashboard" }); },
});
