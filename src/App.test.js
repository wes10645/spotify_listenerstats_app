import { render, screen } from "@testing-library/react";

// p5 needs a real canvas, which the test environment doesn't have.
// A plain function (not jest.fn) because CRA resets jest.fn mocks before each test.
jest.mock("p5", () => function FakeP5() {
  return { remove() {} };
});
import App from "./App";
import BarChart from "./components/BarChart";

test("shows the Spotify login button when the backend says we're not logged in", async () => {
  global.fetch = jest.fn().mockResolvedValue({ status: 401, ok: false });
  render(<App />);
  expect(await screen.findByText(/log in with spotify/i)).toBeInTheDocument();
});

test("BarChart scales the biggest bar to full width", () => {
  const { container } = render(
    <BarChart title="Genres" data={[{ label: "rock", value: 4 }, { label: "jazz", value: 2 }]} />
  );
  const bars = container.querySelectorAll(".bar");
  expect(bars[0]).toHaveStyle({ width: "100%" });
  expect(bars[1]).toHaveStyle({ width: "50%" });
});
