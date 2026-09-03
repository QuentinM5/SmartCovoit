import type { Metadata } from "next";
import { EditEventClient } from "./edit-event-client";

type Params = { id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { id } = await params;
  return {
    title: "Modifier l'événement",
    alternates: { canonical: `/events/${id}/edit` },
    robots: { index: false, follow: false },
  };
}

export default async function EditEventPage({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  return <EditEventClient id={id} />;
}
