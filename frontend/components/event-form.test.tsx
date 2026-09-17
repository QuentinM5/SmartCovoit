/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EventForm } from "@/components/event-form";

vi.mock("@/components/address-input", () => ({
  AddressInput: () => <span>Adresse</span>,
  needsSelection: () => false,
}));
afterEach(cleanup);

function setup(schedule = {}) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<EventForm initialValues={{ name: "Sortie", eventDate: "2026-12-24", ...schedule }} submitLabel="Enregistrer" submittingLabel="En cours" onSubmit={onSubmit} />);
  return onSubmit;
}

describe("horaires du formulaire", () => {
  it("accepte un ancien événement sans horaires", async () => {
    const submit = setup();
    fireEvent.click(screen.getByText("Enregistrer"));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ arrivalTime: "", departureTime: "", departureNextDay: false })));
  });

  it("refuse un départ antérieur puis accepte le lendemain", async () => {
    const submit = setup({ arrivalTime: "18:00:00", departureTime: "02:00:00" });
    fireEvent.click(screen.getByText("Enregistrer"));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText(/précède l’arrivée/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Départ le lendemain"));
    fireEvent.click(screen.getByText("Enregistrer"));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ arrivalTime: "18:00", departureTime: "02:00", departureNextDay: true })));
  });

  it("efface le lendemain quand l’heure de dispersion est supprimée", async () => {
    const submit = setup({ departureTime: "02:00", departureNextDay: true });
    fireEvent.change(screen.getByLabelText(/Heure de départ pour/), { target: { value: "" } });
    fireEvent.click(screen.getByText("Enregistrer"));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ departureTime: "", departureNextDay: false })));
  });

  it("accepte une heure de rassemblement seule", async () => {
    const submit = setup({ arrivalTime: "10:30" });
    fireEvent.click(screen.getByText("Enregistrer"));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ arrivalTime: "10:30", departureTime: "" })));
  });
});
