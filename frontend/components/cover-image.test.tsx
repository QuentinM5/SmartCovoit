/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EventHeader } from "@/app/events/[id]/event-header";
import type { EventDetail } from "@/lib/api";

const auth = vi.hoisted(() => ({ user: { id: "owner" } as { id: string } | null, loading: false }));
vi.mock("@/components/auth-provider", () => ({ useAuth: () => auth }));
vi.mock("@/components/location-map", () => ({ LocationMap: () => null }));
vi.mock("@/components/copy-link-button", () => ({ CopyLinkButton: () => null }));
vi.mock("@/components/download-ics-button", () => ({ DownloadIcsButton: () => null }));
vi.mock("@/components/qr-code-button", () => ({ QrCodeButton: () => null }));

const event = { id: "event", name: "Test", event_date: "2026-09-17", depot_address: "Paris", has_cover_image: true, access_mode: "approval" } as EventDetail;
const fetchMock = vi.fn();
const revoke = vi.fn();
let sequence = 0;
function header(revision = 0, currentEvent = event) {
  return <EventHeader event={currentEvent} canManage={false} uploadingCoverImage={false} deletingCoverImage={false} coverImageError={null} coverImageRevision={revision} onUploadCoverImage={() => {}} onDeleteCoverImage={() => {}} />;
}
beforeEach(() => {
  auth.user = { id: "owner" };
  localStorage.setItem("smartcovoit-token", "test-session");
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => `blob:cover-${++sequence}`);
  URL.revokeObjectURL = revoke;
  fetchMock.mockImplementation(async () => new Response("image", { headers: { "Content-Type": "image/png" } }));
});
afterEach(() => { cleanup(); vi.resetAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

it("loads a private cover with the session and bypasses old cached public responses", async () => {
  const { container } = render(header());
  await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toMatch(/^blob:/));
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("/events/event/cover-image"), expect.objectContaining({ headers: { Authorization: "Bearer test-session" }, cache: "no-store" }));
});

it("reloads a replaced cover and releases old blobs on replacement and deletion", async () => {
  const { container, rerender } = render(header());
  await waitFor(() => expect(container.querySelector("img")?.src).toMatch(/^blob:/));
  const first = container.querySelector("img")!.src;
  rerender(header(1));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(container.querySelector("img")?.src).toMatch(/^blob:/));
  expect(container.querySelector("img")!.src).not.toBe(first);
  expect(revoke).toHaveBeenCalledWith(first);
  const second = container.querySelector("img")!.src;
  rerender(header(1, { ...event, has_cover_image: false }));
  expect(container.querySelector("img")).toBeNull();
  expect(revoke).toHaveBeenCalledWith(second);
});

it("clears the private image after logout and offers retry on a refused read", async () => {
  const { container, rerender } = render(header());
  await waitFor(() => expect(container.querySelector("img")?.src).toMatch(/^blob:/));
  auth.user = null;
  localStorage.clear();
  fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ detail: "Cet événement est privé." }), { status: 403 }));
  rerender(header());
  await screen.findByRole("button", { name: "Réessayer" });
  expect(container.querySelector("img")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
  await waitFor(() => expect(container.querySelector("img")?.src).toMatch(/^blob:/));
  expect(fetchMock.mock.calls.at(-1)![1].headers).toEqual({});
});

it("ignores a late response after unmount", async () => {
  let resolve!: (response: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done; }));
  const { unmount } = render(header());
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
  unmount();
  expect(signal.aborted).toBe(true);
  await act(async () => { resolve(new Response("late")); });
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

it("rechecks authorization when an open event becomes private", async () => {
  auth.user = null;
  localStorage.clear();
  const { container, rerender } = render(header(0, { ...event, access_mode: "open" }));
  await waitFor(() => expect(container.querySelector("img")?.src).toMatch(/^blob:/));
  const oldUrl = container.querySelector("img")!.src;
  fetchMock.mockImplementationOnce(async () => new Response("{}", { status: 403 }));
  rerender(header());
  await screen.findByRole("alert");
  expect(container.querySelector("img")).toBeNull();
  expect(revoke).toHaveBeenCalledWith(oldUrl);
});

it("offers retry when the browser cannot decode the image", async () => {
  const { container } = render(header());
  await waitFor(() => expect(container.querySelector("img")?.src).toMatch(/^blob:/));
  fireEvent.error(container.querySelector("img")!);
  expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
  expect(container.querySelector("img")).toBeNull();
});
