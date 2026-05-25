import { describe, expect, test } from "bun:test";
import { stripNotificationMarkup } from "@/lib/notifications";

describe("stripNotificationMarkup", () => {
  test("removes angle brackets instead of trying to parse markup", () => {
    expect(stripNotificationMarkup("Hello <b>world</b> <<tag>>")).toBe(
      "Hello bworld/b tag",
    );
  });

  test("strips control and bidi override characters", () => {
    expect(stripNotificationMarkup("safe\u0000 text\u202E now")).toBe("safe text now");
  });
});
