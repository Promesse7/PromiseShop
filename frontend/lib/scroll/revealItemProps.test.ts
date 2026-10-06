import { describe, expect, it } from "vitest";
import { listItem } from "@/lib/motion";
import { revealItemProps } from "./revealItemProps";

describe("revealItemProps", () => {
  it("reveals a card once, the first time it scrolls into view", () => {
    const props = revealItemProps(0, false);
    expect(props).toMatchObject({ variants: listItem, initial: "hidden", whileInView: "show" });
    expect(props.viewport).toMatchObject({ once: true });
  });

  it("staggers the first screenful a little, capped so far cards never wait long", () => {
    expect(revealItemProps(0, false).transition).toEqual({ delay: 0 });
    expect(revealItemProps(2, false).transition).toEqual({ delay: 0.06 });
    expect(revealItemProps(50, false).transition).toEqual({ delay: 0.24 });
  });

  it("does nothing with reduced motion", () => {
    expect(revealItemProps(3, true)).toEqual({ initial: false });
  });
});
