/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { EventForm } from "@/components/event-form";

vi.mock("@/components/address-input", () => ({
  AddressInput: () => <span>Adresse</span>,
  needsSelection: () => false,
}));
afterEach(cleanup);

function setup(schedule = {}, initialEndDayOffset = 0) {
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(<EventForm initialEndDayOffset={initialEndDayOffset} initialValues={{ name: "Sortie", eventDate: "2026-12-24", ...schedule }} submitLabel="Enregistrer" submittingLabel="En cours" onSubmit={onSubmit} />);
  return onSubmit;
}

describe("horaires du formulaire", () => {
  it("accepte un ancien événement sans horaires", async () => {
    const submit = setup();
    fireEvent.click(screen.getByText("Enregistrer"));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ arrivalTime: "", departureTime: "", endDate: "2026-12-24" })));
  });

  it("refuse une fin antérieure puis accepte plusieurs jours", async () => {
    const submit = setup({ arrivalTime: "18:00:00", departureTime: "02:00:00" });
    fireEvent.click(screen.getByText("Enregistrer"));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText(/ne peut pas précéder/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Date de fin/), { target: { value: "2026-12-27" } });
    fireEvent.click(screen.getByText("Enregistrer"));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ arrivalTime: "18:00", departureTime: "02:00", endDate: "2026-12-27" })));
  });

  it("conserve la date de fin quand son heure est supprimée", async () => {
    const submit = setup({ departureTime: "02:00", endDate: "2026-12-27" });
    fireEvent.change(screen.getByLabelText(/Heure de fin/), { target: { value: "" } });
    fireEvent.click(screen.getByText("Enregistrer"));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ departureTime: "", endDate: "2026-12-27" })));
  });

  it("accepte une heure de rassemblement seule", async () => {
    const submit = setup({ arrivalTime: "10:30" });
    fireEvent.click(screen.getByText("Enregistrer"));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ arrivalTime: "10:30", departureTime: "" })));
  });
  it("suit le début quand les dates coïncident et retire les anciens contrôles", () => {
    setup();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByText(/Horaires facultatifs/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/Date de début/), { target: { value: "2026-12-25" } });
    expect((screen.getByLabelText(/Date de fin/) as HTMLInputElement).value).toBe("2026-12-25");
  });
  it("préserve la date de fin indépendante en modification", async () => {
    const submit = setup({ endDate: "2026-12-28" });
    fireEvent.change(screen.getByLabelText(/Date de début/), { target: { value: "2026-12-25" } });
    fireEvent.click(screen.getByText("Enregistrer"));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ eventDate: "2026-12-25", endDate: "2026-12-28" })));
  });
  it("refuse une date de fin antérieure sans horaires", () => {
    const submit = setup({ endDate: "2026-12-23" });
    fireEvent.click(screen.getByText("Enregistrer"));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText(/ne peut pas précéder/)).toBeTruthy();
  });
  it("transpose la durée lors d'une duplication", async () => {
    const submit = setup({ eventDate: "", endDate: "" }, 3);
    fireEvent.change(screen.getByLabelText(/Date de début/), { target: { value: "2027-01-30" } });
    fireEvent.click(screen.getByText("Enregistrer"));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(expect.objectContaining({ eventDate: "2027-01-30", endDate: "2027-02-02" })));
  });

});
