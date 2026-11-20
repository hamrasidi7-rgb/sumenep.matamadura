import { notFound } from "next/navigation";

// Unmatched URLs render (site)/not-found.tsx inside the site layout.
export default function CatchAll() {
  notFound();
}
